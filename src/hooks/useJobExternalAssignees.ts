import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { Subcontractor } from './useSubcontractors';
import { notifyExternalAssigneeChanged } from './useJobsExternalAssigneesBulk';

export interface JobExternalAssignee {
  id: string;
  job_id: string;
  subcontractor_id: string;
  assigned_by: string | null;
  assignment_notes: string | null;
  created_at: string;
  subcontractor?: Subcontractor;
}

export const useJobExternalAssignees = (jobId: string | null | undefined) => {
  const [items, setItems] = useState<JobExternalAssignee[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    if (!jobId) {
      setItems([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const { data, error } = await supabase
      .from('job_external_assignees')
      .select('*, subcontractor:subcontractors(*)')
      .eq('job_id', jobId)
      .order('created_at', { ascending: true });
    if (error) {
      console.error('[useJobExternalAssignees]', error);
      toast.error('Failed to load external assignees');
    } else {
      setItems((data ?? []) as any);
    }
    setIsLoading(false);
  }, [jobId]);

  useEffect(() => {
    fetchAll();
    if (!jobId) return;
    const channel = supabase
      .channel(`job-ext-${jobId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'job_external_assignees',
        filter: `job_id=eq.${jobId}`,
      }, () => fetchAll())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [jobId, fetchAll]);

  const add = async (subcontractorId: string, notes?: string) => {
    if (!jobId) return null;
    const { data: userData } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('job_external_assignees')
      .insert({
        job_id: jobId,
        subcontractor_id: subcontractorId,
        assigned_by: userData.user?.id ?? null,
        assignment_notes: notes?.trim() || null,
      })
      .select()
      .single();
    if (error) {
      toast.error(`Failed to assign: ${error.message}`);
      return null;
    }
    toast.success('External assignee added');
    await fetchAll();
    return data;
  };

  const remove = async (assigneeId: string) => {
    const { error } = await supabase
      .from('job_external_assignees')
      .delete()
      .eq('id', assigneeId);
    if (error) {
      toast.error(`Failed: ${error.message}`);
      return false;
    }
    toast.success('Removed');
    await fetchAll();
    return true;
  };

  return { items, isLoading, refresh: fetchAll, add, remove };
};

/** Returns a Set of jobIds that have at least one external assignee — used for filtering. */
export const useJobsWithExternalAssignees = () => {
  const [jobIds, setJobIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('job_external_assignees')
      .select('job_id');
    if (!error && data) {
      setJobIds(new Set(data.map((d: any) => d.job_id)));
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
    const channel = supabase
      .channel('jobs-with-ext-global')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'job_external_assignees',
      }, () => fetchAll())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchAll]);

  return { jobIds, isLoading, refresh: fetchAll };
};
