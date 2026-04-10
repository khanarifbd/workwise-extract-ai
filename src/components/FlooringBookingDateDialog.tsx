import { useState } from 'react';
import { format } from 'date-fns';
import { CalendarIcon, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { FlooringInfo, Job } from '@/types/job';

interface FlooringBookingDateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: Job;
  flooringInfo: FlooringInfo[];
  totalFlooringCount: number;
  onConfirm: (bookedDate: Date | null) => Promise<void>;
}

export const FlooringBookingDateDialog = ({
  open, onOpenChange, job, flooringInfo, totalFlooringCount, onConfirm,
}: FlooringBookingDateDialogProps) => {
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
      console.error('Error creating flooring job:', error);
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
      console.error('Error creating flooring job:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            🪵 Flooring Detected!
          </DialogTitle>
          <DialogDescription>
            Found <span className="font-semibold text-foreground">{totalFlooringCount} flooring item(s)</span> in job{' '}
            <span className="font-medium">{job.jobNumber}</span>.
            <br />Select a booking date for the flooring job.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="bg-muted/50 rounded-lg p-3 space-y-1">
            <p className="text-sm font-medium">Flooring Details:</p>
            <div className="text-sm text-muted-foreground space-y-0.5">
              {flooringInfo.map((f, idx) => (
                <div key={idx}>• {f.type} x{f.quantity}{f.location && ` - ${f.location}`}</div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Booking Date (optional)</label>
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !selectedDate && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {selectedDate ? format(selectedDate, "PPP") : "Select a date..."}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={selectedDate} onSelect={(date) => { setSelectedDate(date); setCalendarOpen(false); }} initialFocus className="pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <DialogFooter className="flex gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleSkip} disabled={isSubmitting}>Skip (No Date)</Button>
          <Button onClick={handleConfirm} disabled={isSubmitting} className="bg-teal-600 hover:bg-teal-700">
            {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating...</> : <>🪵 {selectedDate ? 'Create & Book' : 'Create Flooring Job'}</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
