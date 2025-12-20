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
  const { session, isAuthenticated, isLoading: authLoading, login, logout, error: authError } = useTeamAuth();
  const { isOnline, pendingSyncCount, cacheJobs, getCachedJobs, getPendingSyncItems, markSynced } = useOfflineStorage();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [isLoadingJobs, setIsLoadingJobs] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const { toast } = useToast();

  // Load jobs for the authenticated team
  const loadJobs = async () => {
    if (!session?.teamName) return;

    setIsLoadingJobs(true);
    try {
      if (isOnline) {
        const { data, error } = await supabase
          .from('jobs')
          .select('*')
          .eq('team', session.teamName)
          .order('created_at', { ascending: false });

        if (error) throw error;

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

  // Sync pending updates when online
  const syncPendingUpdates = async () => {
    if (!isOnline || isSyncing) return;

    setIsSyncing(true);
    try {
      const pendingItems = await getPendingSyncItems();
      
      for (const item of pendingItems) {
        try {
          if (item.actionType === 'progress_update' || item.actionType === 'status_update') {
            const { error } = await supabase
              .from('jobs')
              .update(item.payload)
              .eq('id', item.payload.id);

            if (!error) {
              await markSynced(item.id);
            }
          } else if (item.actionType === 'photo_upload') {
            // Handle photo upload sync
            const { error } = await supabase
              .from('team_job_updates')
              .insert({
                job_id: item.payload.jobId,
                team_id: item.teamId,
                photos: item.payload.photos,
                notes: item.payload.notes,
                synced_at: new Date().toISOString(),
              });

            if (!error) {
              await markSynced(item.id);
            }
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

  // Set up realtime subscription
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
