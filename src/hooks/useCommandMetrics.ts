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

export interface CommandMetrics {
  /** Canonical totals across the whole Genie database. */
  totals: ReturnType<typeof computeMetrics>;
  /** Per-category breakdown (DM Jobs, A & A, Fans …). */
  byCategory: Record<string, CategoryBreakdown>;
  /** Convenience accessors for the two Command Center sections. */
  dm: CategoryBreakdown;
  aa: CategoryBreakdown;
  /** Open flag list — jobs that are active AND (refer-back / urgent / flagged). */
  openFlags: Job[];
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

const completedOn = (j: Job, key: string) => {
  if (!isComplete(j)) return false;
  const d = j.completionDate || (j as any).updatedAt;
  if (!d) return false;
  try {
    return format(new Date(d), 'yyyy-MM-dd') === key;
  } catch {
    return false;
  }
};

const completedWithin = (j: Job, start: Date, end: Date) => {
  if (!isComplete(j)) return false;
  const d = j.completionDate || (j as any).updatedAt;
  if (!d) return false;
  try {
    return isWithinInterval(new Date(d), { start, end });
  } catch {
    return false;
  }
};

export const useCommandMetrics = (): CommandMetrics => {
  // Pull ALL jobs (no category filter) so we share the Genie's cached fetch.
  const { jobs, loading } = useJobs() as any;
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

    const openFlags = list.filter(
      (j) =>
        isActive(j) &&
        (j.referBack ||
          (j as any).flagged ||
          (j as any).isUrgent ||
          j.status === 'no_show' ||
          j.status === 'pause' ||
          isOverdue(j)),
    );

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
      jobs: list,
      isLoading: !!loading,
      lastUpdated: new Date(),
      integrity,
    };
  }, [jobs, categories, loading, todayKey, weekStart.getTime(), weekEnd.getTime()]);
};
