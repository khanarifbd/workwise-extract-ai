/**
 * useMetricsReconciliation — compares every Command-Center derived count
 * against its canonical figure from `genieMetrics`. Surfaces drift so the
 * Diagnostics panel + drift banner can flag it instantly.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useCommandMetrics } from '@/hooks/useCommandMetrics';
import { useCategories } from '@/hooks/useCategories';
import {
  summaryCounts,
  categoryBreakdown,
  pickSiloBreakdowns,
  isOpenFlag,
  isOverdue,
} from '@/lib/genieMetrics';
import { format, startOfWeek, endOfWeek } from 'date-fns';

export interface ReconciliationCheck {
  label: string;
  shown: number;
  canonical: number;
  ok: boolean;
}

export interface MetricsReconciliation {
  ok: boolean;
  checks: ReconciliationCheck[];
  errors: string[];
  summary: ReturnType<typeof summaryCounts>;
}

export function useMetricsReconciliation(): MetricsReconciliation {
  const cm = useCommandMetrics();
  const { categories } = useCategories();

  const result = useMemo(() => {
    const list = Array.isArray(cm.jobs) ? cm.jobs : [];
    const nameById: Record<string, string> = {};
    for (const c of categories || []) nameById[c.id] = c.name;
    for (const j of list as Array<{ categoryId?: string | null; categoryName?: string }>) {
      if (j.categoryId && j.categoryName && !nameById[j.categoryId]) {
        nameById[j.categoryId] = j.categoryName;
      }
    }

    const today = new Date();
    const todayKey = format(today, 'yyyy-MM-dd');
    const weekStart = startOfWeek(today, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(today, { weekStartsOn: 1 });

    const canonical = summaryCounts(list);
    const canonByCat = categoryBreakdown(list, nameById, todayKey, weekStart, weekEnd);
    const { dm: canonDm, aa: canonAa } = pickSiloBreakdowns(canonByCat);

    const canonicalOpenFlags = list.filter(isOpenFlag).length;
    const canonicalOverdue = list.filter(isOverdue).length;

    const checks: ReconciliationCheck[] = [
      { label: 'Total jobs',         shown: cm.totals.total,        canonical: canonical.total },
      { label: 'Complete',           shown: cm.totals.complete,     canonical: canonical.complete },
      { label: 'Active',             shown: cm.totals.active,       canonical: canonical.active },
      { label: 'Booked',             shown: cm.totals.booked,       canonical: canonical.booked },
      { label: 'Overdue',            shown: cm.overdueJobs.length,  canonical: canonicalOverdue },
      { label: 'Open Flags',         shown: cm.openFlags.length,    canonical: canonicalOpenFlags },
      { label: 'DM · Completed today',  shown: cm.dm.completedToday, canonical: canonDm.completedToday },
      { label: 'DM · Active',           shown: cm.dm.active,         canonical: canonDm.active },
      { label: 'DM · Total',            shown: cm.dm.total,          canonical: canonDm.total },
      { label: 'A&A · Completed today', shown: cm.aa.completedToday, canonical: canonAa.completedToday },
      { label: 'A&A · Active',          shown: cm.aa.active,         canonical: canonAa.active },
      { label: 'A&A · Total',           shown: cm.aa.total,          canonical: canonAa.total },
    ].map((c) => ({ ...c, ok: c.shown === c.canonical }));

    return {
      ok: checks.every((c) => c.ok) && cm.integrity.ok,
      checks,
      errors: cm.integrity.errors,
      summary: canonical,
    };
  }, [cm, categories]);

  const lastAutoRealignAt = useRef(0);
  useEffect(() => {
    if (result.ok) return;
    const now = Date.now();
    if (now - lastAutoRealignAt.current < 30_000) return;
    lastAutoRealignAt.current = now;

    // Safe auto-realignment: when Command and canonical figures diverge,
    // force both job readers to bypass local/session caches and rehydrate
    // from the backend. Data correctness itself is protected by the DB trigger.
    cm.refreshJobs?.();
  }, [result.ok, cm.refreshJobs]);

  return result;
}
