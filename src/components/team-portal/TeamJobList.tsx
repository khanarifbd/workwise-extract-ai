import { useState } from 'react';
import { Job, JOB_STATUS_OPTIONS } from '@/types/job';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { RefreshCw, LogOut, MapPin, ChevronRight, ChevronDown, Briefcase, Loader2, Bell, BellOff, Calendar, Phone, Smartphone } from 'lucide-react';
import { format } from 'date-fns';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { useCapacitorPush } from '@/hooks/useCapacitorPush';

interface TeamJobListProps {
  jobs: Job[];
  teamName: string;
  teamId: string;
  isLoading: boolean;
  onSelectJob: (job: Job) => void;
  onRefresh: () => void;
  onLogout: () => void;
}

export const TeamJobList = ({
  jobs,
  teamName,
  teamId,
  isLoading,
  onSelectJob,
  onRefresh,
  onLogout,
}: TeamJobListProps) => {
  // Web push notifications (PWA)
  const { isSupported: webPushSupported, isSubscribed: webPushSubscribed, isLoading: webPushLoading, subscribe: webSubscribe, unsubscribe: webUnsubscribe } = usePushNotifications(teamId);
  
  // Native push notifications (Capacitor - Android/iOS)
  const { isSupported: nativePushSupported, isRegistered: nativePushRegistered, isLoading: nativePushLoading, register: nativeRegister, unregister: nativeUnregister } = useCapacitorPush(teamId);
  
  const [expandedJobs, setExpandedJobs] = useState<Set<string>>(new Set());

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

  const activeJobs = jobs.filter(j => !j.isCompleted);
  const completedJobs = jobs.filter(j => j.isCompleted);

  return (
    <div className="pb-20 min-h-screen">
      {/* Header - Mobile optimized */}
      <div className="bg-primary text-primary-foreground sticky top-0 z-10 shadow-md safe-area-top">
        <div className="px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <h1 className="text-lg sm:text-xl font-bold truncate">Team {teamName}</h1>
              <p className="text-primary-foreground/80 text-xs sm:text-sm">
                {activeJobs.length} active job{activeJobs.length !== 1 ? 's' : ''}
              </p>
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
        </div>
      </div>

      {/* Job List - Mobile optimized */}
      <div className="p-3 sm:p-4 space-y-3">
        {isLoading && jobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
            <p className="text-muted-foreground">Loading jobs...</p>
          </div>
        ) : jobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Briefcase className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-lg font-medium text-muted-foreground">No jobs assigned</p>
            <p className="text-sm text-muted-foreground/80 text-center px-4">
              Jobs assigned to your team will appear here
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
    </div>
  );
};