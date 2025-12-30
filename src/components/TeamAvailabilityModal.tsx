import React, { useState } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isToday, isBefore, startOfDay } from 'date-fns';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ChevronRight, Calendar, AlertTriangle } from 'lucide-react';
import { useTeamSettings, TeamSetting } from '@/hooks/useTeamSettings';
import { useTeamAvailability } from '@/hooks/useTeamAvailability';
import { cn } from '@/lib/utils';

interface TeamAvailabilityModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const TeamAvailabilityModal: React.FC<TeamAvailabilityModalProps> = ({
  open,
  onOpenChange,
}) => {
  const { settings: teams, isLoading: teamsLoading } = useTeamSettings();
  const { unavailableDays, getTeamUnavailableDates, isTeamUnavailable } = useTeamAvailability();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedTeam, setSelectedTeam] = useState<TeamSetting | null>(null);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const prevMonth = () => setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1));
  const nextMonth = () => setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1));

  // Get unavailable count for a team in current month
  const getTeamUnavailableCount = (teamId: string) => {
    return unavailableDays.filter(day => {
      const date = new Date(day.unavailableDate);
      return day.teamId === teamId && isSameMonth(date, currentMonth);
    }).length;
  };

  // Get all teams with unavailable days for a specific date
  const getUnavailableTeamsForDate = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return teams.filter(team => isTeamUnavailable(team.teamId, dateStr));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Team Availability
          </DialogTitle>
        </DialogHeader>

        <div className="flex gap-4 h-[600px]">
          {/* Team List */}
          <div className="w-64 border-r pr-4">
            <h3 className="font-medium mb-3 text-sm text-muted-foreground">Teams</h3>
            <ScrollArea className="h-[540px]">
              <div className="space-y-2">
                <Button
                  variant={selectedTeam === null ? "secondary" : "ghost"}
                  className="w-full justify-start"
                  onClick={() => setSelectedTeam(null)}
                >
                  <span>All Teams</span>
                </Button>
                {teams.map((team) => {
                  const unavailableCount = getTeamUnavailableCount(team.teamId);
                  return (
                    <Button
                      key={team.teamId}
                      variant={selectedTeam?.teamId === team.teamId ? "secondary" : "ghost"}
                      className="w-full justify-between"
                      onClick={() => setSelectedTeam(team)}
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: team.color || '#3B82F6' }}
                        />
                        <span className="truncate">{team.teamName}</span>
                      </div>
                      {unavailableCount > 0 && (
                        <Badge variant="destructive" className="text-xs">
                          {unavailableCount}
                        </Badge>
                      )}
                    </Button>
                  );
                })}
              </div>
            </ScrollArea>
          </div>

          {/* Calendar View */}
          <div className="flex-1">
            {/* Month Navigation */}
            <div className="flex items-center justify-between mb-4">
              <Button variant="ghost" size="icon" onClick={prevMonth}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <h3 className="font-semibold">
                {format(currentMonth, 'MMMM yyyy')}
              </h3>
              <Button variant="ghost" size="icon" onClick={nextMonth}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            {/* Day Headers */}
            <div className="grid grid-cols-7 gap-1 mb-2">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                <div
                  key={day}
                  className="text-center text-xs font-medium text-muted-foreground py-2"
                >
                  {day}
                </div>
              ))}
            </div>

            {/* Calendar Grid */}
            <div className="grid grid-cols-7 gap-1">
              {/* Empty cells for days before month starts */}
              {Array.from({ length: monthStart.getDay() }).map((_, i) => (
                <div key={`empty-${i}`} className="h-20" />
              ))}

              {daysInMonth.map((day) => {
                const dateStr = format(day, 'yyyy-MM-dd');
                const unavailableTeams = selectedTeam
                  ? (isTeamUnavailable(selectedTeam.teamId, dateStr) ? [selectedTeam] : [])
                  : getUnavailableTeamsForDate(day);
                const isPast = isBefore(startOfDay(day), startOfDay(new Date()));

                return (
                  <div
                    key={dateStr}
                    className={cn(
                      "h-20 border rounded-lg p-1 text-xs overflow-hidden",
                      isToday(day) && "border-primary border-2",
                      isPast && "bg-muted/50",
                      unavailableTeams.length > 0 && !isPast && "bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-800"
                    )}
                  >
                    <div className={cn(
                      "font-medium mb-1",
                      isToday(day) && "text-primary"
                    )}>
                      {format(day, 'd')}
                    </div>
                    <ScrollArea className="h-12">
                      {unavailableTeams.map((team) => (
                        <div
                          key={team.teamId}
                          className="flex items-center gap-1 mb-0.5"
                        >
                          <AlertTriangle className="h-3 w-3 text-red-500 flex-shrink-0" />
                          <span className="truncate text-red-600 dark:text-red-400">
                            {team.teamName}
                          </span>
                        </div>
                      ))}
                    </ScrollArea>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
