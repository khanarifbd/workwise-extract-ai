import { useState, useEffect, useCallback } from 'react';
import { Job } from '@/types/job';
import { fetchJobs, createJob, updateJob, deleteJob } from '@/lib/api';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export const useJobs = (categoryId?: string) => {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  const loadJobs = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await fetchJobs(categoryId);
      setJobs(data);
    } catch (error) {
      console.error('Error loading jobs:', error);
      toast({
        title: "Error",
        description: "Failed to load jobs from database",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [categoryId, toast]);

  useEffect(() => {
    loadJobs();

    // Set up realtime subscription
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
          console.log('Realtime update:', payload);
          loadJobs(); // Reload jobs on any change
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [categoryId, loadJobs]);

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
      
      // Check if primary team is being assigned or unassigned
      const isNewTeam1Assignment = newTeam && newTeam !== previousTeam;
      const isTeam1Unassigned = 'team' in updates && !newTeam && previousTeam;
      
      // Check if secondary team is being assigned or unassigned
      const isNewTeam2Assignment = newTeam2 && newTeam2 !== previousTeam2;
      const isTeam2Unassigned = 'team2' in updates && !newTeam2 && previousTeam2;
      
      // Check if status changed
      const isStatusChanged = 'status' in updates && newStatus && newStatus !== previousStatus;
      
      // Optimistic update - immediately update local state for responsive UI
      const optimisticJob = { ...currentJob, ...updates };
      setJobs(prev => prev.map(j => j.id === id ? optimisticJob : j));
      
      try {
        const updated = await updateJob(id, updates);
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
        // Rollback optimistic update on server error
        setJobs(prev => prev.map(j => j.id === id ? currentJob : j));
        throw serverError;
      }
    } catch (error) {
      console.error('Error updating job:', error);
      throw error;
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
    try {
      await deleteJob(id);
      setJobs(prev => prev.filter(j => j.id !== id));
    } catch (error) {
      console.error('Error deleting job:', error);
      throw error;
    }
  };

  const toggleComplete = async (job: Job) => {
    const newCompleted = !(job.isCompleted || job.progress === 100);
    await editJob(job.id, {
      isCompleted: newCompleted,
      progress: newCompleted ? 100 : job.progress === 100 ? 0 : job.progress,
      completionDate: newCompleted ? new Date() : null
    });
  };

  return {
    jobs,
    isLoading,
    addJob,
    editJob,
    removeJob,
    toggleComplete,
    refreshJobs: loadJobs
  };
};
