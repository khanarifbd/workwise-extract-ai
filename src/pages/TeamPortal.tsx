import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTeamAuth } from '@/hooks/useTeamAuth';
import { useOfflineStorage } from '@/hooks/useOfflineStorage';
import { useNewJobNotification } from '@/hooks/useNewJobNotification';
import { TeamLoginForm } from '@/components/team-portal/TeamLoginForm';
import { TeamJobList } from '@/components/team-portal/TeamJobList';
import { TeamJobDetail } from '@/components/team-portal/TeamJobDetail';
import { OfflineIndicator } from '@/components/team-portal/OfflineIndicator';
import { EODReminder } from '@/components/team-portal/EODReminder';
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
  const [isDmTeam, setIsDmTeam] = useState(false);
  const { toast } = useToast();

  // Determine if this team is a DM team (only DM teams require EOD reports)
  useEffect(() => {
    if (!session?.teamName || session?.isOpsManager) {
      setIsDmTeam(false);
      return;
    }
    let cancelled = false;
    supabase
      .from('team_notification_settings')
      .select('team_type')
      .eq('team_name', session.teamName)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setIsDmTeam(data?.team_type === 'dm');
      });
    return () => { cancelled = true; };
  }, [session?.teamName, session?.isOpsManager]);

  // Set status bar color on native platforms
  useEffect(() => {
    const configureStatusBar = async () => {
      if (Capacitor.isNativePlatform()) {
        try {
          // Dynamic import for native-only plugin
          const { StatusBar, Style } = await import('@capacitor/status-bar');
          // iOS: keep WebView below status bar to avoid notch/status overlap.
          // Android can stay overlayed for edge-to-edge layout.
          const overlay = Capacitor.getPlatform() === 'android';
          await StatusBar.setOverlaysWebView({ overlay });
          await StatusBar.setStyle({ style: Style.Light });
        } catch (error) {
          console.error('Error setting status bar:', error);
        }
      }
    };
    configureStatusBar();
  }, []);

  // Android hardware back button: navigate within the app instead of exiting
  // - If a job detail is open → return to home (job list)
  // - Otherwise → minimise the app (so users don't accidentally lose state)
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let remove: (() => void) | undefined;
    (async () => {
      try {
        const { App } = await import('@capacitor/app');
        const handle = await App.addListener('backButton', () => {
          if (selectedJob) {
            setSelectedJob(null);
            return;
          }
          // At home screen — minimise instead of exiting
          App.minimizeApp().catch(() => App.exitApp());
        });
        remove = () => handle.remove();
      } catch (e) {
        console.warn('[backButton] not available:', e);
      }
    })();
    return () => { remove?.(); };
  }, [selectedJob]);

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
  const loadJobsInFlightRef = useRef<Promise<void> | null>(null);
  const lastFullLoadAtRef = useRef(0);
  const lastResumeRefreshAtRef = useRef(0);

  const loadJobs = async (opts?: { since?: string; silent?: boolean }) => {
    if (!session?.teamName) return;
    if (loadJobsInFlightRef.current) return loadJobsInFlightRef.current;

    const since = opts?.since;
    const isOpsManager = session.isOpsManager === true;

    if (!since && opts?.silent && Date.now() - lastFullLoadAtRef.current < 15000) return;

    if (!opts?.silent) setIsLoadingJobs(true);

    const run = (async () => { try {
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
          lastFullLoadAtRef.current = Date.now();
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
      loadJobsInFlightRef.current = null;
    } })();
    loadJobsInFlightRef.current = run;
    return run;
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
          } else if (item.actionType === 'job_complete') {
            // Full sign-off payload queued from TeamJobDetail when offline.
            // Forward the complete data package so the edge function records
            // team_sign_offs + flips the job to complete in the DB.
            const p = item.payload || {};
            await updateTeamJob(p.id || p.jobId, {
              status: p.status ?? 'complete',
              progress: p.progress ?? 100,
              notes: p.notes,
              photos: p.photos,
              videos: p.videos,
              documents: p.documents,
              workItemUpdates: p.workItemUpdates,
              isCompletion: true,
            });
            await markSynced(item.id);
          } else if (item.actionType === 'file_upload') {
            await updateTeamJob(item.payload.jobId || item.payload.id, {
              photos: item.payload.photos,
              videos: item.payload.videos,
              documents: item.payload.documents,
              notes: item.payload.notes,
            });
            await markSynced(item.id);
          } else {
            console.warn('[sync] Unknown queued actionType, skipping:', item.actionType);
          }
        } catch (err) {
          console.error('Error syncing item:', err, 'actionType:', (item as any).actionType);
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
  const sessionRef = useRef(session);
  sessionRef.current = session;

  const saveFcmTokenToTeam = useCallback(
    async (token: string, teamId: string) => {
      const platform = Capacitor.getPlatform();
      console.log('[push] saving token for team', { teamId, platform });

      const { error } = await supabase.functions.invoke('register-fcm-token', {
        body: { action: 'upsert', teamId, fcmToken: token, platform },
      });

      if (error) {
        console.error('[push] register-fcm-token error', error);
      } else {
        console.log('[push] token saved');
      }
    },
    []
  );

  // 1) Ask permission + register on first native app open (runs ONCE for app lifetime)
  // We intentionally use [] deps so the registration listener is never torn down on
  // session changes — otherwise token refresh events would be lost after login.
  useEffect(() => {
    const initPush = async () => {
      if (!Capacitor.isNativePlatform() || pushInitRef.current) return;
      pushInitRef.current = true;

      try {
        console.log('[push] init start');

        await PushNotifications.addListener('registration', async (token: Token) => {
          console.log('[push] registration success');
          localStorage.setItem('pending_fcm_token', token.value);

          // If already logged in, save immediately (read latest session via ref)
          const currentTeamId = sessionRef.current?.teamId;
          if (currentTeamId) {
            await saveFcmTokenToTeam(token.value, currentTeamId);
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
      // Only tear down on real app unmount
      if (Capacitor.isNativePlatform()) {
        PushNotifications.removeAllListeners().catch(() => undefined);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // Native apps do not always fire normal browser focus events reliably when
  // resuming from background, so force a refresh when the app becomes active.
  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !isAuthenticated) return;

    let remove: (() => void) | undefined;

    (async () => {
      try {
        const { App } = await import('@capacitor/app');
        const listener = await App.addListener('appStateChange', ({ isActive }) => {
          if (!isActive) return;
          if (!navigator.onLine) return;
          if (Date.now() - lastResumeRefreshAtRef.current < 15000) return;
          lastResumeRefreshAtRef.current = Date.now();
          syncPendingUpdatesRef.current();
          loadJobsRef.current({ silent: true });
        });
        remove = () => listener.remove();
      } catch (error) {
        console.warn('[appStateChange] listener unavailable:', error);
      }
    })();

    return () => {
      remove?.();
    };
  }, [isAuthenticated]);

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
    <div className="min-h-screen bg-background">
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

      {isAuthenticated && session && (
        <EODReminder
          teamId={session.teamId}
          teamName={session.teamName}
          jobs={jobs}
          enabled={isDmTeam}
          autoOpen={searchParams.get('eod') === '1'}
          onAutoOpenHandled={() => {
            const next = new URLSearchParams(searchParams);
            next.delete('eod');
            setSearchParams(next, { replace: true });
          }}
        />
      )}
      
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
