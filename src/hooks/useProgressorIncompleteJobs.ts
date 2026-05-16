import { useEffect, useMemo, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

// Category IDs (from the categories table). Hard-coded so this hook stays
// self-contained and the progressor workspace only ever pulls these two streams.
export const DM_CATEGORY_ID = 'e1563697-457a-4a67-aa9e-b0785dbc711d';
export const AA_CATEGORY_ID = 'a4a08b3b-70b6-4fa9-b54b-c173dcf07a33';

export type ProgStream = 'dm' | 'aa';

export interface IncompleteJob {
  id: string;
  jobNumber: string;
  name: string;
  address: string | null;
  phoneNumber: string | null;
  description: string | null;
  privateNotes: string | null;
  team: string | null;
  team2: string | null;
  bookedDate: string | null;
  status: string | null;
  isCompleted: boolean;
  attachments: any[];
  updatedAt: string;
  categoryId: string | null;
  stream: ProgStream;
}

const mapRow = (r: any): IncompleteJob => ({
  id: r.id,
  jobNumber: r.job_number,
  name: r.name,
  address: r.address,
  phoneNumber: r.phone_number,
  description: r.description,
  privateNotes: r.private_notes,
  team: r.team,
  team2: r.team2,
  bookedDate: r.booked_date,
  status: r.status,
  isCompleted: !!r.is_completed,
  attachments: r.attachments || [],
  updatedAt: r.updated_at,
  categoryId: r.category_id,
  stream: r.category_id === AA_CATEGORY_ID ? 'aa' : 'dm',
});

/**
 * Returns DM + A&A jobs that were booked *before today* (i.e. their booked
 * day has passed) and are still not completed/signed-off. These are the
 * jobs the progressor needs to chase.
 */
export const useProgressorIncompleteJobs = () => {
  const [jobs, setJobs] = useState<IncompleteJob[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetch = useCallback(async (background = false) => {
    if (!background) setIsLoading(true);
    try {
      // Start of today in local time → anything booked strictly before this is "past its booked day".
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);

      const { data, error } = await supabase
        .from('jobs')
        .select('id, job_number, name, address, phone_number, description, private_notes, team, team2, booked_date, status, is_completed, attachments, updated_at, category_id')
        .in('category_id', [DM_CATEGORY_ID, AA_CATEGORY_ID])
        .not('booked_date', 'is', null)
        .lt('booked_date', startOfToday.toISOString())
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

  const dmJobs = useMemo(() => jobs.filter(j => j.stream === 'dm'), [jobs]);
  const aaJobs = useMemo(() => jobs.filter(j => j.stream === 'aa'), [jobs]);

  return { jobs, dmJobs, aaJobs, isLoading, refresh: () => fetch(true) };
};

/** Group a list of jobs by booked-date (YYYY-MM-DD, local). */
export const groupJobsByBookedDate = (jobs: IncompleteJob[]) => {
  const map = new Map<string, IncompleteJob[]>();
  jobs.forEach(j => {
    if (!j.bookedDate) return;
    const d = new Date(j.bookedDate);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(j);
  });
  return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
};

/** Free-text search filter that works on either stream. */
export const filterJobsBySearch = (jobs: IncompleteJob[], search: string) => {
  const q = search.trim().toLowerCase();
  if (!q) return jobs;
  return jobs.filter(j => `${j.jobNumber} ${j.name} ${j.address || ''}`.toLowerCase().includes(q));
};
