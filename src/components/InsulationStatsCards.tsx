import { Job } from '@/types/job';
import { Home, Clock, CheckCircle2, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

interface InsulationStatsCardsProps {
  jobs: Job[];
}

export const InsulationStatsCards = ({ jobs }: InsulationStatsCardsProps) => {
  // Calculate insulation statistics
  const totalUnitsIdentified = jobs.reduce((sum, job) => {
    const insulationInfo = (job as any).insulationInfo || [];
    if (!insulationInfo || insulationInfo.length === 0) return sum;
    return sum + insulationInfo.reduce((unitSum: number, unit: any) => unitSum + (unit.quantity || 0), 0);
  }, 0);

  const jobsWithInsulation = jobs.filter(j => {
    const info = (j as any).insulationInfo;
    return info && info.length > 0;
  }).length;
  
  const pendingInstallations = jobs.filter(j => {
    const info = (j as any).insulationInfo;
    return info && info.length > 0 && 
      j.status !== 'complete' && !j.isCompleted;
  }).length;

  const completedInstallations = jobs.filter(j => {
    const info = (j as any).insulationInfo;
    return info && info.length > 0 && 
      (j.status === 'complete' || j.isCompleted);
  }).length;

  const assignedJobs = jobs.filter(j => {
    const info = (j as any).insulationInfo;
    return info && info.length > 0 && j.team;
  }).length;

  const stats = [
    { label: 'Total Units', value: totalUnitsIdentified, icon: Home, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
    { label: 'Insulation Jobs', value: jobsWithInsulation, icon: Home, color: 'text-primary', bg: 'bg-primary/10' },
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
