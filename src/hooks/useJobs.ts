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
      // Check if team is being assigned
      const currentJob = jobs.find(j => j.id === id);
      const isNewTeamAssignment = updates.team && updates.team !== currentJob?.team;
      
      const updated = await updateJob(id, updates);
      setJobs(prev => prev.map(j => j.id === id ? updated : j));
      
      // Send push notification if team was just assigned
      if (isNewTeamAssignment && updates.team) {
        sendTeamNotification(updates.team, updated);
      }
      
      return updated;
    } catch (error) {
      console.error('Error updating job:', error);
      throw error;
    }
  };

  const sendTeamNotification = async (teamName: string, job: Job) => {
    try {
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

      // Send push notification with auth headers
      await supabase.functions.invoke('send-push-notification', {
        body: {
          teamId: teamData.team_id,
          title: 'New Job Assigned',
          body: `Job #${job.jobNumber} - ${job.name} has been assigned to your team`,
          data: { jobId: job.id, jobNumber: job.jobNumber }
        },
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      });

      console.log('Push notification sent to team:', teamName);
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
