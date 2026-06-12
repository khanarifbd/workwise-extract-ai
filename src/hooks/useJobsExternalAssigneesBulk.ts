import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface BulkExternalAssignee {
  id: string;
  job_id: string;
  subcontractor_id: string;
  name: string;
  company: string | null;
  trade: string | null;
  phone: string | null;
}

const EXT_ASSIGNEE_EVENT = 'external-assignee-changed';

/** Notify any mounted bulk hooks to refresh immediately (no realtime dependency). */
export const notifyExternalAssigneeChanged = (jobId?: string) => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(EXT_ASSIGNEE_EVENT, { detail: { jobId } }));
};

/**
 * Bulk fetch external assignees for a set of jobIds.
 * - Single stable realtime channel (global)
 * - Local custom-event refresh (instant, no realtime needed)
 * - Content-hash of jobIds so changes always re-fetch
 */
export const useJobsExternalAssigneesBulk = (jobIds: string[]) => {
  const [map, setMap] = useState<Map<string, BulkExternalAssignee[]>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const jobIdsRef = useRef<string[]>(jobIds);
  jobIdsRef.current = jobIds;

  // Stable content hash so reorder/insert/remove all re-trigger fetch.
  const jobIdHash = useMemo(() => {
    if (jobIds.length === 0) return 'empty';
    // Join sorted ids — cheap & deterministic.
    return [...jobIds].sort().join('|');
  }, [jobIds]);

  const fetchAll = useCallback(async () => {
    const ids = jobIdsRef.current;
    if (ids.length === 0) {
      setMap(new Map());
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const chunkSize = 100;
      const acc: any[] = [];
      for (let i = 0; i < ids.length; i += chunkSize) {
        const chunk = ids.slice(i, i + chunkSize);
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
  }, []);

  // Re-fetch whenever the set of jobIds changes.
  useEffect(() => {
    fetchAll();
  }, [jobIdHash, fetchAll]);

  // Single stable realtime channel + local event listener.
  useEffect(() => {
    const channel = supabase
      .channel('job-ext-bulk-global')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'job_external_assignees',
      }, () => fetchAll())
      .subscribe();

    const onLocal = () => fetchAll();
    window.addEventListener(EXT_ASSIGNEE_EVENT, onLocal);

    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener(EXT_ASSIGNEE_EVENT, onLocal);
    };
  }, [fetchAll]);

  const getExternals = useCallback(
    (jobId: string): BulkExternalAssignee[] => map.get(jobId) || [],
    [map]
  );

  return { map, isLoading, getExternals, refresh: fetchAll };
};
