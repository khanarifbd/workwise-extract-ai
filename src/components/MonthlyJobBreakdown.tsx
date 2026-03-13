import { useMemo, useState } from 'react';
import { Job, JOB_STATUS_OPTIONS } from '@/types/job';
import { cn } from '@/lib/utils';
import { CalendarCheck, BookOpen, ChevronDown, ChevronRight } from 'lucide-react';

interface MonthlyJobBreakdownProps {
  jobs: Job[];
}

function isCompleted(j: Job): boolean {
  return j.status === 'complete' || j.isCompleted;
}

const MONTHS = [
  { label: 'Dec 2025', year: 2025, month: 11 },
  { label: 'Jan 2026', year: 2026, month: 0 },
  { label: 'Feb 2026', year: 2026, month: 1 },
  { label: 'Mar 2026', year: 2026, month: 2 },
];

function getJobMonth(job: Job): { year: number; month: number } | null {
  const d = job.dateIssued instanceof Date ? job.dateIssued : new Date(job.dateIssued);
  if (isNaN(d.getTime())) return null;
  return { year: d.getFullYear(), month: d.getMonth() };
}

function getStatusLabel(status: string | null | undefined): string {
  if (!status) return 'Pending';
  const found = JOB_STATUS_OPTIONS.find(o => o.value === status);
  return found ? found.label : status;
}

function getStatusColor(status: string | null | undefined): string {
  if (!status) return '#6B7280';
  const found = JOB_STATUS_OPTIONS.find(o => o.value === status);
  return found ? found.color : '#6B7280';
}

interface StatusCount {
  status: string;
  label: string;
  color: string;
  count: number;
}

function getStatusBreakdown(jobs: Job[]): StatusCount[] {
  const map: Record<string, StatusCount> = {};
  for (const j of jobs) {
    const key = j.status || 'pending';
    if (!map[key]) {
      map[key] = { status: key, label: getStatusLabel(j.status), color: getStatusColor(j.status), count: 0 };
    }
    map[key].count++;
  }
  return Object.values(map).sort((a, b) => b.count - a.count);
}

export function MonthlyJobBreakdown({ jobs }: MonthlyJobBreakdownProps) {
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set(['Mar 2026']));

  const monthlyData = useMemo(() => {
    return MONTHS.map(m => {
      const monthJobs = jobs.filter(j => {
        const jm = getJobMonth(j);
        return jm && jm.year === m.year && jm.month === m.month;
      });

      const incompleteJobs = monthJobs.filter(j => !isCompleted(j));
      const bookedIncomplete = incompleteJobs.filter(j => !!j.bookedDate);
      const unbooked = incompleteJobs.filter(j => !j.bookedDate);
      const completedJobs = monthJobs.filter(isCompleted);

      return {
        ...m,
        total: monthJobs.length,
        completed: completedJobs.length,
        bookedIncomplete,
        bookedIncompleteBreakdown: getStatusBreakdown(bookedIncomplete),
        unbooked,
        unbookedBreakdown: getStatusBreakdown(unbooked),
      };
    });
  }, [jobs]);

  const toggleMonth = (label: string) => {
    setExpandedMonths(prev => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  // Grand totals
  const totals = useMemo(() => {
    const allBooked = monthlyData.flatMap(m => m.bookedIncomplete);
    const allUnbooked = monthlyData.flatMap(m => m.unbooked);
    return {
      bookedIncomplete: allBooked.length,
      bookedBreakdown: getStatusBreakdown(allBooked),
      unbooked: allUnbooked.length,
      unbookedBreakdown: getStatusBreakdown(allUnbooked),
    };
  }, [monthlyData]);

  return (
    <div className="flex flex-col gap-2 w-full mt-2">
      <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
        Monthly Breakdown (Dec 2025 – Mar 2026)
      </div>

      {/* Grand totals summary */}
      <div className="flex gap-3 text-xs">
        <div className="flex items-center gap-1.5 bg-amber-500/10 rounded-md px-2 py-1">
          <CalendarCheck className="w-3.5 h-3.5 text-amber-600" />
          <span className="font-bold text-amber-600">{totals.bookedIncomplete}</span>
          <span className="text-muted-foreground">Booked Incomplete</span>
        </div>
        <div className="flex items-center gap-1.5 bg-slate-500/10 rounded-md px-2 py-1">
          <BookOpen className="w-3.5 h-3.5 text-slate-600" />
          <span className="font-bold text-slate-600">{totals.unbooked}</span>
          <span className="text-muted-foreground">Unbooked</span>
        </div>
      </div>

      {/* Monthly rows */}
      <div className="flex flex-col gap-1 border border-border rounded-lg overflow-hidden">
        {monthlyData.map(m => {
          const isExpanded = expandedMonths.has(m.label);
          const hasData = m.bookedIncomplete.length > 0 || m.unbooked.length > 0;

          return (
            <div key={m.label} className="border-b border-border last:border-b-0">
              {/* Month header */}
              <button
                onClick={() => toggleMonth(m.label)}
                className={cn(
                  "w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-muted/50 transition-colors",
                  m.label === 'Mar 2026' && "bg-primary/5"
                )}
              >
                <div className="flex items-center gap-2">
                  {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
                  <span className="font-semibold text-foreground">{m.label}</span>
                  <span className="text-muted-foreground">({m.total} total, {m.completed} done)</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1">
                    <CalendarCheck className="w-3 h-3 text-amber-600" />
                    <span className="font-semibold text-amber-600">{m.bookedIncomplete.length}</span>
                    <span className="text-muted-foreground">booked</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <BookOpen className="w-3 h-3 text-slate-600" />
                    <span className="font-semibold text-slate-600">{m.unbooked.length}</span>
                    <span className="text-muted-foreground">unbooked</span>
                  </span>
                </div>
              </button>

              {/* Expanded detail */}
              {isExpanded && hasData && (
                <div className="px-4 pb-3 pt-1 grid grid-cols-2 gap-3">
                  {/* Booked Incomplete */}
                  <div className="flex flex-col gap-1">
                    <div className="text-[10px] font-semibold text-amber-600 uppercase tracking-wider flex items-center gap-1">
                      <CalendarCheck className="w-3 h-3" />
                      Booked Incomplete ({m.bookedIncomplete.length})
                    </div>
                    {m.bookedIncompleteBreakdown.length > 0 ? (
                      <div className="flex flex-col gap-0.5">
                        {m.bookedIncompleteBreakdown.map(s => (
                          <div key={s.status} className="flex items-center gap-2 text-xs">
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                            <span className="font-medium" style={{ color: s.color }}>{s.count}</span>
                            <span className="text-muted-foreground">{s.label}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="text-[10px] text-muted-foreground/60 italic">None</span>
                    )}
                  </div>

                  {/* Unbooked */}
                  <div className="flex flex-col gap-1">
                    <div className="text-[10px] font-semibold text-slate-600 uppercase tracking-wider flex items-center gap-1">
                      <BookOpen className="w-3 h-3" />
                      Unbooked ({m.unbooked.length})
                    </div>
                    {m.unbookedBreakdown.length > 0 ? (
                      <div className="flex flex-col gap-0.5">
                        {m.unbookedBreakdown.map(s => (
                          <div key={s.status} className="flex items-center gap-2 text-xs">
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                            <span className="font-medium" style={{ color: s.color }}>{s.count}</span>
                            <span className="text-muted-foreground">{s.label}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="text-[10px] text-muted-foreground/60 italic">None</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
