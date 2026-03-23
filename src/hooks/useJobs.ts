import { useState, useEffect, useCallback, useRef, createElement } from 'react';
import { Job } from '@/types/job';
import { fetchJobs, createJob, updateJob, deleteJob, restoreJob } from '@/lib/api';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { ToastAction } from '@/components/ui/toast';

export const useJobs = (categoryId?: string) => {
  const cacheKey = `genie_jobs_cache_${categoryId || 'all'}`;
  const [jobs, setJobs] = useState<Job[]>(() => {
    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        const { data, timestamp } = JSON.parse(cached);
        if (Date.now() - timestamp < 10 * 60 * 1000) return data;
      }
    } catch {}
    return [];
  });
  const [isLoading, setIsLoading] = useState(() => {
    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        const { timestamp } = JSON.parse(cached);
        if (Date.now() - timestamp < 10 * 60 * 1000) return false;
      }
    } catch {}
    return true;
  });
  const { toast } = useToast();
  
  // Refs to prevent race conditions
  const loadingRef = useRef(false);
  const jobsLengthRef = useRef(0);
  const pendingUpdatesRef = useRef<Set<string>>(new Set());
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastFetchRef = useRef<number>(0);
  const integrityIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    jobsLengthRef.current = jobs.length;
  }, [jobs.length]);

  const loadJobs = useCallback(async (force = false, background = false) => {
    // Prevent concurrent fetches unless forced
    if (loadingRef.current && !force) {
      console.log('Skipping fetch - already loading');
      return;
    }
    
    // Debounce rapid fetches (minimum 500ms between fetches)
    const now = Date.now();
    if (!force && now - lastFetchRef.current < 500) {
      console.log('Skipping fetch - too soon since last fetch');
      return;
    }

    try {
      loadingRef.current = true;
      if (!background) setIsLoading(true);
      lastFetchRef.current = Date.now();
      
      const data = await fetchJobs(categoryId);
      
      // Only update state if no pending optimistic updates
      // This prevents overwriting optimistic updates with stale server data
      setJobs(prevJobs => {
        if (pendingUpdatesRef.current.size > 0) {
          console.log('Merging with pending optimistic updates:', pendingUpdatesRef.current.size);
          // Merge: keep optimistic updates for pending IDs, use server data for others
          const serverJobsMap = new Map(data.map(j => [j.id, j]));
          const prevJobsMap = new Map(prevJobs.map(j => [j.id, j]));
          
          return data.map(serverJob => {
            if (pendingUpdatesRef.current.has(serverJob.id)) {
              // Keep the optimistic version for pending updates
              return prevJobsMap.get(serverJob.id) || serverJob;
            }
            return serverJob;
          });
        }
        return data;
      });
      // Cache for instant restore
      try {
        sessionStorage.setItem(cacheKey, JSON.stringify({ data, timestamp: Date.now() }));
      } catch {}
    } catch (error) {
      console.error('Error loading jobs:', error);
      toast({
        title: "Error",
        description: "Failed to load jobs from database",
        variant: "destructive",
      });
    } finally {
      loadingRef.current = false;
      if (!background) setIsLoading(false);
    }
  }, [categoryId, toast]);

  // Debounced reload for realtime events
  const debouncedReload = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    
    debounceTimerRef.current = setTimeout(() => {
      // Only reload if no pending updates (to prevent overwriting optimistic state)
      if (pendingUpdatesRef.current.size === 0) {
        loadJobs(false, true);
      } else {
        console.log('Skipping realtime reload - pending updates exist');
      }
    }, 1000); // 1 second debounce for realtime events
  }, [loadJobs]);

  useEffect(() => {
    loadJobs(true); // Force initial load

    // Set up realtime subscription with debounced reload
    const channel = supabase
      .channel(`jobs-changes-${categoryId || 'all'}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'jobs'
        },
        (payload) => {
          const newRecord = payload.new as Record<string, unknown> | null;
          const oldRecord = payload.old as Record<string, unknown> | null;

          const newCategoryId = (newRecord?.category_id as string | null | undefined) ?? null;
          const oldCategoryId = (oldRecord?.category_id as string | null | undefined) ?? null;
          const isRelevantToCurrentCategory = !categoryId || newCategoryId === categoryId || oldCategoryId === categoryId;

          if (!isRelevantToCurrentCategory) return;

          console.log('Realtime update received:', payload.eventType, newRecord?.id || oldRecord?.id);
          
          // For DELETE events, update state immediately
          if (payload.eventType === 'DELETE' && oldRecord) {
            const deletedId = oldRecord.id as string;
            if (deletedId) {
              setJobs(prev => prev.filter(j => j.id !== deletedId));
            }
            return;
          }
          
          // For INSERT/UPDATE, check if this is our own optimistic update
          if (newRecord) {
            const newJobId = newRecord.id as string;
            
            // If this update was from our optimistic update, ignore it
            if (newJobId && pendingUpdatesRef.current.has(newJobId)) {
              console.log('Ignoring realtime update for pending optimistic job:', newJobId);
              return;
            }
          }
          
          // Debounce reload for other users' changes
          debouncedReload();
        }
      )
      .subscribe();

    // Periodic integrity check: verify local count matches DB every 30s
    const runIntegrityCheck = async () => {
      if (document.visibilityState !== 'visible') return;
      if (loadingRef.current || pendingUpdatesRef.current.size > 0) return;
      try {
        let query = supabase
          .from('jobs')
          .select('id', { count: 'exact', head: true })
          .is('deleted_at', null);
        if (categoryId) query = query.eq('category_id', categoryId);
        const { count } = await query;
        if (count !== null && count !== jobsLengthRef.current) {
          console.log(`Integrity mismatch: local=${jobsLengthRef.current}, db=${count}. Auto-refreshing...`);
          loadJobs(true, true);
        }
      } catch { /* silent */ }
    };

    integrityIntervalRef.current = setInterval(runIntegrityCheck, 180000);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      if (integrityIntervalRef.current) {
        clearInterval(integrityIntervalRef.current);
      }
      supabase.removeChannel(channel);
    };
  }, [categoryId, loadJobs, debouncedReload]);

  const addJob = async (job: Omit<Job, 'id'>) => {
    try {
      const newJob = await createJob(job, categoryId);
      setJobs(prev => [newJob, ...prev]);
      return newJob;
    } catch (error) {
      console.error('Error adding job:', error);
      throw error;
    }
  };

  const editJob = async (id: string, updates: Partial<Job>) => {
    try {
      const currentJob = jobs.find(j => j.id === id);
      if (!currentJob) {
        throw new Error('Job not found in local state');
      }
      
      const previousTeam = currentJob?.team;
      const previousTeam2 = currentJob?.team2;
      const newTeam = updates.team;
      const newTeam2 = updates.team2;
      const previousStatus = currentJob?.status;
      const newStatus = updates.status;

      // CRITICAL: Booked date overrides completion status
      // When a booked date is set on a completed job, un-complete it
      if (updates.bookedDate && (currentJob.isCompleted || currentJob.status === 'complete')) {
        updates.isCompleted = false;
        updates.status = 'started' as any;
        updates.completionDate = null;
        updates.progress = 50;
      }

      // CRITICAL: Enforce completion flag consistency
      // When status changes to 'complete', sync all completion fields
      if (newStatus === 'complete') {
        updates.isCompleted = true;
        updates.progress = 100;
        if (!updates.completionDate) {
          updates.completionDate = new Date();
        }
      }
      // When status changes FROM 'complete' to something else, reset completion
      if (newStatus && newStatus !== 'complete' && (currentJob.status === 'complete' || currentJob.isCompleted)) {
        updates.isCompleted = false;
        updates.completionDate = null;
        if (updates.progress === undefined || updates.progress === 100) {
          updates.progress = 0;
        }
      }
      // When isCompleted is set directly, sync status too
      if ('isCompleted' in updates) {
        if (updates.isCompleted) {
          updates.status = 'complete';
          updates.progress = 100;
          if (!updates.completionDate) updates.completionDate = new Date();
        } else if (currentJob.isCompleted) {
          // Un-completing: reset status if it was 'complete'
          if (!newStatus && currentJob.status === 'complete') {
            updates.status = 'pending';
          }
          updates.completionDate = null;
          if (updates.progress === undefined || updates.progress === 100) {
            updates.progress = 0;
          }
        }
      }
      
      // Check if primary team is being assigned or unassigned
      const isNewTeam1Assignment = newTeam && newTeam !== previousTeam;
      const isTeam1Unassigned = 'team' in updates && !newTeam && previousTeam;
      
      // Check if secondary team is being assigned or unassigned
      const isNewTeam2Assignment = newTeam2 && newTeam2 !== previousTeam2;
      const isTeam2Unassigned = 'team2' in updates && !newTeam2 && previousTeam2;
      
      // Check if status changed
      const isStatusChanged = 'status' in updates && newStatus && newStatus !== previousStatus;
      
      // Mark this job as having a pending update to prevent realtime overwrite
      pendingUpdatesRef.current.add(id);
      
      // Optimistic update - immediately update local state for responsive UI
      const optimisticJob = { ...currentJob, ...updates };
      setJobs(prev => prev.map(j => j.id === id ? optimisticJob : j));
      
      try {
        const updated = await updateJob(id, updates);
        
        // Clear pending flag after successful server update
        pendingUpdatesRef.current.delete(id);
        
        // Replace optimistic update with server response
        setJobs(prev => prev.map(j => j.id === id ? updated : j));
      
        // Send push notification if primary team was just assigned
        if (isNewTeam1Assignment && newTeam) {
          sendTeamNotification(newTeam, updated, 'assigned');
        }
        
        // Send push notification if secondary team was just assigned
        if (isNewTeam2Assignment && newTeam2) {
          sendTeamNotification(newTeam2, updated, 'assigned');
        }
        
        // Send push notification if primary team was unassigned
        if (isTeam1Unassigned && previousTeam) {
          sendTeamNotification(previousTeam, { ...updated, team: previousTeam }, 'unassigned');
        }
        
        // Send push notification if secondary team was unassigned
        if (isTeam2Unassigned && previousTeam2) {
          sendTeamNotification(previousTeam2, { ...updated, team: previousTeam2 }, 'unassigned');
        }
        
        // Send push notification if status changed (to both assigned teams)
        if (isStatusChanged) {
          if (updated.team) {
            sendTeamNotification(updated.team, updated, 'status_changed', newStatus);
          }
          if (updated.team2) {
            sendTeamNotification(updated.team2, updated, 'status_changed', newStatus);
          }
        }
        
        return updated;
      } catch (serverError) {
        // Clear pending flag and rollback optimistic update on server error
        pendingUpdatesRef.current.delete(id);
        setJobs(prev => prev.map(j => j.id === id ? currentJob : j));
        throw serverError;
      }
    } catch (error: any) {
      console.error('Error updating job:', error);
      // Re-throw with preserved error details
      const errorMessage = error?.message || 'Failed to update job';
      const detailedError = new Error(errorMessage);
      (detailedError as any).details = error?.details;
      (detailedError as any).code = error?.code;
      throw detailedError;
    }
  };

  const sendTeamNotification = async (teamName: string, job: Job, type: 'assigned' | 'unassigned' | 'status_changed' = 'assigned', newStatus?: string) => {
    try {
      console.log(`Sending push notification to team: ${teamName} for job: ${job.jobNumber} (${type})`);
      
      // Get team_id from team_access_codes
      const { data: teamData } = await supabase
        .from('team_access_codes')
        .select('team_id')
        .eq('team_name', teamName)
        .eq('is_active', true)
        .single();

      if (!teamData?.team_id) {
        console.log('No active team found for:', teamName);
        return;
      }

      // Get auth headers for the edge function call
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        console.log('No auth session for push notification');
        return;
      }

      let title: string;
      let body: string;
      
      if (type === 'assigned') {
        title = 'New Job Assigned';
        body = `Job #${job.jobNumber} - ${job.name} has been assigned to your team`;
      } else if (type === 'unassigned') {
        title = 'Job Unassigned';
        body = `Job #${job.jobNumber} - ${job.name} has been removed from your team`;
      } else {
        // status_changed
        const statusLabel = newStatus?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) || 'Updated';
        title = `Job Status: ${statusLabel}`;
        body = `Job #${job.jobNumber} - ${job.name} status changed to ${statusLabel}`;
      }

      // Send native push (Android/iOS) via FCM
      const fcmRes = await supabase.functions.invoke('send-fcm-notification', {
        body: {
          teamId: teamData.team_id,
          title,
          body,
          data: { jobId: job.id, jobNumber: job.jobNumber, type },
        },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });
      console.log('FCM send result:', fcmRes);

      // Send web push (PWA) as well (if any subscriptions exist)
      const webRes = await supabase.functions.invoke('send-push-notification', {
        body: {
          teamId: teamData.team_id,
          title,
          body,
          data: { jobId: job.id, jobNumber: job.jobNumber, type },
        },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });
      console.log('Web push send result:', webRes);

      console.log(`Notifications queued for team: ${teamName} (${type})`);
    } catch (error) {
      console.error('Error sending push notification:', error);
      // Don't throw - notification failure shouldn't block job update
    }
  };

  const removeJob = async (id: string) => {
    // Store the job for undo
    const deletedJob = jobs.find(j => j.id === id);
    
    try {
      // Optimistic delete from UI
      setJobs(prev => prev.filter(j => j.id !== id));
      
      await deleteJob(id);

      // Show undo toast
      if (deletedJob) {
        toast({
          title: "Job deleted",
          description: `${deletedJob.jobNumber} - ${deletedJob.name}`,
          action: createElement(ToastAction, {
            altText: 'Undo delete',
            onClick: async () => {
              try {
                await restoreJob(id);
                setJobs(prev => [deletedJob, ...prev]);
                toast({ title: "Job restored", description: `${deletedJob.jobNumber} has been restored` });
              } catch (err) {
                console.error('Error restoring job:', err);
                toast({ title: "Error", description: "Failed to restore job", variant: "destructive" });
              }
            }
          } as any, 'Undo') as any,
          duration: 10000,
        });
      }
    } catch (error) {
      // Rollback on error
      if (deletedJob) {
        setJobs(prev => [deletedJob, ...prev]);
      }
      console.error('Error deleting job:', error);
      throw error;
    }
  };

  const toggleComplete = async (job: Job) => {
    const newCompleted = !(job.isCompleted || job.progress === 100);
    await editJob(job.id, {
      isCompleted: newCompleted,
      // editJob will auto-sync status, progress, and completionDate
    });
  };

  return {
    jobs,
    isLoading,
    addJob,
    editJob,
    removeJob,
    toggleComplete,
    refreshJobs: () => loadJobs(true, false) // Force refresh
  };
};
