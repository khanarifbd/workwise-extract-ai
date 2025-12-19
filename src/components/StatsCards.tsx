import { Job } from '@/types/job';
import { 
  Briefcase, 
  CheckCircle2, 
  Clock, 
  Users,
  TrendingUp
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatsCardsProps {
  jobs: Job[];
}

export const StatsCards = ({ jobs }: StatsCardsProps) => {
  const totalJobs = jobs.length;
  const completedJobs = jobs.filter(j => j.isCompleted).length;
  const inProgressJobs = jobs.filter(j => !j.isCompleted).length;
  const assignedJobs = jobs.filter(j => j.team !== null).length;
  const avgProgress = jobs.length > 0 
    ? Math.round(jobs.reduce((sum, j) => sum + j.progress, 0) / jobs.length)
    : 0;

  const stats = [
    {
      label: 'Total Jobs',
      value: totalJobs,
      icon: Briefcase,
      color: 'text-primary',
      bg: 'bg-primary/10'
    },
    {
      label: 'Completed',
      value: completedJobs,
      icon: CheckCircle2,
      color: 'text-success',
      bg: 'bg-success/10'
    },
    {
      label: 'In Progress',
      value: inProgressJobs,
      icon: Clock,
      color: 'text-warning',
      bg: 'bg-warning/10'
    },
    {
      label: 'Teams Assigned',
      value: assignedJobs,
      icon: Users,
      color: 'text-primary',
      bg: 'bg-primary/10'
    },
    {
      label: 'Avg Progress',
      value: `${avgProgress}%`,
      icon: TrendingUp,
      color: 'text-success',
      bg: 'bg-success/10'
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
      {stats.map((stat) => (
        <div 
          key={stat.label}
          className="bg-card border border-border rounded-xl p-4 hover:shadow-md transition-shadow"
        >
          <div className="flex items-center gap-3">
            <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", stat.bg)}>
              <stat.icon className={cn("w-5 h-5", stat.color)} />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{stat.value}</p>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
