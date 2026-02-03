import { useState } from 'react';
import { format } from 'date-fns';
import { CalendarIcon, Fan, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { FanInfo, Job } from '@/types/job';

interface FanBookingDateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: Job;
  fanInfo: FanInfo[];
  totalFanCount: number;
  onConfirm: (bookedDate: Date | null) => Promise<void>;
}

export const FanBookingDateDialog = ({
  open,
  onOpenChange,
  job,
  fanInfo,
  totalFanCount,
  onConfirm,
}: FanBookingDateDialogProps) => {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);

  const handleConfirm = async () => {
    setIsSubmitting(true);
    try {
      await onConfirm(selectedDate || null);
      onOpenChange(false);
      setSelectedDate(undefined);
    } catch (error) {
      console.error('Error creating fan job:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSkip = async () => {
    setIsSubmitting(true);
    try {
      await onConfirm(null);
      onOpenChange(false);
      setSelectedDate(undefined);
    } catch (error) {
      console.error('Error creating fan job:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Fan className="h-5 w-5 text-cyan-500" />
            Fan(s) Detected!
          </DialogTitle>
          <DialogDescription>
            Found <span className="font-semibold text-foreground">{totalFanCount} fan(s)</span> in job{' '}
            <span className="font-medium">{job.jobNumber}</span>.
            <br />
            Select a booking date for the fan installation job.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Fan details summary */}
          <div className="bg-muted/50 rounded-lg p-3 space-y-1">
            <p className="text-sm font-medium">Fan Details:</p>
            <div className="text-sm text-muted-foreground space-y-0.5">
              {fanInfo.map((fan, idx) => (
                <div key={idx}>
                  • {fan.type} x{fan.quantity}
                  {fan.location && ` - ${fan.location}`}
                </div>
              ))}
            </div>
          </div>

          {/* Date picker */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Booking Date (optional)</label>
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !selectedDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {selectedDate ? format(selectedDate, "PPP") : "Select a date..."}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(date) => {
                    setSelectedDate(date);
                    setCalendarOpen(false);
                  }}
                  initialFocus
                  className="pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <DialogFooter className="flex gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={handleSkip}
            disabled={isSubmitting}
          >
            Skip (No Date)
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isSubmitting}
            className="bg-cyan-600 hover:bg-cyan-700"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Fan className="mr-2 h-4 w-4" />
                {selectedDate ? 'Create & Book' : 'Create Fan Job'}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
