import { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useSessionPersistence } from '@/hooks/useSessionPersistence';
import { useProgressorAuth } from '@/hooks/useProgressorAuth';
import { useAllSubTasks } from '@/hooks/useSubTasks';
import { useAuditLog } from '@/hooks/useAuditLog';
import { supabase } from '@/integrations/supabase/client';
import { Job, JOB_STATUS_OPTIONS } from '@/types/job';
import { SubTask, SUB_TASK_STATUS_OPTIONS, SubTaskStatus } from '@/types/subTask';
import { mapDatabaseJobToJob } from '@/lib/api';
import { AddSubTaskModal } from '@/components/progressor/AddSubTaskModal';
import { TradeCompaniesModal } from '@/components/progressor/TradeCompaniesModal';
import { ProgressorBookedDashboard } from '@/components/progressor/ProgressorBookedDashboard';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ProgressorTeamCodesModal } from '@/components/progressor/ProgressorTeamCodesModal';
import { ProgressorJobExpandedContent } from '@/components/progressor/ProgressorJobExpandedContent';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  ClipboardList, Search, LogOut, Loader2, ChevronDown,
  AlertTriangle, Clock, CheckCircle2, Building2,
  Wrench, Users, FileText, RefreshCw, Phone, MapPin, User,
  Star, Flag, Zap, Plus, MessageSquare, Info, Trash2,
  ChevronUp, ChevronsUpDown, TrendingUp, PackageOpen, Save,
  CalendarCheck, CheckCircle, CalendarClock, Key,
} from 'lucide-react';
import { format, differenceInDays, differenceInHours, isPast } from 'date-fns';
import { cn } from '@/lib/utils';
import { CalendarDays } from 'lucide-react';

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
  const [searchParams, setSearchParams] = useSearchParams();
  const { signOut, user } = useProgressorAuth();
  const { subTasks, isLoading: subTasksLoading, updateSubTask, fetchAll } = useAllSubTasks();
  const { logAction } = useAuditLog();
  useSessionPersistence('progressor');

  const [jobs, setJobs] = useState<Job[]>(() => {
    // Restore cached jobs from sessionStorage for instant load
    try {
      const cached = sessionStorage.getItem('progressor_jobs_cache');
      if (cached) {
        const { data, timestamp } = JSON.parse(cached);
        // Use cache if less than 10 minutes old
        if (Date.now() - timestamp < 10 * 60 * 1000) return data;
      }
    } catch {}
    return [];
  });
  const [jobsLoading, setJobsLoading] = useState(() => {
    // If we have cached data, don't show loading
    try {
      const cached = sessionStorage.getItem('progressor_jobs_cache');
      if (cached) {
        const { timestamp } = JSON.parse(cached);
        if (Date.now() - timestamp < 10 * 60 * 1000) return false;
      }
    } catch {}
    return true;
  });
  
  // Restore expanded jobs from URL
  const [expandedJobs, setExpandedJobs] = useState<Set<string>>(() => {
    const urlJob = searchParams.get('job');
    return urlJob ? new Set([urlJob]) : new Set();
  });
  const [contactHistory, setContactHistory] = useState<Map<string, ContactRecord[]>>(new Map());


  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [tradeFilter, setTradeFilter] = useState<string>('all');
  const [riskFilter, setRiskFilter] = useState<string>('all');
  const [teamFilter, setTeamFilter] = useState<string>('all');

  // Sorting
  const [sortBy, setSortBy] = useState<'urgency' | 'newest' | 'oldest' | 'name'>('urgency');
  const [activeTab, setActiveTab] = useState<string>('incomplete');

  // Add sub-task modal
  const [addSubTaskJob, setAddSubTaskJob] = useState<Job | null>(null);
  const [showTradeCompanies, setShowTradeCompanies] = useState(false);
  const [showTeamCodes, setShowTeamCodes] = useState(false);
  

  // Fetch incomplete jobs where booked date is 12+ hours past
  const fetchJobs = useCallback(async () => {
    setJobsLoading(true);
    try {
      // Fetch all non-deleted, non-FAN jobs - select only needed columns
      const FAN_CATEGORY_ID = '913c5a29-2b7f-4da9-992a-1b49e51d9d8a';
      const { data, error } = await supabase
        .from('jobs')
        .select('id, job_number, name, address, phone_number, status, team, team2, progress, is_completed, is_ongoing, ongoing_reason, booked_date, completion_date, expected_completion_date, created_at, date_issued, description, work_items, fan_info, category_id, progress_notes, scheduled_trades, attachments, additional_works, summary_of_works, costs, private_notes, refer_back, refer_back_reason, refer_back_date, booking_notes, is_flexible_booking, insulation_info, linked_fan_job_id, linked_insulation_job_id')
        .is('deleted_at', null)
        .or(`category_id.is.null,category_id.neq.${FAN_CATEGORY_ID}`)
        .eq('is_completed', false)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      const now = new Date();
      const mappedJobs = (data || [])
        .map(mapDatabaseJobToJob)
        .filter(job => {
          // Must have a booked date that is 12+ hours in the past
          if (!job.bookedDate) return false;
          const hoursSinceBooked = differenceInHours(now, job.bookedDate);
          return hoursSinceBooked >= 12;
        });
      
      // Split into active and referred-back
      const activeJobs = mappedJobs.filter(j => !j.referBack);
      const referredJobs = mappedJobs.filter(j => j.referBack);
      
      setJobs(activeJobs);
      setReferredBackJobs(referredJobs);
      // Cache jobs for instant restore on return
      try {
        sessionStorage.setItem('progressor_jobs_cache', JSON.stringify({ data: activeJobs, timestamp: Date.now() }));
      } catch {}

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

  // Periodic scan: clear awaiting_trade status for jobs with no remaining sub-tasks
  useEffect(() => {
    const scanAndClearOrphanedAwaitingTrade = async () => {
      try {
        // Find all jobs with awaiting_trade status
        const { data: awaitingJobs } = await supabase
          .from('jobs')
          .select('id')
          .eq('status', 'awaiting_trade')
          .is('deleted_at', null);

        if (!awaitingJobs || awaitingJobs.length === 0) return;

        // For each, check if any sub-tasks exist
        for (const job of awaitingJobs) {
          const { data: tasks } = await supabase
            .from('job_sub_tasks')
            .select('id')
            .eq('parent_job_id', job.id)
            .limit(1);

          if (!tasks || tasks.length === 0) {
            await supabase
              .from('jobs')
              .update({ status: 'started', is_ongoing: false, ongoing_reason: '' })
              .eq('id', job.id);
            // Update local state
            setJobs(prev => prev.map(j =>
              j.id === job.id ? { ...j, status: 'started', isOngoing: false, ongoingReason: '' } : j
            ));
          }
        }
      } catch (err) {
        console.error('Awaiting trade scan error:', err);
      }
    };

    // Run immediately and then every 30 seconds
    scanAndClearOrphanedAwaitingTrade();
    const interval = setInterval(scanAndClearOrphanedAwaitingTrade, 30000);
    return () => clearInterval(interval);
  }, []);

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

  // Job urgency score for sorting
  const getJobUrgency = (job: Job) => {
    const jobSubTasks = subTasksByJob.get(job.id) || [];
    let score = 0;
    
    // Hours past booked date
    if (job.bookedDate) {
      const hoursPast = differenceInHours(new Date(), job.bookedDate);
      score += Math.min(hoursPast / 24, 30) * 3; // weight by days overdue
    }
    
    for (const st of jobSubTasks) {
      const risk = getComplianceRisk(st.deadlineDate);
      if (risk.level === 'overdue') score += 100;
      else if (risk.level === 'critical') score += 50;
      else if (risk.level === 'warning') score += 25;
    }
    const hasIdle = jobSubTasks.some(st => {
      const daysSince = differenceInDays(new Date(), st.updatedAt);
      return daysSince > 3 && st.status !== 'completed_signed_off';
    });
    if (hasIdle) score += 30;
    if (jobSubTasks.length === 0) score += 40;
    return score;
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
    const filtered = jobs.filter(job => {
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

    return filtered.sort((a, b) => {
      switch (sortBy) {
        case 'urgency': return getJobUrgency(b) - getJobUrgency(a);
        case 'newest': return b.createdAt.getTime() - a.createdAt.getTime();
        case 'oldest': return a.createdAt.getTime() - b.createdAt.getTime();
        case 'name': return a.name.localeCompare(b.name);
        default: return 0;
      }
    });
  }, [jobs, searchQuery, statusFilter, tradeFilter, riskFilter, teamFilter, subTasksByJob, sortBy]);

  // Stats — exclude completed_signed_off sub-tasks from counts
  const stats = useMemo(() => {
    // Only count sub-tasks belonging to displayed jobs
    const jobIds = new Set(jobs.map(j => j.id));
    const relevantSubTasks = subTasks.filter(st => jobIds.has(st.parentJobId));
    
    const totalSubTasks = relevantSubTasks.length;
    const overdue = relevantSubTasks.filter(st => st.deadlineDate && differenceInHours(st.deadlineDate, new Date()) < 0 && st.status !== 'completed_signed_off').length;
    const inProgress = relevantSubTasks.filter(st => st.status === 'in_progress').length;
    const scheduled = relevantSubTasks.filter(st => st.status === 'scheduled').length;
    const completedSignedOff = relevantSubTasks.filter(st => st.status === 'completed_signed_off').length;
    const completedAwaitingPortal = relevantSubTasks.filter(st => st.status === 'completed_awaiting_portal').length;
    const notScheduled = relevantSubTasks.filter(st => st.status === 'not_scheduled').length;
    const awaitingMaterials = relevantSubTasks.filter(st => st.status === 'awaiting_materials').length;
    const accessIssue = relevantSubTasks.filter(st => st.status === 'access_issue').length;
    const completionRate = totalSubTasks > 0 ? Math.round((completedSignedOff / totalSubTasks) * 100) : 0;

    const jobsNoSubTasks = jobs.filter(job => !(subTasksByJob.get(job.id)?.length)).length;

    return {
      jobCount: jobs.length,
      totalSubTasks,
      overdue,
      inProgress,
      scheduled,
      completedSignedOff,
      completedAwaitingPortal,
      notScheduled,
      awaitingMaterials,
      accessIssue,
      completionRate,
      jobsNoSubTasks,
    };
  }, [subTasks, jobs, subTasksByJob]);

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

    // Convert date strings to ISO format for the database
    let dbValue = value;
    if (['bookedDate', 'deadlineDate', 'completionDate'].includes(field) && value) {
      dbValue = new Date(value).toISOString();
    }

    // Auto-update status when booked date is set
    const updates: Record<string, any> = { [dbField]: dbValue };
    if (field === 'bookedDate' && value && subTask.status === 'not_scheduled') {
      updates.status = 'scheduled';
    }

    await updateSubTask(subTask.id, updates);

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
      if (next.has(jobId)) {
        next.delete(jobId);
        // Clear job from URL when collapsing
        setSearchParams(p => { const n = new URLSearchParams(p); n.delete('job'); return n; }, { replace: true });
      } else {
        next.add(jobId);
        // Persist last expanded job in URL for session restore
        setSearchParams(p => { const n = new URLSearchParams(p); n.set('job', jobId); return n; }, { replace: true });
      }
      return next;
    });
  };

  const expandAll = () => setExpandedJobs(new Set(filteredJobs.map(j => j.id)));
  const collapseAll = () => { setExpandedJobs(new Set()); setSearchParams(p => { const n = new URLSearchParams(p); n.delete('job'); return n; }, { replace: true }); };

  const handleDeleteSubTask = async (subTask: SubTask) => {
    if (!confirm(`Delete ${subTask.trade} sub-task? This cannot be undone.`)) return;
    try {
      const { error } = await supabase
        .from('job_sub_tasks')
        .delete()
        .eq('id', subTask.id);
      if (error) throw error;
      await logAction({
        action: 'delete',
        tableName: 'job_sub_tasks',
        recordId: subTask.id,
        fieldChanged: 'deleted',
        oldValue: subTask.trade,
        newValue: '',
        metadata: { parentJobId: subTask.parentJobId, trade: subTask.trade },
      });

      // Check if any sub-tasks remain for this job (exclude just-deleted); if not, clear awaiting_trade
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
        // Update local state immediately
        setJobs(prev => prev.map(j => 
          j.id === subTask.parentJobId
            ? { ...j, status: 'started', isOngoing: false, ongoingReason: '' }
            : j
        ));
      }

      await fetchAll();
    } catch (err) {
      console.error('Error deleting sub-task:', err);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/progressor-login', { replace: true });
  };

  const getStatusInfo = (status: string) => {
    return JOB_STATUS_OPTIONS.find(s => s.value === status) || { label: status, color: '#6B7280' };
  };

  const hasActiveFilters = searchQuery || statusFilter !== 'all' || tradeFilter !== 'all' || riskFilter !== 'all' || teamFilter !== 'all';

  const clearFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
    setTradeFilter('all');
    setRiskFilter('all');
    setTeamFilter('all');
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
    <TooltipProvider>
      <div className="min-h-screen bg-background">
        {/* Header */}
        <header className="sticky top-0 z-30 bg-card border-b shadow-sm">
          <div className="max-w-[1400px] mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <ClipboardList className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h1 className="text-lg font-bold">Job Progressor Panel</h1>
                <p className="text-xs text-muted-foreground">
                  {user?.email} • Incomplete jobs past booked date
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowTeamCodes(true)}>
                <Key className="h-3.5 w-3.5 mr-1" />
                Team Codes
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowTradeCompanies(true)}>
                <Building2 className="h-3.5 w-3.5 mr-1" />
                Contacts
              </Button>
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

        <main className="max-w-[1400px] mx-auto px-4 py-5 space-y-6">
          {/* Tab Navigation */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="h-11">
              <TabsTrigger value="incomplete" className="gap-1.5 text-sm">
                <ClipboardList className="h-4 w-4" />
                Incomplete Jobs
                <Badge variant="outline" className="ml-1 text-[10px] h-5">{jobs.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="booked" className="gap-1.5 text-sm">
                <CalendarDays className="h-4 w-4" />
                Booked Dashboard
              </TabsTrigger>
            </TabsList>

            <TabsContent value="booked" className="mt-4">
              <ProgressorBookedDashboard />
            </TabsContent>

            <TabsContent value="incomplete" className="mt-4 space-y-6">
          {/* ═══════════ ANALYTICS SECTION ═══════════ */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <ClipboardList className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">Incomplete Jobs</h2>
              <Badge variant="outline" className="text-xs">{filteredJobs.length}</Badge>
              <div className="flex-1 h-px bg-border" />
            </div>

            {/* Filters & Controls */}
            <div className="bg-card border rounded-lg p-3 mb-3">
              <div className="flex flex-wrap gap-2 items-center">
                <div className="flex-1 min-w-[200px]">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search tenant, address, job #, phone..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9 h-9"
                    />
                  </div>
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[150px] h-9"><SelectValue placeholder="Status" /></SelectTrigger>
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
                  <SelectTrigger className="w-[130px] h-9"><SelectValue placeholder="Trade" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Trades</SelectItem>
                    {uniqueTrades.map(t => (<SelectItem key={t} value={t}>{t}</SelectItem>))}
                  </SelectContent>
                </Select>
                <Select value={teamFilter} onValueChange={setTeamFilter}>
                  <SelectTrigger className="w-[120px] h-9"><SelectValue placeholder="Team" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Teams</SelectItem>
                    {uniqueTeams.map(t => (<SelectItem key={t} value={t}>{t}</SelectItem>))}
                  </SelectContent>
                </Select>
                <Select value={riskFilter} onValueChange={setRiskFilter}>
                  <SelectTrigger className="w-[110px] h-9"><SelectValue placeholder="Risk" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Risk</SelectItem>
                    <SelectItem value="overdue">🔴 Overdue</SelectItem>
                    <SelectItem value="critical">🟠 &lt;24h</SelectItem>
                    <SelectItem value="warning">🟡 &lt;48h</SelectItem>
                    <SelectItem value="safe">🟢 Safe</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={sortBy} onValueChange={(v: any) => setSortBy(v)}>
                  <SelectTrigger className="w-[130px] h-9">
                    <ChevronsUpDown className="h-3 w-3 mr-1" /><SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="urgency">Most Urgent</SelectItem>
                    <SelectItem value="newest">Newest First</SelectItem>
                    <SelectItem value="oldest">Oldest First</SelectItem>
                    <SelectItem value="name">By Name</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between mt-2 pt-2 border-t">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>Showing <strong className="text-foreground">{filteredJobs.length}</strong> of {jobs.length} jobs</span>
                  {hasActiveFilters && (
                    <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={clearFilters}>Clear filters</Button>
                  )}
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={expandAll}>
                    <ChevronDown className="h-3 w-3 mr-1" /> Expand
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={collapseAll}>
                    <ChevronUp className="h-3 w-3 mr-1" /> Collapse
                  </Button>
                </div>
              </div>
            </div>

            {/* Jobs List */}
            <div className="space-y-2">
              {filteredJobs.length === 0 ? (
                <Card className="p-8 text-center">
                  <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto mb-3" />
                  <p className="text-muted-foreground">No incomplete jobs past their booked date.</p>
                  {hasActiveFilters && (
                    <Button variant="link" size="sm" onClick={clearFilters} className="mt-2">Clear all filters</Button>
                  )}
                </Card>
              ) : (
                filteredJobs.map(job => {
                  const jobSubTasks = subTasksByJob.get(job.id) || [];
                  const isExpanded = expandedJobs.has(job.id);
                  const hoursPastBooked = job.bookedDate ? differenceInHours(new Date(), job.bookedDate) : 0;
                  const daysPastBooked = Math.floor(hoursPastBooked / 24);
                  const hasOverdue = jobSubTasks.some(st => {
                    const risk = getComplianceRisk(st.deadlineDate);
                    return risk.level === 'overdue' && st.status !== 'completed_signed_off';
                  });
                  const idleMoreThan3Days = jobSubTasks.some(st => {
                    const daysSince = differenceInDays(new Date(), st.updatedAt);
                    return daysSince > 3 && st.status !== 'completed_signed_off';
                  });
                  const statusInfo = getStatusInfo(job.status);
                  const jobContacts = contactHistory.get(job.id) || [];
                  const activeSubTasks = jobSubTasks.filter(st => st.status !== 'completed_signed_off');
                  const completedCount = jobSubTasks.filter(st => st.status === 'completed_signed_off').length;
                  const totalFans = job.fanInfo?.reduce((sum, f) => sum + f.quantity, 0) || 0;
                  const hasExpectedCompletion = !!job.expectedCompletionDate;
                  const expectedDatePast = job.expectedCompletionDate && isPast(job.expectedCompletionDate);

                  return (
                    <Card
                      key={job.id}
                      className={cn(
                        "overflow-hidden transition-all",
                        isExpanded
                          ? "bg-indigo-50/60 dark:bg-indigo-950/20 border-indigo-400 border-2 shadow-lg shadow-indigo-500/10"
                          : cn(
                              hasOverdue && "border-red-500/50 shadow-red-500/10 shadow-md",
                              idleMoreThan3Days && !hasOverdue && "border-amber-400/50",
                            ),
                        // Outline jobs with no expected completion date
                        !hasExpectedCompletion && !isExpanded && "ring-2 ring-orange-400 dark:ring-orange-500",
                        // Flash when expected date has passed
                        expectedDatePast && !isExpanded && "animate-flash-alert ring-2 ring-red-500",
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
                            <Badge className="text-[10px]" style={{ backgroundColor: statusInfo.color, color: '#fff' }}>
                              {statusInfo.label}
                            </Badge>
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
                            {totalFans > 0 && (
                              <Badge variant="outline" className="text-[10px] border-blue-300 text-blue-600 dark:text-blue-400">
                                <Zap className="h-2.5 w-2.5 mr-0.5" />{totalFans} fan{totalFans !== 1 ? 's' : ''}
                              </Badge>
                            )}
                            {job.referBack && <Flag className="h-3 w-3 text-red-500" />}
                            {hasOverdue && <Badge className="bg-red-600 text-white text-[10px] animate-pulse">OVERDUE</Badge>}
                            {idleMoreThan3Days && !hasOverdue && <Badge className="bg-amber-500 text-white text-[10px]">IDLE 3d+</Badge>}
                            {!hasExpectedCompletion && (
                              <Badge className="bg-orange-500 text-white text-[10px]">
                                <CalendarClock className="h-2.5 w-2.5 mr-0.5" />NO ECD
                              </Badge>
                            )}
                            {expectedDatePast && (
                              <Badge className="bg-red-600 text-white text-[10px] animate-pulse">
                                <CalendarClock className="h-2.5 w-2.5 mr-0.5" />ECD PASSED
                              </Badge>
                            )}
                            {hasExpectedCompletion && !expectedDatePast && (
                              <Badge variant="outline" className="text-[10px] border-emerald-400 text-emerald-600 dark:text-emerald-400">
                                <CalendarCheck className="h-2.5 w-2.5 mr-0.5" />ECD: {format(job.expectedCompletionDate!, 'dd MMM')}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                            <span className="truncate">{job.address}</span>
                            {job.phoneNumber && (
                              <>
                                <span>•</span>
                                <a href={`tel:${job.phoneNumber}`} className="text-primary hover:underline flex items-center gap-0.5"
                                  onClick={(e) => e.stopPropagation()}>
                                  <Phone className="h-2.5 w-2.5" />{job.phoneNumber}
                                </a>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Right side: progress indicator */}
                        <div className="flex items-center gap-4 flex-shrink-0">
                          {/* Sub-task status pills */}
                          {jobSubTasks.length > 0 && (
                            <div className="flex items-center gap-1">
                              {jobSubTasks.map(st => {
                                const stStatus = SUB_TASK_STATUS_OPTIONS.find(o => o.value === st.status);
                                return (
                                  <Tooltip key={st.id}>
                                    <TooltipTrigger asChild>
                                      <div
                                        className="w-3 h-3 rounded-sm flex-shrink-0"
                                        style={{ backgroundColor: stStatus?.color || '#6B7280' }}
                                      />
                                    </TooltipTrigger>
                                    <TooltipContent className="text-xs">
                                      {st.trade}: {stStatus?.label || st.status}
                                      {st.bookedDate && ` • Booked: ${format(st.bookedDate, 'dd MMM')}`}
                                    </TooltipContent>
                                  </Tooltip>
                                );
                              })}
                              <span className="text-[10px] text-muted-foreground ml-1">{completedCount}/{jobSubTasks.length}</span>
                            </div>
                          )}
                          <Badge variant="outline" className={cn("text-[10px]",
                            daysPastBooked > 7 ? "border-red-400 text-red-600" : daysPastBooked > 3 ? "border-amber-400 text-amber-600" : ""
                          )}>
                            {daysPastBooked}d overdue
                          </Badge>
                        </div>
                      </div>

                      {/* Expanded Content */}
                      {isExpanded && (
                        <ProgressorJobExpandedContent
                          job={job}
                          jobSubTasks={jobSubTasks}
                          jobContacts={jobContacts}
                          onJobUpdate={(jobId, updates) => {
                            setJobs(prev => prev.map(j => j.id === jobId ? { ...j, ...updates } : j));
                          }}
                          onSubTaskUpdate={handleSubTaskUpdate}
                          onDeleteSubTask={handleDeleteSubTask}
                          onAddSubTask={(j) => setAddSubTaskJob(j)}
                          onRefresh={() => { fetchJobs(); fetchAll(); }}
                        />
                      )}
                    </Card>
                  );
                })
              )}
            </div>
          </section>
            </TabsContent>
          </Tabs>
        </main>

        {/* Modals */}
        {addSubTaskJob && (
          <AddSubTaskModal
            open={!!addSubTaskJob}
            onOpenChange={(open) => !open && setAddSubTaskJob(null)}
            job={{ id: addSubTaskJob.id, jobNumber: addSubTaskJob.jobNumber, name: addSubTaskJob.name, address: addSubTaskJob.address }}
            onCreated={() => {
              const jobId = addSubTaskJob.id;
              // Force keep the job expanded after creation
              setExpandedJobs(prev => new Set([...prev, jobId]));
              setSearchParams(p => { const n = new URLSearchParams(p); n.set('job', jobId); return n; }, { replace: true });
              // Fetch sub-tasks first (fast), then jobs
              fetchAll().then(() => fetchJobs());
            }}
          />
        )}
        <TradeCompaniesModal open={showTradeCompanies} onOpenChange={setShowTradeCompanies} />
        <ProgressorTeamCodesModal open={showTeamCodes} onOpenChange={setShowTeamCodes} />
      </div>
    </TooltipProvider>
  );
}

/* Reusable stat card */
function StatCard({ icon, label, value, sublabel, sublabelColor, highlight, pulse }: {
  icon: React.ReactNode; label: string; value: number | string;
  sublabel?: string; sublabelColor?: string;
  highlight?: 'destructive' | 'warning'; pulse?: boolean;
}) {
  return (
    <div className={cn(
      "flex items-center gap-2 bg-card border rounded-lg px-3 py-2 transition-all",
      highlight === 'destructive' && "border-red-500/50 bg-red-50 dark:bg-red-950/20",
      highlight === 'warning' && "border-amber-500/50 bg-amber-50 dark:bg-amber-950/20",
    )}>
      <div className={cn("flex-shrink-0",
        highlight === 'destructive' ? "text-red-500" : highlight === 'warning' ? "text-amber-500" : "text-muted-foreground",
        pulse && "animate-pulse",
      )}>{icon}</div>
      <div className="min-w-0">
        <p className={cn("text-xl font-bold leading-none", highlight === 'destructive' && "text-red-600")}>{value}</p>
        <p className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">{label}</p>
        {sublabel && <p className={cn("text-[10px] mt-0.5 truncate", sublabelColor || "text-muted-foreground")}>{sublabel}</p>}
      </div>
    </div>
  );
}
