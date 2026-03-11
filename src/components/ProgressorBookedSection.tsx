import { useMemo, useState, useEffect } from 'react';
import { Job } from '@/types/job';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { 
  Wrench, ChevronDown, ChevronRight, MapPin, Clock, 
  CheckCircle2, CalendarCheck, ListTodo, FileText, Target
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { ScrollArea } from '@/components/ui/scroll-area';

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

export const ProgressorBookedSection = ({ jobs, tradeBookings, onJobClick }: ProgressorBookedSectionProps) => {
  const [expandedJobs, setExpandedJobs] = useState<Set<string>>(new Set());
  const [subTasks, setSubTasks] = useState<Map<string, SubTaskRow[]>>(new Map());
  const [todos, setTodos] = useState<Map<string, TodoRow[]>>(new Map());

  // Get only progressor-booked jobs (trade-booked, not standard booked)
  const progressorJobs = useMemo(() => {
    return jobs.filter(job => {
      const tradeInfo = tradeBookings.get(job.id);
      return tradeInfo && !job.bookedDate; // Only trade-booked, not standard booked
    });
  }, [jobs, tradeBookings]);

  // Fetch sub-tasks and todos for these jobs
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

  const completedStatuses = ['completed_awaiting_portal', 'completed_signed_off'];

  return (
    <div className="mb-4">
      {/* Section Header */}
      <div className="bg-gradient-to-r from-cyan-600 via-blue-600 to-indigo-700 rounded-t-lg px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md bg-white/20 flex items-center justify-center backdrop-blur-sm">
            <Target className="w-4 h-4 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white tracking-wide">PROGRESSOR BOOKED</h3>
            <p className="text-[10px] text-cyan-100/80">Multi-trade & ongoing jobs managed via Progressor Portal</p>
          </div>
        </div>
        <Badge className="bg-white/20 text-white border-white/30 text-xs font-bold backdrop-blur-sm">
          {progressorJobs.length} Job{progressorJobs.length !== 1 ? 's' : ''}
        </Badge>
      </div>

      {/* Jobs List */}
      <div className="border-x-2 border-b-2 border-cyan-400/40 rounded-b-lg bg-gradient-to-b from-cyan-50/80 to-blue-50/40 dark:from-cyan-950/30 dark:to-blue-950/20 divide-y divide-cyan-200/50 dark:divide-cyan-800/40">
        {progressorJobs.map(job => {
          const tradeInfo = tradeBookings.get(job.id)!;
          const jobSubTasks = subTasks.get(job.id) || [];
          const jobTodos = todos.get(job.id) || [];
          const isExpanded = expandedJobs.has(job.id);
          const completedCount = jobSubTasks.filter(st => completedStatuses.includes(st.status) || !!st.completion_date).length;
          const pendingCount = jobSubTasks.length - completedCount;

          return (
            <div key={job.id} className="group">
              {/* Collapsed Row */}
              <div 
                className={cn(
                  "px-4 py-2.5 flex items-center gap-3 cursor-pointer transition-all hover:bg-cyan-100/50 dark:hover:bg-cyan-900/20",
                  isExpanded && "bg-cyan-100/60 dark:bg-cyan-900/30"
                )}
                onClick={() => toggleExpand(job.id)}
              >
                {/* Expand Arrow */}
                <button className="text-cyan-600 dark:text-cyan-400 flex-shrink-0">
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

                {/* Effective Booked Date */}
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-cyan-600 text-white text-xs font-semibold flex-shrink-0">
                  <CalendarCheck className="w-3.5 h-3.5" />
                  {format(tradeInfo.effectiveBookedDate, 'dd/MM/yy')}
                </div>

                {/* Trade Progress */}
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <div className="flex gap-0.5">
                    {jobSubTasks.map(st => {
                      const isDone = completedStatuses.includes(st.status) || !!st.completion_date;
                      return (
                        <div
                          key={st.id}
                          className={cn(
                            "w-2.5 h-2.5 rounded-full",
                            isDone ? "bg-emerald-500" : "bg-cyan-400"
                          )}
                          title={`${st.trade} - ${isDone ? 'Complete' : st.status}`}
                        />
                      );
                    })}
                  </div>
                  <span className="text-[11px] font-medium text-muted-foreground">
                    {completedCount}/{jobSubTasks.length}
                  </span>
                </div>

                {/* Team */}
                {job.team && (
                  <Badge variant="outline" className="text-[10px] flex-shrink-0">
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

              {/* Expanded Detail */}
              {isExpanded && (
                <div className="px-4 pb-3 pt-1 bg-white/60 dark:bg-cyan-950/20 border-t border-cyan-200/40 dark:border-cyan-800/30">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    
                    {/* Scheduled Trades */}
                    <div className="space-y-1.5">
                      <h4 className="text-xs font-bold text-cyan-700 dark:text-cyan-300 flex items-center gap-1.5">
                        <Wrench className="w-3.5 h-3.5" />
                        Scheduled Trades ({jobSubTasks.length})
                      </h4>
                      <div className="space-y-1">
                        {jobSubTasks.map(st => {
                          const isDone = completedStatuses.includes(st.status) || !!st.completion_date;
                          return (
                            <div 
                              key={st.id}
                              className={cn(
                                "flex items-center justify-between rounded px-2 py-1 text-[11px]",
                                isDone
                                  ? "bg-emerald-100/80 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 line-through"
                                  : st.task_type === 'dm_team'
                                    ? "bg-blue-100/80 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400"
                                    : "bg-cyan-100/80 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-400"
                              )}
                            >
                              <div className="flex items-center gap-1.5">
                                {isDone ? (
                                  <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                                ) : (
                                  <div className="w-3 h-3 rounded-full border-2 border-cyan-400" />
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
                        {jobSubTasks.length === 0 && (
                          <p className="text-[11px] text-muted-foreground italic">No trades scheduled</p>
                        )}
                      </div>
                    </div>

                    {/* To-Do List */}
                    <div className="space-y-1.5">
                      <h4 className="text-xs font-bold text-cyan-700 dark:text-cyan-300 flex items-center gap-1.5">
                        <ListTodo className="w-3.5 h-3.5" />
                        To-Do List ({jobTodos.filter(t => t.is_completed).length}/{jobTodos.length})
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
                    <div className="space-y-1.5">
                      <h4 className="text-xs font-bold text-cyan-700 dark:text-cyan-300 flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5" />
                        Description & Notes
                      </h4>
                      {job.description && (
                        <p className="text-[11px] text-foreground leading-relaxed line-clamp-4 bg-white/50 dark:bg-white/5 rounded px-2 py-1.5">
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
                        <div className="flex items-center gap-1.5 mt-1 text-[11px] text-orange-600 dark:text-orange-400 font-semibold bg-orange-50/80 dark:bg-orange-900/20 rounded px-2 py-1">
                          <Clock className="w-3 h-3" />
                          Expected Completion: {format(new Date(job.expectedCompletionDate), 'dd MMM yyyy')}
                        </div>
                      )}
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          onJobClick?.(job);
                        }}
                        className="text-[11px] text-cyan-600 dark:text-cyan-400 hover:underline font-medium mt-1"
                      >
                        Open Full Details →
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
