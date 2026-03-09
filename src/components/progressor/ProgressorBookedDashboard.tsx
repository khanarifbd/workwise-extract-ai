import { useState, useMemo, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Job } from '@/types/job';
import { mapDatabaseJobToJob } from '@/lib/api';
import { useTradeBookedJobs } from '@/hooks/useTradeBookedJobs';
import { format, isToday, isTomorrow, startOfDay, isValid, parseISO } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Calendar, ChevronDown, Search, Loader2, Users,
  Phone, MapPin, RefreshCw, Clock, Wrench,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface DateGroup {
  key: string;
  label: string;
  count: number;
  date: Date;
  isSpecial?: 'today' | 'tomorrow';
  jobs: Array<Job & { isTradeBooked?: boolean; tradeInfo?: { pendingTrades: { trade: string; bookedDate: Date }[]; totalTrades: number; completedTrades: number } }>;
}

interface MonthGroup {
  monthKey: string;
  monthLabel: string;
  dates: DateGroup[];
  totalCount: number;
  hasToday: boolean;
}

export function ProgressorBookedDashboard() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const { tradeBookings, refetch: refetchTradeBookings } = useTradeBookedJobs();

  const fetchBookedJobs = useCallback(async () => {
    setLoading(true);
    try {
      const FAN_CATEGORY_ID = '913c5a29-2b7f-4da9-992a-1b49e51d9d8a';
      
      // Fetch jobs with booked dates
      const { data: bookedData, error: bookedError } = await supabase
        .from('jobs')
        .select('id, job_number, name, address, phone_number, status, team, team2, progress, is_completed, is_ongoing, ongoing_reason, booked_date, completion_date, expected_completion_date, created_at, date_issued, description, work_items, fan_info, category_id, progress_notes, scheduled_trades, booking_notes, is_flexible_booking')
        .is('deleted_at', null)
        .not('booked_date', 'is', null)
        .or(`category_id.is.null,category_id.neq.${FAN_CATEGORY_ID}`)
        .order('booked_date', { ascending: true });

      if (bookedError) throw bookedError;
      
      // Fetch jobs that have trade bookings but no main booked_date
      const tradeJobIds = Array.from(tradeBookings.keys());
      let tradeOnlyJobs: Job[] = [];
      
      if (tradeJobIds.length > 0) {
        const { data: tradeData, error: tradeError } = await supabase
          .from('jobs')
          .select('id, job_number, name, address, phone_number, status, team, team2, progress, is_completed, is_ongoing, ongoing_reason, booked_date, completion_date, expected_completion_date, created_at, date_issued, description, work_items, fan_info, category_id, progress_notes, scheduled_trades, booking_notes, is_flexible_booking')
          .is('deleted_at', null)
          .is('booked_date', null)
          .in('id', tradeJobIds)
          .or(`category_id.is.null,category_id.neq.${FAN_CATEGORY_ID}`);

        if (tradeError) throw tradeError;
        tradeOnlyJobs = (tradeData || []).map(mapDatabaseJobToJob);
      }
      
      const allJobs = [...(bookedData || []).map(mapDatabaseJobToJob), ...tradeOnlyJobs];
      setJobs(allJobs);
    } catch (err) {
      console.error('Error fetching booked jobs:', err);
    } finally {
      setLoading(false);
    }
  }, [tradeBookings]);

  useEffect(() => { fetchBookedJobs(); }, [fetchBookedJobs]);

  const handleRefresh = useCallback(() => {
    refetchTradeBookings();
    fetchBookedJobs();
  }, [refetchTradeBookings, fetchBookedJobs]);

  // Filter by search
  const filteredJobs = useMemo(() => {
    if (!searchQuery) return jobs;
    const q = searchQuery.toLowerCase();
    return jobs.filter(j =>
      j.name.toLowerCase().includes(q) ||
      j.address.toLowerCase().includes(q) ||
      j.jobNumber.toLowerCase().includes(q) ||
      (j.phoneNumber && j.phoneNumber.includes(q))
    );
  }, [jobs, searchQuery]);

  // Group into month > date structure
  const { monthGroups, totalCount } = useMemo(() => {
    const dateMap = new Map<string, DateGroup['jobs']>();

    filteredJobs.forEach(job => {
      const tradeInfo = tradeBookings.get(job.id);
      const isTradeBooked = !job.bookedDate && !!tradeInfo;
      
      // Determine the effective date
      let effectiveDate: Date | null = null;
      if (job.bookedDate) {
        effectiveDate = job.bookedDate instanceof Date ? job.bookedDate : parseISO(job.bookedDate as any);
      } else if (tradeInfo) {
        effectiveDate = tradeInfo.effectiveBookedDate;
      }
      
      if (!effectiveDate || !isValid(effectiveDate)) return;
      
      const dateKey = format(effectiveDate, 'yyyy-MM-dd');
      if (!dateMap.has(dateKey)) dateMap.set(dateKey, []);
      dateMap.get(dateKey)!.push({
        ...job,
        isTradeBooked,
        tradeInfo: tradeInfo ? {
          pendingTrades: tradeInfo.pendingTrades,
          totalTrades: tradeInfo.totalTrades,
          completedTrades: tradeInfo.completedTrades,
        } : undefined,
      });
    });

    const allDates: DateGroup[] = Array.from(dateMap.entries()).map(([key, dateJobs]) => {
      const date = startOfDay(parseISO(key));
      let label = format(date, 'EEEE dd MMM');
      let isSpecial: DateGroup['isSpecial'] = undefined;
      if (isToday(date)) { label = 'Today'; isSpecial = 'today'; }
      else if (isTomorrow(date)) { label = 'Tomorrow'; isSpecial = 'tomorrow'; }
      return { key, label, count: dateJobs.length, date, isSpecial, jobs: dateJobs };
    });

    allDates.sort((a, b) => a.date.getTime() - b.date.getTime());

    const monthMap = new Map<string, MonthGroup>();
    allDates.forEach(dg => {
      const mk = format(dg.date, 'yyyy-MM');
      const ml = format(dg.date, 'MMMM yyyy');
      if (!monthMap.has(mk)) monthMap.set(mk, { monthKey: mk, monthLabel: ml, dates: [], totalCount: 0, hasToday: false });
      const m = monthMap.get(mk)!;
      m.dates.push(dg);
      m.totalCount += dg.count;
      if (dg.isSpecial === 'today') m.hasToday = true;
    });

    const sorted = Array.from(monthMap.values()).sort((a, b) => a.dates[0].date.getTime() - b.dates[0].date.getTime());
    const total = filteredJobs.filter(j => !!j.bookedDate || tradeBookings.has(j.id)).length;
    return { monthGroups: sorted, totalCount: total };
  }, [filteredJobs, tradeBookings]);

  // Current month expanded by default
  const currentMonthKey = format(new Date(), 'yyyy-MM');
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set([currentMonthKey]));

  const toggleMonth = (mk: string) => {
    setExpandedMonths(prev => {
      const next = new Set(prev);
      next.has(mk) ? next.delete(mk) : next.add(mk);
      return next;
    });
  };

  // Get jobs for selected date
  const selectedDateJobs = useMemo(() => {
    // Build augmented list with trade info
    const augmented = filteredJobs.map(job => {
      const tradeInfo = tradeBookings.get(job.id);
      return {
        ...job,
        isTradeBooked: !job.bookedDate && !!tradeInfo,
        tradeInfo: tradeInfo ? {
          pendingTrades: tradeInfo.pendingTrades,
          totalTrades: tradeInfo.totalTrades,
          completedTrades: tradeInfo.completedTrades,
        } : undefined,
      };
    }).filter(j => !!j.bookedDate || tradeBookings.has(j.id));
    
    if (!selectedDate) return augmented;
    
    return augmented.filter(j => {
      let effectiveDate: Date | null = null;
      if (j.bookedDate) {
        effectiveDate = j.bookedDate instanceof Date ? j.bookedDate : parseISO(j.bookedDate as any);
      } else {
        const ti = tradeBookings.get(j.id);
        if (ti) effectiveDate = ti.effectiveBookedDate;
      }
      if (!effectiveDate) return false;
      return format(effectiveDate, 'yyyy-MM-dd') === selectedDate;
    });
  }, [filteredJobs, selectedDate, tradeBookings]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary mr-2" />
        <span className="text-sm text-muted-foreground">Loading booked jobs...</span>
      </div>
    );
  }

  return (
    <div className="flex gap-4 h-[calc(100vh-280px)]">
      {/* Date Sidebar */}
      <div className="w-52 border border-border rounded-xl bg-card flex flex-col shrink-0">
        <div className="p-3 border-b border-border">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Calendar className="w-4 h-4 text-primary" />
            Booked Dates
          </h3>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            <button
              onClick={() => setSelectedDate(null)}
              className={cn(
                "w-full text-left px-2 py-1.5 rounded-md text-sm transition-colors flex items-center justify-between",
                selectedDate === null ? "bg-primary text-primary-foreground" : "hover:bg-muted"
              )}
            >
              <span className="font-medium">All Dates</span>
              <Badge variant={selectedDate === null ? "secondary" : "outline"} className="text-[10px] h-5 px-1.5">{totalCount}</Badge>
            </button>

            <div className="h-px bg-border my-2" />

            {monthGroups.map(month => (
              <Collapsible key={month.monthKey} open={expandedMonths.has(month.monthKey)} onOpenChange={() => toggleMonth(month.monthKey)}>
                <CollapsibleTrigger className="w-full">
                  <div className={cn("flex items-center justify-between px-2 py-1.5 rounded-md text-sm hover:bg-muted transition-colors", month.hasToday && "bg-muted/50")}>
                    <div className="flex items-center gap-1.5">
                      <ChevronDown className={cn("w-3 h-3 transition-transform", !expandedMonths.has(month.monthKey) && "-rotate-90")} />
                      <span className="font-medium text-xs">{month.monthLabel}</span>
                    </div>
                    <Badge variant="outline" className="text-[10px] h-4 px-1">{month.totalCount}</Badge>
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="ml-3 mt-1 space-y-0.5 border-l border-border pl-2">
                    {month.dates.map(group => (
                      <button
                        key={group.key}
                        onClick={() => setSelectedDate(group.key)}
                        className={cn(
                          "w-full text-left px-2 py-1 rounded text-xs transition-colors flex items-center justify-between",
                          selectedDate === group.key
                            ? "bg-amber-500 text-white"
                            : group.isSpecial === 'today'
                              ? "bg-green-100 dark:bg-green-900/30 hover:bg-green-200 dark:hover:bg-green-900/50 font-semibold text-green-700 dark:text-green-400"
                              : group.isSpecial === 'tomorrow'
                                ? "bg-blue-100 dark:bg-blue-900/30 hover:bg-blue-200 dark:hover:bg-blue-900/50 font-medium text-blue-700 dark:text-blue-400"
                                : "hover:bg-muted text-muted-foreground"
                        )}
                      >
                        <span className="truncate">{group.label}</span>
                        <Badge variant={selectedDate === group.key ? "secondary" : "outline"} className={cn("text-[10px] h-4 px-1", selectedDate === group.key && "bg-white/20 text-white border-white/30")}>{group.count}</Badge>
                      </button>
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            ))}

            {monthGroups.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">No booked dates</p>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Jobs List */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center gap-2 mb-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search tenant, address, job #..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-9 h-9" />
          </div>
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh
          </Button>
        </div>

        <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground">
          <Calendar className="h-3.5 w-3.5" />
          <span>
            {selectedDate
              ? `${format(parseISO(selectedDate), 'EEEE dd MMMM yyyy')} — ${selectedDateJobs.length} job${selectedDateJobs.length !== 1 ? 's' : ''}`
              : `All booked jobs — ${selectedDateJobs.length} total`}
          </span>
        </div>

        <ScrollArea className="flex-1">
          <div className="space-y-2 pr-2">
            {selectedDateJobs.length === 0 ? (
              <Card className="p-8 text-center">
                <Calendar className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
                <p className="text-muted-foreground text-sm">No booked jobs{selectedDate ? ' for this date' : ''}</p>
              </Card>
            ) : (
              selectedDateJobs.map(job => (
                <Card key={job.id} className={cn(
                  "p-3 transition-colors hover:shadow-md",
                  job.isTradeBooked
                    ? "border-l-4 border-l-violet-600 bg-violet-50/80 dark:bg-violet-950/20 ring-1 ring-violet-200 dark:ring-violet-800"
                    : job.isCompleted
                      ? "opacity-70 bg-emerald-50/50 dark:bg-emerald-950/10"
                      : "",
                )}>
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-xs font-mono">#{job.jobNumber}</Badge>
                        <span className="font-semibold text-sm truncate">{job.name}</span>
                        {job.isTradeBooked && job.tradeInfo && (
                          <Badge className="bg-violet-600 text-white text-[10px] flex items-center gap-0.5">
                            <Wrench className="h-2.5 w-2.5" />
                            {job.tradeInfo.pendingTrades.length} Trade{job.tradeInfo.pendingTrades.length !== 1 ? 's' : ''} Booked
                          </Badge>
                        )}
                        {job.isCompleted && <Badge className="bg-emerald-600 text-white text-[10px]">Complete</Badge>}
                        {job.status === 'started' && !job.isTradeBooked && <Badge className="bg-blue-600 text-white text-[10px]">Started</Badge>}
                        {job.status === 'pending' && !job.isTradeBooked && <Badge className="bg-muted text-muted-foreground text-[10px]">Pending</Badge>}
                        {job.team && (
                          <Badge variant="secondary" className="text-[10px]">
                            <Users className="h-2.5 w-2.5 mr-0.5" />{job.team}
                          </Badge>
                        )}
                        {job.team2 && (
                          <Badge variant="secondary" className="text-[10px]">
                            <Users className="h-2.5 w-2.5 mr-0.5" />{job.team2}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1 truncate"><MapPin className="h-3 w-3 shrink-0" />{job.address}</span>
                        {job.phoneNumber && (
                          <a href={`tel:${job.phoneNumber}`} className="flex items-center gap-1 text-primary hover:underline shrink-0">
                            <Phone className="h-3 w-3" />{job.phoneNumber}
                          </a>
                        )}
                      </div>
                      {/* Show pending trades for trade-booked jobs */}
                      {job.isTradeBooked && job.tradeInfo && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {job.tradeInfo.pendingTrades.map((t, i) => (
                            <Badge key={i} variant="outline" className="text-[10px] border-violet-300 text-violet-700 dark:text-violet-400">
                              <Wrench className="h-2 w-2 mr-0.5" />
                              {t.trade} — {format(t.bookedDate, 'dd MMM')}
                            </Badge>
                          ))}
                          {job.tradeInfo.completedTrades > 0 && (
                            <Badge variant="outline" className="text-[10px] border-emerald-300 text-emerald-700 dark:text-emerald-400">
                              ✓ {job.tradeInfo.completedTrades}/{job.tradeInfo.totalTrades} done
                            </Badge>
                          )}
                        </div>
                      )}
                      {job.bookingNotes && (
                        <p className="text-[11px] text-muted-foreground mt-1 italic">📝 {job.bookingNotes}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-medium">
                        {job.isTradeBooked && job.tradeInfo
                          ? format(job.tradeInfo.pendingTrades[0].bookedDate, 'dd MMM yyyy')
                          : job.bookedDate ? format(job.bookedDate, 'dd MMM yyyy') : '—'}
                      </p>
                      {job.isFlexibleBooking && (
                        <Badge variant="outline" className="text-[10px] mt-0.5 border-amber-400 text-amber-600">Flexible</Badge>
                      )}
                      <div className="flex items-center gap-1 mt-1 justify-end">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        <span className="text-[10px] text-muted-foreground">{job.progress}%</span>
                      </div>
                    </div>
                  </div>
                </Card>
              ))
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
