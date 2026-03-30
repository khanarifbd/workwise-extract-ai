import { useMemo } from 'react';
import { Job } from '@/types/job';
import { getGMTNow, getHoursDifferenceGMT, isGMTPast } from '@/lib/dateUtils';

interface JobAlertStatus {
  isOverdue: boolean; // More than 24 hours past booked date without completion/sign-off (GMT)
  isOngoing: boolean; // Manually marked as ongoing
  requiresAttention: boolean; // Either of the above
  hoursOverdue: number;
}

/**
 * Determines if a job should display the "Ongoing" or "Overdue" alert badge.
 * All time calculations are in GMT timezone.
 * 
 * Conditions:
 * 1. Manually marked as isOngoing = true
 * 2. Auto-trigger: Job has a booked date, more than 24 hours have passed since booked date (GMT),
 *    job is not completed, not cancelled, and not signed off.
 */
export const useJobAlerts = (
  jobs: Job[],
  signOffStatuses?: Record<string, { allSignedOff: boolean }>
) => {
  const alertStatuses = useMemo(() => {
    const statuses: Record<string, JobAlertStatus> = {};
    const now = getGMTNow();

    for (const job of jobs) {
      let isOverdue = false;
      let hoursOverdue = 0;

      // Check auto-trigger conditions
      if (job.bookedDate) {
        const bookedDate = job.bookedDate instanceof Date 
          ? job.bookedDate 
          : new Date(job.bookedDate);
        
        // Calculate hours since booked date in GMT
        hoursOverdue = getHoursDifferenceGMT(now, bookedDate);

        // Auto-trigger if:
        // - Booked date is in the past (GMT)
        // - More than 24 hours past booked date
        // - Job is not completed
        // - Job is not signed off (if sign-off data available)
        // - Job status is not cancelled/paused
        // - Job is not in refer back folder
        const bookedDateGMT = new Date(bookedDate);
        const isPastBookedDate = bookedDateGMT.getTime() < now.getTime();
        const isOldBookedDate = isPastBookedDate && hoursOverdue > 24;
        const isNotComplete = !job.isCompleted && job.progress !== 100;
        const isNotCancelled = job.status !== 'pause' && job.status !== 'jan2026';
        const isNotReferBack = !job.referBack;
        
        // Check sign-off status if available
        const signOffData = signOffStatuses?.[job.id];
        const isNotSignedOff = !signOffData?.allSignedOff;

        isOverdue = isOldBookedDate && isNotComplete && isNotCancelled && isNotSignedOff && isNotReferBack;
      }

      const isOngoing = job.isOngoing || false;
      const requiresAttention = isOverdue || isOngoing;

      statuses[job.id] = {
        isOverdue,
        isOngoing,
        requiresAttention,
        hoursOverdue: Math.max(0, Math.round(hoursOverdue - 24)), // Hours overdue beyond 24hr threshold
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
 * Standalone function to check if a single job should show ongoing/overdue alert.
 * All time calculations are in GMT timezone.
 */
export const shouldShowOngoingAlert = (
  job: Job,
  isSignedOff: boolean = false
): { showAlert: boolean; isAutoTriggered: boolean; hoursOverdue: number } => {
  // Manual flag always shows
  if (job.isOngoing) {
    return { showAlert: true, isAutoTriggered: false, hoursOverdue: 0 };
  }

  // Skip cancelled/paused jobs
  if (job.status === 'pause' || job.status === 'jan2026') {
    return { showAlert: false, isAutoTriggered: false, hoursOverdue: 0 };
  }

  // Skip completed jobs
  if (job.isCompleted || job.progress === 100) {
    return { showAlert: false, isAutoTriggered: false, hoursOverdue: 0 };
  }

  // Check auto-trigger conditions
  if (!job.bookedDate) {
    return { showAlert: false, isAutoTriggered: false, hoursOverdue: 0 };
  }

  const now = getGMTNow();
  const bookedDate = job.bookedDate instanceof Date 
    ? job.bookedDate 
    : new Date(job.bookedDate);

  if (isNaN(bookedDate.getTime())) {
    return { showAlert: false, isAutoTriggered: false, hoursOverdue: 0 };
  }

  const hoursOverdue = getHoursDifferenceGMT(now, bookedDate);
  
  // Auto-trigger if:
  // - Booked date is in the past (GMT)
  // - More than 24 hours past booked date
  // - Job is not signed off
  const isPastDate = bookedDate.getTime() < now.getTime();
  const isOverdue = isPastDate && hoursOverdue > 24;
  
  const showAlert = isOverdue && !isSignedOff;

  return {
    showAlert,
    isAutoTriggered: showAlert,
    hoursOverdue: Math.max(0, Math.round(hoursOverdue - 24)),
  };
};
