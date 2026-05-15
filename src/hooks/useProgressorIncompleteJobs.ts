import { useEffect, useMemo, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface IncompleteJob {
  id: string;
  jobNumber: string;
  name: string;
  address: string | null;
  description: string | null;
  privateNotes: string | null;
  team: string | null;
  team2: string | null;
  bookedDate: string | null;
  status: string | null;
  isCompleted: boolean;
  attachments: any[];
  updatedAt: string;
}

const mapRow = (r: any): IncompleteJob => ({
  id: r.id,
  jobNumber: r.job_number,
  name: r.name,
  address: r.address,
  description: r.description,
  privateNotes: r.private_notes,
  team: r.team,
  team2: r.team2,
  bookedDate: r.booked_date,
  status: r.status,
  isCompleted: !!r.is_completed,
  attachments: r.attachments || [],
  updatedAt: r.updated_at,
});

export const useProgressorIncompleteJobs = () => {
  const [jobs, setJobs] = useState<IncompleteJob[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetch = useCallback(async (background = false) => {
    if (!background) setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('jobs')
        .select('id, job_number, name, address, description, private_notes, team, team2, booked_date, status, is_completed, attachments, updated_at')
        .not('booked_date', 'is', null)
        .neq('is_completed', true)
        .neq('status', 'complete')
        .is('deleted_at', null)
        .order('booked_date', { ascending: true })
        .limit(2000);
      if (error) throw error;
      setJobs((data || []).map(mapRow));
    } catch (err) {
      console.error('useProgressorIncompleteJobs error', err);
    } finally {
      if (!background) setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetch(false); }, [fetch]);

  useEffect(() => {
    const ch = supabase
      .channel('progressor-incomplete-jobs')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'jobs' }, () => fetch(true))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [fetch]);

  return { jobs, isLoading, refresh: () => fetch(true) };
};

export type DateFilter = 'all' | 'overdue' | 'today' | 'week' | 'range';

export const useFilteredIncompleteJobs = (
  jobs: IncompleteJob[],
  dateFilter: DateFilter,
  fromDate: string | null,
  toDate: string | null,
  teamFilter: string | null,
  search: string,
) => {
  return useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(startOfToday); endOfToday.setDate(endOfToday.getDate() + 1);
    const endOfWeek = new Date(startOfToday); endOfWeek.setDate(endOfWeek.getDate() + 7);
    const q = search.trim().toLowerCase();

    return jobs.filter(j => {
      if (!j.bookedDate) return false;
      const bd = new Date(j.bookedDate);

      if (dateFilter === 'overdue' && bd >= now) return false;
      if (dateFilter === 'today' && (bd < startOfToday || bd >= endOfToday)) return false;
      if (dateFilter === 'week' && (bd < startOfToday || bd >= endOfWeek)) return false;
      if (dateFilter === 'range') {
        if (fromDate && bd < new Date(fromDate)) return false;
        if (toDate) {
          const t = new Date(toDate); t.setDate(t.getDate() + 1);
          if (bd >= t) return false;
        }
      }

      if (teamFilter && j.team !== teamFilter && j.team2 !== teamFilter) return false;

      if (q) {
        const hay = `${j.jobNumber} ${j.name} ${j.address || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [jobs, dateFilter, fromDate, toDate, teamFilter, search]);
};
