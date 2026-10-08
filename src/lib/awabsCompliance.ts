/**
 * AWABS LAW Compliance Utilities
 * 
 * Regulatory framework requirements:
 * 1. Tenants must be CONTACTED within 24 hours of job upload (dateIssued/createdAt)
 * 2. Jobs must be COMPLETED (signed off) within 5 days of job upload
 */

import { Job } from '@/types/job';

export interface AwabsCompliance {
  /** Hours since job was uploaded */
  hoursSinceUpload: number;
  /** Whether the 24h contact deadline has passed */
  contactDeadlinePassed: boolean;
  /** Whether the job has been contacted (has contact history) */
  hasBeenContacted: boolean;
  /** Whether the 5-day completion deadline has passed */
  completionDeadlinePassed: boolean;
  /** Whether the job is completed */
  isCompleted: boolean;
  /** Hours remaining until contact deadline (negative = overdue) */
  contactHoursRemaining: number;
  /** Hours remaining until completion deadline (negative = overdue) */
  completionHoursRemaining: number;
  /** Overall compliance status */
  status: 'compliant' | 'at_risk' | 'breached';
  /** Days since upload */
  daysSinceUpload: number;
}

export const CONTACT_DEADLINE_HOURS = 24;
const toDate = (d: unknown): Date | null => {
  if (d == null || d === '') return null;
  const x = d instanceof Date ? d : new Date(d as string);
  return isNaN(x.getTime()) ? null : x;
};

/** Earliest trustworthy moment the job existed on the system. */
export const getJobLoadedAt = (job: Pick<Job, 'createdAt' | 'dateIssued'>): Date | null => {
  const c = toDate(job.createdAt);
  const i = toDate(job.dateIssued);
  if (c && i) return i.getTime() < c.getTime() ? i : c;
  return c || i;
};

export const COMPLETION_DEADLINE_HOURS = 5 * 24; // 5 days

/**
 * Calculate AWABS LAW compliance for a single job
 */
export const getAwabsCompliance = (
  job: Job,
  hasContactHistory: boolean
): AwabsCompliance => {
  const now = new Date();
  
  // Clock starts at the EARLIEST known load time. date_issued can be pushed
  // forward (linked trade jobs sync it to the booked date), so never trust it
  // alone; created_at is the real moment the job hit the system.
  const uploadDate = getJobLoadedAt(job) ?? now;
  // Clock stops at sign-off for completed jobs.
  const done = job.isCompleted || job.status === 'complete';
  const clockEnd = done && toDate(job.completionDate) ? toDate(job.completionDate)! : now;

  const msSinceUpload = Math.max(0, clockEnd.getTime() - uploadDate.getTime());
  const hoursSinceUpload = msSinceUpload / (1000 * 60 * 60);
  const daysSinceUpload = hoursSinceUpload / 24;

  const contactDeadlinePassed = hoursSinceUpload > CONTACT_DEADLINE_HOURS;
  const completionDeadlinePassed = hoursSinceUpload > COMPLETION_DEADLINE_HOURS;

  const isCompleted = job.isCompleted || job.status === 'complete' || job.progress === 100;

  const contactHoursRemaining = CONTACT_DEADLINE_HOURS - hoursSinceUpload;
  const completionHoursRemaining = COMPLETION_DEADLINE_HOURS - hoursSinceUpload;

  // Determine overall status
  let status: 'compliant' | 'at_risk' | 'breached' = 'compliant';
  
  if (isCompleted) {
    status = 'compliant';
  } else if (
    (contactDeadlinePassed && !hasContactHistory) ||
    completionDeadlinePassed
  ) {
    status = 'breached';
  } else if (
    contactHoursRemaining < 6 || // Less than 6 hours to contact
    completionHoursRemaining < 24 // Less than 1 day to complete
  ) {
    status = 'at_risk';
  }

  return {
    hoursSinceUpload,
    contactDeadlinePassed,
    hasBeenContacted: hasContactHistory,
    completionDeadlinePassed,
    isCompleted,
    contactHoursRemaining,
    completionHoursRemaining,
    status,
    daysSinceUpload,
  };
};

/**
 * Format remaining time as human-readable string
 */
export const formatTimeRemaining = (hours: number): string => {
  if (hours <= 0) {
    const overdue = Math.abs(hours);
    if (overdue >= 24) {
      return `${Math.floor(overdue / 24)}d overdue`;
    }
    return `${Math.round(overdue)}h overdue`;
  }
  if (hours >= 24) {
    return `${Math.floor(hours / 24)}d ${Math.round(hours % 24)}h left`;
  }
  return `${Math.round(hours)}h left`;
};

/**
 * Get jobs breaching AWABS LAW contact deadline
 */
export const getContactBreaches = (
  jobs: Job[],
  contactHistoryMap: Map<string, boolean>
): Job[] => {
  return jobs.filter(job => {
    if (job.isCompleted || job.status === 'complete') return false;
    if (job.status === 'pause' || job.status === 'jan2026') return false;
    const hasContact = contactHistoryMap.get(job.id) || false;
    if (hasContact) return false;
    
    const compliance = getAwabsCompliance(job, hasContact);
    return compliance.contactDeadlinePassed;
  });
};

/**
 * Get jobs breaching AWABS LAW completion deadline
 */
export const getCompletionBreaches = (
  jobs: Job[]
): Job[] => {
  return jobs.filter(job => {
    if (job.isCompleted || job.status === 'complete') return false;
    if (job.status === 'pause' || job.status === 'jan2026') return false;
    
    const compliance = getAwabsCompliance(job, true); // contact status irrelevant here
    return compliance.completionDeadlinePassed;
  });
};
