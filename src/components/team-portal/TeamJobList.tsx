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
  ChevronsUpDown,
  Minus,
  Plus,
  ArrowUp,
  EyeOff,
  Languages,
} from 'lucide-react';
import { format, parseISO, isValid } from 'date-fns';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { useCapacitorPush } from '@/hooks/useCapacitorPush';
import { useTeamSettings } from '@/hooks/useTeamSettings';
import { useTranslation } from '@/hooks/useTranslation';
import { TeamDiary } from './TeamDiary';
import { LanguageSelector } from './LanguageSelector';
import { RemoveJobConfirmModal } from './RemoveJobConfirmModal';
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

// Ops Manager ordering must match database ordering: group + sort by createdAt.
const getJobGroupDate = (job: Job): Date => {
  const createdAt = job.createdAt instanceof Date ? job.createdAt : new Date(job.createdAt as any);
  if (isValid(createdAt)) return createdAt;

  if (job.dateIssued) {
    const date = new Date(job.dateIssued);
    if (isValid(date)) return date;
  }

  return new Date();
};

// Group jobs by booked date for regular team view
const getJobBookedDate = (job: Job): Date | null => {
  if (job.bookedDate) {
    const date = new Date(job.bookedDate);
    if (isValid(date)) return date;
  }
  return null;
};

const groupJobsByBookedDate = (jobs: Job[]): { grouped: Map<string, Job[]>, unscheduled: Job[] } => {
  const groups = new Map<string, Job[]>();
  const unscheduled: Job[] = [];

  for (const job of jobs) {
    const bookedDate = getJobBookedDate(job);
    if (bookedDate) {
      const dateKey = format(bookedDate, 'yyyy-MM-dd');
      if (!groups.has(dateKey)) groups.set(dateKey, []);
      groups.get(dateKey)!.push(job);
    } else {
      unscheduled.push(job);
    }
  }

  // Sort each group by booked date time
  for (const [key, group] of groups.entries()) {
    group.sort((a, b) => {
      const at = new Date(a.bookedDate!).getTime();
      const bt = new Date(b.bookedDate!).getTime();
      return at - bt;
    });
    groups.set(key, group);
  }

  // Sort date keys chronologically (earliest first for upcoming work)
  const sorted = new Map<string, Job[]>();
  const sortedKeys = Array.from(groups.keys()).sort((a, b) => a.localeCompare(b));
  for (const key of sortedKeys) sorted.set(key, groups.get(key)!);

  return { grouped: sorted, unscheduled };
};

const groupJobsByCreatedDateDesc = (jobs: Job[]): Map<string, Job[]> => {
  const groups = new Map<string, Job[]>();

  for (const job of jobs) {
    const d = getJobGroupDate(job);
    const dateKey = format(d, 'yyyy-MM-dd');

    if (!groups.has(dateKey)) groups.set(dateKey, []);
    groups.get(dateKey)!.push(job);
  }

  // Sort each group newest -> oldest (createdAt)
  for (const [key, group] of groups.entries()) {
    group.sort((a, b) => {
      const at = getJobGroupDate(a).getTime();
      const bt = getJobGroupDate(b).getTime();
      return bt - at;
    });
    groups.set(key, group);
  }

  // Sort date keys newest -> oldest
  const sorted = new Map<string, Job[]>();
  const sortedKeys = Array.from(groups.keys()).sort((a, b) => b.localeCompare(a));
  for (const key of sortedKeys) sorted.set(key, groups.get(key)!);

  return sorted;
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
  const [expandedDateGroups, setExpandedDateGroups] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<'jobs' | 'diary' | 'workload'>('jobs');
  const [teamFilter, setTeamFilter] = useState<string | null>(null);
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

  const toggleDateGroup = (dateKey: string) => {
    setExpandedDateGroups(prev => {
      const next = new Set(prev);
      if (next.has(dateKey)) {
        next.delete(dateKey);
      } else {
        next.add(dateKey);
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

  // Filtered jobs (by team if filter is active)
  const filteredJobs = useMemo(() => {
    if (!teamFilter) return jobs;
    return jobs.filter(j => (j.team || 'Unassigned') === teamFilter);
  }, [jobs, teamFilter]);

  const activeJobs = filteredJobs.filter(j => !j.isCompleted);
  const completedJobs = filteredJobs.filter(j => j.isCompleted);
  const totalActiveJobs = jobs.filter(j => !j.isCompleted).length;

  // Ops Manager: group by created date
  const groupedActiveJobs = useMemo(() => {
    if (!isOpsManager) return null;
    return groupJobsByCreatedDateDesc(activeJobs);
  }, [isOpsManager, activeJobs]);

  const groupedCompletedJobs = useMemo(() => {
    if (!isOpsManager) return null;
    return groupJobsByCreatedDateDesc(completedJobs);
  }, [isOpsManager, completedJobs]);

  // Regular team: group by booked date
  const teamGroupedJobs = useMemo(() => {
    if (isOpsManager) return null;
    return groupJobsByBookedDate(activeJobs);
  }, [isOpsManager, activeJobs]);

  const todayKey = format(new Date(), 'yyyy-MM-dd');
  
  // Get all date keys for expand/collapse functionality
  const allActiveDateKeys = useMemo(() => {
    if (isOpsManager && groupedActiveJobs) {
      return Array.from(groupedActiveJobs.keys());
    }
    if (!isOpsManager && teamGroupedJobs) {
      const keys = Array.from(teamGroupedJobs.grouped.keys());
      if (teamGroupedJobs.unscheduled.length > 0) {
        keys.push('unscheduled');
      }
      return keys;
    }
    return [];
  }, [isOpsManager, groupedActiveJobs, teamGroupedJobs]);

  // Expand/Collapse all
  const expandAllDateGroups = useCallback(() => {
    setExpandedDateGroups(new Set(allActiveDateKeys));
  }, [allActiveDateKeys]);

  const collapseAllDateGroups = useCallback(() => {
    setExpandedDateGroups(new Set());
  }, []);

  // Jump to today (expand only today)
  const jumpToToday = useCallback(() => {
    if (allActiveDateKeys.includes(todayKey)) {
      setExpandedDateGroups(new Set([todayKey]));
    }
  }, [allActiveDateKeys, todayKey]);

  const formatDateHeader = (dateKey: string): string => {
    try {
      const date = parseISO(dateKey);
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      if (format(date, 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd')) {
        return 'Today';
      }
      if (format(date, 'yyyy-MM-dd') === format(yesterday, 'yyyy-MM-dd')) {
        return 'Yesterday';
      }
      if (format(date, 'yyyy-MM-dd') === format(tomorrow, 'yyyy-MM-dd')) {
        return 'Tomorrow';
      }
      return format(date, 'EEEE, MMMM d, yyyy');
    } catch {
      return dateKey;
    }
  };
  return (
    <div className="pb-20 min-h-screen safe-area-bottom">
      {/* Header - Mobile optimized with iOS safe area */}
      <div className={cn(
        "text-primary-foreground sticky top-0 z-10 shadow-md safe-area-top safe-area-left safe-area-right",
        isOpsManager ? "bg-gradient-to-r from-amber-600 to-orange-600" : "bg-primary"
      )}>
        <div className="px-4 py-3 sm:py-4">
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              {isOpsManager ? (
                <div className="flex items-center gap-2">
                  <Crown className="h-5 w-5 text-yellow-300 flex-shrink-0" />
                  <div>
                    <h1 className="text-lg sm:text-xl font-bold truncate">Operations Manager</h1>
                    <p className="text-primary-foreground/80 text-xs sm:text-sm">
                      {totalActiveJobs} active job{totalActiveJobs !== 1 ? 's'  : ''} across all teams
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <h1 className="text-lg sm:text-xl font-bold truncate">Team {teamName}</h1>
                  <p className="text-primary-foreground/80 text-xs sm:text-sm">
                    {activeJobs.length} active job{activeJobs.length !== 1 ? 's' : ''}
                  </p>
                </>
              )}
            </div>
            <div className="flex gap-1 sm:gap-2 flex-shrink-0">
              {/* Native Push (Capacitor - Android/iOS) */}
              {nativePushSupported && (
                <Button
                  variant="secondary"
                  size="icon"
                  className="h-9 w-9 sm:h-10 sm:w-10"
                  onClick={() => nativePushRegistered ? nativeUnregister() : nativeRegister()}
                  disabled={nativePushLoading}
                  title={nativePushRegistered ? 'Disable push notifications' : 'Enable push notifications'}
                >
                  {nativePushRegistered ? (
                    <Smartphone className="h-4 w-4 text-green-600" />
                  ) : (
                    <Smartphone className="h-4 w-4" />
                  )}
                </Button>
              )}
              {/* Web Push (PWA - Browser) */}
              {webPushSupported && !nativePushSupported && (
                <Button
                  variant="secondary"
                  size="icon"
                  className="h-9 w-9 sm:h-10 sm:w-10"
                  onClick={() => webPushSubscribed ? webUnsubscribe() : webSubscribe()}
                  disabled={webPushLoading}
                  title={webPushSubscribed ? 'Disable notifications' : 'Enable notifications'}
                >
                  {webPushSubscribed ? (
                    <Bell className="h-4 w-4" />
                  ) : (
                    <BellOff className="h-4 w-4" />
                  )}
                </Button>
              )}
              <Button
                variant="secondary"
                size="icon"
                className="h-9 w-9 sm:h-10 sm:w-10"
                onClick={onRefresh}
                disabled={isLoading}
              >
                <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              </Button>
              <Button
                variant="secondary"
                size="icon"
                className="h-9 w-9 sm:h-10 sm:w-10"
                onClick={onLogout}
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
          {/* Language Selector Row */}
          <div className="flex justify-end pt-2 border-t border-primary-foreground/20 mt-2">
            <LanguageSelector
              currentLanguage={languagePreference}
              onLanguageChange={onLanguageChange}
            />
          </div>
        </div>
      </div>

      {/* Tabs for Jobs, Diary and Workload */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'jobs' | 'diary' | 'workload')} className="w-full">
        <div className="border-b border-border bg-background sticky top-[calc(68px+env(safe-area-inset-top,0px))] z-[5] safe-area-left safe-area-right">
          <TabsList className="w-full justify-start rounded-none h-auto p-0 bg-transparent">
            <TabsTrigger 
              value="jobs" 
              className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent py-3"
            >
              <Briefcase className="h-4 w-4 mr-2" />
              Jobs ({activeJobs.length})
            </TabsTrigger>
            {isOpsManager && (
              <TabsTrigger 
                value="workload" 
                className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent py-3"
              >
                <Users className="h-4 w-4 mr-2" />
                Teams
              </TabsTrigger>
            )}
            <TabsTrigger 
              value="diary" 
              className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent py-3"
            >
              <CalendarDays className="h-4 w-4 mr-2" />
              {isOpsManager ? 'All Teams' : 'My Diary'}
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Team Workload Tab (Ops Manager only) */}
        {isOpsManager && (
          <TabsContent value="workload" className="p-3 sm:p-4 mt-0">
            <div className="space-y-3">
              <h2 className="text-xs sm:text-sm font-semibold text-muted-foreground uppercase tracking-wider px-1">
                Team Workload
              </h2>
              {teamFilter && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => { setTeamFilter(null); setActiveTab('jobs'); }} 
                  className="mb-2"
                >
                  <Minus className="h-3 w-3 mr-1" />
                  Clear filter: {teamFilter}
                </Button>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {Array.from(teamWorkloadCounts.entries()).map(([team, counts]) => {
                  const teamColor = getTeamColor(team);
                  return (
                    <Card 
                      key={team}
                      className={cn(
                        "cursor-pointer hover:opacity-90 transition-all overflow-hidden",
                        teamFilter === team && "ring-2 ring-primary"
                      )}
                      style={teamColor ? { borderLeftWidth: '4px', borderLeftColor: teamColor } : undefined}
                      onClick={() => { setTeamFilter(team); setActiveTab('jobs'); }}
                    >
                      <CardContent className="p-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div 
                            className="h-6 w-6 rounded-full flex items-center justify-center flex-shrink-0"
                            style={{ 
                              backgroundColor: teamColor || 'hsl(var(--muted))',
                              color: teamColor ? getContrastTextColor(teamColor) : 'hsl(var(--muted-foreground))'
                            }}
                          >
                            <Users className="h-3.5 w-3.5" />
                          </div>
                          <span className="font-medium text-sm truncate">{team}</span>
                        </div>
                        <div className="flex gap-2">
                          <Badge 
                            className="text-xs"
                            style={teamColor ? { 
                              backgroundColor: teamColor, 
                              color: getContrastTextColor(teamColor) 
                            } : undefined}
                          >
                            {counts.active} active
                          </Badge>
                          <Badge variant="secondary" className="text-xs">
                            {counts.completed} done
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

        <TabsContent value="diary" className="p-3 sm:p-4 mt-0">
          <TeamDiary teamId={teamId} teamName={teamName} />
        </TabsContent>

        <TabsContent value="jobs" className="mt-0">
          {/* Job List - Mobile optimized */}
          <div className="p-3 sm:p-4 space-y-3">
            {/* Ops Manager: Team filter indicator + expand/collapse controls */}
            {isOpsManager && (
              <div className="flex flex-wrap items-center gap-2 mb-2">
                {teamFilter && (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => setTeamFilter(null)} 
                    className="text-xs"
                  >
                    <Minus className="h-3 w-3 mr-1" />
                    {teamFilter}
                  </Button>
                )}
                <div className="flex-1" />
                <Button variant="ghost" size="sm" onClick={expandAllDateGroups} className="text-xs h-7 px-2">
                  <Plus className="h-3 w-3 mr-1" />
                  Expand All
                </Button>
                <Button variant="ghost" size="sm" onClick={collapseAllDateGroups} className="text-xs h-7 px-2">
                  <Minus className="h-3 w-3 mr-1" />
                  Collapse
                </Button>
                {allActiveDateKeys.includes(todayKey) && (
                  <Button variant="ghost" size="sm" onClick={jumpToToday} className="text-xs h-7 px-2">
                    <ArrowUp className="h-3 w-3 mr-1" />
                    Today
                  </Button>
                )}
              </div>
            )}

            {isLoading && jobs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
                <p className="text-muted-foreground">Loading jobs...</p>
              </div>
            ) : filteredJobs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Briefcase className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <p className="text-lg font-medium text-muted-foreground">
                  {teamFilter ? `No jobs for ${teamFilter}` : 'No jobs assigned'}
                </p>
                <p className="text-sm text-muted-foreground/80 text-center px-4">
                  {teamFilter ? 'Try clearing the filter' : 'Jobs assigned to your team will appear here'}
                </p>
                {teamFilter && (
                  <Button variant="outline" size="sm" className="mt-3" onClick={() => setTeamFilter(null)}>
                    Clear Filter
                  </Button>
                )}
              </div>
            ) : isOpsManager && groupedActiveJobs ? (
              <>
                {/* Ops Manager View - Jobs grouped by date in collapsible sections */}
                {activeJobs.length > 0 && (
                  <div className="space-y-2">
                    <h2 className="text-xs sm:text-sm font-semibold text-muted-foreground uppercase tracking-wider px-1">
                      Active Jobs ({activeJobs.length})
                    </h2>
                    {Array.from(groupedActiveJobs.entries()).map(([dateKey, dateJobs]) => (
                      <Collapsible 
                        key={dateKey} 
                        open={expandedDateGroups.has(dateKey)}
                        onOpenChange={() => toggleDateGroup(dateKey)}
                      >
                        <CollapsibleTrigger asChild>
                          <Card className="cursor-pointer hover:bg-muted/50 transition-colors">
                            <CardContent className="p-3 flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                {expandedDateGroups.has(dateKey) ? (
                                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                ) : (
                                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                )}
                                <CalendarDays className="h-4 w-4 text-primary" />
                                <span className="font-medium text-sm">{formatDateHeader(dateKey)}</span>
                              </div>
                              <Badge variant="secondary" className="text-xs">
                                {dateJobs.length} job{dateJobs.length !== 1 ? 's' : ''}
                              </Badge>
                            </CardContent>
                          </Card>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="space-y-2 mt-2 ml-2 border-l-2 border-primary/20 pl-2">
                          {dateJobs.map((job) => (
                            <Collapsible key={job.id} open={expandedJobs.has(job.id)}>
                              <Card className="border-l-4 border-l-primary bg-card shadow-md hover:shadow-lg transition-all">
                                <CardContent className="p-0">
                                  <div 
                                    className="p-3 sm:p-4 cursor-pointer active:bg-muted/50 transition-colors"
                                    onClick={() => onSelectJob(job)}
                                  >
                                    <div className="flex items-start gap-2 sm:gap-3">
                                      <CollapsibleTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-8 w-8 flex-shrink-0 -ml-1"
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
                                        <div className="flex flex-wrap items-center gap-1.5 mb-1">
                                          <Badge variant="outline" className="text-xs font-mono px-1.5 py-0">
                                            {job.jobNumber}
                                          </Badge>
                                          <Badge 
                                            style={{ backgroundColor: getStatusColor(job.status), color: 'white' }}
                                            className="text-xs px-1.5 py-0"
                                          >
                                            {getStatusLabel(job.status)}
                                          </Badge>
                                          {job.team && (
                                            <Badge 
                                              className="text-xs px-1.5 py-0"
                                              style={getTeamColor(job.team) ? {
                                                backgroundColor: getTeamColor(job.team),
                                                color: getContrastTextColor(getTeamColor(job.team)!)
                                              } : undefined}
                                              variant={getTeamColor(job.team) ? undefined : "secondary"}
                                            >
                                              <Users className="h-3 w-3 mr-1" />
                                              {job.team}
                                            </Badge>
                                          )}
                                          {job.team2 && (
                                            <Badge 
                                              className="text-xs px-1.5 py-0"
                                              style={getTeamColor(job.team2) ? {
                                                backgroundColor: getTeamColor(job.team2),
                                                color: getContrastTextColor(getTeamColor(job.team2)!)
                                              } : undefined}
                                              variant={getTeamColor(job.team2) ? undefined : "secondary"}
                                            >
                                              <Users className="h-3 w-3 mr-1" />
                                              {job.team2}
                                            </Badge>
                                          )}
                                        </div>
                                        <h3 className="font-semibold text-sm sm:text-base text-foreground line-clamp-2">
                                          {job.name}
                                        </h3>
                                        <div className="mt-2">
                                          <div className="flex items-center justify-between text-xs mb-1">
                                            <span className="text-muted-foreground">Progress</span>
                                            <span className="font-medium">{job.progress}%</span>
                                          </div>
                                          <Progress value={job.progress} className="h-1.5 sm:h-2" />
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                  <CollapsibleContent>
                                    <div className="px-3 sm:px-4 pb-3 sm:pb-4 pt-0 space-y-2 border-t border-border/50">
                                      <div className="pt-3 space-y-2">
                                        {job.address && (
                                          <a 
                                            href={`https://maps.google.com/?q=${encodeURIComponent(job.address)}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-start gap-2 text-xs sm:text-sm text-primary hover:underline"
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            <MapPin className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                                            <span className="line-clamp-2">{job.address}</span>
                                          </a>
                                        )}
                                        {job.phoneNumber && (
                                          <a 
                                            href={`tel:${job.phoneNumber}`}
                                            className="flex items-center gap-2 text-xs sm:text-sm text-primary hover:underline"
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            <Phone className="h-3.5 w-3.5" />
                                            <span>{job.phoneNumber}</span>
                                          </a>
                                        )}
                                        {job.summaryOfWorks && (
                                          <div className="mt-2 bg-muted/50 p-2 rounded">
                                            {isTranslatingList && !translatedSummaries[job.id] && languagePreference !== 'en' && (
                                              <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                                                <Loader2 className="h-3 w-3 animate-spin" />
                                                <span>Translating...</span>
                                              </div>
                                            )}
                                            <p className="text-xs sm:text-sm text-muted-foreground">
                                              {languagePreference !== 'en' && translatedSummaries[job.id]
                                                ? translatedSummaries[job.id]
                                                : job.summaryOfWorks}
                                            </p>
                                          </div>
                                        )}
                                        <div className="flex gap-2 mt-2">
                                          <Button className="flex-1" size="sm" onClick={() => onSelectJob(job)}>
                                            View & Update Job
                                          </Button>
                                          {onRemoveJob && !isOpsManager && (
                                            <Button 
                                              variant="outline" 
                                              size="sm" 
                                              className="text-destructive hover:bg-destructive hover:text-destructive-foreground"
                                              onClick={(e) => handleRemoveJobClick(job, e)}
                                              disabled={removingJobId === job.id}
                                            >
                                              {removingJobId === job.id ? (
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                              ) : (
                                                <EyeOff className="h-4 w-4" />
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
                          ))}
                        </CollapsibleContent>
                      </Collapsible>
                    ))}
                  </div>
                )}

                {/* Completed Jobs - Grouped by date */}
                {completedJobs.length > 0 && groupedCompletedJobs && (
                  <div className="space-y-2 mt-6">
                    <h2 className="text-xs sm:text-sm font-semibold text-muted-foreground uppercase tracking-wider px-1">
                      Completed ({completedJobs.length})
                    </h2>
                    {Array.from(groupedCompletedJobs.entries()).slice(0, 5).map(([dateKey, dateJobs]) => (
                      <Collapsible 
                        key={`completed-${dateKey}`} 
                        open={expandedDateGroups.has(`completed-${dateKey}`)}
                        onOpenChange={() => toggleDateGroup(`completed-${dateKey}`)}
                      >
                        <CollapsibleTrigger asChild>
                          <Card className="cursor-pointer hover:bg-success/10 transition-colors opacity-80">
                            <CardContent className="p-3 flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                {expandedDateGroups.has(`completed-${dateKey}`) ? (
                                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                ) : (
                                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                )}
                                <CalendarDays className="h-4 w-4 text-success" />
                                <span className="font-medium text-sm">{formatDateHeader(dateKey)}</span>
                              </div>
                              <Badge className="text-xs bg-success text-success-foreground">
                                {dateJobs.length} completed
                              </Badge>
                            </CardContent>
                          </Card>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="space-y-2 mt-2 ml-2 border-l-2 border-success/20 pl-2">
                          {dateJobs.map((job) => (
                            <Card 
                              key={job.id}
                              className="border-l-4 border-l-success bg-success/5 opacity-80 hover:opacity-100 transition-all cursor-pointer"
                              onClick={() => onSelectJob(job)}
                            >
                              <CardContent className="p-3">
                                <div className="flex flex-wrap items-center gap-1.5 mb-1">
                                  <Badge variant="outline" className="text-xs font-mono px-1.5 py-0">
                                    {job.jobNumber}
                                  </Badge>
                                  <Badge className="text-xs px-1.5 py-0 bg-success text-success-foreground">
                                    Complete
                                  </Badge>
                                  {job.team && (
                                    <Badge 
                                      className="text-xs px-1.5 py-0"
                                      style={getTeamColor(job.team) ? {
                                        backgroundColor: getTeamColor(job.team),
                                        color: getContrastTextColor(getTeamColor(job.team)!)
                                      } : undefined}
                                      variant={getTeamColor(job.team) ? undefined : "secondary"}
                                    >
                                      <Users className="h-3 w-3 mr-1" />
                                      {job.team}
                                    </Badge>
                                  )}
                                  {job.team2 && (
                                    <Badge 
                                      className="text-xs px-1.5 py-0"
                                      style={getTeamColor(job.team2) ? {
                                        backgroundColor: getTeamColor(job.team2),
                                        color: getContrastTextColor(getTeamColor(job.team2)!)
                                      } : undefined}
                                      variant={getTeamColor(job.team2) ? undefined : "secondary"}
                                    >
                                      <Users className="h-3 w-3 mr-1" />
                                      {job.team2}
                                    </Badge>
                                  )}
                                </div>
                                <h3 className="font-medium text-sm text-foreground truncate">{job.name}</h3>
                              </CardContent>
                            </Card>
                          ))}
                        </CollapsibleContent>
                      </Collapsible>
                    ))}
                  </div>
                )}
              </>
            ) : teamGroupedJobs ? (
              <>
                {/* Regular Team View - Jobs grouped by booked date */}
                {/* Expand/Collapse controls for regular team */}
                {activeJobs.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <div className="flex-1" />
                    <Button variant="ghost" size="sm" onClick={expandAllDateGroups} className="text-xs h-7 px-2">
                      <Plus className="h-3 w-3 mr-1" />
                      Expand All
                    </Button>
                    <Button variant="ghost" size="sm" onClick={collapseAllDateGroups} className="text-xs h-7 px-2">
                      <Minus className="h-3 w-3 mr-1" />
                      Collapse
                    </Button>
                    {allActiveDateKeys.includes(todayKey) && (
                      <Button variant="ghost" size="sm" onClick={jumpToToday} className="text-xs h-7 px-2">
                        <ArrowUp className="h-3 w-3 mr-1" />
                        Today
                      </Button>
                    )}
                  </div>
                )}

                {activeJobs.length > 0 && (
                  <div className="space-y-2">
                    <h2 className="text-xs sm:text-sm font-semibold text-muted-foreground uppercase tracking-wider px-1">
                      Active Jobs ({activeJobs.length})
                    </h2>
                    
                    {/* Jobs grouped by booked date */}
                    {Array.from(teamGroupedJobs.grouped.entries()).map(([dateKey, dateJobs]) => (
                      <Collapsible 
                        key={dateKey} 
                        open={expandedDateGroups.has(dateKey)}
                        onOpenChange={() => toggleDateGroup(dateKey)}
                      >
                        <CollapsibleTrigger asChild>
                          <Card className="cursor-pointer hover:bg-muted/50 transition-colors">
                            <CardContent className="p-3 flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                {expandedDateGroups.has(dateKey) ? (
                                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                ) : (
                                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                )}
                                <Calendar className="h-4 w-4 text-primary" />
                                <span className="font-medium text-sm">{formatDateHeader(dateKey)}</span>
                              </div>
                              <Badge variant="secondary" className="text-xs">
                                {dateJobs.length} job{dateJobs.length !== 1 ? 's' : ''}
                              </Badge>
                            </CardContent>
                          </Card>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="space-y-2 mt-2 ml-2 border-l-2 border-primary/20 pl-2">
                          {dateJobs.map((job) => (
                            <Collapsible key={job.id} open={expandedJobs.has(job.id)}>
                              <Card className="border-l-4 border-l-primary bg-card shadow-md hover:shadow-lg transition-all">
                                <CardContent className="p-0">
                                  <div 
                                    className="p-3 sm:p-4 cursor-pointer active:bg-muted/50 transition-colors"
                                    onClick={() => onSelectJob(job)}
                                  >
                                    <div className="flex items-start gap-2 sm:gap-3">
                                      <CollapsibleTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-8 w-8 flex-shrink-0 -ml-1"
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
                                        <div className="flex flex-wrap items-center gap-1.5 mb-1">
                                          <Badge variant="outline" className="text-xs font-mono px-1.5 py-0">
                                            {job.jobNumber}
                                          </Badge>
                                          <Badge 
                                            style={{ backgroundColor: getStatusColor(job.status), color: 'white' }}
                                            className="text-xs px-1.5 py-0"
                                          >
                                            {getStatusLabel(job.status)}
                                          </Badge>
                                          {job.isOngoing && (
                                            <Badge className="text-xs px-1.5 py-0 bg-amber-500 text-white">
                                              Ongoing
                                            </Badge>
                                          )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <h3 className="font-semibold text-sm sm:text-base text-foreground line-clamp-1">
                                            {job.name}
                                          </h3>
                                          {job.bookedDate && (
                                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 flex-shrink-0 bg-primary/10">
                                              <Calendar className="h-3 w-3 mr-1" />
                                              {format(new Date(job.bookedDate), 'EEE d MMM')}
                                            </Badge>
                                          )}
                                        </div>
                                        <div className="mt-2">
                                          <div className="flex items-center justify-between text-xs mb-1">
                                            <span className="text-muted-foreground">Progress</span>
                                            <span className="font-medium">{job.progress}%</span>
                                          </div>
                                          <Progress value={job.progress} className="h-1.5 sm:h-2" />
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                  <CollapsibleContent>
                                    <div className="px-3 sm:px-4 pb-3 sm:pb-4 pt-0 space-y-2 border-t border-border/50">
                                      <div className="pt-3 space-y-2">
                                        {job.address && (
                                          <a 
                                            href={`https://maps.google.com/?q=${encodeURIComponent(job.address)}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-start gap-2 text-xs sm:text-sm text-primary hover:underline"
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            <MapPin className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                                            <span className="line-clamp-2">{job.address}</span>
                                          </a>
                                        )}
                                        {job.phoneNumber && (
                                          <a 
                                            href={`tel:${job.phoneNumber}`}
                                            className="flex items-center gap-2 text-xs sm:text-sm text-primary hover:underline"
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            <Phone className="h-3.5 w-3.5" />
                                            <span>{job.phoneNumber}</span>
                                          </a>
                                        )}
                                        {job.summaryOfWorks && (
                                          <div className="mt-2 bg-muted/50 p-2 rounded">
                                            {isTranslatingList && !translatedSummaries[job.id] && languagePreference !== 'en' && (
                                              <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                                                <Loader2 className="h-3 w-3 animate-spin" />
                                                <span>Translating...</span>
                                              </div>
                                            )}
                                            <p className="text-xs sm:text-sm text-muted-foreground">
                                              {languagePreference !== 'en' && translatedSummaries[job.id]
                                                ? translatedSummaries[job.id]
                                                : job.summaryOfWorks}
                                            </p>
                                          </div>
                                        )}
                                        <div className="flex gap-2 mt-2">
                                          <Button className="flex-1" size="sm" onClick={() => onSelectJob(job)}>
                                            View & Update Job
                                          </Button>
                                          {onRemoveJob && !isOpsManager && (
                                            <Button 
                                              variant="outline" 
                                              size="sm" 
                                              className="text-destructive hover:bg-destructive hover:text-destructive-foreground"
                                            onClick={(e) => handleRemoveJobClick(job, e)}
                                              disabled={removingJobId === job.id}
                                            >
                                              {removingJobId === job.id ? (
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                              ) : (
                                                <EyeOff className="h-4 w-4" />
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
                          ))}
                        </CollapsibleContent>
                      </Collapsible>
                    ))}

                    {/* Unscheduled jobs section */}
                    {teamGroupedJobs.unscheduled.length > 0 && (
                      <Collapsible 
                        open={expandedDateGroups.has('unscheduled')}
                        onOpenChange={() => toggleDateGroup('unscheduled')}
                      >
                        <CollapsibleTrigger asChild>
                          <Card className="cursor-pointer hover:bg-muted/50 transition-colors border-dashed">
                            <CardContent className="p-3 flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                {expandedDateGroups.has('unscheduled') ? (
                                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                ) : (
                                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                )}
                                <Briefcase className="h-4 w-4 text-muted-foreground" />
                                <span className="font-medium text-sm text-muted-foreground">Unscheduled</span>
                              </div>
                              <Badge variant="outline" className="text-xs">
                                {teamGroupedJobs.unscheduled.length} job{teamGroupedJobs.unscheduled.length !== 1 ? 's' : ''}
                              </Badge>
                            </CardContent>
                          </Card>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="space-y-2 mt-2 ml-2 border-l-2 border-muted/40 pl-2">
                          {teamGroupedJobs.unscheduled.map((job) => (
                            <Collapsible key={job.id} open={expandedJobs.has(job.id)}>
                              <Card className="border-l-4 border-l-muted bg-card shadow-md hover:shadow-lg transition-all">
                                <CardContent className="p-0">
                                  <div 
                                    className="p-3 sm:p-4 cursor-pointer active:bg-muted/50 transition-colors"
                                    onClick={() => onSelectJob(job)}
                                  >
                                    <div className="flex items-start gap-2 sm:gap-3">
                                      <CollapsibleTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-8 w-8 flex-shrink-0 -ml-1"
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
                                        <div className="flex flex-wrap items-center gap-1.5 mb-1">
                                          <Badge variant="outline" className="text-xs font-mono px-1.5 py-0">
                                            {job.jobNumber}
                                          </Badge>
                                          <Badge 
                                            style={{ backgroundColor: getStatusColor(job.status), color: 'white' }}
                                            className="text-xs px-1.5 py-0"
                                          >
                                            {getStatusLabel(job.status)}
                                          </Badge>
                                          {job.isOngoing && (
                                            <Badge className="text-xs px-1.5 py-0 bg-amber-500 text-white">
                                              Ongoing
                                            </Badge>
                                          )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <h3 className="font-semibold text-sm sm:text-base text-foreground line-clamp-1">
                                            {job.name}
                                          </h3>
                                        </div>
                                        <div className="mt-2">
                                          <div className="flex items-center justify-between text-xs mb-1">
                                            <span className="text-muted-foreground">Progress</span>
                                            <span className="font-medium">{job.progress}%</span>
                                          </div>
                                          <Progress value={job.progress} className="h-1.5 sm:h-2" />
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                  <CollapsibleContent>
                                    <div className="px-3 sm:px-4 pb-3 sm:pb-4 pt-0 space-y-2 border-t border-border/50">
                                      <div className="pt-3 space-y-2">
                                        {job.address && (
                                          <a 
                                            href={`https://maps.google.com/?q=${encodeURIComponent(job.address)}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-start gap-2 text-xs sm:text-sm text-primary hover:underline"
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            <MapPin className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                                            <span className="line-clamp-2">{job.address}</span>
                                          </a>
                                        )}
                                        {job.phoneNumber && (
                                          <a 
                                            href={`tel:${job.phoneNumber}`}
                                            className="flex items-center gap-2 text-xs sm:text-sm text-primary hover:underline"
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            <Phone className="h-3.5 w-3.5" />
                                            <span>{job.phoneNumber}</span>
                                          </a>
                                        )}
                                        {job.summaryOfWorks && (
                                          <div className="mt-2 bg-muted/50 p-2 rounded">
                                            {isTranslatingList && !translatedSummaries[job.id] && languagePreference !== 'en' && (
                                              <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                                                <Loader2 className="h-3 w-3 animate-spin" />
                                                <span>Translating...</span>
                                              </div>
                                            )}
                                            <p className="text-xs sm:text-sm text-muted-foreground">
                                              {languagePreference !== 'en' && translatedSummaries[job.id]
                                                ? translatedSummaries[job.id]
                                                : job.summaryOfWorks}
                                            </p>
                                          </div>
                                        )}
                                        <div className="flex gap-2 mt-2">
                                          <Button className="flex-1" size="sm" onClick={() => onSelectJob(job)}>
                                            View & Update Job
                                          </Button>
                                          {onRemoveJob && !isOpsManager && (
                                            <Button 
                                              variant="outline" 
                                              size="sm" 
                                              className="text-destructive hover:bg-destructive hover:text-destructive-foreground"
                                              onClick={(e) => handleRemoveJobClick(job, e)}
                                              disabled={removingJobId === job.id}
                                            >
                                              {removingJobId === job.id ? (
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                              ) : (
                                                <EyeOff className="h-4 w-4" />
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
                          ))}
                        </CollapsibleContent>
                      </Collapsible>
                    )}
                  </div>
                )}

                {/* Completed Jobs - Regular team view */}
                {completedJobs.length > 0 && (
                  <div className="space-y-3 mt-6">
                    <h2 className="text-xs sm:text-sm font-semibold text-muted-foreground uppercase tracking-wider px-1">
                      Completed ({completedJobs.length})
                    </h2>
                    {completedJobs.slice(0, 10).map((job) => (
                      <Card 
                        key={job.id}
                        className="border-l-4 border-l-success bg-success/5 opacity-80 hover:opacity-100 transition-all cursor-pointer"
                        onClick={() => onSelectJob(job)}
                      >
                        <CardContent className="p-3 sm:p-4">
                          <div className="flex flex-wrap items-center gap-1.5 mb-1">
                            <Badge variant="outline" className="text-xs font-mono px-1.5 py-0">
                              {job.jobNumber}
                            </Badge>
                            <Badge className="text-xs px-1.5 py-0 bg-success text-success-foreground">
                              Complete
                            </Badge>
                          </div>
                          <h3 className="font-medium text-sm sm:text-base text-foreground truncate">
                            {job.name}
                          </h3>
                          {job.completionDate && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Completed: {format(new Date(job.completionDate), 'MMM d, yyyy')}
                            </p>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </>
            ) : null}
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