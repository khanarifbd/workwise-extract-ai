import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTeamAuth } from '@/hooks/useTeamAuth';
import { useOfflineStorage } from '@/hooks/useOfflineStorage';
import { useNewJobNotification } from '@/hooks/useNewJobNotification';
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
    updateTeamJob,
    updateLanguagePreference,
    removeJobFromTeam,
  } = useTeamAuth();
  const { isOnline, pendingSyncCount, lastSyncTime, cacheJobs, getCachedJobs, getPendingSyncItems, markSynced } = useOfflineStorage(session?.teamId);
  const { notifyNewJob } = useNewJobNotification();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [isLoadingJobs, setIsLoadingJobs] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);
  const [justSynced, setJustSynced] = useState(false);
  const { toast } = useToast();

  // Set status bar color on native platforms
  useEffect(() => {
    const configureStatusBar = async () => {
      if (Capacitor.isNativePlatform()) {
        try {
          // Dynamic import for native-only plugin
          const { StatusBar, Style } = await import('@capacitor/status-bar');
          // Allow WebView to extend behind the status bar so safe-area-inset works
          await StatusBar.setOverlaysWebView({ overlay: true });
          await StatusBar.setStyle({ style: Style.Light });
        } catch (error) {
          console.error('Error setting status bar:', error);
        }
      }
    };
    configureStatusBar();
  }, []);

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

  // Load jobs for the authenticated team using secure backend function
  // Supports delta polling: when "since" is provided, we merge updated jobs into local state.
  const lastJobsSyncRef = useRef<string | null>(null);

  const loadJobs = async (opts?: { since?: string; silent?: boolean }) => {
    if (!session?.teamName) return;

    const since = opts?.since;
    const isOpsManager = session.isOpsManager === true;

    if (!opts?.silent) setIsLoadingJobs(true);

    try {
      if (isOnline) {
        const { jobs: data, serverTime } = await fetchTeamJobs(since);
        const mappedJobs = (data || []).map((row: any) => mapDatabaseJobToJob(row));

        if (since) {
          // Delta merge: upsert updated jobs into the existing list.
          // For Ops Manager: also remove jobs that no longer qualify
          // (team removed, booked_date removed, or soft-deleted).
          if (mappedJobs.length > 0) {
            setJobs((prev) => {
              const map = new Map(prev.map((j) => [j.id, j] as const));
              for (const j of mappedJobs) {
                if (isOpsManager) {
                  // Ops Manager criteria: must have team AND booked_date
                  const hasTeam = (j.team && String(j.team).trim() !== '') || (j.team2 && String(j.team2).trim() !== '');
                  const hasBookedDate = !!j.bookedDate;
                  if (hasTeam && hasBookedDate) {
                    map.set(j.id, j);
                  } else {
                    // No longer qualifies - remove from list
                    map.delete(j.id);
                  }
                } else {
                  // Regular team: check if still assigned
                  const isAssigned = j.team === session.teamName || j.team2 === session.teamName;
                  if (isAssigned) {
                    map.set(j.id, j);
                  } else {
                    map.delete(j.id);
                  }
                }
              }
              return Array.from(map.values());
            });
          }
        } else {
          setJobs(mappedJobs);
          // Cache for offline use with team name for sync time tracking
          await cacheJobs(mappedJobs, session.teamName);
          // Handle deep link after jobs are loaded
          handleDeepLink(mappedJobs);
        }

        // Advance watermark (prefer server time; fallback to now)
        lastJobsSyncRef.current = serverTime || new Date().toISOString();
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

      if (!since) {
        // Try to load from cache on full-load errors
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
      }
    } finally {
      if (!opts?.silent) setIsLoadingJobs(false);
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

  // Stable reference for loadJobs to prevent recreating intervals
  const loadJobsRef = useRef(loadJobs);
  loadJobsRef.current = loadJobs;

  // Load jobs when authenticated
  useEffect(() => {
    if (isAuthenticated && session) {
      loadJobsRef.current();
    }
  }, [isAuthenticated, session]);

  // Separate effect for auto-refresh to prevent recreation on every render
  // Ops Managers get fast delta polling for near real-time visibility of assignments
  useEffect(() => {
    if (!isAuthenticated || !session) return;

    const isOpsManager = session.isOpsManager === true;

    // Ops Managers: delta poll every 5s while app is visible; fallback 15s
    const visiblePollInterval = isOpsManager ? 5000 : 30000;
    const hiddenPollInterval = isOpsManager ? 15000 : 30000;

    let intervalId: number | undefined;

    const startInterval = (ms: number) => {
      if (intervalId) window.clearInterval(intervalId);
      intervalId = window.setInterval(() => {
        if (!navigator.onLine) return;
        const since = lastJobsSyncRef.current || undefined;
        loadJobsRef.current({ since, silent: true });
      }, ms);
    };

    const handleVisibility = () => {
      const isVisible = document.visibilityState === 'visible';
      startInterval(isVisible ? visiblePollInterval : hiddenPollInterval);
    };

    handleVisibility();
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      if (intervalId) window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [isAuthenticated, session]);

  // Sync when coming online - use stable refs
  const syncPendingUpdatesRef = useRef(syncPendingUpdates);
  syncPendingUpdatesRef.current = syncPendingUpdates;

  useEffect(() => {
    if (isOnline && isAuthenticated) {
      syncPendingUpdatesRef.current();
      loadJobsRef.current();
    }
  }, [isOnline, isAuthenticated]);

  // Use refs to avoid recreating subscriptions on every state change
  const selectedJobRef = useRef(selectedJob);
  selectedJobRef.current = selectedJob;

  // Set up realtime subscription - listen to all job changes for IMMEDIATE updates
  // For Ops Managers: listen to ALL jobs where any team is assigned
  // For Regular Teams: listen only to jobs assigned to their team
  useEffect(() => {
    if (!isAuthenticated || !session?.teamName) return;
    
    const teamName = session.teamName;
    const isOpsManager = session.isOpsManager === true;
    
    console.log(`[TeamPortal] Setting up realtime subscription for ${isOpsManager ? 'Ops Manager' : `Team ${teamName}`}`);

    const channel = supabase
      .channel(`team-jobs-realtime-${teamName}-${isOpsManager ? 'ops' : 'team'}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'jobs',
        },
        (payload) => {
          const newJob = payload.new as any;
          
          // For Ops Manager: must have BOTH a team AND a booked_date
          // For Regular Team: only show if this team is assigned
          const hasAnyTeam = (newJob?.team && String(newJob.team).trim() !== '') || (newJob?.team2 && String(newJob.team2).trim() !== '');
          const hasBookedDate = !!newJob?.booked_date;
          const isAssignedToThisTeam = newJob?.team === teamName || newJob?.team2 === teamName;
          const shouldShow = isOpsManager ? (hasAnyTeam && hasBookedDate) : isAssignedToThisTeam;
          
          if (shouldShow) {
            const mappedJob = mapDatabaseJobToJob(newJob);
            setJobs(prev => {
              if (prev.some(j => j.id === mappedJob.id)) return prev;
              return [mappedJob, ...prev];
            });
            
            // Play notification and show toast
            if (isAssignedToThisTeam || isOpsManager) {
              notifyNewJob();
              toast({
                title: isOpsManager ? '📋 New Job Added' : '🆕 New Job Assigned',
                description: `Job #${newJob.job_number} - ${newJob.name}${isOpsManager && newJob.team ? ` → ${newJob.team}` : ''}`,
              });
            }
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'jobs',
        },
        (payload) => {
          const changedJob = payload.new as any;
          const oldJob = payload.old as any;
          
          // For Ops Manager: job must have BOTH a team AND a booked_date to qualify
          const oldHasAnyTeam = (oldJob?.team && String(oldJob.team).trim() !== '') || (oldJob?.team2 && String(oldJob.team2).trim() !== '');
          const newHasAnyTeam = (changedJob?.team && String(changedJob.team).trim() !== '') || (changedJob?.team2 && String(changedJob.team2).trim() !== '');
          const oldHasBookedDate = !!oldJob?.booked_date;
          const newHasBookedDate = !!changedJob?.booked_date;
          
          // For Ops Manager: qualifies = has team + has booked_date
          const oldQualifiesForOps = oldHasAnyTeam && oldHasBookedDate;
          const newQualifiesForOps = newHasAnyTeam && newHasBookedDate;
          
          // For Regular Team: check assignment to this specific team
          const wasAssignedToThisTeam = oldJob?.team === teamName || oldJob?.team2 === teamName;
          const isAssignedToThisTeam = changedJob?.team === teamName || changedJob?.team2 === teamName;
          
          if (isOpsManager) {
            // OPS MANAGER LOGIC - job must be booked AND assigned to appear
            if (newQualifiesForOps && !oldQualifiesForOps) {
              // Job newly qualifies (team assigned + booked) - add it
              const mappedJob = mapDatabaseJobToJob(changedJob);
              setJobs(prev => {
                if (prev.some(j => j.id === mappedJob.id)) return prev;
                return [mappedJob, ...prev];
              });
              notifyNewJob();
              toast({
                title: '📋 Job Assignment',
                description: `Job #${changedJob.job_number} → ${changedJob.team}`,
              });
            } else if (oldQualifiesForOps && !newQualifiesForOps) {
              // Job no longer qualifies (team removed or booked_date removed) - remove it
              setJobs(prev => prev.filter(j => j.id !== changedJob.id));
              
              const currentSelectedJob = selectedJobRef.current;
              if (currentSelectedJob?.id === changedJob.id) {
                setSelectedJob(null);
              }
            } else if (newQualifiesForOps) {
              // Job still qualifies - update in place
              const mappedJob = mapDatabaseJobToJob(changedJob);
              setJobs(prev => prev.map(j => j.id === mappedJob.id ? mappedJob : j));
              
              const currentSelectedJob = selectedJobRef.current;
              if (currentSelectedJob?.id === mappedJob.id) {
                setSelectedJob(mappedJob);
              }
              
              // If team assignment changed, show a toast
              if (oldJob?.team !== changedJob?.team || oldJob?.team2 !== changedJob?.team2) {
                toast({
                  title: '🔄 Team Updated',
                  description: `Job #${changedJob.job_number} → ${changedJob.team}${changedJob.team2 ? ` + ${changedJob.team2}` : ''}`,
                });
              }
            }
          } else {
            // REGULAR TEAM LOGIC
            if (isAssignedToThisTeam && !wasAssignedToThisTeam) {
              // NEWLY ASSIGNED - add immediately
              const mappedJob = mapDatabaseJobToJob(changedJob);
              setJobs(prev => {
                if (prev.some(j => j.id === mappedJob.id)) return prev;
                return [mappedJob, ...prev];
              });
              notifyNewJob();
              toast({
                title: '🆕 New Job Assigned',
                description: `Job #${changedJob.job_number} - ${changedJob.name}`,
              });
            } else if (wasAssignedToThisTeam && !isAssignedToThisTeam) {
              // UNASSIGNED - remove immediately
              setJobs(prev => prev.filter(j => j.id !== changedJob.id));
              
              const currentSelectedJob = selectedJobRef.current;
              if (currentSelectedJob?.id === changedJob.id) {
                setSelectedJob(null);
                toast({
                  title: '⚠️ Job Unassigned',
                  description: `Job #${changedJob.job_number} has been removed from your team by admin.`,
                  variant: 'destructive',
                });
              } else {
                toast({
                  title: 'Job Removed',
                  description: `Job #${changedJob.job_number} has been unassigned from your team.`,
                });
              }
            } else if (isAssignedToThisTeam && wasAssignedToThisTeam) {
              // STILL ASSIGNED - update in place
              const mappedJob = mapDatabaseJobToJob(changedJob);
              setJobs(prev => prev.map(j => j.id === mappedJob.id ? mappedJob : j));
              
              const currentSelectedJob = selectedJobRef.current;
              if (currentSelectedJob?.id === mappedJob.id) {
                setSelectedJob(mappedJob);
              }
            }
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'jobs',
        },
        (payload) => {
          const deletedJob = payload.old as any;
          
          // Remove from list if it was in our list
          setJobs(prev => prev.filter(j => j.id !== deletedJob.id));
          
          const currentSelectedJob = selectedJobRef.current;
          if (currentSelectedJob?.id === deletedJob.id) {
            setSelectedJob(null);
            toast({
              title: 'Job Deleted',
              description: `Job #${deletedJob.job_number} has been deleted.`,
            });
          }
        }
      )
      .subscribe((status) => {
        console.log('[TeamPortal] Realtime subscription status:', status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isAuthenticated, session?.teamName, session?.isOpsManager, toast, notifyNewJob]);

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
    <div className="min-h-screen bg-background pt-[env(safe-area-inset-top)]">
      <OfflineIndicator
        isOnline={isOnline} 
        pendingSyncCount={pendingSyncCount}
        isSyncing={isSyncing}
        lastSyncTime={lastSyncTime}
        onSync={syncPendingUpdates}
        onManualRefresh={async () => {
          setIsManualRefreshing(true);
          try {
            await loadJobs();
            // Trigger sync animation
            setJustSynced(true);
            setTimeout(() => setJustSynced(false), 2500);
            toast({
              title: 'Refreshed',
              description: 'Jobs updated successfully.',
            });
          } finally {
            setIsManualRefreshing(false);
          }
        }}
        isRefreshing={isManualRefreshing}
        justSynced={justSynced}
      />
      
      {selectedJob ? (
        <TeamJobDetail
          job={selectedJob}
          teamId={session!.teamId}
          teamName={session!.teamName}
          languagePreference={session!.languagePreference || 'en'}
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
          languagePreference={session!.languagePreference || 'en'}
          isOpsManager={session!.isOpsManager || false}
          onSelectJob={setSelectedJob}
          onRefresh={loadJobs}
          onLogout={logout}
          onLanguageChange={async (lang) => {
            try {
              await updateLanguagePreference(lang);
              toast({
                title: 'Language Updated',
                description: 'Job descriptions will now be translated to your language.',
              });
            } catch (error) {
              toast({
                title: 'Failed to update language',
                description: 'Please try again.',
                variant: 'destructive',
              });
            }
          }}
          onRemoveJob={async (jobId, jobNumber) => {
            try {
              await removeJobFromTeam(jobId);
              // Remove from local state immediately
              setJobs(prev => prev.filter(j => j.id !== jobId));
              toast({
                title: 'Job Removed',
                description: `Job #${jobNumber} has been removed from your list.`,
              });
            } catch (error) {
              toast({
                title: 'Failed to remove job',
                description: 'Please try again.',
                variant: 'destructive',
              });
              throw error;
            }
          }}
        />
      )}
    </div>
  );
};

export default TeamPortal;
