import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Job } from '@/types/job';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Upload, Wrench, Siren } from 'lucide-react';
import { differenceInHours } from 'date-fns';

interface Props {
  job: Job;
  categoryName?: string;
}

/**
 * Phase 6 — FEATURE 8: AUTO FLAGS
 * Consolidated badge strip with the four automatic rules:
 *   1. No update in 48h           → "AT RISK"
 *   2. Missing uploads             → "UPLOAD MISSING"
 *   3. Trade booked > 48h away OR awaiting trade with no booking → "TRADE DELAY"
 *   4. Emergency job, no visit logged → "🔴 CRITICAL"
 */
export function AutoFlagsBar({ job, categoryName }: Props) {
  const [lastUpdateAt, setLastUpdateAt] = useState<Date | null>(null);
  const [hasPhotos, setHasPhotos] = useState<boolean>(false);
  const [hasVisit, setHasVisit] = useState<boolean>(false);
  const [tradeDelay, setTradeDelay] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [jobRow, updates, contacts, subtasks] = await Promise.all([
        supabase.from('jobs').select('updated_at').eq('id', job.id).maybeSingle(),
        supabase
          .from('team_job_updates')
          .select('created_at, photos')
          .eq('job_id', job.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('contact_history')
          .select('contact_date, outcome')
          .eq('job_id', job.id)
          .order('contact_date', { ascending: false }),
        supabase
          .from('job_sub_tasks')
          .select('booked_date, status, completion_date')
          .eq('parent_job_id', job.id),
      ]);
      if (cancelled) return;

      const times: number[] = [];
      if (jobRow.data?.updated_at) times.push(new Date(jobRow.data.updated_at).getTime());
      if (updates.data?.[0]?.created_at) times.push(new Date(updates.data[0].created_at).getTime());
      if (contacts.data?.[0]?.contact_date) times.push(new Date(contacts.data[0].contact_date).getTime());
      if (times.length) setLastUpdateAt(new Date(Math.max(...times)));

      setHasPhotos(
        (updates.data || []).some((u: any) => Array.isArray(u.photos) && u.photos.length > 0),
      );

      // "Visit logged" = any team update OR any contact with on-site outcome.
      const visitOutcomes = /(on[- ]?site|attended|visited|started|complete|left[_ ]property|no[_ ]show)/i;
      setHasVisit(
        (updates.data?.length || 0) > 0 ||
          (contacts.data || []).some((c: any) => visitOutcomes.test(c.outcome || '')),
      );

      // Trade delay = has any incomplete sub_task with NO booked_date, OR booked > 48h from now.
      const now = Date.now();
      const pending = (subtasks.data || []).filter(
        (s: any) =>
          !s.completion_date &&
          s.status !== 'completed_awaiting_portal' &&
          s.status !== 'completed_signed_off',
      );
      const delayed = pending.some((s: any) => {
        if (!s.booked_date) return true;
        const t = new Date(s.booked_date).getTime();
        return t - now > 48 * 3600 * 1000;
      });
      setTradeDelay(delayed && pending.length > 0);
    })();
    return () => {
      cancelled = true;
    };
  }, [job.id]);

  const flags = useMemo(() => {
    const isCompleted = job.isCompleted || job.status === 'complete' || job.progress === 100;
    if (isCompleted) return [] as Array<{ key: string; label: string; tone: string; icon: any }>;

    const hoursSinceUpdate = lastUpdateAt
      ? differenceInHours(new Date(), lastUpdateAt)
      : differenceInHours(new Date(), job.dateIssued instanceof Date ? job.dateIssued : new Date(job.dateIssued));

    const atRisk = hoursSinceUpdate >= 48;
    const isEmergency = !!categoryName && /emerg/i.test(categoryName);
    const emergencyNoVisit = isEmergency && !hasVisit;
    const missingUploads = !hasPhotos;

    const out: Array<{ key: string; label: string; tone: string; icon: any }> = [];
    if (emergencyNoVisit) {
      out.push({
        key: 'critical',
        label: '🔴 CRITICAL — Emergency, no visit logged',
        tone: 'bg-red-600 text-white animate-pulse',
        icon: Siren,
      });
    }
    if (atRisk) {
      out.push({
        key: 'at-risk',
        label: `AT RISK — No update ${Math.floor(hoursSinceUpdate / 24)}d`,
        tone: 'bg-amber-500 text-white',
        icon: AlertTriangle,
      });
    }
    if (missingUploads) {
      out.push({
        key: 'upload-missing',
        label: 'UPLOAD MISSING',
        tone: 'bg-orange-500 text-white',
        icon: Upload,
      });
    }
    if (tradeDelay) {
      out.push({
        key: 'trade-delay',
        label: 'TRADE DELAY',
        tone: 'bg-rose-600 text-white',
        icon: Wrench,
      });
    }
    return out;
  }, [job, lastUpdateAt, hasPhotos, hasVisit, tradeDelay, categoryName]);

  if (flags.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {flags.map(({ key, label, tone, icon: Icon }) => (
        <Badge
          key={key}
          className={`${tone} text-[10px] font-bold uppercase tracking-wide h-auto px-2 py-1 flex items-center gap-1 border-transparent`}
        >
          <Icon className="h-3 w-3" />
          {label}
        </Badge>
      ))}
    </div>
  );
}
