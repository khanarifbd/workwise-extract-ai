import { useState } from 'react';
import { format } from 'date-fns';
import { CalendarIcon, Home, Loader2 } from 'lucide-react';
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
import { InsulationInfo } from '@/types/insulation';
import { Job } from '@/types/job';

interface InsulationBookingDateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: Job;
  insulationInfo: InsulationInfo[];
  totalInsulationCount: number;
  onConfirm: (bookedDate: Date | null) => Promise<void>;
}

export const InsulationBookingDateDialog = ({
  open,
  onOpenChange,
  job,
  insulationInfo,
  totalInsulationCount,
  onConfirm,
}: InsulationBookingDateDialogProps) => {
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
      console.error('Error creating insulation job:', error);
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
      console.error('Error creating insulation job:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Home className="h-5 w-5 text-sky-500" />
            Insulation Detected!
          </DialogTitle>
          <DialogDescription>
            Found <span className="font-semibold text-foreground">{totalInsulationCount} insulation unit(s)</span> in job{' '}
            <span className="font-medium">{job.jobNumber}</span>.
            <br />
            Select a booking date for the insulation installation job.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="bg-muted/50 rounded-lg p-3 space-y-1">
            <p className="text-sm font-medium">Insulation Details:</p>
            <div className="text-sm text-muted-foreground space-y-0.5">
              {insulationInfo.map((unit, idx) => (
                <div key={idx}>
                  • {unit.type} x{unit.quantity}
                  {unit.location && ` - ${unit.location}`}
                  {unit.thickness && ` (${unit.thickness})`}
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Booking Date (optional)</label>
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    'w-full justify-start text-left font-normal',
                    !selectedDate && 'text-muted-foreground'
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {selectedDate ? format(selectedDate, 'PPP') : 'Select a date...'}
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
          <Button variant="outline" onClick={handleSkip} disabled={isSubmitting}>
            Skip (No Date)
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isSubmitting}
            className="bg-sky-600 hover:bg-sky-700"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Home className="mr-2 h-4 w-4" />
                {selectedDate ? 'Create & Book' : 'Create Insulation Job'}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
