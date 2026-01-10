import { useState, useMemo } from 'react';
import { Job, JOB_STATUS_OPTIONS } from '@/types/job';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { RefreshCw, LogOut, MapPin, ChevronRight, ChevronDown, Briefcase, Loader2, Bell, BellOff, Calendar, Phone, Smartphone, CalendarDays, Crown, Filter, X, Users, Search } from 'lucide-react';
import { format } from 'date-fns';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { useCapacitorPush } from '@/hooks/useCapacitorPush';
import { TeamDiary } from './TeamDiary';
import { LanguageSelector } from './LanguageSelector';
import { cn } from '@/lib/utils';

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
}

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
}: TeamJobListProps) => {
  // Web push notifications (PWA)
  const { isSupported: webPushSupported, isSubscribed: webPushSubscribed, isLoading: webPushLoading, subscribe: webSubscribe, unsubscribe: webUnsubscribe } = usePushNotifications(teamId);
  
  // Native push notifications (Capacitor - Android/iOS)
  const { isSupported: nativePushSupported, isRegistered: nativePushRegistered, isLoading: nativePushLoading, register: nativeRegister, unregister: nativeUnregister } = useCapacitorPush(teamId);
  
  const [expandedJobs, setExpandedJobs] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<'jobs' | 'diary'>('jobs');
  
  // Ops Manager filters
  const [showFilters, setShowFilters] = useState(false);
  const [filterTeam, setFilterTeam] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterDateFrom, setFilterDateFrom] = useState<Date | undefined>();
  const [filterDateTo, setFilterDateTo] = useState<Date | undefined>();
  const [searchQuery, setSearchQuery] = useState('');
  
  // Get unique teams from jobs for filter dropdown
  const availableTeams = useMemo(() => {
    const teams = new Set(jobs.map(j => j.team).filter(Boolean) as string[]);
    return Array.from(teams).sort();
  }, [jobs]);
  
  // Filter jobs for ops manager
  const filteredJobs = useMemo(() => {
    if (!isOpsManager) return jobs;
    
    return jobs.filter(job => {
      // Search query
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesSearch = 
          job.jobNumber.toLowerCase().includes(query) ||
          job.name.toLowerCase().includes(query) ||
          job.address?.toLowerCase().includes(query) ||
          job.team?.toLowerCase().includes(query);
        if (!matchesSearch) return false;
      }
      
      // Team filter
      if (filterTeam && filterTeam !== 'all' && job.team !== filterTeam) return false;
      
      // Status filter
      if (filterStatus && filterStatus !== 'all' && job.status !== filterStatus) return false;
      
      // Date range filter (on booked date)
      if (filterDateFrom && job.bookedDate) {
        const bookedDate = new Date(job.bookedDate);
        if (bookedDate < filterDateFrom) return false;
      }
      if (filterDateTo && job.bookedDate) {
        const bookedDate = new Date(job.bookedDate);
        if (bookedDate > filterDateTo) return false;
      }
      
      return true;
    });
  }, [jobs, isOpsManager, searchQuery, filterTeam, filterStatus, filterDateFrom, filterDateTo]);
  
  const hasActiveFilters = (filterTeam && filterTeam !== 'all') || (filterStatus && filterStatus !== 'all') || filterDateFrom || filterDateTo || searchQuery;
  
  const clearFilters = () => {
    setFilterTeam('all');
    setFilterStatus('all');
    setFilterDateFrom(undefined);
    setFilterDateTo(undefined);
    setSearchQuery('');
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

  const activeJobs = filteredJobs.filter(j => !j.isCompleted);
  const completedJobs = filteredJobs.filter(j => j.isCompleted);
  const totalActiveJobs = jobs.filter(j => !j.isCompleted).length;

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
              {/* Filter button for Ops Manager */}
              {isOpsManager && (
                <Button
                  variant="secondary"
                  size="icon"
                  className={cn("h-9 w-9 sm:h-10 sm:w-10", hasActiveFilters && "ring-2 ring-yellow-300")}
                  onClick={() => setShowFilters(!showFilters)}
                  title="Filter jobs"
                >
                  <Filter className="h-4 w-4" />
                </Button>
              )}
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

      {/* Ops Manager Filters Panel */}
      {isOpsManager && showFilters && (
        <div className="bg-muted/50 border-b border-border p-3 sm:p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Filter className="h-4 w-4" />
              Filter Jobs
            </h3>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="h-7 text-xs">
                <X className="h-3 w-3 mr-1" />
                Clear
              </Button>
            )}
          </div>
          
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search jobs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
          
          <div className="grid grid-cols-2 gap-2">
            {/* Team Filter */}
            <Select value={filterTeam} onValueChange={setFilterTeam}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="All Teams" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Teams</SelectItem>
                {availableTeams.map(team => (
                  <SelectItem key={team} value={team}>{team}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            {/* Status Filter */}
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                {JOB_STATUS_OPTIONS.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          {/* Date Range */}
          <div className="grid grid-cols-2 gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="h-9 justify-start text-left font-normal text-xs">
                  <Calendar className="mr-2 h-3 w-3" />
                  {filterDateFrom ? format(filterDateFrom, 'MMM d') : 'From'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarComponent
                  mode="single"
                  selected={filterDateFrom}
                  onSelect={setFilterDateFrom}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
            
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="h-9 justify-start text-left font-normal text-xs">
                  <Calendar className="mr-2 h-3 w-3" />
                  {filterDateTo ? format(filterDateTo, 'MMM d') : 'To'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarComponent
                  mode="single"
                  selected={filterDateTo}
                  onSelect={setFilterDateTo}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
          
          {hasActiveFilters && (
            <p className="text-xs text-muted-foreground">
              Showing {filteredJobs.length} of {jobs.length} jobs
            </p>
          )}
        </div>
      )}

      {/* Tabs for Jobs and Diary */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'jobs' | 'diary')} className="w-full">
        <div className="border-b border-border bg-background sticky top-[calc(68px+env(safe-area-inset-top,0px))] z-[5] safe-area-left safe-area-right">
          <TabsList className="w-full justify-start rounded-none h-auto p-0 bg-transparent">
            <TabsTrigger 
              value="jobs" 
              className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent py-3"
            >
              <Briefcase className="h-4 w-4 mr-2" />
              Jobs ({activeJobs.length})
            </TabsTrigger>
            <TabsTrigger 
              value="diary" 
              className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent py-3"
            >
              <CalendarDays className="h-4 w-4 mr-2" />
              {isOpsManager ? 'All Teams' : 'My Diary'}
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="diary" className="p-3 sm:p-4 mt-0">
          <TeamDiary teamId={teamId} teamName={teamName} />
        </TabsContent>

        <TabsContent value="jobs" className="mt-0">
          {/* Job List - Mobile optimized */}
          <div className="p-3 sm:p-4 space-y-3">
            {isLoading && jobs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
                <p className="text-muted-foreground">Loading jobs...</p>
              </div>
            ) : filteredJobs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Briefcase className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <p className="text-lg font-medium text-muted-foreground">
                  {hasActiveFilters ? 'No jobs match filters' : 'No jobs assigned'}
                </p>
                <p className="text-sm text-muted-foreground/80 text-center px-4">
                  {hasActiveFilters ? 'Try adjusting your filter criteria' : 'Jobs assigned to your team will appear here'}
                </p>
              </div>
            ) : (
              <>
            {/* Active Jobs - Distinct styling */}
            {activeJobs.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-xs sm:text-sm font-semibold text-muted-foreground uppercase tracking-wider px-1">
                  Active Jobs ({activeJobs.length})
                </h2>
                {activeJobs.map((job) => (
                  <Collapsible key={job.id} open={expandedJobs.has(job.id)}>
                    <Card className="border-l-4 border-l-primary bg-card shadow-md hover:shadow-lg transition-all">
                      <CardContent className="p-0">
                        {/* Collapsed header - always visible */}
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
                                <Badge 
                                  variant="outline" 
                                  className="text-xs font-mono px-1.5 py-0"
                                >
                                  {job.jobNumber}
                                </Badge>
                                <Badge 
                                  style={{ 
                                    backgroundColor: getStatusColor(job.status),
                                    color: 'white'
                                  }}
                                  className="text-xs px-1.5 py-0"
                                >
                                  {getStatusLabel(job.status)}
                                </Badge>
                                {/* Show assigned team for ops manager */}
                                {isOpsManager && job.team && (
                                  <Badge 
                                    variant="secondary"
                                    className="text-xs px-1.5 py-0 bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                                  >
                                    <Users className="h-3 w-3 mr-1" />
                                    {job.team}
                                  </Badge>
                                )}
                              </div>
                              
                              <h3 className="font-semibold text-sm sm:text-base text-foreground line-clamp-2">
                                {job.name}
                              </h3>

                              {/* Progress bar */}
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

                        {/* Expanded content */}
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

                              {job.bookedDate && (
                                <div className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground">
                                  <Calendar className="h-3.5 w-3.5" />
                                  <span>Booked: {format(new Date(job.bookedDate), 'MMM d, yyyy')}</span>
                                </div>
                              )}

                              {job.summaryOfWorks && (
                                <p className="text-xs sm:text-sm text-muted-foreground mt-2 bg-muted/50 p-2 rounded">
                                  {job.summaryOfWorks}
                                </p>
                              )}

                              <Button 
                                className="w-full mt-2" 
                                size="sm"
                                onClick={() => onSelectJob(job)}
                              >
                                View & Update Job
                              </Button>
                            </div>
                          </div>
                        </CollapsibleContent>
                      </CardContent>
                    </Card>
                  </Collapsible>
                ))}
              </div>
            )}

            {/* Completed Jobs - Different styling */}
            {completedJobs.length > 0 && (
              <div className="space-y-3 mt-6">
                <h2 className="text-xs sm:text-sm font-semibold text-muted-foreground uppercase tracking-wider px-1">
                  Completed ({completedJobs.length})
                </h2>
                {completedJobs.slice(0, 10).map((job) => (
                  <Collapsible key={job.id} open={expandedJobs.has(job.id)}>
                    <Card 
                      className="border-l-4 border-l-success bg-success/5 opacity-80 hover:opacity-100 transition-all"
                    >
                      <CardContent className="p-0">
                        <div 
                          className="p-3 sm:p-4 cursor-pointer active:bg-success/10 transition-colors"
                          onClick={() => onSelectJob(job)}
                        >
                          <div className="flex items-center gap-2 sm:gap-3">
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
                                <Badge 
                                  variant="outline" 
                                  className="text-xs font-mono px-1.5 py-0"
                                >
                                  {job.jobNumber}
                                </Badge>
                                <Badge 
                                  className="text-xs px-1.5 py-0 bg-success text-success-foreground"
                                >
                                  Complete
                                </Badge>
                                {/* Show assigned team for ops manager */}
                                {isOpsManager && job.team && (
                                  <Badge 
                                    variant="secondary"
                                    className="text-xs px-1.5 py-0 bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                                  >
                                    <Users className="h-3 w-3 mr-1" />
                                    {job.team}
                                  </Badge>
                                )}
                              </div>
                              <h3 className="font-medium text-sm sm:text-base text-foreground truncate">
                                {job.name}
                              </h3>
                              {job.completionDate && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  Completed: {format(new Date(job.completionDate), 'MMM d, yyyy')}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>

                        <CollapsibleContent>
                          <div className="px-3 sm:px-4 pb-3 sm:pb-4 border-t border-border/50">
                            <div className="pt-3 space-y-2">
                              {job.address && (
                                <div className="flex items-start gap-2 text-xs sm:text-sm text-muted-foreground">
                                  <MapPin className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                                  <span>{job.address}</span>
                                </div>
                              )}
                              {job.progressNotes && (
                                <p className="text-xs sm:text-sm text-muted-foreground bg-muted/50 p-2 rounded">
                                  {job.progressNotes}
                                </p>
                              )}
                            </div>
                          </div>
                        </CollapsibleContent>
                      </CardContent>
                    </Card>
                  </Collapsible>
                ))}
              </div>
            )}
          </>
        )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};