import { forwardRef, useMemo, useState } from 'react';
import { Job } from '@/types/job';
import { MonthlyJobBreakdown } from './MonthlyJobBreakdown';
import { WeeklyTeamLeaderboard } from './WeeklyTeamLeaderboard';
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
  ChevronRight,
  BarChart3
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

export const StatsCards = forwardRef<HTMLDivElement, StatsCardsProps>(({ jobs, allJobs, tradeBookings }, ref) => {
  const [detailsOpen, setDetailsOpen] = useState(false);

  const counts = useMemo(() => {
    // Recompute "now" fresh on every jobs change so overdue stays accurate
    // through long sessions (avoids mount-time freeze drift).
    const now = getGMTNow();
    const nowMs = now.getTime();

    const total = jobs.length;
    let complete = 0;
    let assigned = 0;
    let overdue = 0;
    let emergency = 0;
    let urgent = 0;
    let noAnswer = 0;
    let voiceMessage = 0;
    let callBack = 0;
    let noShow = 0;
    let totalUnbooked = 0;
    let awaitingTrade = 0;
    let ongoing = 0;
    let paused = 0;
    let progressSum = 0;

    const activeByStatus = {
      pending: 0, started: 0, noAnswer: 0, voiceMessage: 0, callBack: 0,
      noShow: 0, awaitingTrade: 0, paused: 0, leftProperty: 0, returnNph: 0, jan2026: 0,
    };

    // Single pass over jobs for all incomplete-job counters.
    for (const j of jobs) {
      progressSum += j.progress || 0;
      if (isCompleted(j)) { complete++; continue; }

      // Incomplete only from here
      if (j.team != null && j.team !== '') assigned++;
      if (isEmergencyOrCritical(j.description)) emergency++;
      if (isUrgent(j.description)) urgent++;
      if (j.isOngoing) ongoing++;

      if (j.bookedDate) {
        const bd = j.bookedDate instanceof Date ? j.bookedDate : new Date(j.bookedDate);
        const bdMs = bd.getTime();
        if (!isNaN(bdMs) && bdMs < nowMs && getHoursDifferenceGMT(now, bd) > 24) {
          overdue++;
        }
      } else {
        totalUnbooked++;
        if (j.status === 'no_answer') noAnswer++;
        else if (j.status === 'voice_message') voiceMessage++;
        else if (j.status === 'call_back') callBack++;
        else if (j.status === 'no_show') noShow++;
      }

      switch (j.status) {
        case 'awaiting_trade': awaitingTrade++; activeByStatus.awaitingTrade++; break;
        case 'pause': paused++; activeByStatus.paused++; break;
        case 'started': activeByStatus.started++; break;
        case 'no_answer': activeByStatus.noAnswer++; break;
        case 'voice_message': activeByStatus.voiceMessage++; break;
        case 'call_back': activeByStatus.callBack++; break;
        case 'no_show': activeByStatus.noShow++; break;
        case 'left_property': activeByStatus.leftProperty++; break;
        case 'return_nph': activeByStatus.returnNph++; break;
        case 'jan2026': activeByStatus.jan2026++; break;
        case 'pending':
        case undefined:
        case null:
        case '':
          activeByStatus.pending++; break;
        default:
          if (!j.status) activeByStatus.pending++;
      }
    }

    const active = total - complete;

    // Booked uses a separate source (allJobs) so keep its own pass.
    const sourceJobs = allJobs || jobs;
    let booked = 0;
    for (const j of sourceJobs) {
      if (isCompleted(j)) continue;
      if (j.referBack) continue;
      if (j.bookedDate || (tradeBookings && tradeBookings.has(j.id))) booked++;
    }

    const activeStatusSum =
      activeByStatus.pending + activeByStatus.started + activeByStatus.noAnswer +
      activeByStatus.voiceMessage + activeByStatus.callBack + activeByStatus.noShow +
      activeByStatus.awaitingTrade + activeByStatus.paused + activeByStatus.leftProperty +
      activeByStatus.returnNph + activeByStatus.jan2026;

    const avgProgress = total > 0 ? Math.round(progressSum / total) : 0;

    return {
      total, complete, active, assigned, overdue,
      emergency, urgent,
      noAnswer, voiceMessage, callBack, noShow, totalUnbooked,
      booked, awaitingTrade, ongoing, paused, avgProgress,
      activeByStatus, activeStatusSum
    };
  }, [jobs, allJobs, tradeBookings]);

  const primaryStats = [
    { label: 'Total', value: counts.total, icon: Briefcase, color: 'text-primary', bg: 'bg-primary/10' },
    { label: 'Complete', value: counts.complete, icon: CheckCircle2, color: 'text-success', bg: 'bg-success/10' },
    { label: 'Active', value: counts.active, icon: Clock, color: 'text-warning', bg: 'bg-warning/10' },
    { label: 'Assigned', value: counts.assigned, icon: Users, color: 'text-primary', bg: 'bg-primary/10' },
    { label: 'Booked', value: counts.booked, icon: CalendarCheck, color: 'text-amber-600', bg: 'bg-amber-500/10' },
    { label: 'Overdue', value: counts.overdue, icon: AlertTriangle, color: 'text-destructive', bg: 'bg-destructive/10' },
    { label: 'Avg %', value: `${counts.avgProgress}%`, icon: TrendingUp, color: 'text-success', bg: 'bg-success/10' },
  ];

  const breakdownStats = [
    { label: 'Emergency', value: counts.emergency, icon: Flame, color: 'text-red-600', bg: 'bg-red-500/10', show: counts.emergency > 0 },
    { label: 'Urgent', value: counts.urgent, icon: Zap, color: 'text-orange-600', bg: 'bg-orange-500/10', show: counts.urgent > 0 },
    { label: 'Ongoing', value: counts.ongoing, icon: Wrench, color: 'text-amber-600', bg: 'bg-amber-500/10', show: counts.ongoing > 0 },
  ];

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

      {/* Collapsible Details Section - Active Breakdown + Alerts + Leaderboard + Monthly */}
      <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
        <CollapsibleTrigger className="w-full flex items-center gap-2 py-1 hover:bg-muted/30 rounded-md px-1 transition-colors">
          {detailsOpen ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
          <BarChart3 className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Analytics & Leaderboard</span>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="flex flex-col gap-2 pt-1">
            {/* Active Breakdown by Status */}
            {counts.active > 0 && visibleActiveBreakdown.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-1 mb-1">
                  Active Breakdown
                  <span className={cn(
                    "ml-1",
                    counts.activeStatusSum === counts.active ? "text-success/70" : "text-destructive/70"
                  )}>
                    ({counts.activeStatusSum}/{counts.active}{counts.activeStatusSum === counts.active ? ' ✓' : ' ⚠️'})
                  </span>
                </p>
                <div className="flex flex-wrap gap-1.5">
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
              </div>
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

            {/* Weekly Team Leaderboard */}
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-1 mb-1">
                🏆 Weekly Team Leaderboard (Mon–Sun)
              </p>
              <WeeklyTeamLeaderboard jobs={jobs} />
            </div>

            {/* Monthly Breakdown */}
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-1 mb-1">
                Monthly Breakdown
              </p>
              <MonthlyJobBreakdown jobs={jobs} />
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
});

StatsCards.displayName = 'StatsCards';
