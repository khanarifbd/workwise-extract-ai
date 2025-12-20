import { Job } from '@/types/job';
import { Fan, Clock, CheckCircle2, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FanStatsCardsProps {
  jobs: Job[];
}

export const FanStatsCards = ({ jobs }: FanStatsCardsProps) => {
  // Calculate fan statistics
  const totalFansIdentified = jobs.reduce((sum, job) => {
    if (!job.fanInfo || job.fanInfo.length === 0) return sum;
    return sum + job.fanInfo.reduce((fanSum, fan) => fanSum + fan.quantity, 0);
  }, 0);

  const jobsWithFans = jobs.filter(j => j.fanInfo && j.fanInfo.length > 0).length;
  
  const pendingInstallations = jobs.filter(j => 
    j.fanInfo && j.fanInfo.length > 0 && 
    j.status !== 'complete' && !j.isCompleted
  ).length;

  const completedInstallations = jobs.filter(j => 
    j.fanInfo && j.fanInfo.length > 0 && 
    (j.status === 'complete' || j.isCompleted)
  ).length;

  const assignedJobs = jobs.filter(j => 
    j.fanInfo && j.fanInfo.length > 0 && j.team
  ).length;

  const stats = [
    { label: 'Total Fans', value: totalFansIdentified, icon: Fan, color: 'text-cyan-500', bg: 'bg-cyan-500/10' },
    { label: 'Fan Jobs', value: jobsWithFans, icon: Fan, color: 'text-primary', bg: 'bg-primary/10' },
    { label: 'Pending', value: pendingInstallations, icon: Clock, color: 'text-warning', bg: 'bg-warning/10' },
    { label: 'Complete', value: completedInstallations, icon: CheckCircle2, color: 'text-success', bg: 'bg-success/10' },
    { label: 'Assigned', value: assignedJobs, icon: Users, color: 'text-primary', bg: 'bg-primary/10' },
  ];

  return (
    <div className="flex flex-wrap gap-2">
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
};
