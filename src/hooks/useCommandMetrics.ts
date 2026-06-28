/**
 * useCommandMetrics — single source of truth for the Command Center.
 *
 * This is a thin wrapper over `src/lib/genieMetrics.ts` (the canonical
 * metrics module both Genie and Command must use). It does NOT compute
 * anything itself — every figure here is a direct call into genieMetrics
 * so the two apps can never drift.
 */
import { useMemo } from 'react';
import { format, startOfWeek, endOfWeek } from 'date-fns';
import { useJobs } from '@/hooks/useJobs';
import { useCategories } from '@/hooks/useCategories';
import {
  summaryCounts,
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
}

export const useCommandMetrics = (): CommandMetrics => {
  const { jobs, isLoading } = useJobs() as any;
  const { categories } = useCategories();

  const today = new Date();
  const todayKey = format(today, 'yyyy-MM-dd');
  const weekStart = startOfWeek(today, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(today, { weekStartsOn: 1 });

  return useMemo<CommandMetrics>(() => {
    const list: Job[] = Array.isArray(jobs) ? jobs : [];
    const nameById: Record<string, string> = {};
    for (const c of categories || []) nameById[c.id] = c.name;

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
      lastUpdated: new Date(),
      integrity,
    };
  }, [jobs, categories, isLoading, todayKey, weekStart.getTime(), weekEnd.getTime()]);
};
