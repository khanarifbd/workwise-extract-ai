import { useMemo } from 'react';
import { Job } from '@/types/job';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertTriangle, Clock, MapPin, Phone, Users, X, ExternalLink } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { getGMTNow, getHoursDifferenceGMT } from '@/lib/dateUtils';

interface OverdueJobsDashboardProps {
  jobs: Job[];
  signOffStatuses?: Record<string, { allSignedOff: boolean }>;
  onClose: () => void;
  onJobClick: (job: Job) => void;
}

interface OverdueJob extends Job {
  hoursOverdue: number;
  overdueReason: 'auto' | 'manual';
}

export const OverdueJobsDashboard = ({
  jobs,
  signOffStatuses = {},
  onClose,
  onJobClick,
}: OverdueJobsDashboardProps) => {
  const overdueJobs = useMemo(() => {
    const now = getGMTNow();
    const result: OverdueJob[] = [];

    for (const job of jobs) {
      // Skip completed or cancelled jobs
      if (job.isCompleted || job.progress === 100) continue;
      if (job.status === 'pause' || job.status === 'jan2026') continue;

      // Check manual ongoing flag
      if (job.isOngoing) {
        result.push({
          ...job,
          hoursOverdue: 0,
          overdueReason: 'manual',
        });
        continue;
      }

      // Check auto-trigger: 24+ hours past booked date without sign-off
      if (job.bookedDate) {
        const bookedDate = job.bookedDate instanceof Date 
          ? job.bookedDate 
          : new Date(job.bookedDate);

        if (!isNaN(bookedDate.getTime())) {
          const hoursPast = getHoursDifferenceGMT(now, bookedDate);
          
          // Check if booked date is in the past and more than 24 hours ago
          if (bookedDate.getTime() < now.getTime() && hoursPast > 24) {
            const signOffData = signOffStatuses[job.id];
            const isNotSignedOff = !signOffData?.allSignedOff;

            if (isNotSignedOff) {
              result.push({
                ...job,
                hoursOverdue: hoursPast - 24,
                overdueReason: 'auto',
              });
            }
          }
        }
      }
    }

    // Sort by hours overdue (most overdue first)
    return result.sort((a, b) => {
      // Manual ongoing jobs first, then by hours overdue
      if (a.overdueReason === 'manual' && b.overdueReason !== 'manual') return -1;
      if (a.overdueReason !== 'manual' && b.overdueReason === 'manual') return 1;
      return b.hoursOverdue - a.hoursOverdue;
    });
  }, [jobs, signOffStatuses]);

  const autoOverdueCount = overdueJobs.filter(j => j.overdueReason === 'auto').length;
  const manualOngoingCount = overdueJobs.filter(j => j.overdueReason === 'manual').length;

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-full bg-orange-100 dark:bg-orange-900/30">
            <AlertTriangle className="w-6 h-6 text-orange-600 dark:text-orange-400" />
          </div>
          <div>
            <CardTitle className="text-xl">Jobs Requiring Attention</CardTitle>
            <p className="text-sm text-muted-foreground mt-0.5">
              {overdueJobs.length} job{overdueJobs.length !== 1 ? 's' : ''} need attention
              {autoOverdueCount > 0 && ` • ${autoOverdueCount} overdue`}
              {manualOngoingCount > 0 && ` • ${manualOngoingCount} ongoing`}
            </p>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-5 w-5" />
        </Button>
      </CardHeader>
      <CardContent>
        {overdueJobs.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-4">
              <Clock className="w-8 h-8 text-success" />
            </div>
            <h3 className="text-lg font-semibold text-foreground">All Jobs On Track</h3>
            <p className="text-muted-foreground mt-1">No overdue or ongoing jobs requiring attention.</p>
          </div>
        ) : (
          <ScrollArea className="h-[500px] pr-4">
            <div className="space-y-3">
              {overdueJobs.map((job) => (
                <div
                  key={job.id}
                  className={cn(
                    "border rounded-lg p-4 cursor-pointer transition-all hover:shadow-md",
                    job.overdueReason === 'auto' 
                      ? "border-l-4 border-l-orange-500 bg-orange-50/50 dark:bg-orange-900/10" 
                      : "border-l-4 border-l-amber-500 bg-amber-50/50 dark:bg-amber-900/10"
                  )}
                  onClick={() => onJobClick(job)}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-sm font-bold text-primary">
                          #{job.jobNumber}
                        </span>
                        <Badge 
                          className={cn(
                            "text-white font-bold text-[10px] px-1.5 py-0.5 shadow-sm",
                            job.overdueReason === 'auto' 
                              ? "bg-orange-600 animate-pulse" 
                              : "bg-amber-500"
                          )}
                        >
                          <Clock className="w-3 h-3 mr-0.5" />
                          {job.overdueReason === 'auto' ? 'OVERDUE' : 'ONGOING'}
                        </Badge>
                        {job.overdueReason === 'auto' && job.hoursOverdue > 0 && (
                          <span className="text-xs text-orange-600 dark:text-orange-400 font-medium">
                            {job.hoursOverdue > 48 
                              ? `${Math.floor(job.hoursOverdue / 24)} days overdue`
                              : `${job.hoursOverdue} hours overdue`
                            }
                          </span>
                        )}
                      </div>
                      
                      <h3 className="font-semibold text-foreground mt-1 truncate">
                        {job.name}
                      </h3>
                      
                      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-sm text-muted-foreground">
                        {job.address && (
                          <div className="flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5" />
                            <span className="truncate max-w-[200px]">{job.address}</span>
                          </div>
                        )}
                        {job.phoneNumber && (
                          <div className="flex items-center gap-1">
                            <Phone className="w-3.5 h-3.5" />
                            <span>{job.phoneNumber}</span>
                          </div>
                        )}
                        {job.team && (
                          <div className="flex items-center gap-1">
                            <Users className="w-3.5 h-3.5" />
                            <span>{job.team}</span>
                            {job.team2 && <span>+ {job.team2}</span>}
                          </div>
                        )}
                      </div>

                      {job.bookedDate && (
                        <p className="text-xs text-muted-foreground mt-2">
                          Booked: {format(
                            job.bookedDate instanceof Date ? job.bookedDate : new Date(job.bookedDate),
                            'EEE d MMM yyyy'
                          )} ({formatDistanceToNow(
                            job.bookedDate instanceof Date ? job.bookedDate : new Date(job.bookedDate),
                            { addSuffix: true }
                          )})
                        </p>
                      )}
                    </div>

                    <Button
                      variant="ghost"
                      size="icon"
                      className="flex-shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        onJobClick(job);
                      }}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
};
