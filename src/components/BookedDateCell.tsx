import { useState } from 'react';
import { format } from 'date-fns';
import { CalendarCheck, CalendarX, StickyNote, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';

interface BookedDateCellProps {
  bookedDate: Date | null;
  bookingNotes: string;
  onDateChange: (date: Date | null) => void;
  onNotesChange: (notes: string) => void;
}

export const BookedDateCell = ({ bookedDate, bookingNotes, onDateChange, onNotesChange }: BookedDateCellProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [notesValue, setNotesValue] = useState(bookingNotes || '');
  const [pendingDate, setPendingDate] = useState<Date | null>(null);

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
            </>
          ) : (
            <>
              <CalendarX className="w-3 h-3" />
              <span>UnBooked</span>
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
            <Calendar
              mode="single"
              selected={pendingDate || undefined}
              onSelect={handleDateSelect}
              initialFocus
              className="p-0 pointer-events-auto"
            />
            {pendingDate && (
              <div className="bg-amber-50 dark:bg-amber-900/30 rounded-md p-2 text-center">
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  Selected: <span className="font-semibold">{format(pendingDate, 'dd/MM/yyyy')}</span>
                </p>
              </div>
            )}
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                onClick={handleConfirmBooking}
                disabled={!pendingDate}
                className="flex-1 bg-amber-500 hover:bg-amber-600 text-white pointer-events-auto"
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
