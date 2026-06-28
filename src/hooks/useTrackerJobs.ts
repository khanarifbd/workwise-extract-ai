/**
 * useTrackerJobs — derives the rows shown on DM / A&A trackers directly
 * from canonical Genie job data. Replaces hard-coded seed arrays.
 */
import { useMemo } from 'react';
import { format, addDays } from 'date-fns';
import { useCommandMetrics } from '@/hooks/useCommandMetrics';
import { useCategories } from '@/hooks/useCategories';
import {
  belongsToDM, belongsToAA,
  isActive, isOpenFlag,
  completedOnDay, bookedOnDay,
} from '@/lib/genieMetrics';
import type { Job } from '@/types/job';

export interface TrackerRow {
  id: string;
  jobNumber: string;
  team: string;
  address: string;
  status: Job['status'];
  bookedDate: Date | null;
  completionDate: Date | null;
  isUrgent: boolean;
  isFlagged: boolean;
  isReferBack: boolean;
  isOngoing: boolean;
  job: Job;
}

const adapt = (j: Job): TrackerRow => ({
  id: j.id,
  jobNumber: j.jobNumber || '—',
  team: (j.team || j.team2 || 'Unassigned') as string,
  address: j.address || '',
  status: j.status,
  bookedDate: j.bookedDate ? new Date(j.bookedDate) : null,
  completionDate: j.completionDate ? new Date(j.completionDate) : null,
  isUrgent: !!(j as any).isUrgent || j.status === 'no_show',
  isFlagged: !!(j as any).flagged,
  isReferBack: !!j.referBack,
  isOngoing: !!j.isOngoing,
  job: j,
});

export function useTrackerJobs(silo: 'dm' | 'aa') {
  const cm = useCommandMetrics();
  return useMemo(() => {
    const today = new Date();
    const todayKey = format(today, 'yyyy-MM-dd');
    const tomorrowKey = format(addDays(today, 1), 'yyyy-MM-dd');
    const inSilo = (j: Job) => {
      const cat = (j as any).categoryName as string | undefined;
      if (silo === 'dm') return belongsToDM(cat);
      return belongsToAA(cat);
    };

    const list = (cm.jobs as Job[]).filter(inSilo);

    return {
      stats: silo === 'dm' ? cm.dm : cm.aa,
      urgent:     list.filter(isOpenFlag).map(adapt),
      inProgress: list.filter(j => isActive(j) && bookedOnDay(j, todayKey)).map(adapt),
      completed:  list.filter(j => completedOnDay(j, todayKey)).map(adapt),
      pipeline:   list.filter(j => isActive(j) && bookedOnDay(j, tomorrowKey)).map(adapt),
      all: list.map(adapt),
    };
  }, [cm, silo]);
}
