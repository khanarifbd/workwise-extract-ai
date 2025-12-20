import { useMemo } from 'react';
import { Job, ALLSAINTS_TEAMS } from '@/types/job';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { format } from 'date-fns';
import { CheckCircle2, Phone, MapPin, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

interface KanbanBoardProps {
  jobs: Job[];
  groupBy: 'team' | 'status';
  onJobClick: (job: Job) => void;
  onToggleComplete: (job: Job) => void;
}

export const KanbanBoard = ({ jobs, groupBy, onJobClick, onToggleComplete }: KanbanBoardProps) => {
  const columns = useMemo(() => {
    if (groupBy === 'team') {
      const teamColumns: { id: string; title: string; color: string; jobs: Job[] }[] = [
        { id: 'unassigned', title: 'Unassigned', color: '#6B7280', jobs: [] },
        ...ALLSAINTS_TEAMS.map(team => ({
          id: team.id,
          title: team.name,
          color: team.color,
          jobs: [] as Job[]
        }))
      ];

      jobs.forEach(job => {
        const team = ALLSAINTS_TEAMS.find(t => t.name === job.team);
        if (team) {
          const col = teamColumns.find(c => c.id === team.id);
          col?.jobs.push(job);
        } else {
          teamColumns[0].jobs.push(job);
        }
      });

      return teamColumns.filter(col => col.jobs.length > 0 || col.id === 'unassigned');
    } else {
      const statusColumns = [
        { id: 'not-started', title: 'Not Started', color: '#6B7280', jobs: [] as Job[] },
        { id: 'in-progress', title: 'In Progress', color: '#F59E0B', jobs: [] as Job[] },
        { id: 'completed', title: 'Completed', color: '#10B981', jobs: [] as Job[] }
      ];

      jobs.forEach(job => {
        if (job.isCompleted || job.progress === 100) {
          statusColumns[2].jobs.push(job);
        } else if (job.progress > 0) {
          statusColumns[1].jobs.push(job);
        } else {
          statusColumns[0].jobs.push(job);
        }
      });

      return statusColumns;
    }
  }, [jobs, groupBy]);

  return (
    <div className="flex gap-4 overflow-x-auto pb-4 h-full">
      {columns.map((column) => (
        <div
          key={column.id}
          className="flex-shrink-0 w-80 bg-muted/30 rounded-lg border border-border flex flex-col"
        >
          {/* Column Header */}
          <div
            className="p-3 border-b border-border rounded-t-lg"
            style={{ borderTopColor: column.color, borderTopWidth: 3 }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: column.color }}
                />
                <h3 className="font-semibold">{column.title}</h3>
              </div>
              <Badge variant="secondary">{column.jobs.length}</Badge>
            </div>
          </div>

          {/* Column Content */}
          <div className="flex-1 p-2 space-y-2 overflow-y-auto max-h-[calc(100vh-340px)]">
            {column.jobs.map((job) => {
              const isCompleted = job.isCompleted || job.progress === 100;
              
              return (
                <div
                  key={job.id}
                  className={cn(
                    "bg-card border rounded-lg p-3 cursor-pointer transition-all hover:shadow-md",
                    isCompleted
                      ? "border-l-4 border-l-success bg-success/5"
                      : "border-border hover:border-primary/50"
                  )}
                  onClick={() => onJobClick(job)}
                >
                  {/* Job Header */}
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <span className="font-mono text-sm font-semibold text-primary">
                        {job.jobNumber}
                      </span>
                      <p className="font-medium text-foreground mt-0.5">{job.name}</p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleComplete(job);
                      }}
                      className={cn(
                        "p-1 rounded-full transition-colors",
                        isCompleted
                          ? "text-success hover:bg-success/20"
                          : "text-muted-foreground hover:bg-muted"
                      )}
                    >
                      <CheckCircle2 className={cn("w-5 h-5", isCompleted && "fill-success")} />
                    </button>
                  </div>

                  {/* Contact Info */}
                  <div className="space-y-1 text-xs text-muted-foreground mb-2">
                    <div className="flex items-center gap-1.5">
                      <MapPin className="w-3 h-3" />
                      <span className="truncate">{job.address}</span>
                    </div>
                    {job.phoneNumber && (
                      <div className="flex items-center gap-1.5">
                        <Phone className="w-3 h-3" />
                        <span>{job.phoneNumber}</span>
                      </div>
                    )}
                  </div>

                  {/* Team Badge */}
                  {groupBy === 'status' && job.team && (
                    <div className="mb-2">
                      <Badge
                        className="text-xs"
                        style={{
                          backgroundColor: ALLSAINTS_TEAMS.find(t => t.name === job.team)?.color,
                          color: 'white'
                        }}
                      >
                        <Users className="w-3 h-3 mr-1" />
                        {job.team}
                      </Badge>
                    </div>
                  )}

                  {/* Progress */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Progress</span>
                      <span className="font-medium">{job.progress}%</span>
                    </div>
                    <Progress value={job.progress} className="h-1.5" />
                  </div>

                  {/* SOR Codes */}
                  {job.workItems.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {job.workItems.slice(0, 3).map((item, idx) => (
                        <Badge key={idx} variant="outline" className="text-xs px-1.5 py-0">
                          {item.sorCode}
                        </Badge>
                      ))}
                      {job.workItems.length > 3 && (
                        <Badge variant="outline" className="text-xs px-1.5 py-0">
                          +{job.workItems.length - 3}
                        </Badge>
                      )}
                    </div>
                  )}

                  {/* Date */}
                  <p className="text-xs text-muted-foreground mt-2">
                    {format(job.dateIssued, 'dd MMM yyyy')}
                  </p>
                </div>
              );
            })}

            {column.jobs.length === 0 && (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No jobs
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};
