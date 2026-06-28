/**
 * useCommandMetrics — single source of truth for the Command Center.
 *
 * The Command Center MUST never compute its own counts. Every figure shown
 * in Nav's Command Center, the DM / A&A trackers, and the Owners Dashboard
 * is derived here from the same `useJobs()` data the main Genie renders,
 * via the canonical `metricsIntegrity` helpers. This guarantees the two
 * applications never drift.
 *
 * If you need a new metric, ADD IT HERE — do not recompute in a component.
 */
import { useMemo } from 'react';
import { format, startOfWeek, endOfWeek, isWithinInterval } from 'date-fns';
import { useJobs } from '@/hooks/useJobs';
import { useCategories } from '@/hooks/useCategories';
import {
  computeMetrics,
  validateMetrics,
  isComplete,
  isActive,
  isReferBack,
  isOverdue,
} from '@/lib/metricsIntegrity';
import type { Job } from '@/types/job';

export interface CategoryBreakdown {
  categoryId: string | null;
  categoryName: string;
  total: number;
  active: number;
  complete: number;
  completedToday: number;
  completedThisWeek: number;
  booked: number;
  unbooked: number;
  overdue: number;
  referBack: number;
}

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
  /** Canonical totals across the whole Genie database. */
  totals: ReturnType<typeof computeMetrics>;
  /** Per-category breakdown (DM Jobs, A & A, Fans …). */
  byCategory: Record<string, CategoryBreakdown>;
  /** Convenience accessors for the two Command Center sections. */
  dm: CategoryBreakdown;
  aa: CategoryBreakdown;
  /** Open flag list — explicit flags only (refer-back / urgent / no-show / flagged). */
  openFlags: Job[];
  /** Active jobs that are overdue (>24h past booked) — separate from openFlags. */
  overdueJobs: Job[];
  /** Today's schedule derived from real bookedDate data, grouped by team. */
  todaysSchedule: ScheduleRow[];
  /** All jobs as loaded from the Genie. */
  jobs: Job[];
  isLoading: boolean;
  lastUpdated: Date;
  /** Checksum result — `ok=false` means the figures drifted (logged to console). */
  integrity: ReturnType<typeof validateMetrics>;
}

const EMPTY_BREAKDOWN = (id: string | null, name: string): CategoryBreakdown => ({
  categoryId: id,
  categoryName: name,
  total: 0,
  active: 0,
  complete: 0,
  completedToday: 0,
  completedThisWeek: 0,
  booked: 0,
  unbooked: 0,
  overdue: 0,
  referBack: 0,
});

/**
 * STRICT completion-date check. We MUST NOT fall back to updatedAt — touching
 * a long-completed job today would otherwise inflate "completed today" to
 * absurd numbers (the 46/8 DM bug).
 */
const completedOn = (j: Job, key: string) => {
  if (!isComplete(j) || !j.completionDate) return false;
  try {
    return format(new Date(j.completionDate), 'yyyy-MM-dd') === key;
  } catch {
    return false;
  }
};

const completedWithin = (j: Job, start: Date, end: Date) => {
  if (!isComplete(j) || !j.completionDate) return false;
  try {
    return isWithinInterval(new Date(j.completionDate), { start, end });
  } catch {
    return false;
  }
};

const bookedOn = (j: Job, key: string) => {
  if (!j.bookedDate) return false;
  try {
    return format(new Date(j.bookedDate), 'yyyy-MM-dd') === key;
  } catch {
    return false;
  }
};

export const useCommandMetrics = (): CommandMetrics => {
  // Pull ALL jobs (no category filter) so we share the Genie's cached fetch.
  const { jobs, isLoading } = useJobs() as any;
  const { categories } = useCategories();

  const today = new Date();
  const todayKey = format(today, 'yyyy-MM-dd');
  const weekStart = startOfWeek(today, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(today, { weekStartsOn: 1 });

  return useMemo<CommandMetrics>(() => {
    const list: Job[] = Array.isArray(jobs) ? jobs : [];

    // Build a name lookup. DM and A&A are the two Command Center silos.
    const nameById: Record<string, string> = {};
    for (const c of categories || []) nameById[c.id] = c.name;

    const byCategory: Record<string, CategoryBreakdown> = {};
    const ensure = (id: string | null, name: string) => {
      const key = id || '__uncat__';
      if (!byCategory[key]) byCategory[key] = EMPTY_BREAKDOWN(id, name);
      return byCategory[key];
    };

    for (const j of list) {
      const id = j.categoryId || null;
      const name = (id && nameById[id]) || 'Uncategorised';
      const b = ensure(id, name);
      b.total++;
      if (isComplete(j)) {
        b.complete++;
        if (completedOn(j, todayKey)) b.completedToday++;
        if (completedWithin(j, weekStart, weekEnd)) b.completedThisWeek++;
      } else if (isReferBack(j)) {
        b.referBack++;
      } else {
        b.active++;
        if (j.bookedDate) b.booked++; else b.unbooked++;
        if (isOverdue(j)) b.overdue++;
      }
    }

    const findBy = (predicate: (name: string) => boolean): CategoryBreakdown => {
      const hit = Object.values(byCategory).find((b) => predicate(b.categoryName));
      return hit || EMPTY_BREAKDOWN(null, '—');
    };

    const dm = findBy((n) => /^DM\b|DM Jobs/i.test(n));
    const aa = findBy((n) => /A\s*&\s*A/i.test(n));

    // Explicit flags only. Overdue is tracked separately so the Pulse "Active
    // Alerts" card doesn't blow up to hundreds because of unbooked backlog.
    const openFlags = list.filter(
      (j) =>
        isActive(j) &&
        (j.referBack ||
          (j as any).flagged ||
          (j as any).isUrgent ||
          j.status === 'no_show'),
    );
    const overdueJobs = list.filter(isOverdue);

    // Today's real schedule, grouped by team (one row per team, AM/PM merged
    // in the consumer if it needs to).
    const todaysSchedule: ScheduleRow[] = list
      .filter((j) => isActive(j) && bookedOn(j, todayKey))
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
