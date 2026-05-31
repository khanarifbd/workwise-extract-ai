import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface ControlSummary {
  /** Most recent NON-completed problem_type, falls back to most recent overall */
  problemType: string | null;
  /** Status of the latest control record */
  latestStatus: string | null;
  /** True when at least one record is Completed (a job becomes closeable only with this true) */
  hasCompleted: boolean;
  /** Total records */
  count: number;
}

const EMPTY: ControlSummary = { problemType: null, latestStatus: null, hasCompleted: false, count: 0 };

/**
 * Fetches a tiny summary of job_control_records for a batch of job IDs at once.
 * Designed for left-panel lists & the Control Dashboard — keeps payload minimal.
 */
export function useJobControlSummary(jobIds: string[]) {
  const [map, setMap] = useState<Map<string, ControlSummary>>(new Map());
  const [loading, setLoading] = useState(false);

  const fetchSummaries = useCallback(async (ids: string[]) => {
    if (ids.length === 0) {
      setMap(new Map());
      return;
    }
    setLoading(true);
    try {
      // Chunk to avoid query size limits (50 IDs per chunk – memory rule)
      const CHUNK = 50;
      const out = new Map<string, ControlSummary>();
      for (let i = 0; i < ids.length; i += CHUNK) {
        const slice = ids.slice(i, i + CHUNK);
        const { data, error } = await supabase
          .from('job_control_records')
          .select('job_id, problem_type, status, created_at')
          .in('job_id', slice)
          .order('created_at', { ascending: false });
        if (error) throw error;
        for (const row of data || []) {
          const existing = out.get(row.job_id) || { ...EMPTY };
          existing.count += 1;
          if (!existing.latestStatus) {
            existing.latestStatus = row.status;
            existing.problemType = row.problem_type;
          }
          if (row.status === 'Completed') existing.hasCompleted = true;
          // Prefer surfacing a still-open problem over a resolved one
          if (existing.latestStatus === 'Completed' && row.status !== 'Completed') {
            existing.problemType = row.problem_type;
            existing.latestStatus = row.status;
          }
          out.set(row.job_id, existing);
        }
      }
      setMap(out);
    } catch (err) {
      console.error('useJobControlSummary failed:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSummaries(jobIds);
  }, [jobIds.join(','), fetchSummaries]); // eslint-disable-line react-hooks/exhaustive-deps

  const get = useCallback((jobId: string): ControlSummary => map.get(jobId) || EMPTY, [map]);

  return { get, map, loading, refresh: () => fetchSummaries(jobIds) };
}
