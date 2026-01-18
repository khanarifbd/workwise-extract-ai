import { useEffect, useRef, useCallback } from 'react';
import { Job } from '@/types/job';
import { toast } from '@/hooks/use-toast';
import { getGMTNow, getHoursDifferenceGMT } from '@/lib/dateUtils';

interface UseOverdueNotificationsProps {
  jobs: Job[];
  signOffStatuses?: Record<string, { allSignedOff: boolean }>;
  onJobClick?: (jobId: string) => void;
}

/**
 * Monitors jobs and alerts admins when jobs become overdue (24+ hours past booked date in GMT).
 * Plays audio alert and shows toast notification.
 */
export const useOverdueNotifications = ({
  jobs,
  signOffStatuses,
  onJobClick,
}: UseOverdueNotificationsProps) => {
  const notifiedJobsRef = useRef<Set<string>>(new Set());
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Initialize audio element
  useEffect(() => {
    // Create a simple beep sound using Web Audio API
    audioRef.current = new Audio();
    audioRef.current.volume = 0.5;
    
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const playAlertSound = useCallback(() => {
    try {
      // Create audio context for alert sound
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      // Create oscillator for alert tone
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      // Configure alert sound - two-tone alert
      oscillator.frequency.setValueAtTime(880, audioContext.currentTime); // A5
      oscillator.frequency.setValueAtTime(660, audioContext.currentTime + 0.15); // E5
      oscillator.frequency.setValueAtTime(880, audioContext.currentTime + 0.3); // A5
      
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.45);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.45);
    } catch (error) {
      console.warn('Could not play alert sound:', error);
    }
  }, []);

  const checkForNewOverdueJobs = useCallback(() => {
    const now = getGMTNow();
    const newOverdueJobs: Job[] = [];

    for (const job of jobs) {
      // Skip if already notified
      if (notifiedJobsRef.current.has(job.id)) continue;

      // Skip jobs without booked date
      if (!job.bookedDate) continue;

      // Skip completed or cancelled jobs
      if (job.isCompleted || job.progress === 100) continue;
      if (job.status === 'pause' || job.status === 'jan2026') continue;

      // Skip signed-off jobs
      const signOffData = signOffStatuses?.[job.id];
      if (signOffData?.allSignedOff) continue;

      // Check if job is overdue (24+ hours past booked date in GMT)
      const bookedDate = job.bookedDate instanceof Date 
        ? job.bookedDate 
        : new Date(job.bookedDate);

      if (isNaN(bookedDate.getTime())) continue;

      const hoursSinceBooked = getHoursDifferenceGMT(now, bookedDate);
      const isPastBookedDate = bookedDate.getTime() < now.getTime();
      const isOverdue = isPastBookedDate && hoursSinceBooked > 24;

      if (isOverdue) {
        newOverdueJobs.push(job);
        notifiedJobsRef.current.add(job.id);
      }
    }

    // Show notifications for new overdue jobs
    if (newOverdueJobs.length > 0) {
      playAlertSound();

      if (newOverdueJobs.length === 1) {
        const job = newOverdueJobs[0];
        toast({
          title: "⚠️ Job Overdue",
          description: `${job.jobNumber} - ${job.name} requires attention. Over 24 hours since booked date.`,
          variant: "destructive",
          duration: 10000,
        });
      } else {
        toast({
          title: `⚠️ ${newOverdueJobs.length} Jobs Overdue`,
          description: `${newOverdueJobs.length} jobs require immediate attention. Check the Overdue dashboard.`,
          variant: "destructive",
          duration: 10000,
        });
      }
    }
  }, [jobs, signOffStatuses, playAlertSound]);

  // Check for overdue jobs whenever jobs or sign-off statuses change
  useEffect(() => {
    checkForNewOverdueJobs();
  }, [checkForNewOverdueJobs]);

  // Also check periodically (every minute) for jobs that just became overdue
  useEffect(() => {
    const interval = setInterval(() => {
      checkForNewOverdueJobs();
    }, 60000); // Check every minute

    return () => clearInterval(interval);
  }, [checkForNewOverdueJobs]);

  // Reset notified jobs when component unmounts or jobs list changes significantly
  useEffect(() => {
    const currentJobIds = new Set(jobs.map(j => j.id));
    
    // Remove notified entries for jobs that no longer exist
    notifiedJobsRef.current.forEach(id => {
      if (!currentJobIds.has(id)) {
        notifiedJobsRef.current.delete(id);
      }
    });
  }, [jobs]);

  return {
    checkForNewOverdueJobs,
  };
};
