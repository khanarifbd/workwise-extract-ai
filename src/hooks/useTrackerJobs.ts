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

  // Derived UI fields (best-effort from job data; fall back to neutral defaults)
  overrun: string;
  description: string;
  elapsed: string;
  tenantOK: boolean;
  tier: 1 | 2 | 3;
  materialsOK: boolean;
  tradesOK: boolean;
  duration: string;
  signOffTime: string;
  photosOK: boolean;
  descriptionOK: boolean;
  signed: boolean;
  preVisitNeeded: boolean;
  risk?: string;
}

const hhmm = (d?: Date | null) =>
  d ? d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '—';

const hoursElapsed = (since?: Date | null): string => {
  if (!since) return '—';
  const ms = Date.now() - since.getTime();
  if (ms < 0) return '—';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${String(m).padStart(2, '0')}m`;
};

const adapt = (j: Job): TrackerRow => {
  const booked = j.bookedDate ? new Date(j.bookedDate) : null;
  const completion = j.completionDate ? new Date(j.completionDate) : null;
  const overdueMs = booked ? Date.now() - booked.getTime() : 0;
  const overdueHours = Math.max(0, Math.floor(overdueMs / 3600000));
  const tier: 1 | 2 | 3 =
    (j as any).isUrgent || j.status === 'no_show' ? 3 :
    j.referBack || (j as any).flagged ? 2 : 1;

  return {
    id: j.id,
    jobNumber: j.jobNumber || '—',
    team: (j.team || j.team2 || 'Unassigned') as string,
    address: j.address || '',
    status: j.status,
    bookedDate: booked,
    completionDate: completion,
    isUrgent: !!(j as any).isUrgent || j.status === 'no_show',
    isFlagged: !!(j as any).flagged,
    isReferBack: !!j.referBack,
    isOngoing: !!j.isOngoing,
    job: j,

    overrun: overdueHours > 0 ? `+${overdueHours}h overrun` : '—',
    description: (j as any).description || (j as any).notes || j.referBackReason || '—',
    elapsed: hoursElapsed(booked),
    tenantOK: !!(j as any).tenantConfirmed,
    tier,
    materialsOK: !!(j as any).materialsConfirmed,
    tradesOK: !!j.team || !!j.team2,
    duration: hoursElapsed(booked),
    signOffTime: hhmm(completion),
    photosOK: Array.isArray((j as any).photos) ? (j as any).photos.length > 0 : !!(j as any).photosUploaded,
    descriptionOK: !!((j as any).description || (j as any).completionDescription),
    signed: j.status === 'complete' || !!j.isCompleted,
    preVisitNeeded: !(j as any).tenantConfirmed,
    risk: j.referBackReason ?? (j as any).riskNote ?? undefined,
  };
};

export function useTrackerJobs(silo: 'dm' | 'aa') {
  const cm = useCommandMetrics();
  const { categories } = useCategories();
  return useMemo(() => {
    const nameById: Record<string, string> = {};
    for (const c of categories || []) nameById[c.id] = c.name;

    const today = new Date();
    const todayKey = format(today, 'yyyy-MM-dd');
    const tomorrowKey = format(addDays(today, 1), 'yyyy-MM-dd');
    const inSilo = (j: Job) => {
      const cat = (j as Job & { categoryName?: string }).categoryName || (j.categoryId ? nameById[j.categoryId] : undefined);
      return silo === 'dm' ? belongsToDM(cat) : belongsToAA(cat);
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
  }, [cm, categories, silo]);
}
