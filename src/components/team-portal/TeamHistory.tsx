import { useState, useMemo } from 'react';
import { Job } from '@/types/job';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  FolderOpen,
  Calendar,
  Search,
  History,
  MapPin,
  Phone,
} from 'lucide-react';
import { format, isValid, isToday, isYesterday } from 'date-fns';
import { cn } from '@/lib/utils';

const parseDateKeyAsLocal = (dateStr: string): Date => {
  const parts = dateStr.split('-').map(Number);
  if (parts.length >= 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }
  return new Date(dateStr);
};

const getJobHistoryDate = (job: Job): Date | null => {
  // Prefer completion date, fall back to booked date
  const cd = job.completionDate;
  if (cd) {
    const d = cd instanceof Date ? cd : new Date(cd as any);
    if (isValid(d)) return d;
  }
  const bd = job.bookedDate;
  if (bd) {
    const d = bd instanceof Date ? bd : parseDateKeyAsLocal(String(bd));
    if (isValid(d)) return d;
  }
  return null;
};

interface TeamHistoryProps {
  jobs: Job[];
  teamName: string;
  onSelectJob: (job: Job) => void;
}

const formatDayHeader = (dateKey: string): string => {
  try {
    const date = parseDateKeyAsLocal(dateKey);
    if (isToday(date)) return `Today — ${format(date, 'EEEE d')}`;
    if (isYesterday(date)) return `Yesterday — ${format(date, 'EEEE d')}`;
    return format(date, 'EEEE, d');
  } catch {
    return dateKey;
  }
};

export const TeamHistory = ({ jobs, teamName, onSelectJob }: TeamHistoryProps) => {
  const [search, setSearch] = useState('');
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());

  // Only completed jobs assigned to this team (defensive)
  const completedJobs = useMemo(() => {
    return jobs.filter(j => {
      if (!j.isCompleted) return false;
      const isAssigned = j.team === teamName || j.team2 === teamName;
      return isAssigned;
    });
  }, [jobs, teamName]);

  // Apply search
  const searchedJobs = useMemo(() => {
    if (!search.trim()) return completedJobs;
    const term = search.toLowerCase();
    return completedJobs.filter(j =>
      (j.jobNumber || '').toLowerCase().includes(term) ||
      (j.name || '').toLowerCase().includes(term) ||
      (j.address || '').toLowerCase().includes(term) ||
      (j.description || '').toLowerCase().includes(term) ||
      (j.summaryOfWorks || '').toLowerCase().includes(term)
    );
  }, [completedJobs, search]);

  // Group by month → day (descending)
  const grouped = useMemo(() => {
    const monthMap = new Map<string, Map<string, Job[]>>();
    const undated: Job[] = [];

    for (const job of searchedJobs) {
      const date = getJobHistoryDate(job);
      if (!date) {
        undated.push(job);
        continue;
      }
      const monthKey = format(date, 'yyyy-MM');
      const dayKey = format(date, 'yyyy-MM-dd');
      if (!monthMap.has(monthKey)) monthMap.set(monthKey, new Map());
      const days = monthMap.get(monthKey)!;
      if (!days.has(dayKey)) days.set(dayKey, []);
      days.get(dayKey)!.push(job);
    }

    // Sort jobs within day by date desc
    for (const [, days] of monthMap) {
      for (const [, list] of days) {
        list.sort((a, b) => (getJobHistoryDate(b)?.getTime() || 0) - (getJobHistoryDate(a)?.getTime() || 0));
      }
    }

    // Sort months descending (newest first)
    const months = Array.from(monthMap.keys()).sort((a, b) => b.localeCompare(a)).map(monthKey => {
      const daysMap = monthMap.get(monthKey)!;
      // Sort days descending within each month
      const sortedDayKeys = Array.from(daysMap.keys()).sort((a, b) => b.localeCompare(a));
      const sortedDays = new Map<string, Job[]>();
      let total = 0;
      for (const dk of sortedDayKeys) {
        const list = daysMap.get(dk)!;
        sortedDays.set(dk, list);
        total += list.length;
      }
      const monthDate = parseDateKeyAsLocal(`${monthKey}-01`);
      return {
        monthKey,
        monthLabel: format(monthDate, 'MMMM yyyy'),
        days: sortedDays,
        total,
      };
    });

    return { months, undated };
  }, [searchedJobs]);

  const toggleMonth = (key: string) =>
    setExpandedMonths(prev => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key); else n.add(key);
      return n;
    });

  const toggleDay = (key: string) =>
    setExpandedDays(prev => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key); else n.add(key);
      return n;
    });

  // Auto-expand newest month on first render
  useMemo(() => {
    if (grouped.months.length > 0 && expandedMonths.size === 0 && !search) {
      setExpandedMonths(new Set([grouped.months[0].monthKey]));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grouped.months.length]);

  return (
    <div className="p-3 space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2 px-1">
        <div className="h-8 w-8 rounded-full bg-[hsl(var(--success))]/15 flex items-center justify-center">
          <History className="h-4 w-4 text-[hsl(var(--success))]" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-bold text-foreground">Job History</h2>
          <p className="text-[10px] text-muted-foreground">
            {completedJobs.length} completed job{completedJobs.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by job #, address, name…"
          className="pl-9 h-9 text-sm rounded-full"
        />
      </div>

      {completedJobs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
            <CheckCircle2 className="h-8 w-8 text-muted-foreground/50" />
          </div>
          <p className="text-base font-medium text-muted-foreground">No completed jobs yet</p>
          <p className="text-xs text-muted-foreground/80 text-center px-4 mt-1">
            Once you sign off jobs, they'll appear here grouped by date.
          </p>
        </div>
      ) : searchedJobs.length === 0 ? (
        <div className="text-center py-10 text-sm text-muted-foreground">
          No matches for "{search}"
        </div>
      ) : (
        <div className="space-y-2">
          {grouped.months.map((m) => (
            <Collapsible key={m.monthKey} open={expandedMonths.has(m.monthKey)} onOpenChange={() => toggleMonth(m.monthKey)}>
              <CollapsibleTrigger asChild>
                <div className="cursor-pointer rounded-xl bg-[hsl(var(--success))]/5 border border-[hsl(var(--success))]/20 px-3 py-2 flex items-center justify-between hover:bg-[hsl(var(--success))]/10 transition-colors">
                  <div className="flex items-center gap-2">
                    {expandedMonths.has(m.monthKey)
                      ? <ChevronDown className="h-4 w-4 text-[hsl(var(--success))]" />
                      : <ChevronRight className="h-4 w-4 text-[hsl(var(--success))]" />}
                    <FolderOpen className="h-4 w-4 text-[hsl(var(--success))]" />
                    <span className="font-semibold text-sm">{m.monthLabel}</span>
                  </div>
                  <Badge className="text-[10px] bg-[hsl(var(--success))]/15 text-[hsl(var(--success))] hover:bg-[hsl(var(--success))]/15 rounded-full">
                    {m.total}
                  </Badge>
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-1.5 mt-1.5 ml-3 border-l-2 border-[hsl(var(--success))]/20 pl-3">
                {Array.from(m.days.entries()).map(([dayKey, dayJobs]) => (
                  <Collapsible key={dayKey} open={expandedDays.has(dayKey)} onOpenChange={() => toggleDay(dayKey)}>
                    <CollapsibleTrigger asChild>
                      <div className="cursor-pointer rounded-lg px-3 py-2 flex items-center justify-between hover:bg-muted/50 transition-colors">
                        <div className="flex items-center gap-1.5">
                          {expandedDays.has(dayKey)
                            ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                            : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                          <Calendar className="h-3.5 w-3.5 text-[hsl(var(--success))]/80" />
                          <span className="font-medium text-xs">{formatDayHeader(dayKey)}</span>
                        </div>
                        <Badge variant="secondary" className="text-[10px] px-1.5 rounded-full">
                          {dayJobs.length}
                        </Badge>
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-1 mt-1.5 ml-2 pl-2">
                      {dayJobs.map((job) => (
                        <button
                          key={job.id}
                          onClick={() => onSelectJob(job)}
                          className={cn(
                            "w-full text-left rounded-lg border border-border bg-card p-3 hover:bg-muted/40 transition-colors",
                            "border-l-4 border-l-[hsl(var(--success))]"
                          )}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 mb-0.5">
                                <CheckCircle2 className="h-3.5 w-3.5 text-[hsl(var(--success))] flex-shrink-0" />
                                <span className="font-mono text-[11px] text-muted-foreground">
                                  {job.jobNumber}
                                </span>
                              </div>
                              <p className="font-semibold text-sm text-foreground truncate">{job.name}</p>
                              {job.address && (
                                <p className="text-xs text-muted-foreground flex items-start gap-1 mt-0.5">
                                  <MapPin className="h-3 w-3 mt-0.5 flex-shrink-0" />
                                  <span className="line-clamp-1">{job.address}</span>
                                </p>
                              )}
                              {job.phoneNumber && (
                                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                                  <Phone className="h-3 w-3 flex-shrink-0" />
                                  <span>{job.phoneNumber}</span>
                                </p>
                              )}
                            </div>
                            {(() => {
                              const d = getJobHistoryDate(job);
                              return d ? (
                                <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                                  {format(d, 'HH:mm')}
                                </span>
                              ) : null;
                            })()}
                          </div>
                        </button>
                      ))}
                    </CollapsibleContent>
                  </Collapsible>
                ))}
              </CollapsibleContent>
            </Collapsible>
          ))}

          {grouped.undated.length > 0 && (
            <div className="space-y-1 pt-2">
              <h3 className="text-[10px] uppercase tracking-wider text-muted-foreground px-1">Undated</h3>
              {grouped.undated.map((job) => (
                <button
                  key={job.id}
                  onClick={() => onSelectJob(job)}
                  className="w-full text-left rounded-lg border border-border bg-card p-3 hover:bg-muted/40 transition-colors border-l-4 border-l-[hsl(var(--success))]"
                >
                  <p className="font-mono text-[11px] text-muted-foreground">{job.jobNumber}</p>
                  <p className="font-semibold text-sm">{job.name}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
