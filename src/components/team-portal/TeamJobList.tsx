import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Job, JOB_STATUS_OPTIONS } from '@/types/job';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  RefreshCw,
  LogOut,
  MapPin,
  ChevronRight,
  ChevronDown,
  Briefcase,
  Loader2,
  Bell,
  BellOff,
  Calendar,
  Phone,
  Smartphone,
  CalendarDays,
  Crown,
  Users,
  CalendarCheck,
  ChevronsUpDown,
  Minus,
  Plus,
  ArrowUp,
  EyeOff,
  Languages,
  FolderOpen,
  AlertTriangle,
} from 'lucide-react';
import { format, isValid, isSameMonth, isSameDay, startOfMonth, isToday, isTomorrow, isYesterday } from 'date-fns';

// Parse a date string as local date to prevent timezone shift
const parseDateKeyAsLocal = (dateStr: string): Date => {
  const parts = dateStr.split('-').map(Number);
  if (parts.length >= 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }
  return new Date(dateStr);
};
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { useCapacitorPush } from '@/hooks/useCapacitorPush';
import { useTeamSettings } from '@/hooks/useTeamSettings';
import { useTranslation } from '@/hooks/useTranslation';
import { shouldShowOngoingAlert } from '@/hooks/useJobAlerts';
import { TeamDiary } from './TeamDiary';
import { LanguageSelector } from './LanguageSelector';
import { RemoveJobConfirmModal } from './RemoveJobConfirmModal';
import { OpsManagerNotes } from './OpsManagerNotes';
import { OpsAlertsPanel } from './OpsAlertsPanel';
import { TeamOverdueAlert } from './TeamOverdueAlert';
import { AwabsComplianceBadge } from '@/components/AwabsComplianceBadge';
import { cn } from '@/lib/utils';

// Helper to get contrasting text color
const getContrastTextColor = (hexColor: string): string => {
  if (!hexColor || !hexColor.startsWith('#')) return '#ffffff';
  const r = parseInt(hexColor.slice(1, 3), 16);
  const g = parseInt(hexColor.slice(3, 5), 16);
  const b = parseInt(hexColor.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#000000' : '#ffffff';
};

interface TeamJobListProps {
  jobs: Job[];
  teamName: string;
  teamId: string;
  isLoading: boolean;
  languagePreference: string;
  isOpsManager?: boolean;
  onSelectJob: (job: Job) => void;
  onRefresh: () => void;
  onLogout: () => void;
  onLanguageChange: (language: string) => void;
  onRemoveJob?: (jobId: string, jobNumber: string) => Promise<void>;
}

interface MonthGroup {
  monthKey: string;
  monthLabel: string;
  days: Map<string, Job[]>;
  totalJobs: number;
}

const getJobBookedDate = (job: Job): Date | null => {
  if (job.bookedDate) {
    if (job.bookedDate instanceof Date) {
      return isValid(job.bookedDate) ? job.bookedDate : null;
    }
    const d = parseDateKeyAsLocal(String(job.bookedDate));
    return isValid(d) ? d : null;
  }
  return null;
};

const getJobGroupDate = (job: Job): Date | null => {
  if (job.bookedDate) {
    if (job.bookedDate instanceof Date) {
      return isValid(job.bookedDate) ? job.bookedDate : null;
    }
    const d = parseDateKeyAsLocal(String(job.bookedDate));
    return isValid(d) ? d : null;
  }
  return null;
};

const getJobFallbackDate = (job: Job): Date => {
  const createdAt = job.createdAt instanceof Date ? job.createdAt : new Date(job.createdAt as any);
  if (isValid(createdAt)) return createdAt;
  if (job.dateIssued) {
    const date = new Date(job.dateIssued);
    if (isValid(date)) return date;
  }
  return new Date();
};

const groupJobsByMonthAndDay = (jobs: Job[]): { months: MonthGroup[], unscheduled: Job[] } => {
  const monthMap = new Map<string, Map<string, Job[]>>();
  const unscheduled: Job[] = [];

  for (const job of jobs) {
    const bookedDate = getJobBookedDate(job);
    if (bookedDate) {
      const monthKey = format(bookedDate, 'yyyy-MM');
      const dayKey = format(bookedDate, 'yyyy-MM-dd');
      if (!monthMap.has(monthKey)) monthMap.set(monthKey, new Map());
      const daysMap = monthMap.get(monthKey)!;
      if (!daysMap.has(dayKey)) daysMap.set(dayKey, []);
      daysMap.get(dayKey)!.push(job);
    } else {
      unscheduled.push(job);
    }
  }

  for (const [_, daysMap] of monthMap.entries()) {
    for (const [dayKey, dayJobs] of daysMap.entries()) {
      dayJobs.sort((a, b) => {
        const at = getJobBookedDate(a)?.getTime() || 0;
        const bt = getJobBookedDate(b)?.getTime() || 0;
        return at - bt;
      });
    }
  }

  const months: MonthGroup[] = [];
  const sortedMonthKeys = Array.from(monthMap.keys()).sort((a, b) => a.localeCompare(b));
  
  for (const monthKey of sortedMonthKeys) {
    const daysMap = monthMap.get(monthKey)!;
    const sortedDays = new Map<string, Job[]>();
    const sortedDayKeys = Array.from(daysMap.keys()).sort((a, b) => a.localeCompare(b));
    let totalJobs = 0;
    for (const dayKey of sortedDayKeys) {
      const jobs = daysMap.get(dayKey)!;
      sortedDays.set(dayKey, jobs);
      totalJobs += jobs.length;
    }
    const monthDate = parseDateKeyAsLocal(`${monthKey}-01`);
    months.push({ monthKey, monthLabel: format(monthDate, 'MMMM yyyy'), days: sortedDays, totalJobs });
  }

  return { months, unscheduled };
};

const groupJobsByMonthAndDayDesc = (jobs: Job[]): { months: MonthGroup[], unscheduled: Job[] } => {
  const monthMap = new Map<string, Map<string, Job[]>>();
  const unscheduled: Job[] = [];

  for (const job of jobs) {
    const bookedDate = getJobGroupDate(job);
    if (bookedDate) {
      const monthKey = format(bookedDate, 'yyyy-MM');
      const dayKey = format(bookedDate, 'yyyy-MM-dd');
      if (!monthMap.has(monthKey)) monthMap.set(monthKey, new Map());
      const daysMap = monthMap.get(monthKey)!;
      if (!daysMap.has(dayKey)) daysMap.set(dayKey, []);
      daysMap.get(dayKey)!.push(job);
    } else {
      unscheduled.push(job);
    }
  }

  for (const [_, daysMap] of monthMap.entries()) {
    for (const [dayKey, dayJobs] of daysMap.entries()) {
      dayJobs.sort((a, b) => (getJobBookedDate(a)?.getTime() || 0) - (getJobBookedDate(b)?.getTime() || 0));
    }
  }

  unscheduled.sort((a, b) => getJobFallbackDate(b).getTime() - getJobFallbackDate(a).getTime());

  const months: MonthGroup[] = [];
  const currentMonth = format(new Date(), 'yyyy-MM');
  const allMonthKeys = Array.from(monthMap.keys());
  const futureMonths = allMonthKeys.filter(k => k >= currentMonth).sort((a, b) => a.localeCompare(b));
  const pastMonths = allMonthKeys.filter(k => k < currentMonth).sort((a, b) => b.localeCompare(a));
  const sortedMonthKeys = [...futureMonths, ...pastMonths];
  
  for (const monthKey of sortedMonthKeys) {
    const daysMap = monthMap.get(monthKey)!;
    const sortedDays = new Map<string, Job[]>();
    const sortedDayKeys = Array.from(daysMap.keys()).sort((a, b) => a.localeCompare(b));
    let totalJobs = 0;
    for (const dayKey of sortedDayKeys) {
      const jobs = daysMap.get(dayKey)!;
      sortedDays.set(dayKey, jobs);
      totalJobs += jobs.length;
    }
    const monthDate = parseDateKeyAsLocal(`${monthKey}-01`);
    months.push({ monthKey, monthLabel: format(monthDate, 'MMMM yyyy'), days: sortedDays, totalJobs });
  }

  return { months, unscheduled };
};

export const TeamJobList = ({
  jobs,
  teamName,
  teamId,
  isLoading,
  languagePreference,
  isOpsManager = false,
  onSelectJob,
  onRefresh,
  onLogout,
  onLanguageChange,
  onRemoveJob,
}: TeamJobListProps) => {
  const {
    isSupported: webPushSupported,
    isSubscribed: webPushSubscribed,
    isLoading: webPushLoading,
    subscribe: webSubscribe,
    unsubscribe: webUnsubscribe,
  } = usePushNotifications(teamId);

  const {
    isSupported: nativePushSupported,
    isRegistered: nativePushRegistered,
    isLoading: nativePushLoading,
    register: nativeRegister,
    unregister: nativeUnregister,
  } = useCapacitorPush(teamId);

  const [expandedJobs, setExpandedJobs] = useState<Set<string>>(new Set());
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<'jobs' | 'diary' | 'workload'>('jobs');
  const [teamFilter, setTeamFilter] = useState<string | null>(null);
  const [todayOnlyFilter, setTodayOnlyFilter] = useState(false);
  const [removingJobId, setRemovingJobId] = useState<string | null>(null);
  const [jobToRemove, setJobToRemove] = useState<Job | null>(null);
  
  const { translateToUserLanguage } = useTranslation(languagePreference);
  const [translatedSummaries, setTranslatedSummaries] = useState<Record<string, string>>({});
  const [isTranslatingList, setIsTranslatingList] = useState(false);
  const translatedIdsRef = useRef<Set<string>>(new Set());
  
  useEffect(() => {
    setTranslatedSummaries({});
    translatedIdsRef.current = new Set();
  }, [languagePreference]);
  
  useEffect(() => {
    const translateExpandedJobSummaries = async () => {
      if (languagePreference === 'en') return;
      const expandedJobIds = Array.from(expandedJobs);
      if (expandedJobIds.length === 0) return;
      const jobsToTranslate = jobs.filter(j => 
        expandedJobIds.includes(j.id) && j.summaryOfWorks && !translatedIdsRef.current.has(j.id)
      );
      if (jobsToTranslate.length === 0) return;
      setIsTranslatingList(true);
      for (const job of jobsToTranslate) {
        if (job.summaryOfWorks) {
          try {
            translatedIdsRef.current.add(job.id);
            const translated = await translateToUserLanguage(job.summaryOfWorks);
            setTranslatedSummaries(prev => ({ ...prev, [job.id]: translated }));
          } catch (error) {
            console.error('Translation error:', error);
            translatedIdsRef.current.delete(job.id);
          }
        }
      }
      setIsTranslatingList(false);
    };
    translateExpandedJobSummaries();
  }, [languagePreference, expandedJobs, jobs, translateToUserLanguage]);

  const { settings: teamSettings } = useTeamSettings();

  const getTeamColor = (teamName: string): string | undefined => {
    const team = teamSettings.find(t => t.teamName === teamName);
    return team?.color || undefined;
  };

  const getStatusColor = (status: string) => {
    const option = JOB_STATUS_OPTIONS.find(o => o.value === status);
    return option?.color || '#6B7280';
  };

  const getStatusLabel = (status: string) => {
    const option = JOB_STATUS_OPTIONS.find(o => o.value === status);
    return option?.label || status;
  };

  const toggleExpand = (jobId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedJobs(prev => {
      const next = new Set(prev);
      if (next.has(jobId)) next.delete(jobId); else next.add(jobId);
      return next;
    });
  };

  const toggleMonth = (monthKey: string) => {
    setExpandedMonths(prev => {
      const next = new Set(prev);
      if (next.has(monthKey)) next.delete(monthKey); else next.add(monthKey);
      return next;
    });
  };

  const toggleDay = (dayKey: string) => {
    setExpandedDays(prev => {
      const next = new Set(prev);
      if (next.has(dayKey)) next.delete(dayKey); else next.add(dayKey);
      return next;
    });
  };

  const handleRemoveJobClick = (job: Job, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onRemoveJob || removingJobId) return;
    setJobToRemove(job);
  };

  const confirmRemoveJob = async () => {
    if (!jobToRemove || !onRemoveJob) return;
    setRemovingJobId(jobToRemove.id);
    try { await onRemoveJob(jobToRemove.id, jobToRemove.jobNumber); }
    finally { setRemovingJobId(null); setJobToRemove(null); }
  };

  const cancelRemoveJob = () => { if (!removingJobId) setJobToRemove(null); };

  const teamWorkloadCounts = useMemo(() => {
    if (!isOpsManager) return new Map<string, { active: number; completed: number }>();
    const counts = new Map<string, { active: number; completed: number }>();
    for (const job of jobs) {
      const team = job.team || 'Unassigned';
      if (!counts.has(team)) counts.set(team, { active: 0, completed: 0 });
      if (job.isCompleted) counts.get(team)!.completed++; else counts.get(team)!.active++;
    }
    return new Map([...counts.entries()].sort((a, b) => b[1].active - a[1].active));
  }, [isOpsManager, jobs]);

  const filteredJobs = useMemo(() => {
    let result = jobs;
    if (teamFilter) result = result.filter(j => (j.team || 'Unassigned') === teamFilter);
    if (todayOnlyFilter && isOpsManager) {
      const todayStr = format(new Date(), 'yyyy-MM-dd');
      result = result.filter(j => {
        if (!j.bookedDate) return false;
        const jobDate = getJobBookedDate(j);
        if (!jobDate) return false;
        return format(jobDate, 'yyyy-MM-dd') === todayStr;
      });
    }
    return result;
  }, [jobs, teamFilter, todayOnlyFilter, isOpsManager]);

  const activeJobs = filteredJobs.filter(j => !j.isCompleted);
  const completedJobs = filteredJobs.filter(j => j.isCompleted);
  const totalActiveJobs = jobs.filter(j => !j.isCompleted).length;

  const { groupedActiveMonths, activeUnscheduled } = useMemo(() => {
    if (isOpsManager) {
      const result = groupJobsByMonthAndDayDesc(activeJobs);
      return { groupedActiveMonths: result.months, activeUnscheduled: result.unscheduled };
    } else {
      const result = groupJobsByMonthAndDay(activeJobs);
      return { groupedActiveMonths: result.months, activeUnscheduled: result.unscheduled };
    }
  }, [isOpsManager, activeJobs]);

  const { groupedCompletedMonths, completedUnscheduled } = useMemo(() => {
    if (isOpsManager) {
      const result = groupJobsByMonthAndDayDesc(completedJobs);
      return { groupedCompletedMonths: result.months, completedUnscheduled: result.unscheduled };
    } else {
      const result = groupJobsByMonthAndDay(completedJobs);
      return { groupedCompletedMonths: result.months, completedUnscheduled: result.unscheduled };
    }
  }, [isOpsManager, completedJobs]);

  const unscheduledJobs = activeUnscheduled;
  const todayKey = format(new Date(), 'yyyy-MM-dd');
  const currentMonthKey = format(new Date(), 'yyyy-MM');
  
  useEffect(() => {
    setExpandedMonths(new Set([currentMonthKey]));
    setExpandedDays(new Set([todayKey]));
  }, [currentMonthKey, todayKey]);

  const allMonthKeys = useMemo(() => groupedActiveMonths.map(m => m.monthKey), [groupedActiveMonths]);

  const allDayKeys = useMemo(() => {
    const keys: string[] = [];
    for (const month of groupedActiveMonths) {
      for (const dayKey of month.days.keys()) keys.push(dayKey);
    }
    if (unscheduledJobs.length > 0) keys.push('unscheduled');
    return keys;
  }, [groupedActiveMonths, unscheduledJobs]);

  const expandAllGroups = useCallback(() => {
    setExpandedMonths(new Set(allMonthKeys));
    setExpandedDays(new Set(allDayKeys));
  }, [allMonthKeys, allDayKeys]);

  const collapseAllGroups = useCallback(() => {
    setExpandedMonths(new Set());
    setExpandedDays(new Set());
  }, []);

  const jumpToToday = useCallback(() => {
    setExpandedMonths(new Set([currentMonthKey]));
    setExpandedDays(new Set([todayKey]));
  }, [currentMonthKey, todayKey]);

  const formatDayHeader = (dateKey: string): string => {
    try {
      const date = parseDateKeyAsLocal(dateKey);
      if (isToday(date)) return `Today — ${format(date, 'EEEE d')}`;
      if (isTomorrow(date)) return `Tomorrow — ${format(date, 'EEEE d')}`;
      if (isYesterday(date)) return `Yesterday — ${format(date, 'EEEE d')}`;
      return format(date, 'EEEE, d');
    } catch { return dateKey; }
  };

  const getDayBadgeStyle = (dateKey: string): string => {
    try {
      const date = parseDateKeyAsLocal(dateKey);
      if (isToday(date)) return 'bg-primary text-primary-foreground';
      if (isTomorrow(date)) return 'bg-blue-500 text-white';
      return '';
    } catch { return ''; }
  };

  // ============ V2 Job Card ============
  const renderJobCard = (job: Job, showTeamBadge: boolean = false) => {
    const alertInfo = shouldShowOngoingAlert(job, false);
    const isOverdue = alertInfo.showAlert && alertInfo.isAutoTriggered;
    const progressValue = job.progress || 0;
    
    // Color-coded left border based on status
    const getCardBorderColor = () => {
      if (isOverdue) return 'border-l-destructive';
      if (job.isCompleted || progressValue === 100) return 'border-l-[hsl(var(--success))]';
      if (progressValue > 50) return 'border-l-blue-500';
      return 'border-l-primary';
    };
    
    return (
    <div key={job.id} className="group">
      <div 
        className={cn(
          "bg-card rounded-xl border border-border/60 shadow-sm hover:shadow-md transition-all cursor-pointer active:scale-[0.98]",
          "border-l-[4px]",
          getCardBorderColor(),
          isOverdue && "bg-destructive/5"
        )}
        onClick={() => onSelectJob(job)}
      >
        <div className="p-3">
          {/* Row 1: Job number + Status + Team */}
          <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
            <span className="font-mono text-[11px] font-bold text-muted-foreground">
              #{job.jobNumber}
            </span>
            <Badge 
              style={{ backgroundColor: getStatusColor(job.status), color: 'white' }}
              className="text-[10px] px-1.5 py-0 h-[18px] rounded-full"
            >
              {getStatusLabel(job.status)}
            </Badge>
            {isOverdue && (
              <Badge className="text-[10px] px-1.5 py-0 h-[18px] rounded-full bg-destructive text-destructive-foreground animate-pulse">
                <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
                OVERDUE
              </Badge>
            )}
            {job.isOngoing && !isOverdue && (
              <Badge className="text-[10px] px-1.5 py-0 h-[18px] rounded-full bg-amber-500 text-white">
                Ongoing
              </Badge>
            )}
            {showTeamBadge && job.team && (
              <Badge 
                className="text-[10px] px-1.5 py-0 h-[18px] rounded-full"
                style={getTeamColor(job.team) ? {
                  backgroundColor: getTeamColor(job.team),
                  color: getContrastTextColor(getTeamColor(job.team)!)
                } : undefined}
                variant={getTeamColor(job.team) ? undefined : "secondary"}
              >
                {job.team}
              </Badge>
            )}
            <AwabsComplianceBadge job={job} hasContactHistory={false} compact />
          </div>

          {/* Row 2: Name */}
          <h3 className="font-semibold text-[13px] text-foreground line-clamp-1 mb-1">
            {job.name}
          </h3>

          {/* Row 3: Address & Phone — always visible */}
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground mb-2">
            {job.address && (
              <span className="flex items-center gap-0.5 truncate flex-1 min-w-0">
                <MapPin className="h-3 w-3 flex-shrink-0 text-primary/60" />
                <span className="truncate">{job.address}</span>
              </span>
            )}
            {job.phoneNumber && (
              <a 
                href={`tel:${job.phoneNumber}`}
                className="flex items-center gap-0.5 flex-shrink-0 text-primary hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                <Phone className="h-3 w-3" />
                {job.phoneNumber}
              </a>
            )}
          </div>

          {/* Row 4: Progress bar — thicker & colored */}
          <div className="flex items-center gap-2">
            <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
              <div 
                className={cn(
                  "h-full rounded-full transition-all duration-500",
                  progressValue === 100 ? "bg-[hsl(var(--success))]" :
                  progressValue > 50 ? "bg-blue-500" :
                  "bg-primary"
                )}
                style={{ width: `${progressValue}%` }}
              />
            </div>
            <span className={cn(
              "text-[11px] font-bold min-w-[32px] text-right",
              progressValue === 100 ? "text-[hsl(var(--success))]" :
              progressValue > 50 ? "text-blue-500" :
              "text-primary"
            )}>
              {progressValue}%
            </span>
          </div>
        </div>

        {/* Expandable detail section */}
        {expandedJobs.has(job.id) && (
          <div className="px-3 pb-3 pt-0 space-y-2 border-t border-border/50">
            <div className="pt-2 space-y-1.5">
              {job.address && (
                <a 
                  href={`https://maps.google.com/?q=${encodeURIComponent(job.address)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-1.5 text-xs text-primary hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MapPin className="h-3 w-3 mt-0.5 flex-shrink-0" />
                  <span className="line-clamp-2">{job.address}</span>
                </a>
              )}
              {(job.summaryOfWorks || job.description) && (
                <div className="mt-1.5 bg-muted/50 p-2 rounded-lg space-y-1">
                  {isTranslatingList && !translatedSummaries[job.id] && languagePreference !== 'en' && (
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground mb-0.5">
                      <Loader2 className="h-2.5 w-2.5 animate-spin" />
                      <span>Translating...</span>
                    </div>
                  )}
                  {job.summaryOfWorks && (
                    <p className="text-xs text-muted-foreground line-clamp-3">
                      {languagePreference !== 'en' && translatedSummaries[job.id]
                        ? translatedSummaries[job.id]
                        : job.summaryOfWorks}
                    </p>
                  )}
                  {job.description && (
                    <div className="border-t border-border/50 pt-1">
                      <p className="text-xs text-muted-foreground/80 line-clamp-4 whitespace-pre-wrap">
                        {job.description}
                      </p>
                    </div>
                  )}
                </div>
              )}
              <div className="flex gap-2 mt-2">
                <Button className="flex-1 h-9 text-xs rounded-lg" size="sm" onClick={() => onSelectJob(job)}>
                  View & Update Job
                </Button>
                {onRemoveJob && !isOpsManager && (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="h-9 text-destructive hover:bg-destructive hover:text-destructive-foreground rounded-lg"
                    onClick={(e) => handleRemoveJobClick(job, e)}
                    disabled={removingJobId === job.id}
                  >
                    {removingJobId === job.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <EyeOff className="h-3.5 w-3.5" />
                    )}
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Expand toggle below card */}
      <div className="flex justify-center -mt-1.5 mb-1">
        <button
          className="text-muted-foreground/40 hover:text-muted-foreground transition-colors p-0.5"
          onClick={(e) => toggleExpand(job.id, e)}
        >
          {expandedJobs.has(job.id) ? (
            <ChevronDown className="h-4 w-4 rotate-180" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </button>
      </div>
    </div>
  );
  };

  return (
    <div className="pb-20 min-h-screen safe-area-bottom bg-background">
      {/* V2 Header — Single row, compact */}
      <div className={cn(
        "text-primary-foreground sticky top-0 z-10 shadow-lg safe-area-top safe-area-left safe-area-right",
        isOpsManager 
          ? "bg-gradient-to-r from-[hsl(220,25%,10%)] to-[hsl(220,25%,18%)]" 
          : "bg-gradient-to-r from-primary to-[hsl(38,92%,50%)]"
      )}>
        <div className="px-3 py-2.5">
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              {isOpsManager ? (
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-lg bg-white/10 flex items-center justify-center">
                    <Crown className="h-4 w-4 text-yellow-300" />
                  </div>
                  <div>
                    <h1 className="text-sm font-bold tracking-wide">OPS MANAGER</h1>
                    <p className="text-primary-foreground/60 text-[10px]">
                      {totalActiveJobs} active across all teams
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-lg bg-white/15 flex items-center justify-center">
                    <Briefcase className="h-4 w-4" />
                  </div>
                  <div>
                    <h1 className="text-sm font-bold">{teamName}</h1>
                    <p className="text-primary-foreground/70 text-[10px]">
                      {activeJobs.length} active job{activeJobs.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>
              )}
            </div>
            <div className="flex gap-1 flex-shrink-0">
              {nativePushSupported && (
                <Button variant="ghost" size="icon" className="h-8 w-8 text-primary-foreground/80 hover:text-primary-foreground hover:bg-white/10"
                  onClick={() => nativePushRegistered ? nativeUnregister() : nativeRegister()} disabled={nativePushLoading}>
                  <Smartphone className={cn("h-3.5 w-3.5", nativePushRegistered && "text-green-400")} />
                </Button>
              )}
              {webPushSupported && !nativePushSupported && (
                <Button variant="ghost" size="icon" className="h-8 w-8 text-primary-foreground/80 hover:text-primary-foreground hover:bg-white/10"
                  onClick={() => webPushSubscribed ? webUnsubscribe() : webSubscribe()} disabled={webPushLoading}>
                  {webPushSubscribed ? <Bell className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5" />}
                </Button>
              )}
              <Button variant="ghost" size="icon" className="h-8 w-8 text-primary-foreground/80 hover:text-primary-foreground hover:bg-white/10"
                onClick={onRefresh} disabled={isLoading}>
                <RefreshCw className={cn("h-3.5 w-3.5", isLoading && 'animate-spin')} />
              </Button>
              <LanguageSelector currentLanguage={languagePreference} onLanguageChange={onLanguageChange} />
              <Button variant="ghost" size="icon" className="h-8 w-8 text-primary-foreground/80 hover:text-primary-foreground hover:bg-white/10"
                onClick={onLogout}>
                <LogOut className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'jobs' | 'diary' | 'workload')} className="w-full">
        <div className="border-b border-border bg-card sticky top-[calc(52px+env(safe-area-inset-top,0px))] z-[5] safe-area-left safe-area-right">
          <TabsList className="w-full justify-start rounded-none h-auto p-0 bg-transparent">
            <TabsTrigger value="jobs" className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent py-2.5 text-xs font-medium">
              <Briefcase className="h-3.5 w-3.5 mr-1.5" />
              Jobs ({activeJobs.length})
            </TabsTrigger>
            {isOpsManager && (
              <TabsTrigger value="workload" className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent py-2.5 text-xs font-medium">
                <Users className="h-3.5 w-3.5 mr-1.5" />
                Teams
              </TabsTrigger>
            )}
            <TabsTrigger value="diary" className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent py-2.5 text-xs font-medium">
              <CalendarDays className="h-3.5 w-3.5 mr-1.5" />
              {isOpsManager ? 'All Teams' : 'My Diary'}
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Team Workload Tab (Ops Manager only) */}
        {isOpsManager && (
          <TabsContent value="workload" className="p-3 mt-0">
            <div className="space-y-2">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">Team Workload</h2>
              {teamFilter && (
                <Button variant="outline" size="sm" onClick={() => { setTeamFilter(null); setActiveTab('jobs'); }} className="mb-2 h-7 text-xs">
                  <Minus className="h-3 w-3 mr-1" />Clear filter: {teamFilter}
                </Button>
              )}
              <div className="grid grid-cols-2 gap-2">
                {Array.from(teamWorkloadCounts.entries()).map(([team, counts]) => {
                  const teamColor = getTeamColor(team);
                  return (
                    <Card key={team} className={cn("cursor-pointer hover:opacity-90 transition-all overflow-hidden rounded-xl", teamFilter === team && "ring-2 ring-primary")}
                      style={teamColor ? { borderLeftWidth: '3px', borderLeftColor: teamColor } : undefined}
                      onClick={() => { setTeamFilter(team); setActiveTab('jobs'); }}>
                      <CardContent className="p-2 flex flex-col gap-1">
                        <div className="flex items-center gap-1.5">
                          <div className="h-5 w-5 rounded-full flex items-center justify-center flex-shrink-0"
                            style={{ backgroundColor: teamColor || 'hsl(var(--muted))', color: teamColor ? getContrastTextColor(teamColor) : 'hsl(var(--muted-foreground))' }}>
                            <Users className="h-3 w-3" />
                          </div>
                          <span className="font-medium text-xs truncate">{team}</span>
                        </div>
                        <div className="flex gap-1">
                          <Badge className="text-[10px] px-1" style={teamColor ? { backgroundColor: teamColor, color: getContrastTextColor(teamColor) } : undefined}>{counts.active}</Badge>
                          <Badge variant="secondary" className="text-[10px] px-1">✓{counts.completed}</Badge>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          </TabsContent>
        )}

        <TabsContent value="diary" className="p-3 mt-0">
          <TeamDiary teamId={teamId} teamName={teamName} />
        </TabsContent>

        <TabsContent value="jobs" className="mt-0">
          <div className="p-3 space-y-2">
            {/* Ops Manager tools */}
            {isOpsManager && (
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <OpsManagerNotes teamId={teamId} teamName={teamName} />
                <OpsAlertsPanel jobs={jobs} onJobClick={onSelectJob} />
              </div>
            )}
            
            {/* Overdue Alert — V2 thin strip */}
            {!isOpsManager && (
              <TeamOverdueAlert jobs={jobs} teamName={teamName} onJobClick={onSelectJob} />
            )}

            {/* Controls row */}
            <div className="flex flex-wrap items-center gap-1.5 mb-2">
              {isOpsManager && (
                <Button variant={todayOnlyFilter ? "default" : "outline"} size="sm" onClick={() => setTodayOnlyFilter(!todayOnlyFilter)}
                  className={cn("text-xs h-7 px-2.5 rounded-full", todayOnlyFilter && "bg-[hsl(var(--success))] hover:bg-[hsl(var(--success))]/90 text-white")}>
                  <CalendarCheck className="h-3 w-3 mr-1" />Today Only
                </Button>
              )}
              {teamFilter && (
                <Button variant="outline" size="sm" onClick={() => setTeamFilter(null)} className="text-xs h-7 px-2 rounded-full">
                  <Minus className="h-3 w-3 mr-1" />{teamFilter}
                </Button>
              )}
              <div className="flex-1" />
              <Button variant="ghost" size="sm" onClick={expandAllGroups} className="text-[10px] h-6 px-2"><Plus className="h-3 w-3 mr-0.5" />All</Button>
              <Button variant="ghost" size="sm" onClick={collapseAllGroups} className="text-[10px] h-6 px-2"><Minus className="h-3 w-3 mr-0.5" />Close</Button>
              <Button variant="ghost" size="sm" onClick={jumpToToday} className="text-[10px] h-6 px-2"><ArrowUp className="h-3 w-3 mr-0.5" />Today</Button>
            </div>

            {isLoading && jobs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
                <p className="text-muted-foreground text-sm">Loading jobs...</p>
              </div>
            ) : filteredJobs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16">
                <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
                  <Briefcase className="h-8 w-8 text-muted-foreground/50" />
                </div>
                <p className="text-base font-medium text-muted-foreground">
                  {teamFilter ? `No jobs for ${teamFilter}` : 'No jobs assigned'}
                </p>
                <p className="text-xs text-muted-foreground/80 text-center px-4 mt-1">
                  {teamFilter ? 'Try clearing the filter' : 'Jobs assigned to your team will appear here'}
                </p>
                {teamFilter && (
                  <Button variant="outline" size="sm" className="mt-3 h-7 text-xs rounded-full" onClick={() => setTeamFilter(null)}>Clear Filter</Button>
                )}
              </div>
            ) : (
              <>
                {/* Active Jobs */}
                {activeJobs.length > 0 && (
                  <div className="space-y-2">
                    <h2 className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest px-1">
                      Active ({activeJobs.length})
                    </h2>
                    
                    {groupedActiveMonths.map((monthGroup) => (
                      <Collapsible key={monthGroup.monthKey} open={expandedMonths.has(monthGroup.monthKey)} onOpenChange={() => toggleMonth(monthGroup.monthKey)}>
                        <CollapsibleTrigger asChild>
                          <div className="cursor-pointer rounded-xl bg-primary/5 border border-primary/15 px-3 py-2 flex items-center justify-between hover:bg-primary/10 transition-colors">
                            <div className="flex items-center gap-2">
                              {expandedMonths.has(monthGroup.monthKey) ? <ChevronDown className="h-4 w-4 text-primary" /> : <ChevronRight className="h-4 w-4 text-primary" />}
                              <FolderOpen className="h-4 w-4 text-primary" />
                              <span className="font-semibold text-sm">{monthGroup.monthLabel}</span>
                            </div>
                            <Badge className="text-[10px] bg-primary/15 text-primary hover:bg-primary/15 rounded-full">
                              {monthGroup.totalJobs}
                            </Badge>
                          </div>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="space-y-1.5 mt-1.5 ml-3 border-l-2 border-primary/20 pl-3">
                          {Array.from(monthGroup.days.entries()).map(([dayKey, dayJobs]) => (
                            <Collapsible key={dayKey} open={expandedDays.has(dayKey)} onOpenChange={() => toggleDay(dayKey)}>
                              <CollapsibleTrigger asChild>
                                <div className={cn(
                                  "cursor-pointer rounded-lg px-3 py-2 flex items-center justify-between hover:bg-muted/50 transition-colors",
                                  isToday(parseDateKeyAsLocal(dayKey)) && "bg-primary/8 border border-primary/20"
                                )}>
                                  <div className="flex items-center gap-1.5">
                                    {expandedDays.has(dayKey) ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                                    <Calendar className="h-3.5 w-3.5 text-primary/70" />
                                    <span className="font-medium text-xs">{formatDayHeader(dayKey)}</span>
                                  </div>
                                  <Badge variant="secondary" className={cn("text-[10px] px-1.5 rounded-full", getDayBadgeStyle(dayKey))}>
                                    {dayJobs.length}
                                  </Badge>
                                </div>
                              </CollapsibleTrigger>
                              <CollapsibleContent className="space-y-1 mt-1.5 ml-2 pl-2">
                                {dayJobs.map((job) => renderJobCard(job, isOpsManager))}
                              </CollapsibleContent>
                            </Collapsible>
                          ))}
                        </CollapsibleContent>
                      </Collapsible>
                    ))}

                    {/* Unscheduled */}
                    {unscheduledJobs.length > 0 && (
                      <Collapsible open={expandedDays.has('unscheduled')} onOpenChange={() => toggleDay('unscheduled')}>
                        <CollapsibleTrigger asChild>
                          <div className="cursor-pointer rounded-xl border border-dashed border-border px-3 py-2 flex items-center justify-between hover:bg-muted/50 transition-colors">
                            <div className="flex items-center gap-1.5">
                              {expandedDays.has('unscheduled') ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                              <Briefcase className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="font-medium text-xs text-muted-foreground">Unscheduled</span>
                            </div>
                            <Badge variant="outline" className="text-[10px] px-1.5 rounded-full">{unscheduledJobs.length}</Badge>
                          </div>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="space-y-1 mt-1.5 ml-3 pl-3">
                          {unscheduledJobs.map((job) => renderJobCard(job, false))}
                        </CollapsibleContent>
                      </Collapsible>
                    )}
                  </div>
                )}

                {/* Completed */}
                {completedJobs.length > 0 && (
                  <div className="space-y-2 mt-4">
                    <h2 className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest px-1">
                      Completed ({completedJobs.length})
                    </h2>
                    {groupedCompletedMonths.slice(0, 3).map((monthGroup) => (
                      <Collapsible key={`completed-${monthGroup.monthKey}`} open={expandedMonths.has(`completed-${monthGroup.monthKey}`)} onOpenChange={() => toggleMonth(`completed-${monthGroup.monthKey}`)}>
                        <CollapsibleTrigger asChild>
                          <div className="cursor-pointer rounded-xl bg-[hsl(var(--success))]/5 border border-[hsl(var(--success))]/15 px-3 py-2 flex items-center justify-between opacity-80 hover:opacity-100 transition-all">
                            <div className="flex items-center gap-2">
                              {expandedMonths.has(`completed-${monthGroup.monthKey}`) ? <ChevronDown className="h-4 w-4 text-[hsl(var(--success))]" /> : <ChevronRight className="h-4 w-4 text-[hsl(var(--success))]" />}
                              <FolderOpen className="h-4 w-4 text-[hsl(var(--success))]" />
                              <span className="font-semibold text-sm">{monthGroup.monthLabel}</span>
                            </div>
                            <Badge className="text-[10px] bg-[hsl(var(--success))]/15 text-[hsl(var(--success))] hover:bg-[hsl(var(--success))]/15 rounded-full">
                              {monthGroup.totalJobs} done
                            </Badge>
                          </div>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="space-y-1.5 mt-1.5 ml-3 border-l-2 border-[hsl(var(--success))]/15 pl-3">
                          {Array.from(monthGroup.days.entries()).slice(0, 5).map(([dayKey, dayJobs]) => (
                            <Collapsible key={`completed-${dayKey}`} open={expandedDays.has(`completed-${dayKey}`)} onOpenChange={() => toggleDay(`completed-${dayKey}`)}>
                              <CollapsibleTrigger asChild>
                                <div className="cursor-pointer rounded-lg px-3 py-2 flex items-center justify-between opacity-80 hover:opacity-100">
                                  <div className="flex items-center gap-1.5">
                                    {expandedDays.has(`completed-${dayKey}`) ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                                    <Calendar className="h-3.5 w-3.5 text-[hsl(var(--success))]" />
                                    <span className="font-medium text-xs">{formatDayHeader(dayKey)}</span>
                                  </div>
                                  <Badge variant="secondary" className="text-[10px] px-1.5 bg-[hsl(var(--success))]/15 text-[hsl(var(--success))] rounded-full">{dayJobs.length}</Badge>
                                </div>
                              </CollapsibleTrigger>
                              <CollapsibleContent className="space-y-1 mt-1.5 ml-2 pl-2">
                                {dayJobs.map((job) => (
                                  <div key={job.id} className="bg-[hsl(var(--success))]/5 rounded-xl border border-[hsl(var(--success))]/15 p-2.5 opacity-80 hover:opacity-100 transition-all cursor-pointer" onClick={() => onSelectJob(job)}>
                                    <div className="flex items-center gap-1 mb-0.5">
                                      <span className="font-mono text-[10px] text-muted-foreground">{job.jobNumber}</span>
                                      <Badge className="text-[9px] px-1 py-0 bg-[hsl(var(--success))] text-white rounded-full">Complete</Badge>
                                    </div>
                                    <h3 className="font-medium text-xs truncate">{job.name}</h3>
                                  </div>
                                ))}
                              </CollapsibleContent>
                            </Collapsible>
                          ))}
                        </CollapsibleContent>
                      </Collapsible>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <RemoveJobConfirmModal job={jobToRemove} isOpen={!!jobToRemove} isRemoving={removingJobId === jobToRemove?.id} onConfirm={confirmRemoveJob} onCancel={cancelRemoveJob} />
    </div>
  );
};
