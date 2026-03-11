import { useMemo, useState, useEffect } from 'react';
import { Job } from '@/types/job';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { 
  Wrench, ChevronDown, ChevronRight, MapPin, Clock, 
  CheckCircle2, CalendarCheck, ListTodo, FileText, Zap,
  Layers, ArrowRight
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

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
}

const completedStatuses = ['completed_awaiting_portal', 'completed_signed_off'];

const ProgressorIcon = ({ className }: { className?: string }) => (
  <div className={cn("relative flex items-center justify-center", className)}>
    <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-cyan-400 via-blue-500 to-indigo-600 opacity-90" />
    <div className="absolute inset-0 rounded-lg animate-pulse bg-gradient-to-br from-cyan-400/30 to-indigo-500/30" />
    <Zap className="relative w-4 h-4 text-white drop-shadow-sm" fill="currentColor" />
  </div>
);

export const ProgressorBookedSection = ({ jobs, tradeBookings, onJobClick }: ProgressorBookedSectionProps) => {
  const [expandedJobs, setExpandedJobs] = useState<Set<string>>(new Set());
  const [subTasks, setSubTasks] = useState<Map<string, SubTaskRow[]>>(new Map());
  const [todos, setTodos] = useState<Map<string, TodoRow[]>>(new Map());

  const progressorJobs = useMemo(() => {
    return jobs.filter(job => tradeBookings.has(job.id));
  }, [jobs, tradeBookings]);

  useEffect(() => {
    if (progressorJobs.length === 0) return;
    const jobIds = progressorJobs.map(j => j.id);

    const fetchData = async () => {
      const [subTaskRes, todoRes] = await Promise.all([
        supabase
          .from('job_sub_tasks')
          .select('id, parent_job_id, trade, assigned_team, booked_date, deadline_date, status, completion_date, description, task_type')
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
    };

    fetchData();
  }, [progressorJobs]);

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
      {/* ── Section Chrome ── */}
      <div className="relative overflow-hidden rounded-t-xl">
        {/* Gradient bar */}
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
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 bg-white/10 backdrop-blur-sm rounded-full px-3 py-1.5 border border-white/20">
              <Layers className="w-3.5 h-3.5 text-cyan-200" />
              <span className="text-white font-bold text-xs">{progressorJobs.length}</span>
              <span className="text-cyan-200/80 text-[10px]">job{progressorJobs.length !== 1 ? 's' : ''}</span>
            </div>
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
                {/* Progressor lightning icon */}
                <div className="flex-shrink-0 w-6 h-6 rounded-md bg-gradient-to-br from-cyan-400 to-indigo-600 flex items-center justify-center shadow-sm">
                  <Zap className="w-3.5 h-3.5 text-white" fill="currentColor" />
                </div>

                {/* Expand */}
                <button className="text-cyan-600 dark:text-cyan-400 flex-shrink-0 -ml-1">
                  {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>

                {/* Job Number */}
                <span className="font-mono font-bold text-cyan-700 dark:text-cyan-300 text-sm min-w-[90px]">
                  {job.jobNumber}
                </span>

                {/* Name & Address */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{job.name}</p>
                  <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <MapPin className="w-3 h-3 flex-shrink-0" />
                    <span className="truncate">{job.address}</span>
                  </div>
                </div>

                {/* Booked Date Chip */}
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gradient-to-r from-cyan-600 to-blue-600 text-white text-xs font-bold flex-shrink-0 shadow-sm">
                  <CalendarCheck className="w-3.5 h-3.5" />
                  {format(tradeInfo.effectiveBookedDate, 'dd/MM/yy')}
                </div>

                {/* Progress Bar */}
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

                {/* Team */}
                {job.team && (
                  <Badge variant="outline" className="text-[10px] flex-shrink-0 border-cyan-400/50">
                    {job.team}
                  </Badge>
                )}

                {/* ECD */}
                {job.expectedCompletionDate && (
                  <div className="flex items-center gap-1 text-[11px] text-orange-600 dark:text-orange-400 font-medium flex-shrink-0">
                    <Clock className="w-3 h-3" />
                    ECD: {format(new Date(job.expectedCompletionDate), 'dd/MM')}
                  </div>
                )}
              </div>

              {/* ── Expanded Detail ── */}
              {isExpanded && (
                <div className="px-5 pb-4 pt-2 bg-white/70 dark:bg-cyan-950/30 border-t border-cyan-200/50 dark:border-cyan-800/30">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    
                    {/* Scheduled Trades */}
                    <div className="space-y-2">
                      <h4 className="text-xs font-bold text-cyan-700 dark:text-cyan-300 flex items-center gap-1.5 uppercase tracking-wider">
                        <Wrench className="w-3.5 h-3.5" />
                        Scheduled Trades ({totalTasks})
                      </h4>
                      <div className="space-y-1">
                        {jobSubTasks.map(st => {
                          const isDone = completedStatuses.includes(st.status) || !!st.completion_date;
                          return (
                            <div 
                              key={st.id}
                              className={cn(
                                "flex items-center justify-between rounded-md px-2.5 py-1.5 text-[11px] transition-colors",
                                isDone
                                  ? "bg-emerald-100/80 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 line-through"
                                  : st.task_type === 'dm_team'
                                    ? "bg-blue-100/80 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-l-2 border-blue-400"
                                    : "bg-cyan-100/80 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-400 border-l-2 border-cyan-400"
                              )}
                            >
                              <div className="flex items-center gap-1.5">
                                {isDone ? (
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                                ) : (
                                  <div className="w-3.5 h-3.5 rounded-full border-2 border-current opacity-50" />
                                )}
                                <span className="font-medium">{st.trade}</span>
                                {st.assigned_team && (
                                  <span className="text-muted-foreground">({st.assigned_team})</span>
                                )}
                              </div>
                              <span className="font-mono">
                                {st.booked_date ? format(new Date(st.booked_date), 'dd/MM') : '—'}
                              </span>
                            </div>
                          );
                        })}
                        {totalTasks === 0 && (
                          <p className="text-[11px] text-muted-foreground italic">No trades scheduled</p>
                        )}
                      </div>
                    </div>

                    {/* To-Do List */}
                    <div className="space-y-2">
                      <h4 className="text-xs font-bold text-cyan-700 dark:text-cyan-300 flex items-center gap-1.5 uppercase tracking-wider">
                        <ListTodo className="w-3.5 h-3.5" />
                        To-Do ({jobTodos.filter(t => t.is_completed).length}/{jobTodos.length})
                      </h4>
                      <div className="space-y-0.5">
                        {jobTodos.slice(0, 6).map(todo => (
                          <div 
                            key={todo.id}
                            className={cn(
                              "flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded",
                              todo.is_completed 
                                ? "text-muted-foreground line-through" 
                                : "text-foreground font-medium"
                            )}
                          >
                            {todo.is_completed ? (
                              <CheckCircle2 className="w-3 h-3 text-emerald-500 flex-shrink-0" />
                            ) : (
                              <div className="w-3 h-3 rounded border border-cyan-400 flex-shrink-0" />
                            )}
                            <span className="truncate">{todo.custom_text || todo.label}</span>
                          </div>
                        ))}
                        {jobTodos.length > 6 && (
                          <p className="text-[10px] text-muted-foreground px-2">+{jobTodos.length - 6} more...</p>
                        )}
                        {jobTodos.length === 0 && (
                          <p className="text-[11px] text-muted-foreground italic">No to-dos</p>
                        )}
                      </div>
                    </div>

                    {/* Description & Notes */}
                    <div className="space-y-2">
                      <h4 className="text-xs font-bold text-cyan-700 dark:text-cyan-300 flex items-center gap-1.5 uppercase tracking-wider">
                        <FileText className="w-3.5 h-3.5" />
                        Description & Notes
                      </h4>
                      {job.description && (
                        <p className="text-[11px] text-foreground leading-relaxed line-clamp-4 bg-white/50 dark:bg-white/5 rounded-md px-2.5 py-1.5 border border-cyan-200/30 dark:border-cyan-800/20">
                          {job.description}
                        </p>
                      )}
                      {job.ongoingReason && (
                        <div className="mt-1">
                          <span className="text-[10px] font-bold text-orange-600 dark:text-orange-400 uppercase">Ongoing Reason:</span>
                          <p className="text-[11px] text-foreground line-clamp-2">{job.ongoingReason}</p>
                        </div>
                      )}
                      {job.expectedCompletionDate && (
                        <div className="flex items-center gap-1.5 mt-1 text-[11px] text-orange-600 dark:text-orange-400 font-semibold bg-orange-50/80 dark:bg-orange-900/20 rounded-md px-2.5 py-1.5">
                          <Clock className="w-3 h-3" />
                          Expected Completion: {format(new Date(job.expectedCompletionDate), 'dd MMM yyyy')}
                        </div>
                      )}
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          onJobClick?.(job);
                        }}
                        className="flex items-center gap-1 text-[11px] text-cyan-600 dark:text-cyan-400 hover:text-cyan-700 dark:hover:text-cyan-300 font-semibold mt-1 transition-colors"
                      >
                        Open Full Details <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Separator between progressor and standard bookings */}
      <div className="flex items-center gap-3 my-4 px-2">
        <div className="flex-1 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Standard Bookings</span>
        <div className="flex-1 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
      </div>
    </div>
  );
};
