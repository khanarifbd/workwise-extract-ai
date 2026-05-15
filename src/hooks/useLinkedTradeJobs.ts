import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type LinkedTradeKind = 'fan' | 'roofing' | 'flooring' | 'fire_door';

export interface LinkedTradeJobInfo {
  kind: LinkedTradeKind;
  id: string;
  jobNumber: string;
  bookedDate: string | null;
  status: string | null;
  isCompleted: boolean;
  team: string | null;
  team2: string | null;
}

const LINK_COLUMNS: Record<LinkedTradeKind, string> = {
  fan: 'linked_fan_job_id',
  roofing: 'linked_roofing_job_id',
  flooring: 'linked_flooring_job_id',
  fire_door: 'linked_fire_door_job_id',
};

/**
 * Loads booked_date / status / team for the linked Fan, Roofing, Flooring and
 * Fire Door child jobs of a given parent job. Used by the progressor so they
 * can see at a glance whether each trade has been booked on a parent job.
 */
export function useLinkedTradeJobs(parentJobId?: string) {
  const [linked, setLinked] = useState<LinkedTradeJobInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!parentJobId) { setLinked([]); return; }
    let cancelled = false;

    (async () => {
      setIsLoading(true);
      try {
        const { data: parent, error: pErr } = await supabase
          .from('jobs')
          .select('linked_fan_job_id, linked_roofing_job_id, linked_flooring_job_id, linked_fire_door_job_id')
          .eq('id', parentJobId)
          .maybeSingle();
        if (pErr) throw pErr;
        if (!parent) { if (!cancelled) setLinked([]); return; }

        const idMap: Partial<Record<LinkedTradeKind, string>> = {};
        (Object.keys(LINK_COLUMNS) as LinkedTradeKind[]).forEach((kind) => {
          const v = (parent as any)[LINK_COLUMNS[kind]];
          if (v) idMap[kind] = v;
        });

        const ids = Object.values(idMap).filter(Boolean) as string[];
        if (ids.length === 0) { if (!cancelled) setLinked([]); return; }

        const { data: rows, error: cErr } = await supabase
          .from('jobs')
          .select('id, job_number, booked_date, status, is_completed, team, team2')
          .in('id', ids);
        if (cErr) throw cErr;

        const byId = new Map((rows || []).map(r => [r.id as string, r]));
        const result: LinkedTradeJobInfo[] = (Object.keys(idMap) as LinkedTradeKind[])
          .map((kind) => {
            const id = idMap[kind]!;
            const r = byId.get(id);
            if (!r) return null;
            return {
              kind,
              id,
              jobNumber: r.job_number,
              bookedDate: r.booked_date,
              status: r.status,
              isCompleted: !!r.is_completed,
              team: r.team,
              team2: r.team2,
            } as LinkedTradeJobInfo;
          })
          .filter((x): x is LinkedTradeJobInfo => !!x);

        if (!cancelled) setLinked(result);
      } catch (err) {
        console.error('useLinkedTradeJobs error', err);
        if (!cancelled) setLinked([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [parentJobId]);

  return { linked, isLoading };
}
