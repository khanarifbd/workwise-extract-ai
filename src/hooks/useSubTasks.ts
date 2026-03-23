import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { SubTask, mapDbSubTask } from '@/types/subTask';

export const useSubTasks = (parentJobId?: string) => {
  const [subTasks, setSubTasks] = useState<SubTask[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchSubTasks = useCallback(async () => {
    if (!parentJobId) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('job_sub_tasks')
        .select('*')
        .eq('parent_job_id', parentJobId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setSubTasks((data || []).map(mapDbSubTask));
    } catch (err) {
      console.error('Error fetching sub-tasks:', err);
    } finally {
      setIsLoading(false);
    }
  }, [parentJobId]);

  useEffect(() => {
    fetchSubTasks();
  }, [fetchSubTasks]);

  // Realtime subscription
  useEffect(() => {
    if (!parentJobId) return;
    const channel = supabase
      .channel(`sub-tasks-${parentJobId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'job_sub_tasks',
        filter: `parent_job_id=eq.${parentJobId}`,
      }, () => {
        fetchSubTasks();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [parentJobId, fetchSubTasks]);

  const updateSubTask = async (id: string, updates: Record<string, any>) => {
    const { error } = await supabase
      .from('job_sub_tasks')
      .update(updates)
      .eq('id', id);
    if (error) throw error;
    await fetchSubTasks();
  };

  return { subTasks, isLoading, fetchSubTasks, updateSubTask };
};

// Hook to fetch ALL sub-tasks across all jobs (for control panel)
export const useAllSubTasks = () => {
  const [subTasks, setSubTasks] = useState<SubTask[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchAll = useCallback(async (background = false) => {
    if (!background) setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('job_sub_tasks')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setSubTasks((data || []).map(mapDbSubTask));
    } catch (err) {
      console.error('Error fetching all sub-tasks:', err);
    } finally {
      if (!background) setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(false); }, [fetchAll]);

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel('all-sub-tasks')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'job_sub_tasks',
      }, () => {
        fetchAll(true);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchAll]);

  const updateSubTask = async (id: string, updates: Record<string, any>) => {
    const { error } = await supabase
      .from('job_sub_tasks')
      .update(updates)
      .eq('id', id);
    if (error) throw error;
    await fetchAll(true);
  };

  return { subTasks, isLoading, fetchAll, updateSubTask };
};
