import React, { useState, useEffect } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isToday, isBefore, startOfDay } from 'date-fns';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { ChevronLeft, ChevronRight, Calendar, X, Plus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface TeamUnavailableDay {
  id: string;
  teamId: string;
  unavailableDate: string;
  reason: string | null;
  createdAt: string;
}

interface TeamDiaryProps {
  teamId: string;
  teamName: string;
}

export const TeamDiary: React.FC<TeamDiaryProps> = ({ teamId, teamName }) => {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [unavailableDays, setUnavailableDays] = useState<TeamUnavailableDay[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const prevMonth = () => setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1));
  const nextMonth = () => setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1));

  const loadUnavailableDays = async () => {
    try {
      const { data, error } = await supabase
        .from('team_availability')
        .select('*')
        .eq('team_id', teamId)
        .order('unavailable_date');

      if (error) throw error;

      setUnavailableDays(
        (data || []).map((row: any) => ({
          id: row.id,
          teamId: row.team_id,
          unavailableDate: row.unavailable_date,
          reason: row.reason,
          createdAt: row.created_at,
        }))
      );
    } catch (error) {
      console.error('Error loading unavailable days:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadUnavailableDays();

    // Real-time subscription
    const channel = supabase
      .channel(`team-availability-${teamId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'team_availability',
          filter: `team_id=eq.${teamId}`,
        },
        () => {
          loadUnavailableDays();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [teamId]);

  const isDateUnavailable = (dateStr: string) => {
    return unavailableDays.some(day => day.unavailableDate === dateStr);
  };

  const getReasonForDate = (dateStr: string) => {
    const day = unavailableDays.find(d => d.unavailableDate === dateStr);
    return day?.reason || null;
  };

  const handleDateClick = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    const isPast = isBefore(startOfDay(date), startOfDay(new Date()));
    
    if (isPast) return;
    
    if (isDateUnavailable(dateStr)) {
      // Remove unavailable day
      handleRemoveUnavailable(dateStr);
    } else {
      setSelectedDate(dateStr);
      setReason('');
    }
  };

  const handleAddUnavailable = async () => {
    if (!selectedDate) return;

    try {
      const { error } = await supabase.from('team_availability').insert({
        team_id: teamId,
        unavailable_date: selectedDate,
        reason: reason || null,
        created_by: teamName,
      });

      if (error) {
        if (error.code === '23505') {
          toast({
            title: 'Day already marked unavailable',
            variant: 'destructive',
          });
        } else {
          throw error;
        }
      } else {
        toast({
          title: 'Day marked as unavailable',
          description: `${format(new Date(selectedDate), 'dd MMM yyyy')} is now blocked`,
        });
      }
      setSelectedDate(null);
      setReason('');
    } catch (error) {
      console.error('Error adding unavailable day:', error);
      toast({
        title: 'Failed to update',
        variant: 'destructive',
      });
    }
  };

  const handleRemoveUnavailable = async (dateStr: string) => {
    try {
      const { error } = await supabase
        .from('team_availability')
        .delete()
        .eq('team_id', teamId)
        .eq('unavailable_date', dateStr);

      if (error) throw error;

      toast({
        title: 'Day marked as available',
        description: `${format(new Date(dateStr), 'dd MMM yyyy')} is now available`,
      });
    } catch (error) {
      console.error('Error removing unavailable day:', error);
      toast({
        title: 'Failed to update',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="bg-card rounded-lg border p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold flex items-center gap-2">
          <Calendar className="h-4 w-4" />
          My Diary
        </h3>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={prevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium min-w-[120px] text-center">
            {format(currentMonth, 'MMM yyyy')}
          </span>
          <Button variant="ghost" size="icon" onClick={nextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex gap-4 mb-4 text-xs">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-green-500" />
          <span>Available</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-red-500" />
          <span>Unavailable</span>
        </div>
      </div>

      {/* Day Headers */}
      <div className="grid grid-cols-7 gap-1 mb-2">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => (
          <div
            key={`${day}-${i}`}
            className="text-center text-xs font-medium text-muted-foreground py-1"
          >
            {day}
          </div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 gap-1">
        {/* Empty cells for days before month starts */}
        {Array.from({ length: monthStart.getDay() }).map((_, i) => (
          <div key={`empty-${i}`} className="h-10" />
        ))}

        {daysInMonth.map((day) => {
          const dateStr = format(day, 'yyyy-MM-dd');
          const isUnavailable = isDateUnavailable(dateStr);
          const isPast = isBefore(startOfDay(day), startOfDay(new Date()));
          const reasonText = getReasonForDate(dateStr);

          return (
            <button
              key={dateStr}
              onClick={() => handleDateClick(day)}
              disabled={isPast}
              className={cn(
                "h-10 rounded-lg text-sm font-medium transition-colors relative",
                "flex items-center justify-center",
                isPast && "opacity-40 cursor-not-allowed",
                !isPast && !isUnavailable && "hover:bg-green-100 dark:hover:bg-green-900/30 cursor-pointer",
                !isPast && isUnavailable && "hover:bg-red-200 dark:hover:bg-red-900/50 cursor-pointer",
                isToday(day) && "ring-2 ring-primary",
                isUnavailable ? "bg-red-500 text-white" : "bg-green-100 dark:bg-green-900/20",
                selectedDate === dateStr && "ring-2 ring-blue-500"
              )}
              title={reasonText || (isUnavailable ? 'Click to mark available' : 'Click to mark unavailable')}
            >
              {format(day, 'd')}
              {isUnavailable && (
                <X className="h-3 w-3 absolute top-0.5 right-0.5" />
              )}
            </button>
          );
        })}
      </div>

      {/* Add Unavailable Form */}
      {selectedDate && (
        <div className="mt-4 p-3 bg-muted rounded-lg">
          <p className="text-sm font-medium mb-2">
            Mark {format(new Date(selectedDate), 'dd MMM yyyy')} as unavailable
          </p>
          <Input
            placeholder="Reason (optional)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="mb-2"
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={handleAddUnavailable}>
              <Plus className="h-4 w-4 mr-1" />
              Confirm
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelectedDate(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Upcoming Unavailable Days */}
      <div className="mt-4">
        <h4 className="text-sm font-medium mb-2">Upcoming Unavailable Days</h4>
        <ScrollArea className="h-32">
          {unavailableDays
            .filter(day => !isBefore(new Date(day.unavailableDate), startOfDay(new Date())))
            .slice(0, 10)
            .map((day) => (
              <div
                key={day.id}
                className="flex items-center justify-between py-1 text-sm"
              >
                <span>{format(new Date(day.unavailableDate), 'EEE, dd MMM yyyy')}</span>
                {day.reason && (
                  <span className="text-muted-foreground text-xs truncate max-w-[100px]">
                    {day.reason}
                  </span>
                )}
              </div>
            ))}
          {unavailableDays.filter(day => !isBefore(new Date(day.unavailableDate), startOfDay(new Date()))).length === 0 && (
            <p className="text-sm text-muted-foreground">No upcoming unavailable days</p>
          )}
        </ScrollArea>
      </div>
    </div>
  );
};
