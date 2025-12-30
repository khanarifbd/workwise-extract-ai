import React, { useState, useEffect } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isToday, isBefore, startOfDay } from 'date-fns';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { ChevronLeft, ChevronRight, Calendar, X, Check, AlertCircle } from 'lucide-react';
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

  const getUnavailableDay = (dateStr: string) => {
    return unavailableDays.find(day => day.unavailableDate === dateStr);
  };

  const isDateUnavailable = (dateStr: string) => {
    return !!getUnavailableDay(dateStr);
  };

  const handleDateClick = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    const isPast = isBefore(startOfDay(date), startOfDay(new Date()));
    
    if (isPast) return;
    
    setSelectedDate(dateStr);
    setReason('');
  };

  const handleAddUnavailable = async () => {
    if (!selectedDate) return;

    try {
      const { data, error } = await supabase.from('team_availability').insert({
        team_id: teamId,
        unavailable_date: selectedDate,
        reason: reason || null,
        created_by: teamName,
      }).select().single();

      if (error) {
        if (error.code === '23505') {
          toast({
            title: 'Day already marked unavailable',
            variant: 'destructive',
          });
        } else {
          throw error;
        }
      } else if (data) {
        // Immediately update local state to reflect the change
        setUnavailableDays(prev => [...prev, {
          id: data.id,
          teamId: data.team_id,
          unavailableDate: data.unavailable_date,
          reason: data.reason,
          createdAt: data.created_at,
        }]);
        
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

      // Immediately update local state to reflect the change
      setUnavailableDays(prev => prev.filter(day => day.unavailableDate !== dateStr));
      
      toast({
        title: 'Day marked as available',
        description: `${format(new Date(dateStr), 'dd MMM yyyy')} is now available`,
      });
      setSelectedDate(null);
    } catch (error) {
      console.error('Error removing unavailable day:', error);
      toast({
        title: 'Failed to update',
        variant: 'destructive',
      });
    }
  };

  const selectedUnavailableDay = selectedDate ? getUnavailableDay(selectedDate) : null;
  const isSelectedUnavailable = !!selectedUnavailableDay;

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
          const unavailableDay = getUnavailableDay(dateStr);

          return (
            <button
              key={dateStr}
              onClick={() => handleDateClick(day)}
              disabled={isPast}
              className={cn(
                "h-10 rounded-lg text-sm font-medium transition-all relative",
                "flex items-center justify-center",
                isPast && "opacity-40 cursor-not-allowed",
                !isPast && !isUnavailable && "hover:bg-green-200 dark:hover:bg-green-900/50 cursor-pointer bg-green-100 dark:bg-green-900/20",
                !isPast && isUnavailable && "hover:bg-red-400 dark:hover:bg-red-800 cursor-pointer bg-red-500 text-white",
                isToday(day) && "ring-2 ring-primary ring-offset-1",
                selectedDate === dateStr && "ring-2 ring-blue-500 ring-offset-1 scale-110 z-10"
              )}
            >
              {format(day, 'd')}
              {isUnavailable && (
                <X className="h-3 w-3 absolute top-0.5 right-0.5" />
              )}
            </button>
          );
        })}
      </div>

      {/* Status Panel - Shows when a date is selected */}
      {selectedDate && (
        <div className={cn(
          "mt-4 p-4 rounded-lg border-2 transition-all",
          isSelectedUnavailable 
            ? "bg-red-50 dark:bg-red-950/30 border-red-300 dark:border-red-800" 
            : "bg-green-50 dark:bg-green-950/30 border-green-300 dark:border-green-800"
        )}>
          {/* Current Status Header */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              {isSelectedUnavailable ? (
                <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
                  <X className="h-5 w-5" />
                  <span className="font-semibold">UNAVAILABLE</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
                  <Check className="h-5 w-5" />
                  <span className="font-semibold">AVAILABLE</span>
                </div>
              )}
            </div>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setSelectedDate(null)}
              className="h-8 w-8 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Date Display */}
          <p className="text-lg font-medium mb-3">
            {format(new Date(selectedDate), 'EEEE, dd MMMM yyyy')}
          </p>

          {/* Show Reason if Unavailable */}
          {isSelectedUnavailable && selectedUnavailableDay?.reason && (
            <div className="mb-3 p-2 bg-red-100 dark:bg-red-900/40 rounded flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
              <div>
                <span className="text-xs font-medium text-red-700 dark:text-red-400">Reason:</span>
                <p className="text-sm text-red-800 dark:text-red-300">{selectedUnavailableDay.reason}</p>
              </div>
            </div>
          )}

          {/* Action Section */}
          {isSelectedUnavailable ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                This day is currently blocked. Tap below to make it available for work.
              </p>
              <Button 
                onClick={() => handleRemoveUnavailable(selectedDate)}
                className="w-full bg-green-600 hover:bg-green-700 text-white"
                size="lg"
              >
                <Check className="h-4 w-4 mr-2" />
                Make Available
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                This day is currently available. Add a reason and tap below to block it.
              </p>
              <Input
                placeholder="Reason for unavailability (optional)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="bg-white dark:bg-background"
              />
              <Button 
                onClick={handleAddUnavailable}
                className="w-full bg-red-600 hover:bg-red-700 text-white"
                size="lg"
              >
                <X className="h-4 w-4 mr-2" />
                Mark Unavailable
              </Button>
            </div>
          )}
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
                className="flex items-center justify-between py-2 px-2 text-sm border-b last:border-0 hover:bg-muted/50 rounded cursor-pointer"
                onClick={() => setSelectedDate(day.unavailableDate)}
              >
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-red-500" />
                  <span className="font-medium">{format(new Date(day.unavailableDate), 'EEE, dd MMM')}</span>
                </div>
                {day.reason && (
                  <span className="text-muted-foreground text-xs truncate max-w-[120px] italic">
                    {day.reason}
                  </span>
                )}
              </div>
            ))}
          {unavailableDays.filter(day => !isBefore(new Date(day.unavailableDate), startOfDay(new Date()))).length === 0 && (
            <p className="text-sm text-muted-foreground py-2">No upcoming unavailable days</p>
          )}
        </ScrollArea>
      </div>
    </div>
  );
};
