import { useMemo, useState } from 'react';
import { Job, ALLSAINTS_TEAMS } from '@/types/job';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  eachDayOfInterval, 
  isSameMonth, 
  isSameDay,
  addMonths,
  subMonths,
  startOfWeek,
  endOfWeek
} from 'date-fns';
import { ChevronLeft, ChevronRight, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CalendarViewProps {
  jobs: Job[];
  onJobClick: (job: Job) => void;
  onToggleComplete: (job: Job) => void;
}

export const CalendarView = ({ jobs, onJobClick, onToggleComplete }: CalendarViewProps) => {
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    
    return eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  }, [currentMonth]);

  const getJobsForDay = (date: Date) => {
    return jobs.filter(job => {
      const startMatch = job.startDate && isSameDay(job.startDate, date);
      const completionMatch = job.completionDate && isSameDay(job.completionDate, date);
      const issuedMatch = isSameDay(job.dateIssued, date);
      return startMatch || completionMatch || issuedMatch;
    });
  };

  const getJobBadgeInfo = (job: Job, date: Date) => {
    const startMatch = job.startDate && isSameDay(job.startDate, date);
    const completionMatch = job.completionDate && isSameDay(job.completionDate, date);
    
    if (completionMatch) {
      return { label: 'Due', color: 'bg-success text-white' };
    } else if (startMatch) {
      return { label: 'Start', color: 'bg-primary text-primary-foreground' };
    }
    return { label: 'Issued', color: 'bg-muted text-muted-foreground' };
  };

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
        >
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <h2 className="text-lg font-semibold">
          {format(currentMonth, 'MMMM yyyy')}
        </h2>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
        >
          <ChevronRight className="w-5 h-5" />
        </Button>
      </div>

      {/* Weekday Headers */}
      <div className="grid grid-cols-7 border-b border-border">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
          <div
            key={day}
            className="p-2 text-center text-sm font-medium text-muted-foreground"
          >
            {day}
          </div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7">
        {calendarDays.map((day, index) => {
          const dayJobs = getJobsForDay(day);
          const isCurrentMonth = isSameMonth(day, currentMonth);
          const isToday = isSameDay(day, new Date());

          return (
            <div
              key={index}
              className={cn(
                "min-h-[100px] border-r border-b border-border p-1",
                !isCurrentMonth && "bg-muted/30",
                index % 7 === 6 && "border-r-0"
              )}
            >
              <div
                className={cn(
                  "text-xs font-medium mb-1 w-6 h-6 flex items-center justify-center rounded-full",
                  isToday && "bg-primary text-primary-foreground",
                  !isCurrentMonth && "text-muted-foreground"
                )}
              >
                {format(day, 'd')}
              </div>
              
              <div className="space-y-0.5 max-h-[80px] overflow-y-auto">
                {dayJobs.slice(0, 3).map(job => {
                  const badgeInfo = getJobBadgeInfo(job, day);
                  const isCompleted = job.isCompleted || job.progress === 100;
                  const team = ALLSAINTS_TEAMS.find(t => t.name === job.team);
                  
                  return (
                    <div
                      key={`${job.id}-${day.toISOString()}`}
                      className={cn(
                        "group flex items-center gap-1 p-1 rounded text-xs cursor-pointer transition-colors",
                        "hover:bg-muted",
                        isCompleted && "opacity-60"
                      )}
                      onClick={() => onJobClick(job)}
                    >
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleComplete(job);
                        }}
                        className={cn(
                          "flex-shrink-0 w-3 h-3 rounded-full border",
                          isCompleted 
                            ? "bg-success border-success" 
                            : "border-muted-foreground hover:border-primary"
                        )}
                      >
                        {isCompleted && <CheckCircle2 className="w-3 h-3 text-success-foreground" />}
                      </button>
                      <div
                        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: team?.color || '#6B7280' }}
                      />
                      <span className={cn(
                        "truncate font-medium",
                        isCompleted && "line-through"
                      )}>
                        {job.jobNumber}
                      </span>
                      <Badge
                        variant="secondary"
                        className={cn("text-[10px] px-1 py-0 h-4", badgeInfo.color)}
                      >
                        {badgeInfo.label}
                      </Badge>
                    </div>
                  );
                })}
                {dayJobs.length > 3 && (
                  <div className="text-[10px] text-muted-foreground text-center">
                    +{dayJobs.length - 3} more
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
