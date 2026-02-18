import { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProgressorAuth } from '@/hooks/useProgressorAuth';
import { useAllSubTasks } from '@/hooks/useSubTasks';
import { useAuditLog } from '@/hooks/useAuditLog';
import { supabase } from '@/integrations/supabase/client';
import { Job, JOB_STATUS_OPTIONS } from '@/types/job';
import { SubTask, SUB_TASK_STATUS_OPTIONS, SubTaskStatus } from '@/types/subTask';
import { mapDatabaseJobToJob } from '@/lib/api';
import { AddSubTaskModal } from '@/components/progressor/AddSubTaskModal';
import { SubTaskJobSheetPDF } from '@/components/progressor/SubTaskJobSheetPDF';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import {
  ClipboardList, Search, Filter, LogOut, Loader2, ChevronDown,
  Calendar as CalendarIcon, AlertTriangle, Clock, CheckCircle2, Building2,
  Wrench, Users, FileText, RefreshCw, Phone, MapPin, User,
  Star, Flag, Zap, Plus, MessageSquare, Info,
} from 'lucide-react';
import { format, differenceInDays, differenceInHours } from 'date-fns';
import { cn } from '@/lib/utils';

interface ContactRecord {
  id: string;
  outcome: string;
  notes: string | null;
  contact_date: string;
  next_action: string | null;
  next_action_date: string | null;
}

export default function ProgressorPanel() {
  const navigate = useNavigate();
  const { signOut, user } = useProgressorAuth();
  const { subTasks, isLoading: subTasksLoading, updateSubTask, fetchAll } = useAllSubTasks();
  const { logAction } = useAuditLog();

  const [jobs, setJobs] = useState<Job[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [expandedJobs, setExpandedJobs] = useState<Set<string>>(new Set());
  const [contactHistory, setContactHistory] = useState<Map<string, ContactRecord[]>>(new Map());

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [tradeFilter, setTradeFilter] = useState<string>('all');
  const [riskFilter, setRiskFilter] = useState<string>('all');
  const [teamFilter, setTeamFilter] = useState<string>('all');

  // Add sub-task modal
  const [addSubTaskJob, setAddSubTaskJob] = useState<Job | null>(null);

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
      const mappedJobs = (data || []).map(mapDatabaseJobToJob);
      setJobs(mappedJobs);

      // Fetch contact history for all these jobs
      const jobIds = mappedJobs.map(j => j.id);
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

  // Get unique trades & teams for filters
  const uniqueTrades = useMemo(() => {
    const trades = new Set<string>();
    subTasks.forEach(st => trades.add(st.trade));
    return Array.from(trades).sort();
  }, [subTasks]);

  const uniqueTeams = useMemo(() => {
    const teams = new Set<string>();
    jobs.forEach(j => {
      if (j.team) teams.add(j.team);
      if (j.team2) teams.add(j.team2);
    });
    return Array.from(teams).sort();
  }, [jobs]);

  // Filter jobs
  const filteredJobs = useMemo(() => {
    return jobs.filter(job => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const match = job.name.toLowerCase().includes(q) ||
          job.address.toLowerCase().includes(q) ||
          job.jobNumber.toLowerCase().includes(q) ||
          (job.phoneNumber && job.phoneNumber.includes(q));
        if (!match) return false;
      }

      const jobSubTasks = subTasksByJob.get(job.id) || [];

      if (statusFilter !== 'all') {
        const hasStatus = jobSubTasks.some(st => st.status === statusFilter);
        if (!hasStatus && jobSubTasks.length > 0) return false;
      }

      if (tradeFilter !== 'all') {
        const hasTrade = jobSubTasks.some(st => st.trade === tradeFilter);
        if (!hasTrade) return false;
      }

      if (teamFilter !== 'all') {
        if (job.team !== teamFilter && job.team2 !== teamFilter) return false;
      }

      if (riskFilter !== 'all') {
        const hasRisk = jobSubTasks.some(st => {
          const risk = getComplianceRisk(st.deadlineDate);
          return risk.level === riskFilter;
        });
        if (!hasRisk) return false;
      }

      return true;
    });
  }, [jobs, searchQuery, statusFilter, tradeFilter, riskFilter, teamFilter, subTasksByJob]);

  // Stats
  const stats = useMemo(() => {
    const total = subTasks.length;
    const overdue = subTasks.filter(st => st.deadlineDate && differenceInHours(st.deadlineDate, new Date()) < 0).length;
    const inProgress = subTasks.filter(st => st.status === 'in_progress' || st.status === 'scheduled').length;
    const completed = subTasks.filter(st => st.status === 'completed_signed_off').length;
    const notScheduled = subTasks.filter(st => st.status === 'not_scheduled').length;
    return { total, overdue, inProgress, completed, notScheduled, jobCount: jobs.length };
  }, [subTasks, jobs]);

  const handleSubTaskUpdate = async (subTask: SubTask, field: string, value: any) => {
    const oldValue = (subTask as any)[field];
    const dbField = field === 'assignedTeam' ? 'assigned_team'
      : field === 'bookedDate' ? 'booked_date'
      : field === 'deadlineDate' ? 'deadline_date'
      : field === 'completionDate' ? 'completion_date'
      : field === 'portalUpdated' ? 'portal_updated'
      : field === 'signedOff' ? 'signed_off'
      : field;

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

  const getStatusInfo = (status: string) => {
    return JOB_STATUS_OPTIONS.find(s => s.value === status) || { label: status, color: '#6B7280' };
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
              <p className="text-xs text-muted-foreground">{user?.email} • {stats.jobCount} jobs</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => { fetchJobs(); fetchAll(); }}>
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
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <Card className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Jobs</span>
            </div>
            <p className="text-2xl font-bold">{stats.jobCount}</p>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <FileText className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Sub-Tasks</span>
            </div>
            <p className="text-2xl font-bold">{stats.total}</p>
          </Card>
          <Card className={cn("p-3", stats.overdue > 0 && "border-red-500/50 bg-red-50 dark:bg-red-950/20")}>
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className={cn("h-3.5 w-3.5", stats.overdue > 0 ? "text-red-500 animate-pulse" : "text-muted-foreground")} />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Overdue</span>
            </div>
            <p className={cn("text-2xl font-bold", stats.overdue > 0 && "text-red-600")}>{stats.overdue}</p>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="h-3.5 w-3.5 text-amber-500" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Not Sched.</span>
            </div>
            <p className="text-2xl font-bold">{stats.notScheduled}</p>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <Wrench className="h-3.5 w-3.5 text-blue-500" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide">In Progress</span>
            </div>
            <p className="text-2xl font-bold">{stats.inProgress}</p>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Complete</span>
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
                  placeholder="Search tenant, address, job #, phone..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[170px]">
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
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Trade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Trades</SelectItem>
                {uniqueTrades.map(t => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={teamFilter} onValueChange={setTeamFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Team" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Teams</SelectItem>
                {uniqueTeams.map(t => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={riskFilter} onValueChange={setRiskFilter}>
              <SelectTrigger className="w-[130px]">
                <SelectValue placeholder="Risk" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Risk</SelectItem>
                <SelectItem value="overdue">🔴 Overdue</SelectItem>
                <SelectItem value="critical">🟠 &lt;24h</SelectItem>
                <SelectItem value="warning">🟡 &lt;48h</SelectItem>
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
              const hasOverdue = jobSubTasks.some(st => getComplianceRisk(st.deadlineDate).level === 'overdue');
              const idleMoreThan3Days = jobSubTasks.some(st => {
                const daysSince = differenceInDays(new Date(), st.updatedAt);
                return daysSince > 3 && st.status !== 'completed_signed_off';
              });
              const statusInfo = getStatusInfo(job.status);
              const jobContacts = contactHistory.get(job.id) || [];

              return (
                <Card
                  key={job.id}
                  className={cn(
                    "overflow-hidden transition-all",
                    hasOverdue && "border-red-500/50 shadow-red-500/10 shadow-md",
                    idleMoreThan3Days && !hasOverdue && "border-amber-400/50",
                  )}
                >
                  {/* Job Header */}
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
                        <Badge
                          className="text-[10px]"
                          style={{ backgroundColor: statusInfo.color, color: '#fff' }}
                        >
                          {statusInfo.label}
                        </Badge>
                        {job.team && (
                          <Badge variant="secondary" className="text-[10px]">
                            <Users className="h-2.5 w-2.5 mr-0.5" />
                            {job.team}
                          </Badge>
                        )}
                        {job.team2 && (
                          <Badge variant="secondary" className="text-[10px]">
                            <Users className="h-2.5 w-2.5 mr-0.5" />
                            {job.team2}
                          </Badge>
                        )}
                        {job.isFlexibleBooking && <Star className="h-3 w-3 text-amber-500" />}
                        {job.referBack && <Flag className="h-3 w-3 text-red-500" />}
                        {hasOverdue && <Badge className="bg-red-600 text-white text-[10px] animate-pulse">OVERDUE</Badge>}
                        {idleMoreThan3Days && !hasOverdue && <Badge className="bg-amber-500 text-white text-[10px]">IDLE 3d+</Badge>}
                        {allComplete && <Badge className="bg-emerald-500 text-white text-[10px]">ALL COMPLETE</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {job.address}
                        {job.phoneNumber && ` • ${job.phoneNumber}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">{daysOpen}d open</p>
                        <p className="text-xs font-medium">{jobSubTasks.length} sub-tasks</p>
                      </div>
                      <div className="flex gap-0.5">
                        {jobSubTasks.slice(0, 5).map(st => {
                          const risk = getComplianceRisk(st.deadlineDate);
                          return <div key={st.id} className={cn("w-2 h-2 rounded-full", risk.color)} />;
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Expanded Content */}
                  {isExpanded && (
                    <div className="border-t">
                      {/* Rich Job Info Panel */}
                      <div className="px-4 py-3 bg-muted/20 space-y-3">
                        {/* Row 1: Key info */}
                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 text-xs">
                          <div>
                            <span className="text-muted-foreground flex items-center gap-1"><User className="h-3 w-3" /> Tenant</span>
                            <p className="font-medium">{job.name}</p>
                          </div>
                          <div>
                            <span className="text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3" /> Address</span>
                            <p className="font-medium">{job.address}</p>
                          </div>
                          <div>
                            <span className="text-muted-foreground flex items-center gap-1"><Phone className="h-3 w-3" /> Phone</span>
                            <p className="font-medium">{job.phoneNumber || '—'}</p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Booked Date</span>
                            <p className="font-medium">{job.bookedDate ? format(job.bookedDate, 'dd MMM yyyy') : '—'}</p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Assigned Team</span>
                            <p className="font-medium">
                              {job.team || '—'}
                              {job.team2 ? ` + ${job.team2}` : ''}
                            </p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Progress</span>
                            <div className="flex items-center gap-2">
                              <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                                <div
                                  className="h-full bg-primary rounded-full transition-all"
                                  style={{ width: `${job.progress}%` }}
                                />
                              </div>
                              <span className="font-medium">{job.progress}%</span>
                            </div>
                          </div>
                        </div>

                        {/* Row 2: Ongoing reason, description, fan info */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
                          {job.ongoingReason && (
                            <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-2.5">
                              <span className="text-amber-700 dark:text-amber-300 font-semibold flex items-center gap-1">
                                <AlertTriangle className="h-3 w-3" /> Ongoing Reason
                              </span>
                              <p className="mt-0.5">{job.ongoingReason}</p>
                            </div>
                          )}
                          {job.description && (
                            <div className="bg-background border rounded-lg p-2.5">
                              <span className="text-muted-foreground font-semibold flex items-center gap-1">
                                <Info className="h-3 w-3" /> Description
                              </span>
                              <p className="mt-0.5 whitespace-pre-wrap line-clamp-4">{job.description}</p>
                            </div>
                          )}
                          {job.summaryOfWorks && (
                            <div className="bg-background border rounded-lg p-2.5">
                              <span className="text-muted-foreground font-semibold">Summary of Works</span>
                              <p className="mt-0.5 whitespace-pre-wrap line-clamp-4">{job.summaryOfWorks}</p>
                            </div>
                          )}
                        </div>

                        {/* Row 3: Fan info, progress notes, refer back */}
                        <div className="flex flex-wrap gap-2 text-xs">
                          {job.fanInfo && job.fanInfo.length > 0 && (
                            <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-2 flex-1 min-w-[200px]">
                              <span className="text-blue-700 dark:text-blue-300 font-semibold flex items-center gap-1">
                                <Zap className="h-3 w-3" /> Fan Info
                              </span>
                              <div className="mt-1 space-y-0.5">
                                {job.fanInfo.map((f, i) => (
                                  <p key={i}>{f.type} × {f.quantity} — {f.location}</p>
                                ))}
                              </div>
                            </div>
                          )}
                          {job.progressNotes && (
                            <div className="bg-background border rounded-lg p-2 flex-1 min-w-[200px]">
                              <span className="text-muted-foreground font-semibold flex items-center gap-1">
                                <MessageSquare className="h-3 w-3" /> Progress Notes
                              </span>
                              <p className="mt-0.5 whitespace-pre-wrap line-clamp-3">{job.progressNotes}</p>
                            </div>
                          )}
                          {job.referBack && (
                            <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg p-2 flex-1 min-w-[200px]">
                              <span className="text-red-700 dark:text-red-300 font-semibold flex items-center gap-1">
                                <Flag className="h-3 w-3" /> Referred Back
                              </span>
                              <p className="mt-0.5">{job.referBackReason || 'No reason given'}</p>
                              {job.referBackDate && <p className="text-muted-foreground">{format(job.referBackDate, 'dd MMM yyyy')}</p>}
                            </div>
                          )}
                        </div>

                        {/* Contact History */}
                        {jobContacts.length > 0 && (
                          <div className="bg-background border rounded-lg p-2.5 text-xs">
                            <span className="text-muted-foreground font-semibold flex items-center gap-1 mb-1.5">
                              <Phone className="h-3 w-3" /> Contact Log ({jobContacts.length} entries)
                            </span>
                            <div className="space-y-1 max-h-[100px] overflow-y-auto">
                              {jobContacts.slice(0, 5).map(c => (
                                <div key={c.id} className="flex items-center gap-2 text-[11px]">
                                  <span className="text-muted-foreground shrink-0">
                                    {format(new Date(c.contact_date), 'dd/MM HH:mm')}
                                  </span>
                                  <Badge variant="outline" className="text-[10px] shrink-0">{c.outcome}</Badge>
                                  {c.notes && <span className="truncate">{c.notes}</span>}
                                  {c.next_action && (
                                    <span className="text-primary shrink-0">→ {c.next_action}</span>
                                  )}
                                </div>
                              ))}
                              {jobContacts.length > 5 && (
                                <p className="text-muted-foreground text-[10px]">+ {jobContacts.length - 5} more entries</p>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Add Sub-Task Button */}
                        <div className="flex justify-end">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => { e.stopPropagation(); setAddSubTaskJob(job); }}
                            className="text-xs"
                          >
                            <Plus className="h-3 w-3 mr-1" />
                            Add Sub-Task
                          </Button>
                        </div>
                      </div>

                      <Separator />

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
                                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Completion</th>
                                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Status</th>
                                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Portal</th>
                                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Notes</th>
                                <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">PDF</th>
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
                                        <span className="font-medium text-xs">{st.trade}</span>
                                      </div>
                                      {st.description && (
                                        <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">{st.description}</p>
                                      )}
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
                                        <div className={cn("w-2 h-2 rounded-full flex-shrink-0", risk.color)} title={risk.label} />
                                        <Input
                                          type="date"
                                          value={st.deadlineDate ? format(st.deadlineDate, 'yyyy-MM-dd') : ''}
                                          onChange={(e) => handleSubTaskUpdate(st, 'deadlineDate', e.target.value || null)}
                                          className="h-7 text-xs w-[120px]"
                                        />
                                      </div>
                                    </td>
                                    <td className="px-3 py-2">
                                      <Input
                                        type="date"
                                        value={st.completionDate ? format(st.completionDate, 'yyyy-MM-dd') : ''}
                                        onChange={(e) => handleSubTaskUpdate(st, 'completionDate', e.target.value || null)}
                                        className="h-7 text-xs w-[120px]"
                                      />
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
                                    <td className="px-3 py-2 text-center">
                                      <SubTaskJobSheetPDF subTask={st} job={job} />
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                          <p>No sub-tasks created yet.</p>
                          <Button
                            size="sm"
                            variant="outline"
                            className="mt-2 text-xs"
                            onClick={() => setAddSubTaskJob(job)}
                          >
                            <Plus className="h-3 w-3 mr-1" />
                            Create Sub-Tasks
                          </Button>
                        </div>
                      )}

                      {/* Ready for Invoice */}
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

      {/* Add Sub-Task Modal */}
      {addSubTaskJob && (
        <AddSubTaskModal
          open={!!addSubTaskJob}
          onOpenChange={(open) => !open && setAddSubTaskJob(null)}
          job={{
            id: addSubTaskJob.id,
            jobNumber: addSubTaskJob.jobNumber,
            name: addSubTaskJob.name,
            address: addSubTaskJob.address,
          }}
          onCreated={() => { fetchJobs(); fetchAll(); }}
        />
      )}
    </div>
  );
}
