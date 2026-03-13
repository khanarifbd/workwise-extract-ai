import { forwardRef } from 'react';
import { Job } from '@/types/job';
import { 
  Briefcase, 
  CheckCircle2, 
  Clock, 
  Users,
  TrendingUp,
  CalendarCheck
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatsCardsProps {
  jobs: Job[];
  allJobs?: Job[]; // All jobs including booked ones for counting
}

export const StatsCards = forwardRef<HTMLDivElement, StatsCardsProps>(({ jobs, allJobs }, ref) => {
  const totalJobs = jobs.length;
  // UNIFIED COMPLETED DEFINITION: status === 'complete' OR isCompleted === true
  const completedJobs = jobs.filter(j => j.status === 'complete' || j.isCompleted).length;
  // Active = not completed and has some progress or a non-default status
  const inProgressJobs = jobs.filter(j => {
    if (j.status === 'complete' || j.isCompleted) return false;
    if (j.progress > 0) return true;
    if (j.status && j.status !== 'pending') return true;
    return false;
  }).length;
  const assignedJobs = jobs.filter(j => j.team !== null && j.team !== undefined && j.team !== '').length;
  const avgProgress = jobs.length > 0 
    ? Math.round(jobs.reduce((sum, j) => sum + (j.progress || 0), 0) / jobs.length)
    : 0;
  const bookedCount = (allJobs || jobs).filter(j => {
    if (j.status === 'complete' || j.isCompleted) return false;
    return !!j.bookedDate;
  }).length;

  const stats = [
    { label: 'Total', value: totalJobs, icon: Briefcase, color: 'text-primary', bg: 'bg-primary/10' },
    { label: 'Complete', value: completedJobs, icon: CheckCircle2, color: 'text-success', bg: 'bg-success/10' },
    { label: 'Active', value: inProgressJobs, icon: Clock, color: 'text-warning', bg: 'bg-warning/10' },
    { label: 'Assigned', value: assignedJobs, icon: Users, color: 'text-primary', bg: 'bg-primary/10' },
    { label: 'Booked', value: bookedCount, icon: CalendarCheck, color: 'text-amber-600', bg: 'bg-amber-500/10' },
    { label: 'Avg %', value: `${avgProgress}%`, icon: TrendingUp, color: 'text-success', bg: 'bg-success/10' },
  ];

  return (
    <div ref={ref} className="flex flex-wrap gap-2">
      {stats.map((stat) => (
        <div 
          key={stat.label}
          className="flex items-center gap-2 bg-card border border-border rounded-lg px-3 py-2"
        >
          <div className={cn("w-7 h-7 rounded-md flex items-center justify-center", stat.bg)}>
            <stat.icon className={cn("w-4 h-4", stat.color)} />
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-lg font-bold text-foreground">{stat.value}</span>
            <span className="text-xs text-muted-foreground">{stat.label}</span>
          </div>
        </div>
      ))}
    </div>
  );
});

StatsCards.displayName = 'StatsCards';
