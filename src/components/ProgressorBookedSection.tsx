import { useMemo, useState, useEffect, useCallback } from 'react';
import { Job, FanInfo } from '@/types/job';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { format } from 'date-fns';
import { 
  Wrench, ChevronDown, ChevronRight, MapPin, Clock, 
  CheckCircle2, CalendarCheck, ListTodo, FileText, Zap,
  Layers, ArrowRight, AlertCircle, Phone, StickyNote,
  Calendar, Edit3, Save, X, Loader2, Fan, Users
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { FanEditor } from '@/components/FanEditor';
import { TeamSelector } from '@/components/TeamSelector';

interface TradeBookingInfo {
  jobId: string;
  effectiveBookedDate: Date;
  totalTrades: number;
  completedTrades: number;
  pendingTrades: { trade: string; bookedDate: Date; taskType?: string }[];
  isTradeBooked: true;
  taskType?: string;
}

interface SubTaskRow {
  id: string;
  parent_job_id: string;
  trade: string;
  assigned_team: string | null;
  booked_date: string | null;
  deadline_date: string | null;
  status: string;
  completion_date: string | null;
  description: string | null;
  task_type: string;
  notes: string | null;
}

interface TodoRow {
  id: string;
  job_id: string;
  label: string;
  is_completed: boolean;
  custom_text: string | null;
}

interface ProgressorBookedSectionProps {
  jobs: Job[];
  tradeBookings: Map<string, TradeBookingInfo>;
  onJobClick?: (job: Job) => void;
  onJobUpdate?: (jobId: string, updates: Partial<Job>) => void;
  refreshJobs?: () => void;
  fanCategoryId?: string;
  currentCategoryId?: string;
}

const completedStatuses = ['completed_awaiting_portal', 'completed_signed_off'];

const ProgressorIcon = ({ className }: { className?: string }) => (
  <div className={cn("relative flex items-center justify-center", className)}>
    <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-cyan-400 via-blue-500 to-indigo-600 opacity-90" />
    <div className="absolute inset-0 rounded-lg animate-pulse bg-gradient-to-br from-cyan-400/30 to-indigo-500/30" />
    <Zap className="relative w-4 h-4 text-white drop-shadow-sm" fill="currentColor" />
  </div>
);

export const ProgressorBookedSection = ({ jobs, tradeBookings, onJobClick, onJobUpdate, refreshJobs, fanCategoryId, currentCategoryId }: ProgressorBookedSectionProps) => {
  const [expandedJobs, setExpandedJobs] = useState<Set<string>>(new Set());
  const [subTasks, setSubTasks] = useState<Map<string, SubTaskRow[]>>(new Map());
  const [todos, setTodos] = useState<Map<string, TodoRow[]>>(new Map());

  const progressorJobs = useMemo(() => {
    return jobs.filter(job => tradeBookings.has(job.id));
  }, [jobs, tradeBookings]);

  const fetchData = useCallback(async () => {
    if (progressorJobs.length === 0) return;
    const jobIds = progressorJobs.map(j => j.id);

    const [subTaskRes, todoRes] = await Promise.all([
      supabase
        .from('job_sub_tasks')
        .select('id, parent_job_id, trade, assigned_team, booked_date, deadline_date, status, completion_date, description, task_type, notes')
        .in('parent_job_id', jobIds),
      supabase
        .from('progressor_todos')
        .select('id, job_id, label, is_completed, custom_text')
        .in('job_id', jobIds),
    ]);

    if (subTaskRes.data) {
      const map = new Map<string, SubTaskRow[]>();
      subTaskRes.data.forEach((st: any) => {
        if (!map.has(st.parent_job_id)) map.set(st.parent_job_id, []);
        map.get(st.parent_job_id)!.push(st);
      });
      setSubTasks(map);
    }

    if (todoRes.data) {
      const map = new Map<string, TodoRow[]>();
      todoRes.data.forEach((t: any) => {
        if (!map.has(t.job_id)) map.set(t.job_id, []);
        map.get(t.job_id)!.push(t);
      });
      setTodos(map);
    }
  }, [progressorJobs]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const toggleTradeStatus = async (st: SubTaskRow) => {
    const isDone = completedStatuses.includes(st.status) || !!st.completion_date;
    const newStatus = isDone ? 'scheduled' : 'completed_awaiting_portal';
    const newCompletionDate = isDone ? null : new Date().toISOString();

    // Optimistic update
    setSubTasks(prev => {
      const next = new Map(prev);
      const list = [...(next.get(st.parent_job_id) || [])];
      const idx = list.findIndex(s => s.id === st.id);
      if (idx >= 0) {
        list[idx] = { ...list[idx], status: newStatus, completion_date: newCompletionDate };
      }
      next.set(st.parent_job_id, list);
      return next;
    });

    const { error } = await supabase
      .from('job_sub_tasks')
      .update({ status: newStatus, completion_date: newCompletionDate })
      .eq('id', st.id);

    if (error) {
      toast.error('Failed to update trade status');
      fetchData();
    } else {
      toast.success(`${st.trade} marked as ${isDone ? 'pending' : 'completed'}`);
    }
  };

  const toggleTodo = async (todo: TodoRow) => {
    const newCompleted = !todo.is_completed;

    // Optimistic update
    setTodos(prev => {
      const next = new Map(prev);
      const list = [...(next.get(todo.job_id) || [])];
      const idx = list.findIndex(t => t.id === todo.id);
      if (idx >= 0) {
        list[idx] = { ...list[idx], is_completed: newCompleted };
      }
      next.set(todo.job_id, list);
      return next;
    });

    const { error } = await supabase
      .from('progressor_todos')
      .update({ 
        is_completed: newCompleted, 
        completed_at: newCompleted ? new Date().toISOString() : null 
      })
      .eq('id', todo.id);

    if (error) {
      toast.error('Failed to update to-do');
      fetchData();
    }
  };

  const toggleExpand = (jobId: string) => {
    setExpandedJobs(prev => {
      const next = new Set(prev);
      if (next.has(jobId)) next.delete(jobId);
      else next.add(jobId);
      return next;
    });
  };

  if (progressorJobs.length === 0) return null;

  return (
    <div className="mb-6 mx-1">
      {/* ── Section Header ── */}
      <div className="relative overflow-hidden rounded-t-xl">
        <div className="absolute inset-0 bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-700" />
        <div className="absolute inset-0 bg-[repeating-linear-gradient(90deg,transparent,transparent_20px,rgba(255,255,255,0.03)_20px,rgba(255,255,255,0.03)_40px)]" />
        
        <div className="relative flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <ProgressorIcon className="w-8 h-8 rounded-lg" />
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-black text-white tracking-widest uppercase">
                  Progressor Booked
                </h3>
                <Badge className="bg-white/15 text-white/90 border-white/20 text-[9px] font-bold uppercase tracking-wider backdrop-blur-sm px-2 py-0">
                  Multi-Trade
                </Badge>
              </div>
              <p className="text-[10px] text-cyan-100/70 mt-0.5">
                Jobs managed via the Progressor Portal — separate from standard bookings
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 bg-white/10 backdrop-blur-sm rounded-full px-3 py-1.5 border border-white/20">
            <Layers className="w-3.5 h-3.5 text-cyan-200" />
            <span className="text-white font-bold text-xs">{progressorJobs.length}</span>
            <span className="text-cyan-200/80 text-[10px]">job{progressorJobs.length !== 1 ? 's' : ''}</span>
          </div>
        </div>
      </div>

      {/* ── Jobs Container ── */}
      <div className="border-2 border-t-0 border-cyan-500/30 rounded-b-xl overflow-hidden bg-gradient-to-b from-cyan-50/90 via-blue-50/50 to-indigo-50/30 dark:from-cyan-950/40 dark:via-blue-950/20 dark:to-indigo-950/10 shadow-lg shadow-cyan-500/5">
        {progressorJobs.map((job, idx) => {
          const tradeInfo = tradeBookings.get(job.id)!;
          const jobSubTasks = subTasks.get(job.id) || [];
          const jobTodos = todos.get(job.id) || [];
          const isExpanded = expandedJobs.has(job.id);
          const completedCount = jobSubTasks.filter(st => completedStatuses.includes(st.status) || !!st.completion_date).length;
          const totalTasks = jobSubTasks.length;
          const progressPct = totalTasks > 0 ? Math.round((completedCount / totalTasks) * 100) : 0;
          const todoCompletedCount = jobTodos.filter(t => t.is_completed).length;

          return (
            <div 
              key={job.id} 
              className={cn(
                "group transition-all",
                idx > 0 && "border-t border-cyan-300/30 dark:border-cyan-700/30"
              )}
            >
              {/* ── Collapsed Row ── */}
              <div 
                className={cn(
                  "px-4 py-3 flex items-center gap-3 cursor-pointer transition-all duration-200",
                  "hover:bg-cyan-100/60 dark:hover:bg-cyan-900/30",
                  isExpanded && "bg-gradient-to-r from-cyan-100/80 via-blue-50/60 to-transparent dark:from-cyan-900/40 dark:via-blue-950/20"
                )}
                onClick={() => toggleExpand(job.id)}
              >
                <div className="flex-shrink-0 w-6 h-6 rounded-md bg-gradient-to-br from-cyan-400 to-indigo-600 flex items-center justify-center shadow-sm">
                  <Zap className="w-3.5 h-3.5 text-white" fill="currentColor" />
                </div>

                <button className="text-cyan-600 dark:text-cyan-400 flex-shrink-0 -ml-1">
                  {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>

                <span className="font-mono font-bold text-cyan-700 dark:text-cyan-300 text-sm min-w-[90px]">
                  {job.jobNumber}
                </span>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{job.name}</p>
                  <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <MapPin className="w-3 h-3 flex-shrink-0" />
                    <span className="truncate">{job.address}</span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gradient-to-r from-cyan-600 to-blue-600 text-white text-xs font-bold flex-shrink-0 shadow-sm">
                  <CalendarCheck className="w-3.5 h-3.5" />
                  {format(tradeInfo.effectiveBookedDate, 'dd/MM/yy')}
                </div>

                <div className="flex items-center gap-2 flex-shrink-0 min-w-[100px]">
                  <div className="flex-1 h-2 rounded-full bg-cyan-200/50 dark:bg-cyan-800/40 overflow-hidden">
                    <div 
                      className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-emerald-500 transition-all duration-500"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                  <span className="text-[11px] font-bold text-cyan-700 dark:text-cyan-300 tabular-nums">
                    {completedCount}/{totalTasks}
                  </span>
                </div>

                {job.team && (
                  <Badge variant="outline" className="text-[10px] flex-shrink-0 border-cyan-400/50">
                    {job.team}
                  </Badge>
                )}

                {job.expectedCompletionDate && (
                  <div className="flex items-center gap-1 text-[11px] text-orange-600 dark:text-orange-400 font-medium flex-shrink-0">
                    <Clock className="w-3 h-3" />
                    ECD: {format(new Date(job.expectedCompletionDate), 'dd/MM')}
                  </div>
                )}
              </div>

              {/* ── Expanded Detail ── */}
              {isExpanded && (
                <ExpandedJobDetail
                  job={job}
                  jobSubTasks={jobSubTasks}
                  jobTodos={jobTodos}
                  totalTasks={totalTasks}
                  completedCount={completedCount}
                  todoCompletedCount={todoCompletedCount}
                  onToggleTrade={toggleTradeStatus}
                  onToggleTodo={toggleTodo}
                  onJobClick={onJobClick}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Separator */}
      <div className="flex items-center gap-3 my-4 px-2">
        <div className="flex-1 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Standard Bookings</span>
        <div className="flex-1 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
      </div>
    </div>
  );
};

/* ── Expanded Job Detail (sub-component) ── */
interface ExpandedJobDetailProps {
  job: Job;
  jobSubTasks: SubTaskRow[];
  jobTodos: TodoRow[];
  totalTasks: number;
  completedCount: number;
  todoCompletedCount: number;
  onToggleTrade: (st: SubTaskRow) => void;
  onToggleTodo: (todo: TodoRow) => void;
  onJobClick?: (job: Job) => void;
}

const ExpandedJobDetail = ({
  job, jobSubTasks, jobTodos, totalTasks, completedCount, todoCompletedCount,
  onToggleTrade, onToggleTodo, onJobClick,
}: ExpandedJobDetailProps) => {
  return (
    <div className="px-5 pb-5 pt-3 bg-white/80 dark:bg-cyan-950/30 border-t border-cyan-200/50 dark:border-cyan-800/30">
      {/* Top info bar */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        {job.phoneNumber && (
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground bg-muted/50 rounded-md px-2.5 py-1">
            <Phone className="w-3 h-3" />
            {job.phoneNumber}
          </div>
        )}
        {job.isOngoing && (
          <Badge className="bg-amber-100 text-amber-800 border-amber-300 text-[10px]">
            <AlertCircle className="w-3 h-3 mr-1" />
            Ongoing
          </Badge>
        )}
        {job.expectedCompletionDate && (
          <div className="flex items-center gap-1.5 text-[11px] text-orange-600 dark:text-orange-400 font-semibold bg-orange-50/80 dark:bg-orange-900/20 rounded-md px-2.5 py-1">
            <Clock className="w-3 h-3" />
            ECD: {format(new Date(job.expectedCompletionDate), 'dd MMM yyyy')}
          </div>
        )}
        <button 
          onClick={(e) => { e.stopPropagation(); onJobClick?.(job); }}
          className="ml-auto flex items-center gap-1 text-[11px] text-cyan-600 dark:text-cyan-400 hover:text-cyan-700 dark:hover:text-cyan-300 font-semibold transition-colors bg-cyan-50 dark:bg-cyan-900/30 rounded-md px-2.5 py-1"
        >
          Open Full Details <ArrowRight className="w-3 h-3" />
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* ── Column 1: Scheduled Trades ── */}
        <div className="space-y-2">
          <h4 className="text-xs font-bold text-cyan-700 dark:text-cyan-300 flex items-center gap-1.5 uppercase tracking-wider pb-1 border-b border-cyan-200/50 dark:border-cyan-800/30">
            <Wrench className="w-3.5 h-3.5" />
            Scheduled Trades
            <span className="ml-auto font-mono text-[10px] bg-cyan-100 dark:bg-cyan-900/50 rounded px-1.5 py-0.5">
              {completedCount}/{totalTasks}
            </span>
          </h4>
          <div className="space-y-1.5">
            {jobSubTasks.map(st => {
              const isDone = completedStatuses.includes(st.status) || !!st.completion_date;
              return (
                <div 
                  key={st.id}
                  className={cn(
                    "rounded-lg px-3 py-2 text-[11px] transition-all",
                    isDone
                      ? "bg-emerald-50/80 dark:bg-emerald-900/20 border border-emerald-200/50 dark:border-emerald-800/30"
                      : st.task_type === 'dm_team'
                        ? "bg-blue-50/80 dark:bg-blue-900/20 border-l-3 border border-l-blue-400 border-blue-200/50 dark:border-blue-800/30"
                        : "bg-cyan-50/80 dark:bg-cyan-900/20 border-l-3 border border-l-cyan-400 border-cyan-200/50 dark:border-cyan-800/30"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={isDone}
                      onCheckedChange={() => onToggleTrade(st)}
                      className={cn(
                        "h-4 w-4 rounded-sm",
                        isDone ? "border-emerald-500 data-[state=checked]:bg-emerald-500" : "border-cyan-400"
                      )}
                    />
                    <span className={cn("font-semibold flex-1", isDone && "line-through text-muted-foreground")}>
                      {st.trade}
                    </span>
                    {st.task_type === 'dm_team' && (
                      <Badge className="bg-blue-100 text-blue-700 border-blue-300 text-[9px] px-1.5 py-0">DM</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 ml-6 text-[10px] text-muted-foreground">
                    {st.assigned_team && (
                      <span>Team: <strong className="text-foreground">{st.assigned_team}</strong></span>
                    )}
                    {st.booked_date && (
                      <span className="flex items-center gap-0.5">
                        <Calendar className="w-2.5 h-2.5" />
                        {format(new Date(st.booked_date), 'dd/MM/yy')}
                      </span>
                    )}
                    {st.deadline_date && (
                      <span className="text-orange-500 flex items-center gap-0.5">
                        <Clock className="w-2.5 h-2.5" />
                        Due: {format(new Date(st.deadline_date), 'dd/MM')}
                      </span>
                    )}
                    {isDone && st.completion_date && (
                      <span className="text-emerald-600">
                        ✓ {format(new Date(st.completion_date), 'dd/MM/yy')}
                      </span>
                    )}
                  </div>
                  {st.description && (
                    <p className="mt-1 ml-6 text-[10px] text-muted-foreground italic">{st.description}</p>
                  )}
                  {st.notes && st.notes.trim() && (
                    <p className="mt-0.5 ml-6 text-[10px] text-indigo-600 dark:text-indigo-400">
                      <StickyNote className="w-2.5 h-2.5 inline mr-0.5" />
                      {st.notes}
                    </p>
                  )}
                </div>
              );
            })}
            {totalTasks === 0 && (
              <p className="text-[11px] text-muted-foreground italic py-2">No trades scheduled</p>
            )}
          </div>
        </div>

        {/* ── Column 2: To-Do List ── */}
        <div className="space-y-2">
          <h4 className="text-xs font-bold text-cyan-700 dark:text-cyan-300 flex items-center gap-1.5 uppercase tracking-wider pb-1 border-b border-cyan-200/50 dark:border-cyan-800/30">
            <ListTodo className="w-3.5 h-3.5" />
            To-Do List
            <span className="ml-auto font-mono text-[10px] bg-cyan-100 dark:bg-cyan-900/50 rounded px-1.5 py-0.5">
              {todoCompletedCount}/{jobTodos.length}
            </span>
          </h4>
          <div className="space-y-1">
            {jobTodos.map(todo => (
              <div 
                key={todo.id}
                className={cn(
                  "flex items-center gap-2 text-[11px] px-2.5 py-1.5 rounded-md cursor-pointer transition-all hover:bg-cyan-100/50 dark:hover:bg-cyan-800/20",
                  todo.is_completed 
                    ? "bg-emerald-50/50 dark:bg-emerald-900/10" 
                    : "bg-white/50 dark:bg-white/5"
                )}
                onClick={() => onToggleTodo(todo)}
              >
                <Checkbox
                  checked={todo.is_completed}
                  onCheckedChange={() => onToggleTodo(todo)}
                  className={cn(
                    "h-3.5 w-3.5 rounded-sm",
                    todo.is_completed ? "border-emerald-500 data-[state=checked]:bg-emerald-500" : "border-cyan-400"
                  )}
                />
                <span className={cn(
                  "flex-1",
                  todo.is_completed 
                    ? "text-muted-foreground line-through" 
                    : "text-foreground font-medium"
                )}>
                  {todo.custom_text || todo.label}
                </span>
              </div>
            ))}
            {jobTodos.length === 0 && (
              <p className="text-[11px] text-muted-foreground italic py-2">No to-dos assigned</p>
            )}
          </div>
        </div>

        {/* ── Column 3: Description, Notes & Ongoing ── */}
        <div className="space-y-3">
          <h4 className="text-xs font-bold text-cyan-700 dark:text-cyan-300 flex items-center gap-1.5 uppercase tracking-wider pb-1 border-b border-cyan-200/50 dark:border-cyan-800/30">
            <FileText className="w-3.5 h-3.5" />
            Description & Notes
          </h4>

          {/* Full Description */}
          {job.description ? (
            <div className="bg-white/60 dark:bg-white/5 rounded-lg px-3 py-2 border border-cyan-200/30 dark:border-cyan-800/20">
              <span className="text-[9px] font-bold text-cyan-600 dark:text-cyan-400 uppercase tracking-wider">Description</span>
              <p className="text-[11px] text-foreground leading-relaxed mt-0.5 whitespace-pre-wrap">
                {job.description}
              </p>
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground italic">No description</p>
          )}

          {/* Summary of Works */}
          {job.summaryOfWorks && (
            <div className="bg-indigo-50/60 dark:bg-indigo-900/10 rounded-lg px-3 py-2 border border-indigo-200/30 dark:border-indigo-800/20">
              <span className="text-[9px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">Summary of Works</span>
              <p className="text-[11px] text-foreground leading-relaxed mt-0.5 whitespace-pre-wrap">
                {job.summaryOfWorks}
              </p>
            </div>
          )}

          {/* Ongoing Reason */}
          {job.ongoingReason && (
            <div className="bg-amber-50/80 dark:bg-amber-900/10 rounded-lg px-3 py-2 border border-amber-300/40 dark:border-amber-800/20">
              <span className="text-[9px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                Ongoing Reason
              </span>
              <p className="text-[11px] text-foreground leading-relaxed mt-0.5 whitespace-pre-wrap">
                {job.ongoingReason}
              </p>
            </div>
          )}

          {/* Progress Notes */}
          {job.progressNotes && (
            <div className="bg-white/50 dark:bg-white/5 rounded-lg px-3 py-2 border border-cyan-200/20 dark:border-cyan-800/15">
              <span className="text-[9px] font-bold text-cyan-600 dark:text-cyan-400 uppercase tracking-wider flex items-center gap-1">
                <StickyNote className="w-3 h-3" />
                Progress Notes
              </span>
              <p className="text-[11px] text-foreground leading-relaxed mt-0.5 whitespace-pre-wrap">
                {job.progressNotes}
              </p>
            </div>
          )}

          {/* Booking Notes */}
          {job.bookingNotes && (
            <div className="bg-white/50 dark:bg-white/5 rounded-lg px-3 py-2 border border-cyan-200/20 dark:border-cyan-800/15">
              <span className="text-[9px] font-bold text-cyan-600 dark:text-cyan-400 uppercase tracking-wider">Booking Notes</span>
              <p className="text-[11px] text-foreground leading-relaxed mt-0.5 whitespace-pre-wrap">
                {job.bookingNotes}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
