/**
 * useCommandMetrics — single source of truth for the Command Center.
 *
 * This is a thin wrapper over `src/lib/genieMetrics.ts` (the canonical
 * metrics module both Genie and Command must use). It does NOT compute
 * anything itself — every figure here is a direct call into genieMetrics
 * so the two apps can never drift.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { format, startOfWeek, endOfWeek } from 'date-fns';
import { useCategories } from '@/hooks/useCategories';
import { supabase } from '@/integrations/supabase/client';
import { mapDatabaseJobToJob } from '@/lib/api';
import {
  categoryBreakdown,
  pickSiloBreakdowns,
  validateMetrics,
  isActive,
  isOpenFlag,
  isOverdue,
  bookedOnDay,
  type CategoryBreakdown,
  type JobMetrics,
  type MetricsCheck,
} from '@/lib/genieMetrics';
import type { Job } from '@/types/job';

const COMMAND_JOB_SELECT = 'id,job_number,name,address,phone_number,summary_of_works,description,team,team2,progress,progress_notes,is_completed,is_ongoing,ongoing_reason,scheduled_trades,created_at,date_issued,booked_date,is_flexible_booking,booking_notes,completion_date,status,private_notes,refer_back,refer_back_reason,refer_back_date,expected_completion_date,blocker_type,blocker_notes,blocker_set_at,blocker_chase_date,category_id,categories(name)';

let commandJobsCache: { at: number; jobs: Job[] } | null = null;
let commandJobsInflight: Promise<Job[]> | null = null;
const COMMAND_JOBS_TTL = 15_000;

async function fetchCommandJobs(force = false): Promise<Job[]> {
  if (commandJobsInflight) return commandJobsInflight;
  if (!force && commandJobsCache && Date.now() - commandJobsCache.at < COMMAND_JOBS_TTL) {
    return commandJobsCache.jobs;
  }

  commandJobsInflight = (async () => {
    const batchSize = 1000;
    const rows: any[] = [];
    for (let offset = 0; ; offset += batchSize) {
      const { data, error } = await supabase
        .from('jobs')
        .select(COMMAND_JOB_SELECT)
        .is('deleted_at', null)
        .order('date_issued', { ascending: false })
        .range(offset, offset + batchSize - 1);

      if (error) throw error;
      const batch = data ?? [];
      rows.push(...batch);
      if (batch.length < batchSize) break;
    }
    const jobs = rows.map((row) => {
      const job = mapDatabaseJobToJob(row) as Job & { categoryName?: string };
      job.categoryName = row?.categories?.name || undefined;
      return job;
    });
    commandJobsCache = { at: Date.now(), jobs };
    return jobs;
  })();

  try {
    return await commandJobsInflight;
  } catch (error) {
    if (commandJobsCache) return commandJobsCache.jobs;
    throw error;
  } finally {
    commandJobsInflight = null;
  }
}

function useCommandJobSnapshot() {
  const [jobs, setJobs] = useState<Job[]>(() => commandJobsCache?.jobs ?? []);
  const [isLoading, setIsLoading] = useState(() => !commandJobsCache);
  const [lastUpdated, setLastUpdated] = useState(() => commandJobsCache ? new Date(commandJobsCache.at) : new Date());
  const loadingRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (force = false, background = false) => {
    if (loadingRef.current && !force) return;
    loadingRef.current = true;
    if (!background) setIsLoading(true);
    try {
      const next = await fetchCommandJobs(force);
      setJobs(next);
      setLastUpdated(new Date());
    } catch (error) {
      console.error('[CommandMetrics] failed to load command job snapshot:', error);
    } finally {
      loadingRef.current = false;
      if (!background) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load(false);
    const channel = supabase
      .channel(`command-metrics-jobs-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'jobs' }, () => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => load(true, true), 800);
      })
      .subscribe();

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      supabase.removeChannel(channel);
    };
  }, [load]);

  const refreshJobs = useCallback(() => {
    commandJobsCache = null;
    void load(true);
  }, [load]);

  return { jobs, isLoading, lastUpdated, refreshJobs };
}

export type { CategoryBreakdown };

export interface ScheduleRow {
  id: string;
  team: string;
  jobNumber: string;
  address: string;
  bookedDate: Date;
  isAA: boolean;
  status: 'done' | 'in_progress' | 'flagged' | 'urgent';
  categoryName: string;
  job: Job;
}

export interface CommandMetrics {
  totals: JobMetrics;
  byCategory: Record<string, CategoryBreakdown>;
  dm: CategoryBreakdown;
  aa: CategoryBreakdown;
  openFlags: Job[];
  overdueJobs: Job[];
  todaysSchedule: ScheduleRow[];
  jobs: Job[];
  isLoading: boolean;
  lastUpdated: Date;
  integrity: MetricsCheck;
  refreshJobs: () => void;
}

export const useCommandMetrics = (): CommandMetrics => {
  const { jobs, isLoading, lastUpdated, refreshJobs } = useCommandJobSnapshot();
  const { categories } = useCategories();

  const today = new Date();
  const todayKey = format(today, 'yyyy-MM-dd');
  const weekStart = startOfWeek(today, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(today, { weekStartsOn: 1 });

  return useMemo<CommandMetrics>(() => {
    const list: Job[] = Array.isArray(jobs) ? jobs : [];
    const nameById: Record<string, string> = {};
    for (const c of categories || []) nameById[c.id] = c.name;
    for (const j of list as Array<Job & { categoryName?: string }>) {
      if (j.categoryId && j.categoryName && !nameById[j.categoryId]) {
        nameById[j.categoryId] = j.categoryName;
      }
    }

    const byCategory = categoryBreakdown(list, nameById, todayKey, weekStart, weekEnd);
    const { dm, aa } = pickSiloBreakdowns(byCategory);

    const openFlags = list.filter(isOpenFlag);
    const overdueJobs = list.filter(isOverdue);

    const todaysSchedule: ScheduleRow[] = list
      .filter((j) => isActive(j) && bookedOnDay(j, todayKey))
      .map((j) => {
        const teamName = (j.team || j.team2 || 'Unassigned') as string;
        const catName = (j.categoryId && nameById[j.categoryId]) || '';
        const isAA = /A\s*&\s*A/i.test(catName);
        let status: ScheduleRow['status'] = 'in_progress';
        if ((j as any).isUrgent || j.status === 'no_show') status = 'urgent';
        else if (j.referBack || (j as any).flagged) status = 'flagged';
        else if (j.status === 'started') status = 'in_progress';
        return {
          id: j.id,
          team: teamName,
          jobNumber: j.jobNumber || '—',
          address: j.address || '',
          bookedDate: new Date(j.bookedDate!),
          isAA,
          status,
          categoryName: catName,
          job: j,
        };
      })
      .sort((a, b) => a.team.localeCompare(b.team));

    const integrity = validateMetrics(list);
    if (!integrity.ok && typeof window !== 'undefined') {
      // eslint-disable-next-line no-console
      console.warn('[CommandMetrics] integrity drift:', integrity.errors);
    }

    return {
      totals: integrity.metrics,
      byCategory,
      dm,
      aa,
      openFlags,
      overdueJobs,
      todaysSchedule,
      jobs: list,
      isLoading: !!isLoading,
      lastUpdated,
      integrity,
      refreshJobs,
    };
  }, [jobs, categories, isLoading, lastUpdated, refreshJobs, todayKey, weekStart.getTime(), weekEnd.getTime()]);
};
