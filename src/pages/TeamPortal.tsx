import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
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
import { Capacitor } from '@capacitor/core';
import { PushNotifications, Token } from '@capacitor/push-notifications';

const TeamPortal = () => {
  const [searchParams, setSearchParams] = useSearchParams();
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

  // Handle deep link from notification
  const handleDeepLink = useCallback((loadedJobs: Job[]) => {
    const jobIdFromUrl = searchParams.get('job');
    const actionFromUrl = searchParams.get('action');
    
    if (jobIdFromUrl && loadedJobs.length > 0) {
      const targetJob = loadedJobs.find(j => j.id === jobIdFromUrl);
      if (targetJob) {
        setSelectedJob(targetJob);
        // Clear URL params after handling
        setSearchParams({});
        
        if (actionFromUrl === 'submit') {
          toast({
            title: 'জব খোলা হয়েছে',
            description: `জব #${targetJob.jobNumber} - এখানে আপনার কাজ সাবমিট করুন`,
          });
        }
      }
    }
  }, [searchParams, setSearchParams, toast]);

  // Listen for messages from service worker
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'NOTIFICATION_CLICK') {
        const jobId = event.data.jobId;
        if (jobId && jobs.length > 0) {
          const targetJob = jobs.find(j => j.id === jobId);
          if (targetJob) {
            setSelectedJob(targetJob);
            toast({
              title: 'জব খোলা হয়েছে',
              description: `জব #${targetJob.jobNumber}`,
            });
          }
        }
      }
    };

    navigator.serviceWorker?.addEventListener('message', handleMessage);
    return () => {
      navigator.serviceWorker?.removeEventListener('message', handleMessage);
    };
  }, [jobs, toast]);

  // Check for pending job from Capacitor notification
  useEffect(() => {
    const pendingJobId = sessionStorage.getItem('pendingJobId');
    if (pendingJobId && jobs.length > 0) {
      const targetJob = jobs.find(j => j.id === pendingJobId);
      if (targetJob) {
        setSelectedJob(targetJob);
        sessionStorage.removeItem('pendingJobId');
        toast({
          title: 'জব খোলা হয়েছে',
          description: `জব #${targetJob.jobNumber} - এখানে আপনার কাজ সাবমিট করুন`,
        });
      }
    }
  }, [jobs, toast]);

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
        
        // Handle deep link after jobs are loaded
        handleDeepLink(mappedJobs);
      } else {
        // Load from cache
        const cachedJobs = await getCachedJobs(session.teamName);
        setJobs(cachedJobs);
        handleDeepLink(cachedJobs);
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
        handleDeepLink(cachedJobs);
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

  // Push notifications (Native Android/iOS)
  // Note: OS permission prompts cannot be shown "during install" automatically; we request on the first app open,
  // then bind the token to the team after login.
  const pushInitRef = useRef(false);

  const saveFcmTokenToTeam = useCallback(
    async (token: string, teamId: string) => {
      const platform = Capacitor.getPlatform();
      console.log('[push] saving token for team', { teamId, platform });

      const { data: existing, error: selectError } = await supabase
        .from('team_fcm_tokens' as any)
        .select('id')
        .eq('team_id', teamId)
        .eq('fcm_token', token)
        .maybeSingle();

      if (selectError) console.error('[push] select token error', selectError);

      if (!existing) {
        const { error: insertError } = await supabase
          .from('team_fcm_tokens' as any)
          .insert({ team_id: teamId, fcm_token: token, platform } as any);

        if (insertError) {
          console.error('[push] insert token error', insertError);
        } else {
          console.log('[push] token saved');
        }
      }
    },
    []
  );

  // 1) Ask permission + register on first native app open
  useEffect(() => {
    const initPush = async () => {
      if (!Capacitor.isNativePlatform() || pushInitRef.current) return;
      pushInitRef.current = true;

      try {
        console.log('[push] init start');

        await PushNotifications.addListener('registration', async (token: Token) => {
          console.log('[push] registration success', token.value);
          localStorage.setItem('pending_fcm_token', token.value);

          // If already logged in, save immediately
          if (session?.teamId) {
            await saveFcmTokenToTeam(token.value, session.teamId);
          }
        });

        await PushNotifications.addListener('registrationError', (error) => {
          console.error('[push] registration error', error);
        });

        const perm = await PushNotifications.checkPermissions();
        console.log('[push] permission status', perm);

        if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
          const result = await PushNotifications.requestPermissions();
          console.log('[push] permission result', result);
          if (result.receive !== 'granted') return;
        }

        if (perm.receive === 'denied') return;

        await PushNotifications.register();
      } catch (e) {
        console.error('[push] init error', e);
      }
    };

    initPush();

    return () => {
      if (Capacitor.isNativePlatform()) {
        PushNotifications.removeAllListeners().catch(() => undefined);
      }
    };
  }, [session?.teamId, saveFcmTokenToTeam]);

  // 2) After login: bind any pending token to this team
  useEffect(() => {
    const bindPendingToken = async () => {
      if (!Capacitor.isNativePlatform() || !session?.teamId) return;
      const token = localStorage.getItem('pending_fcm_token');
      if (!token) return;

      await saveFcmTokenToTeam(token, session.teamId);
      toast({
        title: 'Notifications Enabled',
        description: 'You will now receive notifications for new jobs',
      });
    };

    bindPendingToken();
  }, [session?.teamId, toast, saveFcmTokenToTeam]);

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
      <div className="min-h-screen bg-background flex items-center justify-center safe-area-all">
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
