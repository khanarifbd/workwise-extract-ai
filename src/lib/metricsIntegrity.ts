/**
 * Metrics Integrity — single source of truth for app-wide job metrics.
 *
 * Every screen that shows counts / analytics should derive numbers from the
 * canonical helpers below. The `validateMetrics` checksum is run continuously
 * by `useMetricsIntegrity` and warns in the console when any derived figure
 * drifts from the canonical totals (Active + Complete = Total, etc.).
 */
import { Job } from '@/types/job';
import { getGMTNow, getHoursDifferenceGMT } from '@/lib/dateUtils';

export interface JobMetrics {
  total: number;
  complete: number;
  active: number;          // not complete & not refer-back
  referBack: number;
  booked: number;          // active + has bookedDate
  unbooked: number;        // active + no bookedDate
  overdue: number;         // booked > 24h GMT past & still active
  ongoing: number;
  flexible: number;
}

export const isComplete = (j: Job): boolean =>
  j.status === 'complete' || j.isCompleted === true;

export const isReferBack = (j: Job): boolean => j.referBack === true;

export const isActive = (j: Job): boolean => !isComplete(j) && !isReferBack(j);

export const isOverdue = (j: Job): boolean => {
  if (!isActive(j) || !j.bookedDate) return false;
  return getHoursDifferenceGMT(getGMTNow(), new Date(j.bookedDate)) > 24
    && new Date(j.bookedDate).getTime() < getGMTNow().getTime();
};

export const computeMetrics = (jobs: Job[]): JobMetrics => {
  let complete = 0, referBack = 0, booked = 0, unbooked = 0,
      overdue = 0, ongoing = 0, flexible = 0;

  for (const j of jobs) {
    if (isComplete(j)) { complete++; continue; }
    if (isReferBack(j)) { referBack++; continue; }
    // active
    if (j.bookedDate) booked++; else unbooked++;
    if (isOverdue(j)) overdue++;
    if (j.isOngoing) ongoing++;
    if (j.isFlexibleBooking) flexible++;
  }

  return {
    total: jobs.length,
    complete,
    active: jobs.length - complete - referBack,
    referBack,
    booked,
    unbooked,
    overdue,
    ongoing,
    flexible,
  };
};

export interface MetricsCheck {
  ok: boolean;
  errors: string[];
  metrics: JobMetrics;
}

/**
 * Checksum validation: ensures every derived count reconciles back to total.
 * Returns errors describing any drift.
 */
export const validateMetrics = (jobs: Job[]): MetricsCheck => {
  const m = computeMetrics(jobs);
  const errors: string[] = [];

  if (m.complete + m.active + m.referBack !== m.total) {
    errors.push(
      `Total mismatch: complete(${m.complete}) + active(${m.active}) + referBack(${m.referBack}) ≠ total(${m.total})`
    );
  }
  if (m.booked + m.unbooked !== m.active) {
    errors.push(
      `Active mismatch: booked(${m.booked}) + unbooked(${m.unbooked}) ≠ active(${m.active})`
    );
  }
  if (m.overdue > m.booked) {
    errors.push(`Overdue(${m.overdue}) cannot exceed booked(${m.booked})`);
  }
  if (m.ongoing > m.active) {
    errors.push(`Ongoing(${m.ongoing}) cannot exceed active(${m.active})`);
  }
  if (jobs.some(j => isComplete(j) && isReferBack(j))) {
    errors.push('Found jobs flagged BOTH complete and refer-back — invalid state.');
  }
  if (jobs.some(j => isOverdue(j) && !j.bookedDate)) {
    errors.push('Found overdue jobs without bookedDate — overdue requires booking.');
  }

  return { ok: errors.length === 0, errors, metrics: m };
};

/**
 * Compare an externally-computed counter to the canonical figure.
 * Returns true if they match, false (and warns) otherwise.
 * Use this in any feature panel to keep its display aligned.
 */
export const assertCount = (
  label: string,
  external: number,
  canonical: number,
): boolean => {
  if (external === canonical) return true;
  // eslint-disable-next-line no-console
  console.warn(
    `[metrics] "${label}" drifted: shown=${external} canonical=${canonical}`
  );
  return false;
};
