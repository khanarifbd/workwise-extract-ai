import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { differenceInHours } from 'date-fns';
import { Job } from '@/types/job';
import { SubTask, SUB_TASK_STATUS_OPTIONS } from '@/types/subTask';
import { mapDatabaseJobToJob } from '@/lib/api';
import { useTradeBookedJobs } from '@/hooks/useTradeBookedJobs';
import { useAllSubTasks } from '@/hooks/useSubTasks';
import { useAuditLog } from '@/hooks/useAuditLog';
import { ProgressorJobExpandedContent } from '@/components/progressor/ProgressorJobExpandedContent';
import { AddSubTaskModal } from '@/components/progressor/AddSubTaskModal';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
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
  Phone, MapPin, RefreshCw, Clock, Wrench, AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ContactRecord {
  id: string;
  outcome: string;
  notes: string | null;
  contact_date: string;
  next_action: string | null;
  next_action_date: string | null;
}

type ViewFilter = 'all' | 'trades' | 'dm_teams';

interface DateGroup {
  key: string;
  label: string;
  count: number;
  date: Date;
  isSpecial?: 'today' | 'tomorrow';
  jobs: Array<Job & { isTradeBooked?: boolean; tradeInfo?: { pendingTrades: { trade: string; bookedDate: Date; taskType?: string }[]; totalTrades: number; completedTrades: number } }>;
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
  const [viewFilter, setViewFilter] = useState<ViewFilter>('all');
  const [expandedJobs, setExpandedJobs] = useState<Set<string>>(new Set());
  const [contactHistory, setContactHistory] = useState<Map<string, ContactRecord[]>>(new Map());
  const [addSubTaskJob, setAddSubTaskJob] = useState<Job | null>(null);
  const { tradeBookings, refetch: refetchTradeBookings } = useTradeBookedJobs();
  const { subTasks, updateSubTask, fetchAll: fetchAllSubTasks } = useAllSubTasks();
  const { logAction } = useAuditLog();
  const hasInitializedFetchRef = useRef(false);

  // Group sub-tasks by parent job
  const subTasksByJob = useMemo(() => {
    const map = new Map<string, SubTask[]>();
    for (const st of subTasks) {
      const existing = map.get(st.parentJobId) || [];
      existing.push(st);
      map.set(st.parentJobId, existing);
    }
    return map;
  }, [subTasks]);

  const realtimeRefreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchBookedJobs = useCallback(async (background = false) => {
    if (!background) setLoading(true);
    try {
      const FAN_CATEGORY_ID = '913c5a29-2b7f-4da9-992a-1b49e51d9d8a';
      
      const { data: bookedData, error: bookedError } = await supabase
        .from('jobs')
        .select('id, job_number, name, address, phone_number, status, team, team2, progress, is_completed, is_ongoing, ongoing_reason, booked_date, completion_date, expected_completion_date, created_at, date_issued, description, work_items, fan_info, category_id, progress_notes, scheduled_trades, booking_notes, is_flexible_booking, attachments, additional_works, summary_of_works, costs, private_notes, refer_back, refer_back_reason, refer_back_date, insulation_info, linked_fan_job_id, linked_insulation_job_id')
        .is('deleted_at', null)
        .not('booked_date', 'is', null)
        .eq('refer_back', false)
        .or(`category_id.is.null,category_id.neq.${FAN_CATEGORY_ID}`)
        .order('booked_date', { ascending: true });

      if (bookedError) throw bookedError;
      
      const bookedJobs = (bookedData || []).map(mapDatabaseJobToJob);
      const bookedJobIds = new Set(bookedJobs.map(j => j.id));
      
      // Fetch trade-booked jobs that aren't already in the booked list
      const tradeJobIds = Array.from(tradeBookings.keys()).filter(id => !bookedJobIds.has(id));
      let tradeOnlyJobs: Job[] = [];
      
      if (tradeJobIds.length > 0) {
        const { data: tradeData, error: tradeError } = await supabase
          .from('jobs')
          .select('id, job_number, name, address, phone_number, status, team, team2, progress, is_completed, is_ongoing, ongoing_reason, booked_date, completion_date, expected_completion_date, created_at, date_issued, description, work_items, fan_info, category_id, progress_notes, scheduled_trades, booking_notes, is_flexible_booking, attachments, additional_works, summary_of_works, costs, private_notes, refer_back, refer_back_reason, refer_back_date, insulation_info, linked_fan_job_id, linked_insulation_job_id')
          .is('deleted_at', null)
          .in('id', tradeJobIds)
          .or(`category_id.is.null,category_id.neq.${FAN_CATEGORY_ID}`);

        if (tradeError) throw tradeError;
        tradeOnlyJobs = (tradeData || []).map(mapDatabaseJobToJob);
      }
      
      const allJobs = [...bookedJobs, ...tradeOnlyJobs];
      setJobs(allJobs);

      // Fetch contact history for all jobs
      const jobIds = allJobs.map(j => j.id);
      if (jobIds.length > 0) {
        const { data: contacts } = await supabase
          .from('contact_history')
          .select('*')
          .in('job_id', jobIds)
          .order('contact_date', { ascending: false });
        
        const contactMap = new Map<string, ContactRecord[]>();
        (contacts || []).forEach((c: any) => {
          const existing = contactMap.get(c.job_id) || [];
          existing.push(c);
          contactMap.set(c.job_id, existing);
        });
        setContactHistory(contactMap);
      }
    } catch (err) {
      console.error('Error fetching booked jobs:', err);
    } finally {
      if (!background) setLoading(false);
    }
  }, [tradeBookings]);

  useEffect(() => {
    const background = hasInitializedFetchRef.current;
    void fetchBookedJobs(background);
    hasInitializedFetchRef.current = true;
  }, [fetchBookedJobs]);

  // Realtime: refresh in background and debounce to avoid disruptive UI flicker
  useEffect(() => {
    const FAN_CATEGORY_ID = '913c5a29-2b7f-4da9-992a-1b49e51d9d8a';

    const isRelevantBookedRecord = (record: any) => {
      if (!record || record.deleted_at) return false;
      if (record.category_id === FAN_CATEGORY_ID) return false;
      if (record.refer_back === true) return false;
      return !!record.booked_date;
    };

    const queueBackgroundRefresh = () => {
      if (realtimeRefreshTimeoutRef.current) {
        clearTimeout(realtimeRefreshTimeoutRef.current);
      }
      realtimeRefreshTimeoutRef.current = setTimeout(() => {
        void fetchBookedJobs(true);
      }, 1200);
    };

    const channel = supabase
      .channel('progressor-booked-realtime-sync')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'jobs' }, (payload) => {
        const o = payload.old as any;
        const n = payload.new as any;

        if (!isRelevantBookedRecord(o) && !isRelevantBookedRecord(n)) return;

        // Refresh on booked_date, is_completed, status, or team changes
        if (o?.booked_date !== n?.booked_date || o?.is_completed !== n?.is_completed ||
            o?.status !== n?.status || o?.team !== n?.team || o?.progress !== n?.progress ||
            o?.refer_back !== n?.refer_back) {
          queueBackgroundRefresh();
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'jobs' }, (payload) => {
        const n = payload.new as any;
        if (isRelevantBookedRecord(n)) {
          queueBackgroundRefresh();
        }
      })
      .subscribe();

    return () => {
      if (realtimeRefreshTimeoutRef.current) {
        clearTimeout(realtimeRefreshTimeoutRef.current);
        realtimeRefreshTimeoutRef.current = null;
      }
      supabase.removeChannel(channel);
    };
  }, [fetchBookedJobs]);

  // Periodic sync every 2 min to catch missed updates without forcing visible loading state
  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      void fetchBookedJobs(true);
    }, 120000);
    return () => clearInterval(interval);
  }, [fetchBookedJobs]);

  const handleRefresh = useCallback(() => {
    refetchTradeBookings();
    void fetchBookedJobs(true);
    void fetchAllSubTasks(true);
  }, [refetchTradeBookings, fetchBookedJobs, fetchAllSubTasks]);

  const handleSubTaskUpdate = async (subTask: SubTask, field: string, value: any) => {
    const oldValue = (subTask as any)[field];
    const dbField = field === 'assignedTeam' ? 'assigned_team'
      : field === 'bookedDate' ? 'booked_date'
      : field === 'deadlineDate' ? 'deadline_date'
      : field === 'completionDate' ? 'completion_date'
      : field === 'portalUpdated' ? 'portal_updated'
      : field === 'signedOff' ? 'signed_off'
      : field;

    if (field === 'status' && value === 'completed_signed_off' && !subTask.completionDate) return;

    let dbValue = value;
    if (['bookedDate', 'deadlineDate', 'completionDate'].includes(field) && value) {
      dbValue = new Date(value).toISOString();
    }

    const updates: Record<string, any> = { [dbField]: dbValue };
    if (field === 'bookedDate' && value && subTask.status === 'not_scheduled') {
      updates.status = 'scheduled';
    }

    await updateSubTask(subTask.id, updates);
    await logAction({
      action: 'update', tableName: 'job_sub_tasks', recordId: subTask.id,
      fieldChanged: field, oldValue: String(oldValue ?? ''), newValue: String(value),
      metadata: { parentJobId: subTask.parentJobId, trade: subTask.trade },
    });
  };

  const handleDeleteSubTask = async (subTask: SubTask) => {
    if (!confirm(`Delete ${subTask.trade} sub-task? This cannot be undone.`)) return;
    try {
      const { error } = await supabase.from('job_sub_tasks').delete().eq('id', subTask.id);
      if (error) throw error;
      await logAction({
        action: 'delete', tableName: 'job_sub_tasks', recordId: subTask.id,
        fieldChanged: 'deleted', oldValue: subTask.trade, newValue: '',
        metadata: { parentJobId: subTask.parentJobId, trade: subTask.trade },
      });

      // Check if any sub-tasks remain (exclude just-deleted); if not, clear awaiting_trade
      const { data: remaining } = await supabase
        .from('job_sub_tasks')
        .select('id')
        .eq('parent_job_id', subTask.parentJobId)
        .neq('id', subTask.id);
      
      if (!remaining || remaining.length === 0) {
        await supabase
          .from('jobs')
          .update({ status: 'started', is_ongoing: false, ongoing_reason: '' })
          .eq('id', subTask.parentJobId);
        setJobs(prev => prev.map(j => 
          j.id === subTask.parentJobId
            ? { ...j, status: 'started' as any, isOngoing: false, ongoingReason: '' }
            : j
        ));
      }

      await fetchAllSubTasks();
    } catch (err) {
      console.error('Error deleting sub-task:', err);
    }
  };

  const toggleJobExpand = (jobId: string) => {
    setExpandedJobs(prev => {
      const next = new Set(prev);
      next.has(jobId) ? next.delete(jobId) : next.add(jobId);
      return next;
    });
  };

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

  // Group into month > date structure, filtered by viewFilter
  const { monthGroups, totalCount, tradeCount, dmCount } = useMemo(() => {
    const dateMap = new Map<string, DateGroup['jobs']>();

    filteredJobs.forEach(job => {
      const tradeInfo = tradeBookings.get(job.id);
      const isTradeBooked = !!tradeInfo;
      
      // Apply view filter
      if (viewFilter === 'trades') {
        // Only show jobs with trade-type sub-tasks (or regular booked jobs without trade info)
        if (tradeInfo && tradeInfo.taskType === 'dm_team') return;
        if (tradeInfo) {
          const tradePending = tradeInfo.pendingTrades.filter(t => (t.taskType || 'trade') === 'trade');
          if (tradePending.length === 0 && !job.bookedDate) return;
        }
      } else if (viewFilter === 'dm_teams') {
        // Only show jobs with DM team sub-tasks
        if (!tradeInfo) return;
        const dmPending = tradeInfo.pendingTrades.filter(t => t.taskType === 'dm_team');
        if (dmPending.length === 0) return;
      }

      let effectiveDate: Date | null = null;
      if (tradeInfo) {
        // For filtered views, use the effective date of matching sub-tasks
        if (viewFilter === 'dm_teams') {
          const dmPending = tradeInfo.pendingTrades.filter(t => t.taskType === 'dm_team');
          effectiveDate = dmPending.length > 0 ? dmPending[0].bookedDate : tradeInfo.effectiveBookedDate;
        } else if (viewFilter === 'trades') {
          const tradePending = tradeInfo.pendingTrades.filter(t => (t.taskType || 'trade') === 'trade');
          effectiveDate = tradePending.length > 0 ? tradePending[0].bookedDate : tradeInfo.effectiveBookedDate;
        } else {
          effectiveDate = tradeInfo.effectiveBookedDate;
        }
      } else if (job.bookedDate) {
        effectiveDate = job.bookedDate instanceof Date ? job.bookedDate : parseISO(job.bookedDate as any);
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
    const total = allDates.reduce((sum, d) => sum + d.count, 0);
    
    // Count trades vs DM for badge numbers
    let tc = 0, dc = 0;
    filteredJobs.forEach(job => {
      const ti = tradeBookings.get(job.id);
      if (ti) {
        if (ti.pendingTrades.some(t => (t.taskType || 'trade') === 'trade')) tc++;
        if (ti.pendingTrades.some(t => t.taskType === 'dm_team')) dc++;
      }
      if (!ti && job.bookedDate) tc++; // Regular booked jobs count as trades
    });

    return { monthGroups: sorted, totalCount: total, tradeCount: tc, dmCount: dc };
  }, [filteredJobs, tradeBookings, viewFilter]);

  const currentMonthKey = format(new Date(), 'yyyy-MM');
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set([currentMonthKey]));

  const toggleMonth = (mk: string) => {
    setExpandedMonths(prev => {
      const next = new Set(prev);
      next.has(mk) ? next.delete(mk) : next.add(mk);
      return next;
    });
  };

  // Get jobs for selected date (respects viewFilter via monthGroups)
  const selectedDateJobs = useMemo(() => {
    // Collect all jobs from monthGroups (already filtered by viewFilter)
    const allGroupedJobs = monthGroups.flatMap(m => m.dates.flatMap(d => d.jobs));
    
    if (!selectedDate) return allGroupedJobs;
    
    const dateGroup = monthGroups.flatMap(m => m.dates).find(d => d.key === selectedDate);
    return dateGroup ? dateGroup.jobs : [];
  }, [monthGroups, selectedDate]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary mr-2" />
        <span className="text-sm text-muted-foreground">Loading booked jobs...</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* View Filter Tabs */}
      <Tabs value={viewFilter} onValueChange={(v) => { setViewFilter(v as ViewFilter); setSelectedDate(null); }}>
        <TabsList className="h-9">
          <TabsTrigger value="all" className="text-xs gap-1.5">
            <Calendar className="h-3.5 w-3.5" />
            All Booked
            <Badge variant="outline" className="text-[10px] h-4 px-1 ml-0.5">{tradeCount + dmCount}</Badge>
          </TabsTrigger>
          <TabsTrigger value="trades" className="text-xs gap-1.5">
            <Wrench className="h-3.5 w-3.5" />
            Trades
            <Badge variant="outline" className="text-[10px] h-4 px-1 ml-0.5">{tradeCount}</Badge>
          </TabsTrigger>
          <TabsTrigger value="dm_teams" className="text-xs gap-1.5">
            <Users className="h-3.5 w-3.5" />
            DM Teams
            <Badge variant="outline" className="text-[10px] h-4 px-1 ml-0.5">{dmCount}</Badge>
          </TabsTrigger>
        </TabsList>
      </Tabs>

    <div className="flex gap-4 h-[calc(100vh-340px)]">
      {/* Date Sidebar */}
      <div className="w-52 border border-border rounded-xl bg-card flex flex-col shrink-0">
        <div className="p-3 border-b border-border">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            {viewFilter === 'dm_teams' ? <Users className="w-4 h-4 text-blue-500" /> : <Calendar className="w-4 h-4 text-primary" />}
            {viewFilter === 'dm_teams' ? 'DM Team Schedule' : viewFilter === 'trades' ? 'Trade Schedule' : 'Booked Dates'}
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
              selectedDateJobs.map(job => {
                const isExpanded = expandedJobs.has(job.id);
                const jobSubTasks = subTasksByJob.get(job.id) || [];
                const jobContacts = contactHistory.get(job.id) || [];

                return (
                  <Card key={job.id} className={cn(
                    "overflow-hidden transition-all",
                    isExpanded
                      ? "bg-indigo-50/60 dark:bg-indigo-950/20 border-indigo-400 border-2 shadow-lg shadow-indigo-500/10"
                      : job.isTradeBooked
                        ? "border-l-4 border-l-violet-600 bg-violet-50/80 dark:bg-violet-950/20 ring-1 ring-violet-200 dark:ring-violet-800"
                        : job.isCompleted
                          ? "opacity-70 bg-emerald-50/50 dark:bg-emerald-950/10"
                          : "",
                  )}>
                    {/* 12-hour overdue flash alert */}
                    {(() => {
                      const effectiveDate = job.bookedDate || (job.tradeInfo?.pendingTrades?.[0]?.bookedDate);
                      const hoursSinceBooked = effectiveDate ? differenceInHours(new Date(), effectiveDate) : 0;
                      const isOverdue12h = effectiveDate && hoursSinceBooked >= 12 && !job.isCompleted && job.progress !== 100;
                      if (!isOverdue12h) return null;
                      return (
                        <div className="bg-red-600 text-white text-[11px] font-bold px-4 py-1.5 flex items-center gap-2 animate-pulse">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          <span>OVERDUE — {Math.round(hoursSinceBooked)}h since booked date. Requires immediate attention.</span>
                        </div>
                      );
                    })()}
                    {/* Clickable Header */}
                    <div
                      className="px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors flex items-start gap-3"
                      onClick={() => toggleJobExpand(job.id)}
                    >
                      <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform flex-shrink-0 mt-0.5", isExpanded && "rotate-180")} />
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
                            <a href={`tel:${job.phoneNumber}`} className="flex items-center gap-1 text-primary hover:underline shrink-0"
                              onClick={(e) => e.stopPropagation()}>
                              <Phone className="h-3 w-3" />{job.phoneNumber}
                            </a>
                          )}
                        </div>
                        {/* Show pending trades for trade-booked jobs */}
                        {!isExpanded && job.isTradeBooked && job.tradeInfo && (
                          <div className="mt-1.5 flex flex-wrap gap-1" onClick={(e) => e.stopPropagation()}>
                            {job.tradeInfo.pendingTrades.map((t, i) => {
                              const matchingSt = jobSubTasks.find(st => st.trade === t.trade && !st.completionDate);
                              return (
                                <div key={i} className="flex items-center gap-1 border border-violet-300 dark:border-violet-700 rounded-md px-1.5 py-0.5 bg-violet-50 dark:bg-violet-950/30">
                                  <Wrench className="h-2.5 w-2.5 text-violet-600" />
                                  <span className="text-[10px] font-medium text-violet-700 dark:text-violet-400">{t.trade}</span>
                                  <Input
                                    type="date"
                                    value={t.bookedDate ? format(t.bookedDate, 'yyyy-MM-dd') : ''}
                                    onChange={async (e) => {
                                      if (!matchingSt) return;
                                      const newDate = e.target.value ? new Date(e.target.value).toISOString() : null;
                                      await updateSubTask(matchingSt.id, {
                                        booked_date: newDate,
                                        status: newDate && matchingSt.status === 'not_scheduled' ? 'scheduled' : matchingSt.status,
                                      });
                                      await fetchAllSubTasks(true);
                                      refetchTradeBookings();
                                    }}
                                    className="h-5 text-[10px] w-[100px] px-1 border-violet-300"
                                  />
                                </div>
                              );
                            })}
                            {job.tradeInfo.completedTrades > 0 && (
                              <Badge variant="outline" className="text-[10px] border-emerald-300 text-emerald-700 dark:text-emerald-400">
                                ✓ {job.tradeInfo.completedTrades}/{job.tradeInfo.totalTrades} done
                              </Badge>
                            )}
                          </div>
                        )}
                        {!isExpanded && job.bookingNotes && (
                          <p className="text-[11px] text-muted-foreground mt-1 italic">📝 {job.bookingNotes}</p>
                        )}
                      </div>
                      <div className="text-right shrink-0" onClick={(e) => e.stopPropagation()}>
                        {job.isTradeBooked && job.tradeInfo ? (
                          <p className="text-xs font-medium cursor-default" onClick={(e) => { e.stopPropagation(); toggleJobExpand(job.id); }}>
                            {format(job.tradeInfo.pendingTrades[0].bookedDate, 'dd MMM yyyy')}
                            <span className="block text-[9px] text-muted-foreground">Edit in expanded view ↓</span>
                          </p>
                        ) : (
                          <Input
                            type="date"
                            value={job.bookedDate ? format(job.bookedDate, 'yyyy-MM-dd') : ''}
                            onChange={async (e) => {
                              const newDate = e.target.value ? new Date(e.target.value).toISOString() : null;
                              await supabase.from('jobs').update({ booked_date: newDate }).eq('id', job.id);
                              setJobs(prev => prev.map(j => j.id === job.id ? { ...j, bookedDate: newDate ? new Date(newDate) : null } : j));
                              // Refresh to ensure sidebar and trade bookings are in sync
                              handleRefresh();
                            }}
                            className="h-7 text-xs w-[130px] font-medium"
                          />
                        )}
                        {job.isFlexibleBooking && (
                          <Badge variant="outline" className="text-[10px] mt-0.5 border-amber-400 text-amber-600">Flexible</Badge>
                        )}
                        <div className="flex items-center gap-1 mt-1 justify-end">
                          <Clock className="h-3 w-3 text-muted-foreground" />
                          <span className="text-[10px] text-muted-foreground">{job.progress}%</span>
                        </div>
                      </div>
                    </div>

                    {/* Expanded Editable Content */}
                    {isExpanded && (
                      <ProgressorJobExpandedContent
                        job={job}
                        jobSubTasks={jobSubTasks}
                        jobContacts={jobContacts}
                        onJobUpdate={(jobId, updates) => {
                          setJobs(prev => prev.map(j => j.id === jobId ? { ...j, ...updates } : j));
                          // If bookedDate changed, refresh so the job moves to the correct date folder
                          if ('bookedDate' in updates) {
                            handleRefresh();
                          }
                        }}
                        onSubTaskUpdate={handleSubTaskUpdate}
                        onDeleteSubTask={handleDeleteSubTask}
                        onAddSubTask={(j) => setAddSubTaskJob(j)}
                        onRefresh={handleRefresh}
                      />
                    )}
                  </Card>
                );
              })
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Add Sub-Task Modal */}
      {addSubTaskJob && (
        <AddSubTaskModal
          open={!!addSubTaskJob}
          onOpenChange={(open) => !open && setAddSubTaskJob(null)}
          job={{ id: addSubTaskJob.id, jobNumber: addSubTaskJob.jobNumber, name: addSubTaskJob.name, address: addSubTaskJob.address }}
          onCreated={() => {
            const jobId = addSubTaskJob.id;
            setExpandedJobs(prev => new Set([...prev, jobId]));
            fetchAllSubTasks(true).then(() => fetchBookedJobs(true));
          }}
        />
      )}
    </div>
    </div>
  );
}
