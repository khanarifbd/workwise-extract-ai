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
      const updated = await updateJob(id, updates);
      setJobs(prev => prev.map(j => j.id === id ? updated : j));
      return updated;
    } catch (error) {
      console.error('Error updating job:', error);
      throw error;
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
