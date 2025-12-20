import { Job, JOB_STATUS_OPTIONS } from '@/types/job';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { RefreshCw, LogOut, MapPin, Phone, ChevronRight, Briefcase, Loader2 } from 'lucide-react';
import { format } from 'date-fns';

interface TeamJobListProps {
  jobs: Job[];
  teamName: string;
  isLoading: boolean;
  onSelectJob: (job: Job) => void;
  onRefresh: () => void;
  onLogout: () => void;
}

export const TeamJobList = ({
  jobs,
  teamName,
  isLoading,
  onSelectJob,
  onRefresh,
  onLogout,
}: TeamJobListProps) => {
  const getStatusColor = (status: string) => {
    const option = JOB_STATUS_OPTIONS.find(o => o.value === status);
    return option?.color || '#6B7280';
  };

  const getStatusLabel = (status: string) => {
    const option = JOB_STATUS_OPTIONS.find(o => o.value === status);
    return option?.label || status;
  };

  const activeJobs = jobs.filter(j => !j.isCompleted);
  const completedJobs = jobs.filter(j => j.isCompleted);

  return (
    <div className="pb-20">
      {/* Header */}
      <div className="bg-primary text-primary-foreground sticky top-0 z-10 shadow-md">
        <div className="px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold">Team {teamName}</h1>
              <p className="text-primary-foreground/80 text-sm">
                {activeJobs.length} active jobs
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="icon"
                onClick={onRefresh}
                disabled={isLoading}
              >
                <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              </Button>
              <Button
                variant="secondary"
                size="icon"
                onClick={onLogout}
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Job List */}
      <div className="p-4 space-y-3">
        {isLoading && jobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
            <p className="text-muted-foreground">Loading jobs...</p>
          </div>
        ) : jobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Briefcase className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-lg font-medium text-muted-foreground">No jobs assigned</p>
            <p className="text-sm text-muted-foreground/80">
              Jobs assigned to your team will appear here
            </p>
          </div>
        ) : (
          <>
            {/* Active Jobs */}
            {activeJobs.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider px-1">
                  Active Jobs
                </h2>
                {activeJobs.map((job) => (
                  <Card
                    key={job.id}
                    className="cursor-pointer hover:shadow-md transition-shadow active:scale-[0.99]"
                    onClick={() => onSelectJob(job)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge 
                              variant="outline" 
                              className="text-xs font-mono"
                            >
                              {job.jobNumber}
                            </Badge>
                            <Badge 
                              style={{ 
                                backgroundColor: getStatusColor(job.status),
                                color: 'white'
                              }}
                              className="text-xs"
                            >
                              {getStatusLabel(job.status)}
                            </Badge>
                          </div>
                          
                          <h3 className="font-semibold text-foreground truncate">
                            {job.name}
                          </h3>
                          
                          {job.address && (
                            <div className="flex items-start gap-1.5 text-sm text-muted-foreground mt-1">
                              <MapPin className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                              <span className="line-clamp-2">{job.address}</span>
                            </div>
                          )}

                          {job.bookedDate && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Booked: {format(new Date(job.bookedDate), 'MMM d, yyyy')}
                            </p>
                          )}

                          {/* Progress bar */}
                          <div className="mt-3">
                            <div className="flex items-center justify-between text-xs mb-1">
                              <span className="text-muted-foreground">Progress</span>
                              <span className="font-medium">{job.progress}%</span>
                            </div>
                            <Progress value={job.progress} className="h-2" />
                          </div>
                        </div>
                        
                        <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-1" />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* Completed Jobs */}
            {completedJobs.length > 0 && (
              <div className="space-y-3 mt-6">
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider px-1">
                  Completed ({completedJobs.length})
                </h2>
                {completedJobs.slice(0, 5).map((job) => (
                  <Card
                    key={job.id}
                    className="cursor-pointer hover:shadow-md transition-shadow active:scale-[0.99] opacity-75"
                    onClick={() => onSelectJob(job)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge 
                              variant="outline" 
                              className="text-xs font-mono"
                            >
                              {job.jobNumber}
                            </Badge>
                            <Badge 
                              style={{ backgroundColor: '#10B981', color: 'white' }}
                              className="text-xs"
                            >
                              Complete
                            </Badge>
                          </div>
                          <h3 className="font-medium text-foreground truncate">
                            {job.name}
                          </h3>
                        </div>
                        <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
