import React, { useState } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isToday, isBefore, startOfDay } from 'date-fns';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ChevronRight, Calendar, AlertTriangle, CheckCircle, RefreshCcw } from 'lucide-react';
import { useTeamSettings, TeamSetting } from '@/hooks/useTeamSettings';
import { useTeamAvailability } from '@/hooks/useTeamAvailability';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface TeamAvailabilityModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const TeamAvailabilityModal: React.FC<TeamAvailabilityModalProps> = ({
  open,
  onOpenChange,
}) => {
  const { settings: teams, isLoading: teamsLoading } = useTeamSettings();
  const { unavailableDays, getTeamUnavailableDates, isTeamUnavailable, getUnavailableReason, refreshAvailability, isLoading } = useTeamAvailability();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedTeam, setSelectedTeam] = useState<TeamSetting | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

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

  // Get unavailable info for teams on a date
  const getUnavailableInfoForDate = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return teams
      .filter(team => isTeamUnavailable(team.teamId, dateStr))
      .map(team => ({
        team,
        reason: getUnavailableReason(team.teamId, dateStr)
      }));
  };

  // Get available teams for a date
  const getAvailableTeamsForDate = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return teams.filter(team => !isTeamUnavailable(team.teamId, dateStr));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Team Availability
              {isLoading && <RefreshCcw className="w-4 h-4 animate-spin text-muted-foreground" />}
            </div>
            <Button variant="ghost" size="sm" onClick={() => refreshAvailability()}>
              <RefreshCcw className="w-4 h-4 mr-1" />
              Refresh
            </Button>
          </DialogTitle>
        </DialogHeader>

        <div className="flex gap-4 h-[600px]">
          {/* Team List */}
          <div className="w-64 border-r pr-4 flex flex-col">
            <h3 className="font-medium mb-3 text-sm text-muted-foreground">Teams</h3>
            <ScrollArea className="flex-1">
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
            
            {/* Legend */}
            <div className="mt-4 pt-4 border-t space-y-2 text-xs">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-green-100 dark:bg-green-900/30 border border-green-300 dark:border-green-700" />
                <span className="text-muted-foreground">Available</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700" />
                <span className="text-muted-foreground">Unavailable</span>
              </div>
            </div>
          </div>

          {/* Calendar View */}
          <div className="flex-1 flex flex-col">
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
            <div className="grid grid-cols-7 gap-1 flex-1">
              {/* Empty cells for days before month starts */}
              {Array.from({ length: monthStart.getDay() }).map((_, i) => (
                <div key={`empty-${i}`} className="min-h-[80px]" />
              ))}

              <TooltipProvider>
                {daysInMonth.map((day) => {
                  const dateStr = format(day, 'yyyy-MM-dd');
                  const unavailableTeams = selectedTeam
                    ? (isTeamUnavailable(selectedTeam.teamId, dateStr) ? [selectedTeam] : [])
                    : getUnavailableTeamsForDate(day);
                  const isPast = isBefore(startOfDay(day), startOfDay(new Date()));
                  const unavailableInfo = getUnavailableInfoForDate(day);
                  const isSelected = selectedDate && format(selectedDate, 'yyyy-MM-dd') === dateStr;

                  return (
                    <Tooltip key={dateStr}>
                      <TooltipTrigger asChild>
                        <div
                          onClick={() => setSelectedDate(day)}
                          className={cn(
                            "min-h-[80px] border rounded-lg p-1 text-xs overflow-hidden cursor-pointer transition-all hover:ring-2 hover:ring-primary/50",
                            isToday(day) && "border-primary border-2",
                            isPast && "bg-muted/50 opacity-75",
                            isSelected && "ring-2 ring-primary",
                            unavailableTeams.length > 0 && !isPast && "bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-800",
                            unavailableTeams.length === 0 && !isPast && "bg-green-50/50 dark:bg-green-950/10"
                          )}
                        >
                          <div className={cn(
                            "font-medium mb-1",
                            isToday(day) && "text-primary"
                          )}>
                            {format(day, 'd')}
                          </div>
                          <ScrollArea className="h-12">
                            {unavailableTeams.length > 0 ? (
                              unavailableTeams.slice(0, 3).map((team) => (
                                <div
                                  key={team.teamId}
                                  className="flex items-center gap-1 mb-0.5"
                                >
                                  <AlertTriangle className="h-3 w-3 text-red-500 flex-shrink-0" />
                                  <span className="truncate text-red-600 dark:text-red-400">
                                    {team.teamName}
                                  </span>
                                </div>
                              ))
                            ) : !isPast && (
                              <div className="flex items-center gap-1 text-green-600 dark:text-green-400">
                                <CheckCircle className="h-3 w-3" />
                                <span>All available</span>
                              </div>
                            )}
                            {unavailableTeams.length > 3 && (
                              <div className="text-muted-foreground">
                                +{unavailableTeams.length - 3} more
                              </div>
                            )}
                          </ScrollArea>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-xs">
                        <div className="space-y-2">
                          <p className="font-semibold">{format(day, 'EEEE, MMMM d, yyyy')}</p>
                          {unavailableInfo.length > 0 ? (
                            <div className="space-y-1">
                              <p className="text-xs text-muted-foreground">Unavailable teams:</p>
                              {unavailableInfo.map(({ team, reason }) => (
                                <div key={team.teamId} className="text-xs">
                                  <span className="font-medium text-red-600">{team.teamName}</span>
                                  {reason && <span className="text-muted-foreground"> - {reason}</span>}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-green-600">All teams available</p>
                          )}
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </TooltipProvider>
            </div>
          </div>

          {/* Selected Date Details Panel */}
          {selectedDate && (
            <div className="w-72 border-l pl-4">
              <h3 className="font-medium mb-3 text-sm">
                {format(selectedDate, 'EEEE, MMMM d')}
              </h3>
              
              <div className="space-y-4">
                {/* Unavailable Teams */}
                <div>
                  <h4 className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3 text-red-500" />
                    Unavailable ({getUnavailableInfoForDate(selectedDate).length})
                  </h4>
                  <ScrollArea className="h-[180px]">
                    {getUnavailableInfoForDate(selectedDate).length > 0 ? (
                      <div className="space-y-2">
                        {getUnavailableInfoForDate(selectedDate).map(({ team, reason }) => (
                          <div key={team.teamId} className="p-2 bg-red-50 dark:bg-red-950/20 rounded-lg">
                            <div className="flex items-center gap-2">
                              <div
                                className="w-3 h-3 rounded-full"
                                style={{ backgroundColor: team.color || '#EF4444' }}
                              />
                              <span className="font-medium text-sm">{team.teamName}</span>
                            </div>
                            {reason && (
                              <p className="text-xs text-muted-foreground mt-1 pl-5">{reason}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">No teams unavailable</p>
                    )}
                  </ScrollArea>
                </div>

                {/* Available Teams */}
                <div>
                  <h4 className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                    <CheckCircle className="w-3 h-3 text-green-500" />
                    Available ({getAvailableTeamsForDate(selectedDate).length})
                  </h4>
                  <ScrollArea className="h-[180px]">
                    <div className="space-y-1">
                      {getAvailableTeamsForDate(selectedDate).map((team) => (
                        <div key={team.teamId} className="flex items-center gap-2 p-2 bg-green-50 dark:bg-green-950/20 rounded">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: team.color || '#22C55E' }}
                          />
                          <span className="text-sm">{team.teamName}</span>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
