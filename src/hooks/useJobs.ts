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
      const previousTeam = currentJob?.team;
      const newTeam = updates.team;
      
      // Check if team is being assigned or unassigned
      const isNewTeamAssignment = newTeam && newTeam !== previousTeam;
      const isTeamUnassigned = 'team' in updates && !newTeam && previousTeam;
      
      const updated = await updateJob(id, updates);
      setJobs(prev => prev.map(j => j.id === id ? updated : j));
      
      // Send push notification if team was just assigned
      if (isNewTeamAssignment && newTeam) {
        sendTeamNotification(newTeam, updated, 'assigned');
      }
      
      // Send push notification if team was unassigned
      if (isTeamUnassigned && previousTeam) {
        sendTeamNotification(previousTeam, { ...updated, team: previousTeam }, 'unassigned');
      }
      
      return updated;
    } catch (error) {
      console.error('Error updating job:', error);
      throw error;
    }
  };

  const sendTeamNotification = async (teamName: string, job: Job, type: 'assigned' | 'unassigned' = 'assigned') => {
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

      const title = type === 'assigned' ? 'New Job Assigned' : 'Job Unassigned';
      const body = type === 'assigned' 
        ? `Job #${job.jobNumber} - ${job.name} has been assigned to your team`
        : `Job #${job.jobNumber} - ${job.name} has been removed from your team`;

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
