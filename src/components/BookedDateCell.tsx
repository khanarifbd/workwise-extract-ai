import { useState, useCallback } from 'react';
import { format } from 'date-fns';
import { CalendarCheck, CalendarX, StickyNote, Check, AlertTriangle, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { useTeamAvailability } from '@/hooks/useTeamAvailability';
import { useToast } from '@/hooks/use-toast';

interface BookedDateCellProps {
  bookedDate: Date | null;
  bookingNotes: string;
  teamName?: string | null;
  isFlexible?: boolean;
  onDateChange: (date: Date | null) => void;
  onNotesChange: (notes: string) => void;
}

export const BookedDateCell = ({ bookedDate, bookingNotes, teamName, isFlexible, onDateChange, onNotesChange }: BookedDateCellProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [notesValue, setNotesValue] = useState(bookingNotes || '');
  const [pendingDate, setPendingDate] = useState<Date | null>(null);
  
  const { isTeamUnavailableByName, getUnavailableReasonByName, getTeamIdByName } = useTeamAvailability();
  const { toast } = useToast();

  const handleSetBooked = () => {
    setShowDatePicker(true);
    setPendingDate(bookedDate);
  };

  const handleDateSelect = (date: Date | undefined) => {
    if (date) {
      setPendingDate(date);
    }
  };

  const handleConfirmBooking = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (pendingDate) {
      // Check if team is unavailable on this date using team name
      const dateStr = format(pendingDate, 'yyyy-MM-dd');
      if (teamName && isTeamUnavailableByName(teamName, dateStr)) {
        const reason = getUnavailableReasonByName(teamName, dateStr);
        toast({
          title: 'Team Unavailable',
          description: `${teamName} is not available on ${format(pendingDate, 'dd MMM yyyy')}${reason ? `: ${reason}` : ''}. Please choose another date or reassign the team.`,
          variant: 'destructive',
          duration: 5000,
        });
        return;
      }
      
      onDateChange(pendingDate);
      setIsOpen(false);
      setShowDatePicker(false);
      setPendingDate(null);
    }
  };

  const handleSetUnbooked = () => {
    onDateChange(null);
    setIsOpen(false);
    setShowDatePicker(false);
    setPendingDate(null);
  };

  const handleSaveNotes = () => {
    onNotesChange(notesValue);
    setShowNotes(false);
  };

  const handleOpenNotes = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowNotes(true);
    setShowDatePicker(false);
  };

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) {
      setShowDatePicker(false);
      setShowNotes(false);
      setNotesValue(bookingNotes || '');
      setPendingDate(null);
    }
  };

  const isBooked = !!bookedDate;
  const hasNotes = !!bookingNotes && bookingNotes.trim().length > 0;

  return (
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-colors",
            isBooked 
              ? "bg-amber-500 text-white hover:bg-amber-600" 
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          )}
        >
          {isBooked ? (
            <>
              <CalendarCheck className="w-3 h-3" />
              <span>{format(bookedDate, 'dd/MM/yy')}</span>
              <span className="font-bold uppercase">BOOKED</span>
              {isFlexible && <Star className="w-3 h-3 fill-amber-100 text-amber-100" />}
              {hasNotes && <StickyNote className="w-3 h-3 ml-0.5 text-amber-100" />}
            </>
          ) : (
            <>
              <CalendarX className="w-3 h-3" />
              <span>UnBooked</span>
              {hasNotes && <StickyNote className="w-3 h-3 ml-0.5 text-amber-600" />}
            </>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-2 min-w-[220px]" align="start">
        {showNotes ? (
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground block">Tenant Interaction Notes</label>
            <Textarea
              value={notesValue}
              onChange={(e) => setNotesValue(e.target.value)}
              placeholder="Add notes about tenant interaction..."
              className="min-h-[100px] text-sm"
              autoFocus
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleSaveNotes}
                className="flex-1"
              >
                Save
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowNotes(false)}
                className="flex-1"
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : !showDatePicker ? (
          <div className="space-y-1">
            <div className="flex items-center gap-1">
              <button
                onClick={handleSetBooked}
                className={cn(
                  "flex-1 flex items-center gap-2 px-3 py-2 text-sm rounded transition-colors text-left",
                  isBooked 
                    ? "bg-amber-500/20 text-amber-700 dark:text-amber-400" 
                    : "hover:bg-muted"
                )}
              >
                <CalendarCheck className="w-4 h-4" />
                <span className="font-medium">Booked</span>
                {isBooked && (
                  <span className="text-xs ml-auto">{format(bookedDate, 'dd/MM/yy')}</span>
                )}
              </button>
              <button
                onClick={handleOpenNotes}
                className={cn(
                  "p-2 rounded transition-colors hover:bg-muted",
                  hasNotes && "text-amber-600 bg-amber-500/10"
                )}
                title="Tenant notes"
              >
                <StickyNote className="w-4 h-4" />
              </button>
            </div>
            
            <div className="flex items-center gap-1">
              <button
                onClick={handleSetUnbooked}
                className={cn(
                  "flex-1 flex items-center gap-2 px-3 py-2 text-sm rounded transition-colors text-left",
                  !isBooked 
                    ? "bg-muted text-foreground" 
                    : "hover:bg-muted"
                )}
              >
                <CalendarX className="w-4 h-4" />
                <span className="font-medium">UnBooked</span>
              </button>
              <button
                onClick={handleOpenNotes}
                className={cn(
                  "p-2 rounded transition-colors hover:bg-muted",
                  hasNotes && "text-amber-600 bg-amber-500/10"
                )}
                title="Tenant notes"
              >
                <StickyNote className="w-4 h-4" />
              </button>
            </div>

            {hasNotes && (
              <div className="mt-2 pt-2 border-t border-border">
                <p className="text-xs text-muted-foreground line-clamp-2">{bookingNotes}</p>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground block">Select Booked Date</label>
            {teamName && (
              <div className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                <AlertTriangle className="w-3 h-3 text-amber-500" />
                <span>Red dates are unavailable for {teamName}</span>
              </div>
            )}
            <Calendar
              mode="single"
              selected={pendingDate || undefined}
              onSelect={handleDateSelect}
              initialFocus
              className="p-0 pointer-events-auto"
              modifiers={teamName ? {
                unavailable: (date) => isTeamUnavailableByName(teamName, format(date, 'yyyy-MM-dd'))
              } : {}}
              modifiersStyles={{
                unavailable: { 
                  backgroundColor: 'hsl(0 84% 60% / 0.15)', 
                  color: 'hsl(0 84% 45%)',
                  fontWeight: '600'
                }
              }}
            />
            {pendingDate && (
              <>
                {teamName && isTeamUnavailableByName(teamName, format(pendingDate, 'yyyy-MM-dd')) ? (
                  <div className="bg-red-50 dark:bg-red-900/30 rounded-md p-2 text-center">
                    <p className="text-xs text-red-700 dark:text-red-400 flex items-center justify-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      {teamName} unavailable: {getUnavailableReasonByName(teamName, format(pendingDate, 'yyyy-MM-dd')) || 'No reason provided'}
                    </p>
                  </div>
                ) : (
                  <div className="bg-amber-50 dark:bg-amber-900/30 rounded-md p-2 text-center">
                    <p className="text-xs text-amber-700 dark:text-amber-400">
                      Selected: <span className="font-semibold">{format(pendingDate, 'dd/MM/yyyy')}</span>
                    </p>
                  </div>
                )}
              </>
            )}
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                onClick={handleConfirmBooking}
                disabled={!pendingDate || (teamName && pendingDate && isTeamUnavailableByName(teamName, format(pendingDate, 'yyyy-MM-dd')))}
                className={cn(
                  "flex-1 pointer-events-auto",
                  teamName && pendingDate && isTeamUnavailableByName(teamName, format(pendingDate, 'yyyy-MM-dd'))
                    ? "bg-muted text-muted-foreground cursor-not-allowed"
                    : "bg-amber-500 hover:bg-amber-600 text-white"
                )}
              >
                <Check className="w-3 h-3 mr-1" />
                Confirm Booking
              </Button>
            </div>
            <button
              onClick={() => {
                setShowDatePicker(false);
                setPendingDate(null);
              }}
              className="w-full text-xs text-muted-foreground hover:text-foreground py-1"
            >
              ← Back
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};
