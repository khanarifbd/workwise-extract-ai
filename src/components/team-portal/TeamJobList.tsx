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
import { format, parseISO, isValid, isSameMonth, isSameDay, startOfMonth, isToday, isTomorrow, isYesterday } from 'date-fns';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { useCapacitorPush } from '@/hooks/useCapacitorPush';
import { useTeamSettings } from '@/hooks/useTeamSettings';
import { useTranslation } from '@/hooks/useTranslation';
import { shouldShowOngoingAlert } from '@/hooks/useJobAlerts';
import { TeamDiary } from './TeamDiary';
import { LanguageSelector } from './LanguageSelector';
import { RemoveJobConfirmModal } from './RemoveJobConfirmModal';
import { OpsManagerNotes } from './OpsManagerNotes';
import { cn } from '@/lib/utils';

// Helper to get contrasting text color (white or black) for a given background color
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

// Interfaces for grouping
interface MonthGroup {
  monthKey: string;
  monthLabel: string;
  days: Map<string, Job[]>;
  totalJobs: number;
}

// Get job booked date for regular team view
const getJobBookedDate = (job: Job): Date | null => {
  if (job.bookedDate) {
    const date = new Date(job.bookedDate);
    if (isValid(date)) return date;
  }
  return null;
};

// Get job group date for ops manager view - prioritize booked date over created date
const getJobGroupDate = (job: Job): Date | null => {
  // First try booked date - this is the scheduling date
  if (job.bookedDate) {
    const date = new Date(job.bookedDate);
    if (isValid(date)) return date;
  }
  return null;
};

// Get job fallback date (created date) for jobs without booked date
const getJobFallbackDate = (job: Job): Date => {
  const createdAt = job.createdAt instanceof Date ? job.createdAt : new Date(job.createdAt as any);
  if (isValid(createdAt)) return createdAt;

  if (job.dateIssued) {
    const date = new Date(job.dateIssued);
    if (isValid(date)) return date;
  }

  return new Date();
};

// Group jobs by month, then by day - for regular teams (by booked date)
const groupJobsByMonthAndDay = (jobs: Job[]): { months: MonthGroup[], unscheduled: Job[] } => {
  const monthMap = new Map<string, Map<string, Job[]>>();
  const unscheduled: Job[] = [];

  for (const job of jobs) {
    const bookedDate = getJobBookedDate(job);
    if (bookedDate) {
      const monthKey = format(bookedDate, 'yyyy-MM');
      const dayKey = format(bookedDate, 'yyyy-MM-dd');
      
      if (!monthMap.has(monthKey)) {
        monthMap.set(monthKey, new Map());
      }
      const daysMap = monthMap.get(monthKey)!;
      if (!daysMap.has(dayKey)) {
        daysMap.set(dayKey, []);
      }
      daysMap.get(dayKey)!.push(job);
    } else {
      unscheduled.push(job);
    }
  }

  // Sort jobs within each day by booked date time
  for (const [_, daysMap] of monthMap.entries()) {
    for (const [dayKey, dayJobs] of daysMap.entries()) {
      dayJobs.sort((a, b) => {
        const at = new Date(a.bookedDate!).getTime();
        const bt = new Date(b.bookedDate!).getTime();
        return at - bt;
      });
    }
  }

  // Convert to sorted array of MonthGroup
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

    const monthDate = parseISO(`${monthKey}-01`);
    months.push({
      monthKey,
      monthLabel: format(monthDate, 'MMMM yyyy'),
      days: sortedDays,
      totalJobs,
    });
  }

  return { months, unscheduled };
};

// Group jobs by month, then by day - for ops manager (by BOOKED date, descending)
// Jobs without booked dates go into an "Unscheduled" section
const groupJobsByMonthAndDayDesc = (jobs: Job[]): { months: MonthGroup[], unscheduled: Job[] } => {
  const monthMap = new Map<string, Map<string, Job[]>>();
  const unscheduled: Job[] = [];

  for (const job of jobs) {
    const bookedDate = getJobGroupDate(job);
    
    if (bookedDate) {
      const monthKey = format(bookedDate, 'yyyy-MM');
      const dayKey = format(bookedDate, 'yyyy-MM-dd');
      
      if (!monthMap.has(monthKey)) {
        monthMap.set(monthKey, new Map());
      }
      const daysMap = monthMap.get(monthKey)!;
      if (!daysMap.has(dayKey)) {
        daysMap.set(dayKey, []);
      }
      daysMap.get(dayKey)!.push(job);
    } else {
      // Jobs without booked dates go to unscheduled
      unscheduled.push(job);
    }
  }

  // Sort jobs within each day by booked date time
  for (const [_, daysMap] of monthMap.entries()) {
    for (const [dayKey, dayJobs] of daysMap.entries()) {
      dayJobs.sort((a, b) => {
        const at = new Date(a.bookedDate!).getTime();
        const bt = new Date(b.bookedDate!).getTime();
        return at - bt;
      });
    }
  }

  // Sort unscheduled by created date (newest first)
  unscheduled.sort((a, b) => {
    const at = getJobFallbackDate(a).getTime();
    const bt = getJobFallbackDate(b).getTime();
    return bt - at;
  });

  // Convert to sorted array of MonthGroup
  // Sort months chronologically with current/future months first, then past months
  const months: MonthGroup[] = [];
  const currentMonth = format(new Date(), 'yyyy-MM');
  const allMonthKeys = Array.from(monthMap.keys());
  
  // Separate into current/future and past months
  const futureMonths = allMonthKeys.filter(k => k >= currentMonth).sort((a, b) => a.localeCompare(b));
  const pastMonths = allMonthKeys.filter(k => k < currentMonth).sort((a, b) => b.localeCompare(a));
  
  // Order: current month first, then future months, then past months (newest first)
  const sortedMonthKeys = [...futureMonths, ...pastMonths];
  
  for (const monthKey of sortedMonthKeys) {
    const daysMap = monthMap.get(monthKey)!;
    const sortedDays = new Map<string, Job[]>();
    
    // Sort days within month chronologically
    const sortedDayKeys = Array.from(daysMap.keys()).sort((a, b) => a.localeCompare(b));
    
    let totalJobs = 0;
    for (const dayKey of sortedDayKeys) {
      const jobs = daysMap.get(dayKey)!;
      sortedDays.set(dayKey, jobs);
      totalJobs += jobs.length;
    }

    const monthDate = parseISO(`${monthKey}-01`);
    months.push({
      monthKey,
      monthLabel: format(monthDate, 'MMMM yyyy'),
      days: sortedDays,
      totalJobs,
    });
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
  // Web push notifications (PWA)
  const {
    isSupported: webPushSupported,
    isSubscribed: webPushSubscribed,
    isLoading: webPushLoading,
    subscribe: webSubscribe,
    unsubscribe: webUnsubscribe,
  } = usePushNotifications(teamId);

  // Native push notifications (Capacitor - Android/iOS)
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
  
  // Translation hook for job summaries
  const { translateToUserLanguage } = useTranslation(languagePreference);
  const [translatedSummaries, setTranslatedSummaries] = useState<Record<string, string>>({});
  const [isTranslatingList, setIsTranslatingList] = useState(false);
  const translatedIdsRef = useRef<Set<string>>(new Set());
  
  // Clear translations when language changes
  useEffect(() => {
    setTranslatedSummaries({});
    translatedIdsRef.current = new Set();
  }, [languagePreference]);
  
  // Translate summaries for expanded jobs when they are expanded
  useEffect(() => {
    const translateExpandedJobSummaries = async () => {
      if (languagePreference === 'en') {
        return;
      }
      
      // Only translate summaries for jobs that are expanded and not already translated
      const expandedJobIds = Array.from(expandedJobs);
      if (expandedJobIds.length === 0) return;
      
      const jobsToTranslate = jobs.filter(j => 
        expandedJobIds.includes(j.id) && 
        j.summaryOfWorks && 
        !translatedIdsRef.current.has(j.id)
      );
      
      if (jobsToTranslate.length === 0) return;
      
      setIsTranslatingList(true);
      
      for (const job of jobsToTranslate) {
        if (job.summaryOfWorks) {
          try {
            // Mark as translating to prevent duplicate requests
            translatedIdsRef.current.add(job.id);
            
            const translated = await translateToUserLanguage(job.summaryOfWorks);
            setTranslatedSummaries(prev => ({ ...prev, [job.id]: translated }));
          } catch (error) {
            console.error('Translation error:', error);
            // Remove from ref so it can be retried
            translatedIdsRef.current.delete(job.id);
          }
        }
      }
      
      setIsTranslatingList(false);
    };
    
    translateExpandedJobSummaries();
  }, [languagePreference, expandedJobs, jobs, translateToUserLanguage]);

  // Get team settings for color-coding
  const { settings: teamSettings } = useTeamSettings();

  // Get team color by team name
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
      if (next.has(jobId)) {
        next.delete(jobId);
      } else {
        next.add(jobId);
      }
      return next;
    });
  };

  const toggleMonth = (monthKey: string) => {
    setExpandedMonths(prev => {
      const next = new Set(prev);
      if (next.has(monthKey)) {
        next.delete(monthKey);
      } else {
        next.add(monthKey);
      }
      return next;
    });
  };

  const toggleDay = (dayKey: string) => {
    setExpandedDays(prev => {
      const next = new Set(prev);
      if (next.has(dayKey)) {
        next.delete(dayKey);
      } else {
        next.add(dayKey);
      }
      return next;
    });
  };

  // Handle job removal from team's list - opens confirmation modal
  const handleRemoveJobClick = (job: Job, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onRemoveJob || removingJobId) return;
    setJobToRemove(job);
  };

  // Confirm job removal
  const confirmRemoveJob = async () => {
    if (!jobToRemove || !onRemoveJob) return;
    
    setRemovingJobId(jobToRemove.id);
    try {
      await onRemoveJob(jobToRemove.id, jobToRemove.jobNumber);
    } finally {
      setRemovingJobId(null);
      setJobToRemove(null);
    }
  };

  // Cancel job removal
  const cancelRemoveJob = () => {
    if (!removingJobId) {
      setJobToRemove(null);
    }
  };

  // Team workload counts (for Ops Manager)
  const teamWorkloadCounts = useMemo(() => {
    if (!isOpsManager) return new Map<string, { active: number; completed: number }>();
    const counts = new Map<string, { active: number; completed: number }>();
    for (const job of jobs) {
      const team = job.team || 'Unassigned';
      if (!counts.has(team)) counts.set(team, { active: 0, completed: 0 });
      if (job.isCompleted) {
        counts.get(team)!.completed++;
      } else {
        counts.get(team)!.active++;
      }
    }
    // Sort by active count descending
    return new Map([...counts.entries()].sort((a, b) => b[1].active - a[1].active));
  }, [isOpsManager, jobs]);

  // Filtered jobs (by team and/or today filter)
  const filteredJobs = useMemo(() => {
    let result = jobs;
    
    // Apply team filter
    if (teamFilter) {
      result = result.filter(j => (j.team || 'Unassigned') === teamFilter);
    }
    
    // Apply "Today Only" filter for Ops Manager
    if (todayOnlyFilter && isOpsManager) {
      const todayStr = format(new Date(), 'yyyy-MM-dd');
      result = result.filter(j => {
        if (!j.bookedDate) return false;
        const jobDate = new Date(j.bookedDate);
        if (!isValid(jobDate)) return false;
        return format(jobDate, 'yyyy-MM-dd') === todayStr;
      });
    }
    
    return result;
  }, [jobs, teamFilter, todayOnlyFilter, isOpsManager]);

  const activeJobs = filteredJobs.filter(j => !j.isCompleted);
  const completedJobs = filteredJobs.filter(j => j.isCompleted);
  const totalActiveJobs = jobs.filter(j => !j.isCompleted).length;

  // Grouped jobs by month/day
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

  // Unscheduled jobs (both views now support unscheduled)
  const unscheduledJobs = activeUnscheduled;

  const todayKey = format(new Date(), 'yyyy-MM-dd');
  const currentMonthKey = format(new Date(), 'yyyy-MM');
  
  // Auto-expand current month and today on mount
  useEffect(() => {
    // Auto-expand current month
    setExpandedMonths(new Set([currentMonthKey]));
    // Auto-expand today
    setExpandedDays(new Set([todayKey]));
  }, [currentMonthKey, todayKey]);

  // Get all keys for expand/collapse functionality
  const allMonthKeys = useMemo(() => {
    return groupedActiveMonths.map(m => m.monthKey);
  }, [groupedActiveMonths]);

  const allDayKeys = useMemo(() => {
    const keys: string[] = [];
    for (const month of groupedActiveMonths) {
      for (const dayKey of month.days.keys()) {
        keys.push(dayKey);
      }
    }
    if (unscheduledJobs.length > 0) {
      keys.push('unscheduled');
    }
    return keys;
  }, [groupedActiveMonths, unscheduledJobs]);

  // Expand/Collapse all
  const expandAllGroups = useCallback(() => {
    setExpandedMonths(new Set(allMonthKeys));
    setExpandedDays(new Set(allDayKeys));
  }, [allMonthKeys, allDayKeys]);

  const collapseAllGroups = useCallback(() => {
    setExpandedMonths(new Set());
    setExpandedDays(new Set());
  }, []);

  // Jump to today (expand only current month and today)
  const jumpToToday = useCallback(() => {
    setExpandedMonths(new Set([currentMonthKey]));
    setExpandedDays(new Set([todayKey]));
  }, [currentMonthKey, todayKey]);

  const formatDayHeader = (dateKey: string): string => {
    try {
      const date = parseISO(dateKey);
      
      if (isToday(date)) {
        return `Today - ${format(date, 'EEEE, d')}`;
      }
      if (isTomorrow(date)) {
        return `Tomorrow - ${format(date, 'EEEE, d')}`;
      }
      if (isYesterday(date)) {
        return `Yesterday - ${format(date, 'EEEE, d')}`;
      }
      return format(date, 'EEEE, d');
    } catch {
      return dateKey;
    }
  };

  const getDayBadgeStyle = (dateKey: string): string => {
    try {
      const date = parseISO(dateKey);
      if (isToday(date)) {
        return 'bg-primary text-primary-foreground';
      }
      if (isTomorrow(date)) {
        return 'bg-blue-500 text-white';
      }
      return '';
    } catch {
      return '';
    }
  };

  // Render a single job card
  const renderJobCard = (job: Job, showTeamBadge: boolean = false) => {
    // Check if job is overdue
    const alertInfo = shouldShowOngoingAlert(job, false);
    const isOverdue = alertInfo.showAlert && alertInfo.isAutoTriggered;
    
    return (
    <Collapsible key={job.id} open={expandedJobs.has(job.id)}>
      <Card className={cn(
        "border-l-4 bg-card shadow-sm hover:shadow-md transition-all",
        isOverdue 
          ? "border-l-red-500 bg-red-50/50 dark:bg-red-950/20" 
          : "border-l-primary"
      )}>
        <CardContent className="p-0">
          <div 
            className="p-3 cursor-pointer active:bg-muted/50 transition-colors"
            onClick={() => onSelectJob(job)}
          >
            <div className="flex items-start gap-2">
              <CollapsibleTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 flex-shrink-0 -ml-1"
                  onClick={(e) => toggleExpand(job.id, e)}
                >
                  {expandedJobs.has(job.id) ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </Button>
              </CollapsibleTrigger>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-1 mb-1">
                  <Badge variant="outline" className="text-[10px] font-mono px-1 py-0">
                    {job.jobNumber}
                  </Badge>
                  <Badge 
                    style={{ backgroundColor: getStatusColor(job.status), color: 'white' }}
                    className="text-[10px] px-1 py-0"
                  >
                    {getStatusLabel(job.status)}
                  </Badge>
                  {/* OVERDUE badge - prominent red styling */}
                  {isOverdue && (
                    <Badge className="text-[10px] px-1.5 py-0 bg-red-600 text-white animate-pulse flex items-center gap-0.5">
                      <AlertTriangle className="h-2.5 w-2.5" />
                      OVERDUE
                    </Badge>
                  )}
                  {/* Ongoing badge - only show if manually marked and not already showing overdue */}
                  {job.isOngoing && !isOverdue && (
                    <Badge className="text-[10px] px-1 py-0 bg-amber-500 text-white">
                      Ongoing
                    </Badge>
                  )}
                  {showTeamBadge && job.team && (
                    <Badge 
                      className="text-[10px] px-1 py-0"
                      style={getTeamColor(job.team) ? {
                        backgroundColor: getTeamColor(job.team),
                        color: getContrastTextColor(getTeamColor(job.team)!)
                      } : undefined}
                      variant={getTeamColor(job.team) ? undefined : "secondary"}
                    >
                      <Users className="h-2.5 w-2.5 mr-0.5" />
                      {job.team}
                    </Badge>
                  )}
                </div>
                <h3 className="font-semibold text-sm text-foreground line-clamp-1">
                  {job.name}
                </h3>
                <div className="mt-1.5">
                  <div className="flex items-center justify-between text-[10px] mb-0.5">
                    <span className="text-muted-foreground">Progress</span>
                    <span className="font-medium">{job.progress}%</span>
                  </div>
                  <Progress value={job.progress} className="h-1" />
                </div>
              </div>
            </div>
          </div>
          <CollapsibleContent>
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
                {job.phoneNumber && (
                  <a 
                    href={`tel:${job.phoneNumber}`}
                    className="flex items-center gap-1.5 text-xs text-primary hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Phone className="h-3 w-3" />
                    <span>{job.phoneNumber}</span>
                  </a>
                )}
                {(job.summaryOfWorks || job.description) && (
                  <div className="mt-1.5 bg-muted/50 p-1.5 rounded space-y-1">
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
                  <Button className="flex-1 h-8 text-xs" size="sm" onClick={() => onSelectJob(job)}>
                    View & Update Job
                  </Button>
                  {onRemoveJob && !isOpsManager && (
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="h-8 text-destructive hover:bg-destructive hover:text-destructive-foreground"
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
          </CollapsibleContent>
        </CardContent>
      </Card>
    </Collapsible>
  );
  };

  return (
    <div className="pb-20 min-h-screen safe-area-bottom">
      {/* Header - Mobile optimized with iOS safe area */}
      <div className={cn(
        "text-primary-foreground sticky top-0 z-10 shadow-md safe-area-top safe-area-left safe-area-right",
        isOpsManager ? "bg-gradient-to-r from-amber-600 to-orange-600" : "bg-primary"
      )}>
        <div className="px-3 py-2.5">
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              {isOpsManager ? (
                <div className="flex items-center gap-2">
                  <Crown className="h-4 w-4 text-yellow-300 flex-shrink-0" />
                  <div>
                    <h1 className="text-base font-bold truncate">OPERATIONS</h1>
                    <p className="text-primary-foreground/80 text-xs">
                      {totalActiveJobs} active job{totalActiveJobs !== 1 ? 's' : ''} across all teams
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <h1 className="text-base font-bold truncate">Team {teamName}</h1>
                  <p className="text-primary-foreground/80 text-xs">
                    {activeJobs.length} active job{activeJobs.length !== 1 ? 's' : ''}
                  </p>
                </>
              )}
            </div>
            <div className="flex gap-1 flex-shrink-0">
              {/* Native Push (Capacitor - Android/iOS) */}
              {nativePushSupported && (
                <Button
                  variant="secondary"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => nativePushRegistered ? nativeUnregister() : nativeRegister()}
                  disabled={nativePushLoading}
                  title={nativePushRegistered ? 'Disable push notifications' : 'Enable push notifications'}
                >
                  {nativePushRegistered ? (
                    <Smartphone className="h-3.5 w-3.5 text-green-600" />
                  ) : (
                    <Smartphone className="h-3.5 w-3.5" />
                  )}
                </Button>
              )}
              {/* Web Push (PWA - Browser) */}
              {webPushSupported && !nativePushSupported && (
                <Button
                  variant="secondary"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => webPushSubscribed ? webUnsubscribe() : webSubscribe()}
                  disabled={webPushLoading}
                  title={webPushSubscribed ? 'Disable notifications' : 'Enable notifications'}
                >
                  {webPushSubscribed ? (
                    <Bell className="h-3.5 w-3.5" />
                  ) : (
                    <BellOff className="h-3.5 w-3.5" />
                  )}
                </Button>
              )}
              <Button
                variant="secondary"
                size="icon"
                className="h-8 w-8"
                onClick={onRefresh}
                disabled={isLoading}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              </Button>
              <Button
                variant="secondary"
                size="icon"
                className="h-8 w-8"
                onClick={onLogout}
              >
                <LogOut className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          {/* Language Selector Row */}
          <div className="flex justify-end pt-1.5 border-t border-primary-foreground/20 mt-1.5">
            <LanguageSelector
              currentLanguage={languagePreference}
              onLanguageChange={onLanguageChange}
            />
          </div>
        </div>
      </div>

      {/* Tabs for Jobs, Diary and Workload */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'jobs' | 'diary' | 'workload')} className="w-full">
        <div className="border-b border-border bg-background sticky top-[calc(60px+env(safe-area-inset-top,0px))] z-[5] safe-area-left safe-area-right">
          <TabsList className="w-full justify-start rounded-none h-auto p-0 bg-transparent">
            <TabsTrigger 
              value="jobs" 
              className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent py-2.5 text-xs"
            >
              <Briefcase className="h-3.5 w-3.5 mr-1.5" />
              Jobs ({activeJobs.length})
            </TabsTrigger>
            {isOpsManager && (
              <TabsTrigger 
                value="workload" 
                className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent py-2.5 text-xs"
              >
                <Users className="h-3.5 w-3.5 mr-1.5" />
                Teams
              </TabsTrigger>
            )}
            <TabsTrigger 
              value="diary" 
              className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent py-2.5 text-xs"
            >
              <CalendarDays className="h-3.5 w-3.5 mr-1.5" />
              {isOpsManager ? 'All Teams' : 'My Diary'}
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Team Workload Tab (Ops Manager only) */}
        {isOpsManager && (
          <TabsContent value="workload" className="p-3 mt-0">
            <div className="space-y-2">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
                Team Workload
              </h2>
              {teamFilter && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => { setTeamFilter(null); setActiveTab('jobs'); }} 
                  className="mb-2 h-7 text-xs"
                >
                  <Minus className="h-3 w-3 mr-1" />
                  Clear filter: {teamFilter}
                </Button>
              )}
              <div className="grid grid-cols-2 gap-2">
                {Array.from(teamWorkloadCounts.entries()).map(([team, counts]) => {
                  const teamColor = getTeamColor(team);
                  return (
                    <Card 
                      key={team}
                      className={cn(
                        "cursor-pointer hover:opacity-90 transition-all overflow-hidden",
                        teamFilter === team && "ring-2 ring-primary"
                      )}
                      style={teamColor ? { borderLeftWidth: '3px', borderLeftColor: teamColor } : undefined}
                      onClick={() => { setTeamFilter(team); setActiveTab('jobs'); }}
                    >
                      <CardContent className="p-2 flex flex-col gap-1">
                        <div className="flex items-center gap-1.5">
                          <div 
                            className="h-5 w-5 rounded-full flex items-center justify-center flex-shrink-0"
                            style={{ 
                              backgroundColor: teamColor || 'hsl(var(--muted))',
                              color: teamColor ? getContrastTextColor(teamColor) : 'hsl(var(--muted-foreground))'
                            }}
                          >
                            <Users className="h-3 w-3" />
                          </div>
                          <span className="font-medium text-xs truncate">{team}</span>
                        </div>
                        <div className="flex gap-1">
                          <Badge 
                            className="text-[10px] px-1"
                            style={teamColor ? { 
                              backgroundColor: teamColor, 
                              color: getContrastTextColor(teamColor) 
                            } : undefined}
                          >
                            {counts.active}
                          </Badge>
                          <Badge variant="secondary" className="text-[10px] px-1">
                            ✓{counts.completed}
                          </Badge>
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
          {/* Job List - Mobile optimized with month/day grouping */}
          <div className="p-3 space-y-2">
            {/* Ops Manager Voice Notes - shown above controls */}
            {isOpsManager && (
              <OpsManagerNotes teamId={teamId} teamName={teamName} />
            )}

            {/* Controls */}
            <div className="flex flex-wrap items-center gap-1.5 mb-2">
              {/* Ops Manager: Today Only quick filter - prominent button */}
              {isOpsManager && (
                <Button 
                  variant={todayOnlyFilter ? "default" : "outline"}
                  size="sm" 
                  onClick={() => setTodayOnlyFilter(!todayOnlyFilter)} 
                  className={cn(
                    "text-xs h-7 px-2.5",
                    todayOnlyFilter && "bg-green-600 hover:bg-green-700 text-white"
                  )}
                >
                  <CalendarCheck className="h-3 w-3 mr-1" />
                  Today Only
                </Button>
              )}
              {teamFilter && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setTeamFilter(null)} 
                  className="text-xs h-7 px-2"
                >
                  <Minus className="h-3 w-3 mr-1" />
                  {teamFilter}
                </Button>
              )}
              <div className="flex-1" />
              <Button variant="ghost" size="sm" onClick={expandAllGroups} className="text-xs h-6 px-2">
                <Plus className="h-3 w-3 mr-0.5" />
                All
              </Button>
              <Button variant="ghost" size="sm" onClick={collapseAllGroups} className="text-xs h-6 px-2">
                <Minus className="h-3 w-3 mr-0.5" />
                Close
              </Button>
              <Button variant="ghost" size="sm" onClick={jumpToToday} className="text-xs h-6 px-2">
                <ArrowUp className="h-3 w-3 mr-0.5" />
                Today
              </Button>
            </div>

            {isLoading && jobs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
                <p className="text-muted-foreground text-sm">Loading jobs...</p>
              </div>
            ) : filteredJobs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Briefcase className="h-10 w-10 text-muted-foreground/50 mb-3" />
                <p className="text-base font-medium text-muted-foreground">
                  {teamFilter ? `No jobs for ${teamFilter}` : 'No jobs assigned'}
                </p>
                <p className="text-xs text-muted-foreground/80 text-center px-4">
                  {teamFilter ? 'Try clearing the filter' : 'Jobs assigned to your team will appear here'}
                </p>
                {teamFilter && (
                  <Button variant="outline" size="sm" className="mt-3 h-7 text-xs" onClick={() => setTeamFilter(null)}>
                    Clear Filter
                  </Button>
                )}
              </div>
            ) : (
              <>
                {/* Active Jobs - Grouped by Month then Day */}
                {activeJobs.length > 0 && (
                  <div className="space-y-2">
                    <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
                      Active Jobs ({activeJobs.length})
                    </h2>
                    
                    {/* Month groups */}
                    {groupedActiveMonths.map((monthGroup) => (
                      <Collapsible 
                        key={monthGroup.monthKey} 
                        open={expandedMonths.has(monthGroup.monthKey)}
                        onOpenChange={() => toggleMonth(monthGroup.monthKey)}
                      >
                        <CollapsibleTrigger asChild>
                          <Card className="cursor-pointer hover:bg-muted/50 transition-colors bg-primary/5 border-primary/20">
                            <CardContent className="p-2.5 flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                {expandedMonths.has(monthGroup.monthKey) ? (
                                  <ChevronDown className="h-4 w-4 text-primary" />
                                ) : (
                                  <ChevronRight className="h-4 w-4 text-primary" />
                                )}
                                <FolderOpen className="h-4 w-4 text-primary" />
                                <span className="font-semibold text-sm">{monthGroup.monthLabel}</span>
                              </div>
                              <Badge className="text-xs bg-primary/20 text-primary hover:bg-primary/20">
                                {monthGroup.totalJobs} job{monthGroup.totalJobs !== 1 ? 's' : ''}
                              </Badge>
                            </CardContent>
                          </Card>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="space-y-1.5 mt-1.5 ml-2 border-l-2 border-primary/30 pl-2">
                          {/* Day groups within month */}
                          {Array.from(monthGroup.days.entries()).map(([dayKey, dayJobs]) => (
                            <Collapsible 
                              key={dayKey} 
                              open={expandedDays.has(dayKey)}
                              onOpenChange={() => toggleDay(dayKey)}
                            >
                              <CollapsibleTrigger asChild>
                                <Card className={cn(
                                  "cursor-pointer hover:bg-muted/50 transition-colors",
                                  isToday(parseISO(dayKey)) && "bg-primary/10 border-primary/30"
                                )}>
                                  <CardContent className="p-2 flex items-center justify-between">
                                    <div className="flex items-center gap-1.5">
                                      {expandedDays.has(dayKey) ? (
                                        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                                      ) : (
                                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                                      )}
                                      <Calendar className="h-3.5 w-3.5 text-primary" />
                                      <span className="font-medium text-xs">{formatDayHeader(dayKey)}</span>
                                    </div>
                                    <Badge 
                                      variant="secondary" 
                                      className={cn("text-[10px] px-1.5", getDayBadgeStyle(dayKey))}
                                    >
                                      {dayJobs.length}
                                    </Badge>
                                  </CardContent>
                                </Card>
                              </CollapsibleTrigger>
                              <CollapsibleContent className="space-y-1.5 mt-1.5 ml-2 border-l border-muted pl-2">
                                {dayJobs.map((job) => renderJobCard(job, isOpsManager))}
                              </CollapsibleContent>
                            </Collapsible>
                          ))}
                        </CollapsibleContent>
                      </Collapsible>
                    ))}

                    {/* Unscheduled jobs section (for regular teams) */}
                    {unscheduledJobs.length > 0 && (
                      <Collapsible 
                        open={expandedDays.has('unscheduled')}
                        onOpenChange={() => toggleDay('unscheduled')}
                      >
                        <CollapsibleTrigger asChild>
                          <Card className="cursor-pointer hover:bg-muted/50 transition-colors border-dashed">
                            <CardContent className="p-2 flex items-center justify-between">
                              <div className="flex items-center gap-1.5">
                                {expandedDays.has('unscheduled') ? (
                                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                                ) : (
                                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                                )}
                                <Briefcase className="h-3.5 w-3.5 text-muted-foreground" />
                                <span className="font-medium text-xs text-muted-foreground">Unscheduled</span>
                              </div>
                              <Badge variant="outline" className="text-[10px] px-1.5">
                                {unscheduledJobs.length}
                              </Badge>
                            </CardContent>
                          </Card>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="space-y-1.5 mt-1.5 ml-2 border-l border-muted/40 pl-2">
                          {unscheduledJobs.map((job) => renderJobCard(job, false))}
                        </CollapsibleContent>
                      </Collapsible>
                    )}
                  </div>
                )}

                {/* Completed Jobs */}
                {completedJobs.length > 0 && (
                  <div className="space-y-2 mt-4">
                    <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
                      Completed ({completedJobs.length})
                    </h2>
                    
                    {groupedCompletedMonths.slice(0, 3).map((monthGroup) => (
                      <Collapsible 
                        key={`completed-${monthGroup.monthKey}`} 
                        open={expandedMonths.has(`completed-${monthGroup.monthKey}`)}
                        onOpenChange={() => toggleMonth(`completed-${monthGroup.monthKey}`)}
                      >
                        <CollapsibleTrigger asChild>
                          <Card className="cursor-pointer hover:bg-success/10 transition-colors opacity-80 bg-success/5">
                            <CardContent className="p-2.5 flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                {expandedMonths.has(`completed-${monthGroup.monthKey}`) ? (
                                  <ChevronDown className="h-4 w-4 text-success" />
                                ) : (
                                  <ChevronRight className="h-4 w-4 text-success" />
                                )}
                                <FolderOpen className="h-4 w-4 text-success" />
                                <span className="font-semibold text-sm">{monthGroup.monthLabel}</span>
                              </div>
                              <Badge className="text-xs bg-success/20 text-success hover:bg-success/20">
                                {monthGroup.totalJobs} done
                              </Badge>
                            </CardContent>
                          </Card>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="space-y-1.5 mt-1.5 ml-2 border-l-2 border-success/20 pl-2">
                          {Array.from(monthGroup.days.entries()).slice(0, 5).map(([dayKey, dayJobs]) => (
                            <Collapsible 
                              key={`completed-${dayKey}`} 
                              open={expandedDays.has(`completed-${dayKey}`)}
                              onOpenChange={() => toggleDay(`completed-${dayKey}`)}
                            >
                              <CollapsibleTrigger asChild>
                                <Card className="cursor-pointer hover:bg-success/10 transition-colors opacity-80">
                                  <CardContent className="p-2 flex items-center justify-between">
                                    <div className="flex items-center gap-1.5">
                                      {expandedDays.has(`completed-${dayKey}`) ? (
                                        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                                      ) : (
                                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                                      )}
                                      <Calendar className="h-3.5 w-3.5 text-success" />
                                      <span className="font-medium text-xs">{formatDayHeader(dayKey)}</span>
                                    </div>
                                    <Badge variant="secondary" className="text-[10px] px-1.5 bg-success/20 text-success">
                                      {dayJobs.length}
                                    </Badge>
                                  </CardContent>
                                </Card>
                              </CollapsibleTrigger>
                              <CollapsibleContent className="space-y-1.5 mt-1.5 ml-2 border-l border-success/20 pl-2">
                                {dayJobs.map((job) => (
                                  <Card 
                                    key={job.id}
                                    className="border-l-3 border-l-success bg-success/5 opacity-80 hover:opacity-100 transition-all cursor-pointer"
                                    onClick={() => onSelectJob(job)}
                                  >
                                    <CardContent className="p-2">
                                      <div className="flex flex-wrap items-center gap-1 mb-0.5">
                                        <Badge variant="outline" className="text-[10px] font-mono px-1 py-0">
                                          {job.jobNumber}
                                        </Badge>
                                        <Badge className="text-[10px] px-1 py-0 bg-success text-success-foreground">
                                          Complete
                                        </Badge>
                                      </div>
                                      <h3 className="font-medium text-xs text-foreground truncate">{job.name}</h3>
                                    </CardContent>
                                  </Card>
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

      {/* Remove Job Confirmation Modal */}
      <RemoveJobConfirmModal
        job={jobToRemove}
        isOpen={!!jobToRemove}
        isRemoving={removingJobId === jobToRemove?.id}
        onConfirm={confirmRemoveJob}
        onCancel={cancelRemoveJob}
      />
    </div>
  );
};
