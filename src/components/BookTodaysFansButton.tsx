import { useMemo, useState } from 'react';
import { Fan, Loader2, CalendarCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Job } from '@/types/job';
import { syncLinkedFanJob } from '@/lib/api';

interface BookTodaysFansButtonProps {
  jobs: Job[];
  fanCategoryId?: string;
  onDone?: () => void;
}

// Normalise bookedDate to a local YYYY-MM-DD string for comparison
const toYMD = (d: Date | string | null | undefined): string | null => {
  if (!d) return null;
  if (typeof d === 'string') return d.slice(0, 10);
  if (d instanceof Date && !isNaN(d.getTime())) return format(d, 'yyyy-MM-dd');
  return null;
};

export const BookTodaysFansButton = ({ jobs, fanCategoryId, onDone }: BookTodaysFansButtonProps) => {
  const [busy, setBusy] = useState(false);
  const today = useMemo(() => new Date(), []);
  const todayStr = format(today, 'yyyy-MM-dd');

  // Parent jobs booked for today that have identified fans
  const todaysFanJobs = useMemo(() => {
    return jobs.filter(j => {
      const fans = (j.fanInfo || []).filter(f => f.type !== '__SCANNED_NO_FANS__');
      if (fans.length === 0) return false;
      // Skip linked fan jobs themselves (they end with -FAN)
      if (j.jobNumber?.endsWith('-FAN')) return false;
      return toYMD(j.bookedDate) === todayStr;
    });
  }, [jobs, todayStr]);

  const count = todaysFanJobs.length;

  const handleClick = async () => {
    if (!fanCategoryId) {
      toast.error('Fan category not found');
      return;
    }
    if (count === 0) {
      toast.info('No jobs booked for today have fans identified');
      return;
    }

    setBusy(true);
    let created = 0;
    let updated = 0;
    let failed = 0;

    for (const job of todaysFanJobs) {
      try {
        const fans = (job.fanInfo || []).filter(f => f.type !== '__SCANNED_NO_FANS__');
        const result = await syncLinkedFanJob(job, fans, fanCategoryId, today);
        if (result.created) created++;
        else updated++;
      } catch (err) {
        console.error('Failed to book fan job for', job.jobNumber, err);
        failed++;
      }
    }

    setBusy(false);
    if (failed > 0) {
      toast.error(`Booked ${created + updated}/${count} — ${failed} failed`);
    } else {
      toast.success(`Booked ${count} fan job${count === 1 ? '' : 's'} for today (${created} created, ${updated} updated)`);
    }
    onDone?.();
  };

  return (
    <Button
      size="sm"
      onClick={handleClick}
      disabled={busy || count === 0 || !fanCategoryId}
      className="bg-cyan-600 hover:bg-cyan-700 text-white gap-2"
      title={count === 0 ? 'No fans found on jobs booked for today' : `Book ${count} fan job(s) for today`}
    >
      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarCheck className="w-4 h-4" />}
      <Fan className="w-4 h-4" />
      Book Today's Fans{count > 0 ? ` (${count})` : ''}
    </Button>
  );
};
