import { memo, useSyncExternalStore } from 'react';
import { Job } from '@/types/job';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { getJobLoadedAt, COMPLETION_DEADLINE_HOURS } from '@/lib/awabsCompliance';
import { cn } from '@/lib/utils';

// One shared 60s clock for every gauge on screen (no per-row timers).
let now = Date.now();
const listeners = new Set<() => void>();
let timer: number | null = null;
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  if (timer === null) {
    timer = window.setInterval(() => { now = Date.now(); listeners.forEach(l => l()); }, 60_000);
  }
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0 && timer !== null) { clearInterval(timer); timer = null; }
  };
};
const useNow = () => useSyncExternalStore(subscribe, () => now);

const HOUR = 3_600_000;
const DEADLINE_DAYS = COMPLETION_DEADLINE_HOURS / 24;
const fmtUK = (d: Date) =>
  d.toLocaleString('en-GB', { timeZone: 'Europe/London', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const fmtSpan = (ms: number) => {
  const h = Math.floor(Math.abs(ms) / HOUR);
  const d = Math.floor(h / 24);
  return d > 0 ? `${d}d ${h % 24}h` : `${h}h ${Math.floor((Math.abs(ms) % HOUR) / 60000)}m`;
};

interface Props { job: Job; size?: 'sm' | 'md' }

/**
 * AWABS job-age gauge: how long a job has been on the system without sign-off.
 * Clock starts at the earliest load time, stops at sign-off. 5 segments = 5-day limit.
 */
export const JobAgeGauge = memo(({ job, size = 'sm' }: Props) => {
  const nowMs = useNow();
  const loaded = getJobLoadedAt(job);
  if (!loaded) return null;

  const signedOff = job.isCompleted || job.status === 'complete';
  const cd = job.completionDate ? new Date(job.completionDate as any).getTime() : NaN;
  const end = signedOff && !isNaN(cd) ? cd : nowMs;
  const ageMs = Math.max(0, end - loaded.getTime());
  const ageHours = ageMs / HOUR;
  const day = Math.floor(ageHours / 24) + 1; // Day 1 = first 24h on system
  const deadline = new Date(loaded.getTime() + COMPLETION_DEADLINE_HOURS * HOUR);
  const remainingMs = deadline.getTime() - end;
  const breached = remainingMs < 0;
  const paused = !signedOff && (job.status === 'pause' || job.status === 'jan2026');

  const tone = signedOff
    ? (breached ? 'late' : 'done')
    : breached ? 'breach' : ageHours >= 96 ? 'critical' : ageHours >= 48 ? 'warn' : 'ok';

  const toneCls: Record<string, string> = {
    ok: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40',
    warn: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/50',
    critical: 'bg-orange-500/20 text-orange-700 dark:text-orange-300 border-orange-500/60',
    breach: 'bg-red-600 text-white border-red-700 animate-pulse',
    done: 'bg-muted text-muted-foreground border-border',
    late: 'bg-muted text-red-600 dark:text-red-400 border-red-500/40',
  };
  const segOn: Record<string, string> = {
    ok: 'bg-emerald-500', warn: 'bg-amber-500', critical: 'bg-orange-500',
    breach: 'bg-white', done: 'bg-muted-foreground/60', late: 'bg-red-500',
  };
  const filled = Math.min(DEADLINE_DAYS, Math.ceil(ageHours / 24) || (ageMs > 0 ? 1 : 0));
  const label = signedOff ? `✓ ${Math.max(1, Math.ceil(ageHours / 24))}d` : `Day ${day}`;

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-md border font-bold tabular-nums cursor-help select-none',
              size === 'sm' ? 'px-1 py-0.5 text-[10px]' : 'px-2 py-1 text-xs',
              toneCls[tone],
              paused && 'opacity-70',
            )}
            aria-label={`${label}, on system ${fmtSpan(ageMs)}`}
          >
            <span>{label}</span>
            <span className="flex gap-[2px]" aria-hidden>
              {Array.from({ length: DEADLINE_DAYS }).map((_, i) => (
                <span key={i} className={cn('rounded-[1px]', size === 'sm' ? 'h-2 w-1' : 'h-2.5 w-1.5', i < filled ? segOn[tone] : 'bg-current opacity-20')} />
              ))}
            </span>
            {breached && !signedOff && <span>+{Math.floor(-remainingMs / (24 * HOUR))}d</span>}
          </span>
        </TooltipTrigger>
        <TooltipContent className="text-xs space-y-0.5 max-w-[240px]">
          <p className="font-semibold">AWABS job age</p>
          <p>Loaded: {fmtUK(loaded)}</p>
          <p>{signedOff ? 'Open for' : 'On system'}: <b>{fmtSpan(ageMs)}</b></p>
          {signedOff
            ? <p>Signed off: {fmtUK(new Date(end))} — {breached ? `${fmtSpan(remainingMs)} over the 5-day limit` : 'within 5 days'}</p>
            : <p>5-day deadline: {fmtUK(deadline)} — <b>{breached ? `${fmtSpan(remainingMs)} overdue` : `${fmtSpan(remainingMs)} left`}</b></p>}
          {paused && <p className="opacity-80">Job paused — clock still running</p>}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});
JobAgeGauge.displayName = 'JobAgeGauge';
