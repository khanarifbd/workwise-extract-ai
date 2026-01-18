import { useMemo } from 'react';
import { Job } from '@/types/job';
import { differenceInHours, isPast } from 'date-fns';

interface JobAlertStatus {
  isOverdue: boolean; // More than 24 hours past booked date without completion/sign-off
  isOngoing: boolean; // Manually marked as ongoing
  requiresAttention: boolean; // Either of the above
  hoursOverdue: number;
}

/**
 * Determines if a job should display the "Ongoing" alert badge.
 * Conditions:
 * 1. Manually marked as isOngoing = true
 * 2. Auto-trigger: Job has a booked date, more than 24 hours have passed since booked date,
 *    job is not completed, not cancelled, and not rebooked to a future date.
 */
export const useJobAlerts = (
  jobs: Job[],
  signOffStatuses?: Record<string, { allSignedOff: boolean }>
) => {
  const alertStatuses = useMemo(() => {
    const statuses: Record<string, JobAlertStatus> = {};
    const now = new Date();

    for (const job of jobs) {
      let isOverdue = false;
      let hoursOverdue = 0;

      // Check auto-trigger conditions
      if (job.bookedDate) {
        const bookedDate = job.bookedDate instanceof Date 
          ? job.bookedDate 
          : new Date(job.bookedDate);
        
        // Calculate hours since booked date
        hoursOverdue = differenceInHours(now, bookedDate);

        // Auto-trigger if:
        // - More than 24 hours past booked date
        // - Job is not completed
        // - Job is not signed off (if sign-off data available)
        // - Job status is not cancelled/pause (rebook scenarios)
        // - Booked date is in the past
        const isOldBookedDate = isPast(bookedDate) && hoursOverdue > 24;
        const isNotComplete = !job.isCompleted && job.progress !== 100;
        const isNotCancelled = job.status !== 'pause' && job.status !== 'jan2026';
        const hasNotBeenRebookedToFuture = !job.bookedDate || isPast(new Date(job.bookedDate));
        
        // Check sign-off status if available
        const signOffData = signOffStatuses?.[job.id];
        const isNotSignedOff = !signOffData?.allSignedOff;

        isOverdue = isOldBookedDate && isNotComplete && isNotCancelled && isNotSignedOff;
      }

      const isOngoing = job.isOngoing || false;
      const requiresAttention = isOngoing || isOverdue;

      statuses[job.id] = {
        isOverdue,
        isOngoing,
        requiresAttention,
        hoursOverdue: Math.max(0, hoursOverdue - 24), // Hours overdue beyond 24hr threshold
      };
    }

    return statuses;
  }, [jobs, signOffStatuses]);

  const getJobAlert = (jobId: string): JobAlertStatus => {
    return alertStatuses[jobId] || {
      isOverdue: false,
      isOngoing: false,
      requiresAttention: false,
      hoursOverdue: 0,
    };
  };

  const getAlertJobs = () => {
    return jobs.filter(job => alertStatuses[job.id]?.requiresAttention);
  };

  return {
    alertStatuses,
    getJobAlert,
    getAlertJobs,
  };
};

/**
 * Standalone function to check if a single job should show ongoing alert
 */
export const shouldShowOngoingAlert = (
  job: Job,
  isSignedOff: boolean = false
): { showAlert: boolean; isAutoTriggered: boolean; hoursOverdue: number } => {
  // Manual flag always shows
  if (job.isOngoing) {
    return { showAlert: true, isAutoTriggered: false, hoursOverdue: 0 };
  }

  // Check auto-trigger conditions
  if (!job.bookedDate) {
    return { showAlert: false, isAutoTriggered: false, hoursOverdue: 0 };
  }

  const now = new Date();
  const bookedDate = job.bookedDate instanceof Date 
    ? job.bookedDate 
    : new Date(job.bookedDate);

  const hoursOverdue = differenceInHours(now, bookedDate);

  // Auto-trigger if:
  // - More than 24 hours past booked date
  // - Job is not completed
  // - Job is not signed off
  // - Job status is not paused/cancelled
  const isOverdue = hoursOverdue > 24;
  const isNotComplete = !job.isCompleted && job.progress !== 100;
  const isNotCancelled = job.status !== 'pause' && job.status !== 'jan2026';
  const isPastDate = isPast(bookedDate);

  const showAlert = isPastDate && isOverdue && isNotComplete && isNotCancelled && !isSignedOff;

  return {
    showAlert,
    isAutoTriggered: showAlert,
    hoursOverdue: Math.max(0, hoursOverdue - 24),
  };
};
