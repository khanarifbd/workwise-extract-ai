import { useState, useEffect } from 'react';
import { useTeamAuth } from '@/hooks/useTeamAuth';
import { useOfflineStorage } from '@/hooks/useOfflineStorage';
import { TeamLoginForm } from '@/components/team-portal/TeamLoginForm';
import { TeamJobList } from '@/components/team-portal/TeamJobList';
import { TeamJobDetail } from '@/components/team-portal/TeamJobDetail';
import { OfflineIndicator } from '@/components/team-portal/OfflineIndicator';
import { supabase } from '@/integrations/supabase/client';
import { Job } from '@/types/job';
import { mapDatabaseJobToJob } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';

const TeamPortal = () => {
  const { 
    session, 
    isAuthenticated, 
    isLoading: authLoading, 
    login, 
    logout, 
    error: authError,
    fetchTeamJobs,
    updateTeamJob 
  } = useTeamAuth();
  const { isOnline, pendingSyncCount, cacheJobs, getCachedJobs, getPendingSyncItems, markSynced } = useOfflineStorage();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [isLoadingJobs, setIsLoadingJobs] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const { toast } = useToast();

  // Load jobs for the authenticated team using secure edge function
  const loadJobs = async () => {
    if (!session?.teamName) return;

    setIsLoadingJobs(true);
    try {
      if (isOnline) {
        // Use edge function for secure job fetching
        const data = await fetchTeamJobs();
        const mappedJobs = (data || []).map((row: any) => mapDatabaseJobToJob(row));
        setJobs(mappedJobs);
        
        // Cache for offline use
        await cacheJobs(mappedJobs);
      } else {
        // Load from cache
        const cachedJobs = await getCachedJobs(session.teamName);
        setJobs(cachedJobs);
        toast({
          title: 'Offline Mode',
          description: 'Showing cached jobs. Changes will sync when online.',
        });
      }
    } catch (error) {
      console.error('Error loading jobs:', error);
      // Try to load from cache on error
      const cachedJobs = await getCachedJobs(session.teamName);
      if (cachedJobs.length > 0) {
        setJobs(cachedJobs);
        toast({
          title: 'Connection Issue',
          description: 'Showing cached jobs.',
          variant: 'destructive',
        });
      }
    } finally {
      setIsLoadingJobs(false);
    }
  };

  // Sync pending updates when online using secure edge function
  const syncPendingUpdates = async () => {
    if (!isOnline || isSyncing || !session) return;

    setIsSyncing(true);
    try {
      const pendingItems = await getPendingSyncItems();
      
      for (const item of pendingItems) {
        try {
          if (item.actionType === 'progress_update' || item.actionType === 'status_update') {
            await updateTeamJob(item.payload.id, {
              status: item.payload.status,
              progress: item.payload.progress,
              notes: item.payload.progress_notes,
            });
            await markSynced(item.id);
          } else if (item.actionType === 'photo_upload') {
            await updateTeamJob(item.payload.jobId, {
              photos: item.payload.photos,
              notes: item.payload.notes,
            });
            await markSynced(item.id);
          }
        } catch (err) {
          console.error('Error syncing item:', err);
        }
      }

      if (pendingItems.length > 0) {
        toast({
          title: 'Synced',
          description: `${pendingItems.length} updates synced successfully.`,
        });
        loadJobs();
      }
    } finally {
      setIsSyncing(false);
    }
  };

  // Load jobs when authenticated
  useEffect(() => {
    if (isAuthenticated && session) {
      loadJobs();
    }
  }, [isAuthenticated, session]);

  // Sync when coming online
  useEffect(() => {
    if (isOnline && isAuthenticated) {
      syncPendingUpdates();
    }
  }, [isOnline, isAuthenticated]);

  // Set up realtime subscription (still works as teams can subscribe to changes)
  useEffect(() => {
    if (!isAuthenticated || !session?.teamName) return;

    const channel = supabase
      .channel('team-jobs-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'jobs',
          filter: `team=eq.${session.teamName}`,
        },
        () => {
          loadJobs();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isAuthenticated, session?.teamName]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <TeamLoginForm onLogin={login} error={authError} />;
  }

  return (
    <div className="min-h-screen bg-background">
      <OfflineIndicator 
        isOnline={isOnline} 
        pendingSyncCount={pendingSyncCount}
        isSyncing={isSyncing}
        onSync={syncPendingUpdates}
      />
      
      {selectedJob ? (
        <TeamJobDetail
          job={selectedJob}
          teamId={session!.teamId}
          teamName={session!.teamName}
          onBack={() => setSelectedJob(null)}
          onJobUpdate={(updatedJob) => {
            setJobs(prev => prev.map(j => j.id === updatedJob.id ? updatedJob : j));
            setSelectedJob(updatedJob);
          }}
          isOnline={isOnline}
        />
      ) : (
        <TeamJobList
          jobs={jobs}
          teamName={session!.teamName}
          teamId={session!.teamId}
          isLoading={isLoadingJobs}
          onSelectJob={setSelectedJob}
          onRefresh={loadJobs}
          onLogout={logout}
        />
      )}
    </div>
  );
};

export default TeamPortal;
