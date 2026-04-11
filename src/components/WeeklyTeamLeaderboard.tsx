import { useMemo } from 'react';
import { Job } from '@/types/job';
import { Trophy, Medal, Award } from 'lucide-react';
import { cn } from '@/lib/utils';
import { startOfWeek, endOfWeek, isWithinInterval } from 'date-fns';
import { getGMTNow } from '@/lib/dateUtils';

interface WeeklyTeamLeaderboardProps {
  jobs: Job[];
}

interface TeamScore {
  team: string;
  booked: number;
  completed: number;
  rate: number;
}

function isCompleted(j: Job): boolean {
  return j.status === 'complete' || j.isCompleted;
}

export const WeeklyTeamLeaderboard = ({ jobs }: WeeklyTeamLeaderboardProps) => {
  const now = useMemo(() => getGMTNow(), []);

  const weekStart = useMemo(() => startOfWeek(now, { weekStartsOn: 1 }), [now]);
  const weekEnd = useMemo(() => endOfWeek(now, { weekStartsOn: 1 }), [now]);

  const leaderboard = useMemo(() => {
    // Get all jobs that have a booked date within this week and are assigned to a team
    const weekJobs = jobs.filter(j => {
      if (!j.team) return false;
      if (!j.bookedDate) return false;
      const bd = j.bookedDate instanceof Date ? j.bookedDate : new Date(j.bookedDate);
      if (isNaN(bd.getTime())) return false;
      return isWithinInterval(bd, { start: weekStart, end: weekEnd });
    });

    // Group by team
    const teamMap = new Map<string, { booked: number; completed: number }>();
    weekJobs.forEach(j => {
      const team = j.team!;
      const entry = teamMap.get(team) || { booked: 0, completed: 0 };
      entry.booked++;
      if (isCompleted(j)) entry.completed++;
      teamMap.set(team, entry);
    });

    // Convert to sorted array
    const scores: TeamScore[] = Array.from(teamMap.entries())
      .map(([team, { booked, completed }]) => ({
        team,
        booked,
        completed,
        rate: booked > 0 ? Math.round((completed / booked) * 100) : 0,
      }))
      .sort((a, b) => {
        // Sort by rate desc, then by completed count desc as tiebreaker
        if (b.rate !== a.rate) return b.rate - a.rate;
        return b.completed - a.completed;
      });

    return scores;
  }, [jobs, weekStart, weekEnd]);

  if (leaderboard.length === 0) {
    return (
      <div className="text-xs text-muted-foreground py-1 px-2">
        No booked jobs this week yet.
      </div>
    );
  }

  const getRankIcon = (rank: number) => {
    if (rank === 0) return <Trophy className="w-4 h-4 text-yellow-500 shrink-0" />;
    if (rank === 1) return <Medal className="w-4 h-4 text-gray-400 shrink-0" />;
    if (rank === 2) return <Award className="w-4 h-4 text-amber-700 shrink-0" />;
    return <span className="w-4 h-4 text-[10px] font-bold text-muted-foreground flex items-center justify-center shrink-0">{rank + 1}</span>;
  };

  const getRankBg = (rank: number) => {
    if (rank === 0) return 'bg-yellow-500/10 border-yellow-500/30';
    if (rank === 1) return 'bg-gray-400/10 border-gray-400/30';
    if (rank === 2) return 'bg-amber-700/10 border-amber-700/30';
    return 'bg-muted/30 border-transparent';
  };

  return (
    <div className="flex flex-wrap gap-1.5">
      {leaderboard.map((entry, idx) => (
        <div
          key={entry.team}
          className={cn(
            "flex items-center gap-1.5 border rounded-md px-2 py-1 text-xs",
            getRankBg(idx)
          )}
        >
          {getRankIcon(idx)}
          <span className="font-semibold text-foreground">{entry.team}</span>
          <span className="text-muted-foreground">
            {entry.completed}/{entry.booked}
          </span>
          <span className={cn(
            "font-bold text-[10px]",
            entry.rate >= 80 ? "text-success" : entry.rate >= 50 ? "text-warning" : "text-destructive"
          )}>
            {entry.rate}%
          </span>
        </div>
      ))}
    </div>
  );
};
