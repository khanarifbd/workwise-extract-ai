import { useMemo, useState, useEffect, useCallback } from 'react';
import { Job } from '@/types/job';
import { SubTask, mapDbSubTask } from '@/types/subTask';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { format } from 'date-fns';
import { 
  Wrench, ChevronDown, ChevronRight, MapPin, Clock, 
  CalendarCheck, Zap, Layers, ArrowRight, Phone
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ProgressorJobExpandedContent } from '@/components/progressor/ProgressorJobExpandedContent';
import { AddSubTaskModal } from '@/components/progressor/AddSubTaskModal';

interface TradeBookingInfo {
  jobId: string;
  effectiveBookedDate: Date;
  totalTrades: number;
  completedTrades: number;
  pendingTrades: { trade: string; bookedDate: Date; taskType?: string }[];
  isTradeBooked: true;
  taskType?: string;
}

interface ContactRecord {
  id: string;
  outcome: string;
  notes: string | null;
  contact_date: string;
  next_action: string | null;
  next_action_date: string | null;
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
  const [subTasksMap, setSubTasksMap] = useState<Map<string, SubTask[]>>(new Map());
  const [contactsMap, setContactsMap] = useState<Map<string, ContactRecord[]>>(new Map());
  const [addSubTaskJob, setAddSubTaskJob] = useState<Job | null>(null);

  const progressorJobs = useMemo(() => {
    return jobs.filter(job => tradeBookings.has(job.id));
  }, [jobs, tradeBookings]);

  const fetchData = useCallback(async () => {
    if (progressorJobs.length === 0) return;
    const jobIds = progressorJobs.map(j => j.id);

    const [subTaskRes, contactRes] = await Promise.all([
      supabase
        .from('job_sub_tasks')
        .select('*')
        .in('parent_job_id', jobIds)
        .order('created_at', { ascending: true }),
      supabase
        .from('contact_history')
        .select('*')
        .in('job_id', jobIds)
        .order('contact_date', { ascending: false }),
    ]);

    if (subTaskRes.data) {
      const map = new Map<string, SubTask[]>();
      subTaskRes.data.forEach((row: any) => {
        if (!map.has(row.parent_job_id)) map.set(row.parent_job_id, []);
        map.get(row.parent_job_id)!.push(mapDbSubTask(row));
      });
      setSubTasksMap(map);
    }

    if (contactRes.data) {
      const map = new Map<string, ContactRecord[]>();
      contactRes.data.forEach((row: any) => {
        if (!map.has(row.job_id)) map.set(row.job_id, []);
        map.get(row.job_id)!.push(row);
      });
      setContactsMap(map);
    }
  }, [progressorJobs]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Realtime for sub-tasks
  useEffect(() => {
    const channel = supabase
      .channel('genie-progressor-subtasks')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'job_sub_tasks' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contact_history' }, () => fetchData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchData]);

  const toggleExpand = (jobId: string) => {
    setExpandedJobs(prev => {
      const next = new Set(prev);
      if (next.has(jobId)) next.delete(jobId);
      else next.add(jobId);
      return next;
    });
  };

  const handleJobUpdate = (jobId: string, updates: Partial<Job>) => {
    onJobUpdate?.(jobId, updates);
  };

  const handleSubTaskUpdate = async (subTask: SubTask, field: string, value: any) => {
    const dbFieldMap: Record<string, string> = {
      trade: 'trade',
      assignedTeam: 'assigned_team',
      bookedDate: 'booked_date',
      deadlineDate: 'deadline_date',
      completionDate: 'completion_date',
      status: 'status',
      portalUpdated: 'portal_updated',
      signedOff: 'signed_off',
      notes: 'notes',
      description: 'description',
    };

    const dbField = dbFieldMap[field] || field;
    let dbValue = value;

    // Handle date fields
    if (['bookedDate', 'deadlineDate', 'completionDate'].includes(field)) {
      dbValue = value ? new Date(value).toISOString() : null;
    }

    const { error } = await supabase
      .from('job_sub_tasks')
      .update({ [dbField]: dbValue })
      .eq('id', subTask.id);

    if (error) {
      toast.error(`Failed to update ${field}`);
    } else {
      fetchData();
    }
  };

  const handleDeleteSubTask = async (subTask: SubTask) => {
    if (!confirm(`Delete trade "${subTask.trade}"?`)) return;
    const { error } = await supabase
      .from('job_sub_tasks')
      .delete()
      .eq('id', subTask.id);

    if (error) {
      toast.error('Failed to delete trade');
    } else {
      toast.success(`${subTask.trade} deleted`);
      fetchData();
    }
  };

  const handleRefresh = () => {
    fetchData();
    refreshJobs?.();
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
          const jobSubTasks = subTasksMap.get(job.id) || [];
          const jobContacts = contactsMap.get(job.id) || [];
          const isExpanded = expandedJobs.has(job.id);
          const completedCount = jobSubTasks.filter(st => completedStatuses.includes(st.status) || !!st.completionDate).length;
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

              {/* ── Expanded Detail — uses shared ProgressorJobExpandedContent ── */}
              {isExpanded && (
                <div className="bg-white/80 dark:bg-cyan-950/30 border-t border-cyan-200/50 dark:border-cyan-800/30">
                  <ProgressorJobExpandedContent
                    job={job}
                    jobSubTasks={jobSubTasks}
                    jobContacts={jobContacts}
                    onJobUpdate={handleJobUpdate}
                    onSubTaskUpdate={handleSubTaskUpdate}
                    onDeleteSubTask={handleDeleteSubTask}
                    onAddSubTask={(j) => setAddSubTaskJob(j)}
                    onRefresh={handleRefresh}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Add Sub Task Modal */}
      {addSubTaskJob && (
        <AddSubTaskModal
          open={!!addSubTaskJob}
          onOpenChange={(open) => { if (!open) setAddSubTaskJob(null); }}
          job={{
            id: addSubTaskJob.id,
            jobNumber: addSubTaskJob.jobNumber,
            name: addSubTaskJob.name,
            address: addSubTaskJob.address || '',
          }}
          onCreated={() => {
            setAddSubTaskJob(null);
            handleRefresh();
          }}
        />
      )}

      {/* Separator */}
      <div className="flex items-center gap-3 my-4 px-2">
        <div className="flex-1 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Standard Bookings</span>
        <div className="flex-1 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
      </div>
    </div>
  );
};
