import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface BulkExternalAssignee {
  id: string;                  // job_external_assignees.id
  job_id: string;
  subcontractor_id: string;
  name: string;
  company: string | null;
  trade: string | null;
  phone: string | null;
}

/**
 * Bulk fetch external assignees for a set of jobIds in a single query
 * (chunked) + one realtime subscription. Avoids N per-row hooks/channels.
 */
export const useJobsExternalAssigneesBulk = (jobIds: string[]) => {
  const [map, setMap] = useState<Map<string, BulkExternalAssignee[]>>(new Map());
  const [isLoading, setIsLoading] = useState(true);

  const jobIdHash = useMemo(
    () => (jobIds.length === 0
      ? 'empty'
      : `${jobIds.length}_${jobIds[0]?.slice(0, 8)}_${jobIds[jobIds.length - 1]?.slice(0, 8)}`),
    [jobIds]
  );

  const fetchAll = useCallback(async () => {
    if (jobIds.length === 0) {
      setMap(new Map());
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const chunkSize = 100;
      const acc: any[] = [];
      for (let i = 0; i < jobIds.length; i += chunkSize) {
        const chunk = jobIds.slice(i, i + chunkSize);
        const { data, error } = await supabase
          .from('job_external_assignees')
          .select('id, job_id, subcontractor_id, subcontractor:subcontractors(name, company, trade, phone)')
          .in('job_id', chunk);
        if (error) throw error;
        if (data) acc.push(...data);
      }
      const next = new Map<string, BulkExternalAssignee[]>();
      acc.forEach((row: any) => {
        const list = next.get(row.job_id) || [];
        list.push({
          id: row.id,
          job_id: row.job_id,
          subcontractor_id: row.subcontractor_id,
          name: row.subcontractor?.name ?? 'Unknown',
          company: row.subcontractor?.company ?? null,
          trade: row.subcontractor?.trade ?? null,
          phone: row.subcontractor?.phone ?? null,
        });
        next.set(row.job_id, list);
      });
      setMap(next);
    } catch (e) {
      console.error('[useJobsExternalAssigneesBulk]', e);
    } finally {
      setIsLoading(false);
    }
  }, [jobIdHash]);

  useEffect(() => {
    fetchAll();
    const channel = supabase
      .channel(`job-ext-bulk-${jobIdHash}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'job_external_assignees',
      }, () => fetchAll())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchAll]);

  const getExternals = useCallback(
    (jobId: string): BulkExternalAssignee[] => map.get(jobId) || [],
    [map]
  );

  return { map, isLoading, getExternals, refresh: fetchAll };
};
