import { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProgressorAuth } from '@/hooks/useProgressorAuth';
import { useAllSubTasks } from '@/hooks/useSubTasks';
import { useAuditLog } from '@/hooks/useAuditLog';
import { supabase } from '@/integrations/supabase/client';
import { Job } from '@/types/job';
import { SubTask, SUB_TASK_STATUS_OPTIONS, SubTaskStatus } from '@/types/subTask';
import { mapDatabaseJobToJob } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  ClipboardList, Search, Filter, LogOut, Loader2, ChevronDown,
  Calendar, AlertTriangle, Clock, CheckCircle2, Building2,
  Wrench, Users, FileText, RefreshCw,
} from 'lucide-react';
import { format, differenceInDays, differenceInHours } from 'date-fns';
import { cn } from '@/lib/utils';

export default function ProgressorPanel() {
  const navigate = useNavigate();
  const { signOut, user } = useProgressorAuth();
  const { subTasks, isLoading: subTasksLoading, updateSubTask } = useAllSubTasks();
  const { logAction } = useAuditLog();

  const [jobs, setJobs] = useState<Job[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [expandedJobs, setExpandedJobs] = useState<Set<string>>(new Set());

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [tradeFilter, setTradeFilter] = useState<string>('all');
  const [riskFilter, setRiskFilter] = useState<string>('all');

  // Fetch all ongoing/awaiting trade jobs
  const fetchJobs = useCallback(async () => {
    setJobsLoading(true);
    try {
      const { data, error } = await supabase
        .from('jobs')
        .select('*')
        .or('is_ongoing.eq.true,status.eq.awaiting_trade')
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setJobs((data || []).map(mapDatabaseJobToJob));
    } catch (err) {
      console.error('Error fetching jobs:', err);
    } finally {
      setJobsLoading(false);
    }
  }, []);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

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

  // Get compliance risk level for a deadline
  const getComplianceRisk = (deadline: Date | null) => {
    if (!deadline) return { level: 'unknown', color: 'bg-muted', label: 'No Deadline' };
    const hoursLeft = differenceInHours(deadline, new Date());
    if (hoursLeft < 0) return { level: 'overdue', color: 'bg-red-600 animate-pulse', label: 'OVERDUE' };
    if (hoursLeft < 24) return { level: 'critical', color: 'bg-red-500', label: '< 24h' };
    if (hoursLeft < 48) return { level: 'warning', color: 'bg-amber-500', label: '< 48h' };
    return { level: 'safe', color: 'bg-emerald-500', label: `${Math.ceil(hoursLeft / 24)}d` };
  };

  // Get unique trades for filter
  const uniqueTrades = useMemo(() => {
    const trades = new Set<string>();
    subTasks.forEach(st => trades.add(st.trade));
    return Array.from(trades).sort();
  }, [subTasks]);

  // Filter jobs
  const filteredJobs = useMemo(() => {
    return jobs.filter(job => {
      // Search filter
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const match = job.name.toLowerCase().includes(q) ||
          job.address.toLowerCase().includes(q) ||
          job.jobNumber.toLowerCase().includes(q);
        if (!match) return false;
      }

      const jobSubTasks = subTasksByJob.get(job.id) || [];

      // Status filter
      if (statusFilter !== 'all') {
        const hasStatus = jobSubTasks.some(st => st.status === statusFilter);
        if (!hasStatus && jobSubTasks.length > 0) return false;
      }

      // Trade filter
      if (tradeFilter !== 'all') {
        const hasTrade = jobSubTasks.some(st => st.trade === tradeFilter);
        if (!hasTrade) return false;
      }

      // Risk filter
      if (riskFilter !== 'all') {
        const hasRisk = jobSubTasks.some(st => {
          const risk = getComplianceRisk(st.deadlineDate);
          return risk.level === riskFilter;
        });
        if (!hasRisk && riskFilter !== 'all') return false;
      }

      return true;
    });
  }, [jobs, searchQuery, statusFilter, tradeFilter, riskFilter, subTasksByJob]);

  // Stats
  const stats = useMemo(() => {
    const total = subTasks.length;
    const overdue = subTasks.filter(st => st.deadlineDate && differenceInHours(st.deadlineDate, new Date()) < 0).length;
    const inProgress = subTasks.filter(st => st.status === 'in_progress' || st.status === 'scheduled').length;
    const completed = subTasks.filter(st => st.status === 'completed_signed_off').length;
    const notScheduled = subTasks.filter(st => st.status === 'not_scheduled').length;
    return { total, overdue, inProgress, completed, notScheduled };
  }, [subTasks]);

  const handleSubTaskUpdate = async (subTask: SubTask, field: string, value: any) => {
    const oldValue = (subTask as any)[field];
    const dbField = field === 'assignedTeam' ? 'assigned_team'
      : field === 'bookedDate' ? 'booked_date'
      : field === 'deadlineDate' ? 'deadline_date'
      : field === 'completionDate' ? 'completion_date'
      : field === 'portalUpdated' ? 'portal_updated'
      : field === 'signedOff' ? 'signed_off'
      : field;

    // Validation: can't sign off without completion date
    if (field === 'status' && value === 'completed_signed_off' && !subTask.completionDate) {
      return;
    }

    await updateSubTask(subTask.id, { [dbField]: value });

    await logAction({
      action: 'update',
      tableName: 'job_sub_tasks',
      recordId: subTask.id,
      fieldChanged: field,
      oldValue: String(oldValue ?? ''),
      newValue: String(value),
      metadata: { parentJobId: subTask.parentJobId, trade: subTask.trade },
    });
  };

  const toggleJobExpand = (jobId: string) => {
    setExpandedJobs(prev => {
      const next = new Set(prev);
      if (next.has(jobId)) next.delete(jobId);
      else next.add(jobId);
      return next;
    });
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/progressor-login', { replace: true });
  };

  if (jobsLoading || subTasksLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Loading Control Panel...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-card border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <ClipboardList className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-bold">Ongoing & Multi-Trade Job Control Panel</h1>
              <p className="text-xs text-muted-foreground">{user?.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={fetchJobs}>
              <RefreshCw className="h-3.5 w-3.5 mr-1" />
              Refresh
            </Button>
            <Button variant="ghost" size="sm" onClick={handleSignOut}>
              <LogOut className="h-4 w-4 mr-1" />
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Stats Dashboard */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Total Sub-Tasks</span>
            </div>
            <p className="text-2xl font-bold">{stats.total}</p>
          </Card>
          <Card className={cn("p-4", stats.overdue > 0 && "border-red-500/50 bg-red-50 dark:bg-red-950/20")}>
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className={cn("h-4 w-4", stats.overdue > 0 ? "text-red-500 animate-pulse" : "text-muted-foreground")} />
              <span className="text-xs text-muted-foreground">Overdue</span>
            </div>
            <p className={cn("text-2xl font-bold", stats.overdue > 0 && "text-red-600")}>{stats.overdue}</p>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="h-4 w-4 text-amber-500" />
              <span className="text-xs text-muted-foreground">Not Scheduled</span>
            </div>
            <p className="text-2xl font-bold">{stats.notScheduled}</p>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Wrench className="h-4 w-4 text-blue-500" />
              <span className="text-xs text-muted-foreground">In Progress</span>
            </div>
            <p className="text-2xl font-bold">{stats.inProgress}</p>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              <span className="text-xs text-muted-foreground">Completed</span>
            </div>
            <p className="text-2xl font-bold">{stats.completed}</p>
          </Card>
        </div>

        {/* Filters */}
        <Card className="p-4">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by property, tenant, job number..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {SUB_TASK_STATUS_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={o.value}>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: o.color }} />
                      {o.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={tradeFilter} onValueChange={setTradeFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Trade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Trades</SelectItem>
                {uniqueTrades.map(t => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={riskFilter} onValueChange={setRiskFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Risk" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Risk</SelectItem>
                <SelectItem value="overdue">🔴 Overdue</SelectItem>
                <SelectItem value="critical">🟠 Critical (&lt;24h)</SelectItem>
                <SelectItem value="warning">🟡 Warning (&lt;48h)</SelectItem>
                <SelectItem value="safe">🟢 Safe</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </Card>

        {/* Jobs List */}
        <div className="space-y-3">
          {filteredJobs.length === 0 ? (
            <Card className="p-8 text-center">
              <Building2 className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">No ongoing jobs found matching your filters.</p>
            </Card>
          ) : (
            filteredJobs.map(job => {
              const jobSubTasks = subTasksByJob.get(job.id) || [];
              const isExpanded = expandedJobs.has(job.id);
              const daysOpen = differenceInDays(new Date(), job.createdAt);
              const allComplete = jobSubTasks.length > 0 && jobSubTasks.every(st => st.status === 'completed_signed_off');
              const hasOverdue = jobSubTasks.some(st => {
                const risk = getComplianceRisk(st.deadlineDate);
                return risk.level === 'overdue';
              });
              const idleMoreThan3Days = jobSubTasks.some(st => {
                const daysSince = differenceInDays(new Date(), st.updatedAt);
                return daysSince > 3 && st.status !== 'completed_signed_off';
              });

              return (
                <Card
                  key={job.id}
                  className={cn(
                    "overflow-hidden transition-all",
                    hasOverdue && "border-red-500/50 shadow-red-500/10 shadow-md",
                    idleMoreThan3Days && !hasOverdue && "border-amber-400/50",
                  )}
                >
                  {/* Job Header - Clickable */}
                  <div
                    className={cn(
                      "px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors flex items-center gap-3",
                      hasOverdue && "bg-red-50 dark:bg-red-950/10",
                    )}
                    onClick={() => toggleJobExpand(job.id)}
                  >
                    <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform flex-shrink-0", isExpanded && "rotate-180")} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-xs font-mono">#{job.jobNumber}</Badge>
                        <span className="font-semibold text-sm truncate">{job.name}</span>
                        {hasOverdue && <Badge className="bg-red-600 text-white text-[10px] animate-pulse">OVERDUE</Badge>}
                        {idleMoreThan3Days && !hasOverdue && <Badge className="bg-amber-500 text-white text-[10px]">IDLE 3d+</Badge>}
                        {allComplete && <Badge className="bg-emerald-500 text-white text-[10px]">ALL COMPLETE</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{job.address}</p>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">{daysOpen}d open</p>
                        <p className="text-xs font-medium">{jobSubTasks.length} sub-tasks</p>
                      </div>
                      {/* Compliance dots */}
                      <div className="flex gap-1">
                        {jobSubTasks.slice(0, 5).map(st => {
                          const risk = getComplianceRisk(st.deadlineDate);
                          return <div key={st.id} className={cn("w-2 h-2 rounded-full", risk.color)} />;
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Expanded: Job Details + Sub-Task Grid */}
                  {isExpanded && (
                    <div className="border-t">
                      {/* Parent Job Summary */}
                      <div className="px-4 py-3 bg-muted/30 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                        <div>
                          <span className="text-muted-foreground">Property</span>
                          <p className="font-medium">{job.address}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Tenant</span>
                          <p className="font-medium">{job.name}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Date Started</span>
                          <p className="font-medium">{format(job.createdAt, 'dd MMM yyyy')}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Status</span>
                          <Badge variant="secondary" className="text-xs mt-0.5">
                            {job.status === 'awaiting_trade' ? 'Awaiting Trade' : job.status}
                          </Badge>
                        </div>
                      </div>

                      {/* Sub-Task Grid */}
                      {jobSubTasks.length > 0 ? (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b bg-muted/20">
                                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Trade</th>
                                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Team</th>
                                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Booked</th>
                                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Deadline</th>
                                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Status</th>
                                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Portal</th>
                                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Notes</th>
                              </tr>
                            </thead>
                            <tbody>
                              {jobSubTasks.map(st => {
                                const risk = getComplianceRisk(st.deadlineDate);
                                return (
                                  <tr key={st.id} className={cn(
                                    "border-b hover:bg-muted/20 transition-colors",
                                    risk.level === 'overdue' && "bg-red-50 dark:bg-red-950/10",
                                  )}>
                                    <td className="px-3 py-2">
                                      <div className="flex items-center gap-1.5">
                                        <Wrench className="h-3 w-3 text-muted-foreground" />
                                        <span className="font-medium">{st.trade}</span>
                                      </div>
                                    </td>
                                    <td className="px-3 py-2">
                                      <Input
                                        value={st.assignedTeam || ''}
                                        onChange={(e) => handleSubTaskUpdate(st, 'assignedTeam', e.target.value)}
                                        placeholder="Assign..."
                                        className="h-7 text-xs w-[100px]"
                                      />
                                    </td>
                                    <td className="px-3 py-2">
                                      <Input
                                        type="date"
                                        value={st.bookedDate ? format(st.bookedDate, 'yyyy-MM-dd') : ''}
                                        onChange={(e) => handleSubTaskUpdate(st, 'bookedDate', e.target.value || null)}
                                        className="h-7 text-xs w-[120px]"
                                      />
                                    </td>
                                    <td className="px-3 py-2">
                                      <div className="flex items-center gap-1.5">
                                        <div className={cn("w-2 h-2 rounded-full flex-shrink-0", risk.color)} />
                                        <Input
                                          type="date"
                                          value={st.deadlineDate ? format(st.deadlineDate, 'yyyy-MM-dd') : ''}
                                          onChange={(e) => handleSubTaskUpdate(st, 'deadlineDate', e.target.value || null)}
                                          className="h-7 text-xs w-[120px]"
                                        />
                                      </div>
                                    </td>
                                    <td className="px-3 py-2">
                                      <Select
                                        value={st.status}
                                        onValueChange={(v) => handleSubTaskUpdate(st, 'status', v)}
                                      >
                                        <SelectTrigger className="h-7 text-xs w-[160px]">
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {SUB_TASK_STATUS_OPTIONS.map(o => (
                                            <SelectItem key={o.value} value={o.value} disabled={
                                              o.value === 'completed_signed_off' && !st.completionDate
                                            }>
                                              <div className="flex items-center gap-1.5">
                                                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: o.color }} />
                                                <span className="text-xs">{o.label}</span>
                                              </div>
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </td>
                                    <td className="px-3 py-2 text-center">
                                      <Checkbox
                                        checked={st.portalUpdated}
                                        onCheckedChange={(v) => handleSubTaskUpdate(st, 'portalUpdated', !!v)}
                                        className="h-4 w-4"
                                      />
                                    </td>
                                    <td className="px-3 py-2">
                                      <Input
                                        value={st.notes}
                                        onChange={(e) => handleSubTaskUpdate(st, 'notes', e.target.value)}
                                        placeholder="Notes..."
                                        className="h-7 text-xs w-[150px]"
                                      />
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                          No sub-tasks created yet for this job.
                        </div>
                      )}

                      {/* Ready for Invoice indicator */}
                      {allComplete && (
                        <div className="px-4 py-3 bg-emerald-50 dark:bg-emerald-950/20 border-t border-emerald-200 dark:border-emerald-800 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                            <span className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
                              All sub-tasks complete – Ready for Invoice
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </Card>
              );
            })
          )}
        </div>
      </main>
    </div>
  );
}
