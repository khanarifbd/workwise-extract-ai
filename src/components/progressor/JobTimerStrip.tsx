import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Job } from '@/types/job';
import { Badge } from '@/components/ui/badge';
import { Clock, AlertTriangle, CalendarClock, Activity } from 'lucide-react';
import { differenceInHours } from 'date-fns';
import { cn } from '@/lib/utils';

interface JobTimerStripProps {
  job: Job;
  categoryName?: string;
}

/**
 * SLA / Time tracking strip (AWAB'S LAW).
 * - Days since job created (dateIssued)
 * - Days since last update (latest of jobs.updated_at, team_job_updates, contact_history)
 * - Countdown to deadline (bookedDate || expectedCompletionDate)
 * - At Risk if no update in 48h
 * - Critical alert if emergency job not actioned
 */
export function JobTimerStrip({ job, categoryName }: JobTimerStripProps) {
  const [lastUpdateAt, setLastUpdateAt] = useState<Date | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ data: jobRow }, { data: updates }, { data: contacts }] = await Promise.all([
        supabase.from('jobs').select('updated_at').eq('id', job.id).maybeSingle(),
        supabase
          .from('team_job_updates')
          .select('created_at')
          .eq('job_id', job.id)
          .order('created_at', { ascending: false })
          .limit(1),
        supabase
          .from('contact_history')
          .select('contact_date')
          .eq('job_id', job.id)
          .order('contact_date', { ascending: false })
          .limit(1),
      ]);
      if (cancelled) return;
      const candidates: number[] = [];
      if (jobRow?.updated_at) candidates.push(new Date(jobRow.updated_at).getTime());
      if (updates?.[0]?.created_at) candidates.push(new Date(updates[0].created_at).getTime());
      if (contacts?.[0]?.contact_date) candidates.push(new Date(contacts[0].contact_date).getTime());
      if (candidates.length) setLastUpdateAt(new Date(Math.max(...candidates)));
    })();
    return () => {
      cancelled = true;
    };
  }, [job.id]);

  const metrics = useMemo(() => {
    const now = new Date();
    const created = job.dateIssued instanceof Date ? job.dateIssued : new Date(job.dateIssued);
    const hoursSinceCreated = isNaN(created.getTime()) ? 0 : differenceInHours(now, created);
    const daysSinceCreated = Math.floor(hoursSinceCreated / 24);

    const lastUpdate = lastUpdateAt || created;
    const hoursSinceUpdate = differenceInHours(now, lastUpdate);
    const daysSinceUpdate = Math.floor(hoursSinceUpdate / 24);

    const deadline = job.bookedDate || job.expectedCompletionDate;
    const hoursToDeadline = deadline ? differenceInHours(new Date(deadline), now) : null;

    const isCompleted = job.isCompleted || job.status === 'complete' || job.progress === 100;
    const atRisk = !isCompleted && hoursSinceUpdate >= 48;

    const isEmergency =
      !!categoryName && /emerg/i.test(categoryName);
    const emergencyUnactioned = isEmergency && !isCompleted && hoursSinceUpdate >= 24;

    return {
      daysSinceCreated,
      hoursSinceCreated,
      daysSinceUpdate,
      hoursSinceUpdate,
      hoursToDeadline,
      deadline,
      atRisk,
      emergencyUnactioned,
      isCompleted,
    };
  }, [job, lastUpdateAt, categoryName]);

  if (metrics.isCompleted) return null;

  const formatDeadline = () => {
    if (metrics.hoursToDeadline == null) return 'No deadline';
    const h = metrics.hoursToDeadline;
    if (h < 0) {
      const overdue = Math.abs(h);
      return overdue >= 24 ? `${Math.floor(overdue / 24)}d overdue` : `${Math.round(overdue)}h overdue`;
    }
    return h >= 24 ? `${Math.floor(h / 24)}d ${Math.round(h % 24)}h left` : `${Math.round(h)}h left`;
  };

  const deadlineTone =
    metrics.hoursToDeadline == null
      ? 'bg-muted text-muted-foreground'
      : metrics.hoursToDeadline < 0
      ? 'bg-red-600 text-white animate-pulse'
      : metrics.hoursToDeadline < 24
      ? 'bg-red-500 text-white'
      : metrics.hoursToDeadline < 48
      ? 'bg-amber-500 text-white'
      : 'bg-emerald-600 text-white';

  return (
    <div className="space-y-2">
      {metrics.emergencyUnactioned && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-600 text-white animate-pulse">
          <AlertTriangle className="h-4 w-4" />
          <span className="text-xs font-bold uppercase tracking-wide">
            🔴 Critical — Emergency job not actioned ({metrics.hoursSinceUpdate}h since last update)
          </span>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <div
          className={cn(
            'flex items-center gap-2 px-3 py-2 rounded-lg border',
            metrics.atRisk ? 'bg-amber-100 border-amber-400 dark:bg-amber-950/40' : 'bg-background',
          )}
        >
          <Activity className={cn('h-3.5 w-3.5', metrics.atRisk ? 'text-amber-700' : 'text-muted-foreground')} />
          <div className="text-[11px] leading-tight">
            <div className="text-muted-foreground">Last Update</div>
            <div className="font-bold">
              {lastUpdateAt
                ? metrics.hoursSinceUpdate >= 24
                  ? `${metrics.daysSinceUpdate}d ago`
                  : `${metrics.hoursSinceUpdate}h ago`
                : 'Never'}
            </div>
          </div>
        </div>
        <div className={cn('flex items-center gap-2 px-3 py-2 rounded-lg border', deadlineTone)}>
          <CalendarClock className="h-3.5 w-3.5" />
          <div className="text-[11px] leading-tight">
            <div className="opacity-80">Deadline</div>
            <div className="font-bold">{formatDeadline()}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
