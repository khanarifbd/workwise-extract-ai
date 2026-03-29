import { forwardRef, useMemo, useState } from 'react';
import { Job } from '@/types/job';
import { MonthlyJobBreakdown } from './MonthlyJobBreakdown';
import { 
  Briefcase, 
  CheckCircle2, 
  Clock, 
  Users,
  TrendingUp,
  CalendarCheck,
  AlertTriangle,
  PhoneOff,
  Voicemail,
  PhoneCall,
  EyeOff,
  Wrench,
  Pause,
  Flame,
  Zap,
  BookOpen,
  ChevronDown,
  ChevronRight
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getGMTNow, getHoursDifferenceGMT } from '@/lib/dateUtils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface StatsCardsProps {
  jobs: Job[];
  allJobs?: Job[];
  tradeBookings?: Map<string, unknown>;
}

const PRIORITY_KEYWORDS = ['emergency', 'urgent', 'priority', 'critical', 'asap', 'immediate'];

function isEmergencyOrCritical(description: string | undefined | null): boolean {
  if (!description) return false;
  const lower = description.toLowerCase();
  return lower.includes('emergency') || lower.includes('critical');
}

function isUrgent(description: string | undefined | null): boolean {
  if (!description) return false;
  const lower = description.toLowerCase();
  if (isEmergencyOrCritical(description)) return false;
  return lower.includes('urgent') || lower.includes('asap') || lower.includes('immediate');
}

function isCompleted(j: Job): boolean {
  return j.status === 'complete' || j.isCompleted;
}

export const StatsCards = forwardRef<HTMLDivElement, StatsCardsProps>(({ jobs, allJobs }, ref) => {
  const now = useMemo(() => getGMTNow(), []);
  const [activeOpen, setActiveOpen] = useState(false);
  const [monthlyOpen, setMonthlyOpen] = useState(false);

  const counts = useMemo(() => {
    const total = jobs.length;
    const complete = jobs.filter(isCompleted).length;
    const active = total - complete;
    const assigned = jobs.filter(j => !isCompleted(j) && j.team != null && j.team !== '').length;

    // Overdue: 24h+ past booked date, incomplete
    const overdue = jobs.filter(j => {
      if (isCompleted(j)) return false;
      if (!j.bookedDate) return false;
      const bd = j.bookedDate instanceof Date ? j.bookedDate : new Date(j.bookedDate);
      if (isNaN(bd.getTime())) return false;
      return bd.getTime() < now.getTime() && getHoursDifferenceGMT(now, bd) > 24;
    }).length;

    // Emergency/Urgent from descriptions (incomplete only)
    const incompleteJobs = jobs.filter(j => !isCompleted(j));
    const emergency = incompleteJobs.filter(j => isEmergencyOrCritical(j.description)).length;
    const urgent = incompleteJobs.filter(j => isUrgent(j.description)).length;

    // Unbooked breakdown (incomplete, no booked date)
    const unbookedJobs = incompleteJobs.filter(j => !j.bookedDate);
    const noAnswer = unbookedJobs.filter(j => j.status === 'no_answer').length;
    const voiceMessage = unbookedJobs.filter(j => j.status === 'voice_message').length;
    const callBack = unbookedJobs.filter(j => j.status === 'call_back').length;
    const noShow = unbookedJobs.filter(j => j.status === 'no_show').length;
    const totalUnbooked = unbookedJobs.length;

    // Booked (incomplete, has booked date)
    const booked = (allJobs || jobs).filter(j => {
      if (isCompleted(j)) return false;
      return !!j.bookedDate;
    }).length;

    // Other active statuses
    const awaitingTrade = incompleteJobs.filter(j => j.status === 'awaiting_trade').length;
    const ongoing = incompleteJobs.filter(j => j.isOngoing).length;
    const paused = incompleteJobs.filter(j => j.status === 'pause').length;

    // Active breakdown by status (mutually exclusive - every active job has exactly one status)
    const activeByStatus = {
      pending: incompleteJobs.filter(j => j.status === 'pending' || !j.status).length,
      started: incompleteJobs.filter(j => j.status === 'started').length,
      noAnswer: incompleteJobs.filter(j => j.status === 'no_answer').length,
      voiceMessage: incompleteJobs.filter(j => j.status === 'voice_message').length,
      callBack: incompleteJobs.filter(j => j.status === 'call_back').length,
      noShow: incompleteJobs.filter(j => j.status === 'no_show').length,
      awaitingTrade: incompleteJobs.filter(j => j.status === 'awaiting_trade').length,
      paused: incompleteJobs.filter(j => j.status === 'pause').length,
      leftProperty: incompleteJobs.filter(j => j.status === 'left_property').length,
      returnNph: incompleteJobs.filter(j => j.status === 'return_nph').length,
      jan2026: incompleteJobs.filter(j => j.status === 'jan2026').length,
    };
    const activeStatusSum = Object.values(activeByStatus).reduce((a, b) => a + b, 0);

    const avgProgress = jobs.length > 0 
      ? Math.round(jobs.reduce((sum, j) => sum + (j.progress || 0), 0) / jobs.length)
      : 0;

    return {
      total, complete, active, assigned, overdue,
      emergency, urgent,
      noAnswer, voiceMessage, callBack, noShow, totalUnbooked,
      booked, awaitingTrade, ongoing, paused, avgProgress,
      activeByStatus, activeStatusSum
    };
  }, [jobs, allJobs, now]);

  // Primary stats row
  const primaryStats = [
    { label: 'Total', value: counts.total, icon: Briefcase, color: 'text-primary', bg: 'bg-primary/10' },
    { label: 'Complete', value: counts.complete, icon: CheckCircle2, color: 'text-success', bg: 'bg-success/10' },
    { label: 'Active', value: counts.active, icon: Clock, color: 'text-warning', bg: 'bg-warning/10' },
    { label: 'Assigned', value: counts.assigned, icon: Users, color: 'text-primary', bg: 'bg-primary/10' },
    { label: 'Booked', value: counts.booked, icon: CalendarCheck, color: 'text-amber-600', bg: 'bg-amber-500/10' },
    { label: 'Overdue', value: counts.overdue, icon: AlertTriangle, color: 'text-destructive', bg: 'bg-destructive/10' },
    { label: 'Avg %', value: `${counts.avgProgress}%`, icon: TrendingUp, color: 'text-success', bg: 'bg-success/10' },
  ];

  // Breakdown categories (alerts - not mutually exclusive, cross-cutting)
  const breakdownStats = [
    { label: 'Emergency', value: counts.emergency, icon: Flame, color: 'text-red-600', bg: 'bg-red-500/10', show: counts.emergency > 0 },
    { label: 'Urgent', value: counts.urgent, icon: Zap, color: 'text-orange-600', bg: 'bg-orange-500/10', show: counts.urgent > 0 },
    { label: 'Ongoing', value: counts.ongoing, icon: Wrench, color: 'text-amber-600', bg: 'bg-amber-500/10', show: counts.ongoing > 0 },
  ];

  // Active breakdown - mutually exclusive by status (these sum to Active)
  const activeBreakdownStats = [
    { label: 'Pending', value: counts.activeByStatus.pending, icon: Clock, color: 'text-muted-foreground', bg: 'bg-muted/50', show: counts.activeByStatus.pending > 0 },
    { label: 'Started', value: counts.activeByStatus.started, icon: Wrench, color: 'text-blue-600', bg: 'bg-blue-500/10', show: counts.activeByStatus.started > 0 },
    { label: 'No Answer', value: counts.activeByStatus.noAnswer, icon: PhoneOff, color: 'text-orange-500', bg: 'bg-orange-400/10', show: counts.activeByStatus.noAnswer > 0 },
    { label: 'Voicemail', value: counts.activeByStatus.voiceMessage, icon: Voicemail, color: 'text-purple-500', bg: 'bg-purple-400/10', show: counts.activeByStatus.voiceMessage > 0 },
    { label: 'Call Back', value: counts.activeByStatus.callBack, icon: PhoneCall, color: 'text-cyan-600', bg: 'bg-cyan-500/10', show: counts.activeByStatus.callBack > 0 },
    { label: 'No Show', value: counts.activeByStatus.noShow, icon: EyeOff, color: 'text-red-500', bg: 'bg-red-400/10', show: counts.activeByStatus.noShow > 0 },
    { label: 'Awaiting Trade', value: counts.activeByStatus.awaitingTrade, icon: Wrench, color: 'text-violet-600', bg: 'bg-violet-500/10', show: counts.activeByStatus.awaitingTrade > 0 },
    { label: 'Paused', value: counts.activeByStatus.paused, icon: Pause, color: 'text-yellow-600', bg: 'bg-yellow-500/10', show: counts.activeByStatus.paused > 0 },
    { label: 'Left Property', value: counts.activeByStatus.leftProperty, icon: CheckCircle2, color: 'text-lime-600', bg: 'bg-lime-500/10', show: counts.activeByStatus.leftProperty > 0 },
    { label: 'Return NPH', value: counts.activeByStatus.returnNph, icon: AlertTriangle, color: 'text-pink-600', bg: 'bg-pink-500/10', show: counts.activeByStatus.returnNph > 0 },
    { label: 'Jan2026', value: counts.activeByStatus.jan2026, icon: CalendarCheck, color: 'text-teal-600', bg: 'bg-teal-500/10', show: counts.activeByStatus.jan2026 > 0 },
  ];

  const visibleBreakdown = breakdownStats.filter(s => s.show);
  const visibleActiveBreakdown = activeBreakdownStats.filter(s => s.show);

  return (
    <div ref={ref} className="flex flex-col gap-2 w-full">
      {/* Primary Stats */}
      <div className="flex flex-wrap gap-2">
        {primaryStats.map((stat) => (
          <TooltipProvider key={stat.label}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className={cn(
                  "flex items-center gap-2 bg-card border border-border rounded-lg px-3 py-2",
                  stat.label === 'Overdue' && counts.overdue > 0 && "border-destructive/50 bg-destructive/5"
                )}>
                  <div className={cn("w-7 h-7 rounded-md flex items-center justify-center", stat.bg)}>
                    <stat.icon className={cn("w-4 h-4", stat.color, stat.label === 'Overdue' && counts.overdue > 0 && "animate-pulse")} />
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className={cn("text-lg font-bold text-foreground", stat.label === 'Overdue' && counts.overdue > 0 && "text-destructive")}>{stat.value}</span>
                    <span className="text-xs text-muted-foreground">{stat.label}</span>
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">
                  {stat.label === 'Active' && `All incomplete jobs (Active + Complete = ${counts.total})`}
                  {stat.label === 'Complete' && `Jobs with status 'complete' or marked completed`}
                  {stat.label === 'Overdue' && `Incomplete jobs 24h+ past their booked date`}
                  {stat.label === 'Booked' && `Incomplete jobs with a booked date`}
                  {stat.label === 'Assigned' && `Incomplete jobs assigned to a team`}
                  {stat.label === 'Total' && `All jobs in this category`}
                  {stat.label === 'Avg %' && `Average progress across all jobs`}
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ))}
      </div>

      {/* Active Breakdown by Status - Collapsible */}
      {counts.active > 0 && visibleActiveBreakdown.length > 0 && (
        <Collapsible open={activeOpen} onOpenChange={setActiveOpen}>
          <CollapsibleTrigger className="w-full flex items-center gap-2 py-1 hover:bg-muted/30 rounded-md px-1 transition-colors">
            {activeOpen ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Active Breakdown</span>
            <span className={cn(
              "text-[10px]",
              counts.activeStatusSum === counts.active ? "text-success/70" : "text-destructive/70"
            )}>
              ({counts.activeStatusSum}/{counts.active}{counts.activeStatusSum === counts.active ? ' ✓' : ' ⚠️'})
            </span>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {visibleActiveBreakdown.map((stat) => (
                <div 
                  key={stat.label}
                  className={cn(
                    "flex items-center gap-1.5 border rounded-md px-2 py-1 text-xs",
                    stat.bg, "border-transparent"
                  )}
                >
                  <stat.icon className={cn("w-3.5 h-3.5", stat.color)} />
                  <span className={cn("font-semibold", stat.color)}>{stat.value}</span>
                  <span className="text-muted-foreground">{stat.label}</span>
                </div>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Priority & Ongoing alerts */}
      {visibleBreakdown.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {visibleBreakdown.map((stat) => (
            <div 
              key={stat.label}
              className={cn(
                "flex items-center gap-1.5 border rounded-md px-2 py-1 text-xs",
                stat.bg, "border-transparent"
              )}
            >
              <stat.icon className={cn("w-3.5 h-3.5", stat.color)} />
              <span className={cn("font-semibold", stat.color)}>{stat.value}</span>
              <span className="text-muted-foreground">{stat.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Monthly Breakdown - Collapsible */}
      <Collapsible open={monthlyOpen} onOpenChange={setMonthlyOpen}>
        <CollapsibleTrigger className="w-full flex items-center gap-2 py-1 hover:bg-muted/30 rounded-md px-1 transition-colors">
          {monthlyOpen ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Monthly Breakdown</span>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <MonthlyJobBreakdown jobs={jobs} />
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
});

StatsCards.displayName = 'StatsCards';
