/**
 * Genie Metrics — the SINGLE canonical module for every job/flag count
 * shown anywhere in this app (main Genie + Command Center).
 *
 * Both apps MUST import their counting rules from here. Any UI component
 * that recomputes its own counts (e.g. "active = total - complete") will
 * drift away from the canonical figure shown elsewhere and should be
 * migrated to use the helpers below.
 *
 *   isComplete / isReferBack / isActive / isOverdue / isOpenFlag
 *   belongsToDM / belongsToAA
 *   completedOnDay / completedInRange / bookedOnDay
 *   summaryCounts(jobs)         — Total / Complete / Active / Booked / Overdue
 *   categoryBreakdown(jobs, cats) — per-silo CategoryBreakdown
 *   validateMetrics(jobs)       — checksum (Active + Complete + ReferBack == Total)
 *   assertCount(label, shown, canonical) — pinpoint drifts in console
 */
import { format, isWithinInterval } from 'date-fns';
import { Job } from '@/types/job';
import { getGMTNow, getHoursDifferenceGMT } from '@/lib/dateUtils';

/* ───────────────────────── Core predicates ───────────────────────── */

export const isComplete = (j: Job): boolean =>
  j.status === 'complete' || j.isCompleted === true;

export const isReferBack = (j: Job): boolean => j.referBack === true;

export const isActive = (j: Job): boolean => !isComplete(j) && !isReferBack(j);

export const isOverdue = (j: Job): boolean => {
  if (!isActive(j) || !j.bookedDate) return false;
  const bd = j.bookedDate instanceof Date ? j.bookedDate : new Date(j.bookedDate);
  if (isNaN(bd.getTime())) return false;
  const now = getGMTNow();
  return bd.getTime() < now.getTime() && getHoursDifferenceGMT(now, bd) > 24;
};

/** Explicit flag — does NOT include overdue backlog (tracked separately). */
export const isOpenFlag = (j: Job): boolean =>
  isActive(j) &&
  (j.referBack === true ||
    (j as any).flagged === true ||
    (j as any).isUrgent === true ||
    j.status === 'no_show');

/* ───────────────────────── Category scope ───────────────────────── */

const DM_RX = /^DM\b|DM\s*Jobs/i;
/** A&A scope intentionally includes the connected trade silos
 *  (Roofing / Flooring / Fire Door / Carpentry) that the A&A team books. */
const AA_RX = /A\s*&\s*A|Adaption|Roofing|Flooring|Fire\s*Door|Carpent/i;

export const belongsToDM = (categoryName?: string | null): boolean =>
  !!categoryName && DM_RX.test(categoryName);

export const belongsToAA = (categoryName?: string | null): boolean =>
  !!categoryName && AA_RX.test(categoryName);

/* ───────────────────────── Date helpers ───────────────────────── */

export const completedOnDay = (j: Job, ymd: string): boolean => {
  if (!isComplete(j) || !j.completionDate) return false;
  try { return format(new Date(j.completionDate), 'yyyy-MM-dd') === ymd; }
  catch { return false; }
};

export const completedInRange = (j: Job, start: Date, end: Date): boolean => {
  if (!isComplete(j) || !j.completionDate) return false;
  try { return isWithinInterval(new Date(j.completionDate), { start, end }); }
  catch { return false; }
};

export const bookedOnDay = (j: Job, ymd: string): boolean => {
  if (!j.bookedDate) return false;
  try { return format(new Date(j.bookedDate), 'yyyy-MM-dd') === ymd; }
  catch { return false; }
};

/* ───────────────────────── Aggregated metrics ───────────────────────── */

export interface JobMetrics {
  total: number;
  complete: number;
  active: number;          // not complete & not refer-back
  referBack: number;
  booked: number;          // active + has bookedDate
  unbooked: number;        // active + no bookedDate
  overdue: number;         // active + >24h GMT past booked
  ongoing: number;
  flexible: number;
}

export const summaryCounts = (jobs: Job[]): JobMetrics => {
  let complete = 0, referBack = 0, booked = 0, unbooked = 0,
      overdue = 0, ongoing = 0, flexible = 0;
  for (const j of jobs) {
    if (isComplete(j)) { complete++; continue; }
    if (isReferBack(j)) { referBack++; continue; }
    if (j.bookedDate) booked++; else unbooked++;
    if (isOverdue(j)) overdue++;
    if (j.isOngoing) ongoing++;
    if (j.isFlexibleBooking) flexible++;
  }
  return {
    total: jobs.length,
    complete,
    active: jobs.length - complete - referBack,
    referBack, booked, unbooked, overdue, ongoing, flexible,
  };
};

/* ───────────────────────── Category breakdown ───────────────────────── */

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

export const emptyBreakdown = (id: string | null, name: string): CategoryBreakdown => ({
  categoryId: id, categoryName: name,
  total: 0, active: 0, complete: 0,
  completedToday: 0, completedThisWeek: 0,
  booked: 0, unbooked: 0, overdue: 0, referBack: 0,
});

export const categoryBreakdown = (
  jobs: Job[],
  categoryNameById: Record<string, string>,
  todayKey: string,
  weekStart: Date,
  weekEnd: Date,
): Record<string, CategoryBreakdown> => {
  const out: Record<string, CategoryBreakdown> = {};
  const ensure = (id: string | null, name: string) => {
    const k = id || '__uncat__';
    if (!out[k]) out[k] = emptyBreakdown(id, name);
    return out[k];
  };
  for (const j of jobs) {
    const id = j.categoryId || null;
    const name = (id && categoryNameById[id]) || 'Uncategorised';
    const b = ensure(id, name);
    b.total++;
    if (isComplete(j)) {
      b.complete++;
      if (completedOnDay(j, todayKey)) b.completedToday++;
      if (completedInRange(j, weekStart, weekEnd)) b.completedThisWeek++;
    } else if (isReferBack(j)) {
      b.referBack++;
    } else {
      b.active++;
      if (j.bookedDate) b.booked++; else b.unbooked++;
      if (isOverdue(j)) b.overdue++;
    }
  }
  return out;
};

/** Pick the DM and A&A breakdowns out of a Record (preserving the scope rules
 *  above — A&A here is the *named* "A & A" category only, since the silo's
 *  trade siblings live under separate category names in the Genie). */
export const pickSiloBreakdowns = (
  byCategory: Record<string, CategoryBreakdown>,
): { dm: CategoryBreakdown; aa: CategoryBreakdown } => {
  const find = (rx: RegExp) =>
    Object.values(byCategory).find((b) => rx.test(b.categoryName)) ||
    emptyBreakdown(null, '—');
  return { dm: find(DM_RX), aa: find(/A\s*&\s*A/i) };
};

/* ───────────────────────── Integrity ───────────────────────── */

export interface MetricsCheck {
  ok: boolean;
  errors: string[];
  metrics: JobMetrics;
}

export const validateMetrics = (jobs: Job[]): MetricsCheck => {
  const m = summaryCounts(jobs);
  const errors: string[] = [];

  if (m.complete + m.active + m.referBack !== m.total) {
    errors.push(
      `Total mismatch: complete(${m.complete}) + active(${m.active}) + referBack(${m.referBack}) ≠ total(${m.total})`,
    );
  }
  if (m.booked + m.unbooked !== m.active) {
    errors.push(
      `Active mismatch: booked(${m.booked}) + unbooked(${m.unbooked}) ≠ active(${m.active})`,
    );
  }
  if (m.overdue > m.booked) errors.push(`Overdue(${m.overdue}) > booked(${m.booked})`);
  if (m.ongoing > m.active) errors.push(`Ongoing(${m.ongoing}) > active(${m.active})`);

  if (jobs.some((j) => isComplete(j) && isReferBack(j))) {
    errors.push('Jobs flagged BOTH complete and refer-back — invalid state.');
  }
  if (jobs.some((j) => isOverdue(j) && !j.bookedDate)) {
    errors.push('Overdue jobs without bookedDate — overdue requires booking.');
  }
  // is_completed ↔ status drift
  const ghostComplete = jobs.filter(
    (j) => j.isCompleted && j.status !== 'complete',
  ).length;
  if (ghostComplete > 0) {
    errors.push(`${ghostComplete} job(s) marked is_completed=true but status≠'complete' (legacy drift).`);
  }

  return { ok: errors.length === 0, errors, metrics: m };
};

export const assertCount = (label: string, shown: number, canonical: number): boolean => {
  if (shown === canonical) return true;
  // eslint-disable-next-line no-console
  console.warn(`[genieMetrics] "${label}" drifted — shown=${shown} canonical=${canonical}`);
  return false;
};

/* ───────────────────────── Aliases ─────────────────────────
 * Older code imported these names from `metricsIntegrity`. Re-export
 * here so a single file is canonical. */
export const computeMetrics = summaryCounts;
