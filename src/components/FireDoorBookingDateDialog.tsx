import { useState } from 'react';
import { format } from 'date-fns';
import { CalendarIcon, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { FireDoorInfo, Job } from '@/types/job';

interface FireDoorBookingDateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: Job;
  fireDoorInfo: FireDoorInfo[];
  totalDoorCount: number;
  onConfirm: (bookedDate: Date | null, doorInfo: FireDoorInfo[]) => Promise<void>;
}

export const FireDoorBookingDateDialog = ({
  open, onOpenChange, job, fireDoorInfo, totalDoorCount, onConfirm,
}: FireDoorBookingDateDialogProps) => {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [doorItems, setDoorItems] = useState<FireDoorInfo[]>(
    fireDoorInfo.length > 0 ? fireDoorInfo : [{ type: 'Fire Door', quantity: 1, location: 'Kitchen' }]
  );

  const updateItem = (idx: number, field: keyof FireDoorInfo, value: any) => {
    setDoorItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  };

  const addItem = () => {
    setDoorItems(prev => [...prev, { type: 'Fire Door', quantity: 1, location: '' }]);
  };

  const removeItem = (idx: number) => {
    if (doorItems.length <= 1) return;
    setDoorItems(prev => prev.filter((_, i) => i !== idx));
  };

  const totalCount = doorItems.reduce((sum, d) => sum + d.quantity, 0);

  const handleConfirm = async () => {
    setIsSubmitting(true);
    try {
      await onConfirm(selectedDate || null, doorItems);
      onOpenChange(false);
      setSelectedDate(undefined);
    } catch (error) {
      console.error('Error creating fire door job:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSkip = async () => {
    setIsSubmitting(true);
    try {
      await onConfirm(null, doorItems);
      onOpenChange(false);
      setSelectedDate(undefined);
    } catch (error) {
      console.error('Error creating fire door job:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <svg className="w-5 h-5 text-red-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <line x1="9" y1="3" x2="9" y2="21" />
              <circle cx="6" cy="12" r="1" />
            </svg>
            Create Fire Door Job
          </DialogTitle>
          <DialogDescription>
            Creating fire door job for <span className="font-medium">{job.jobNumber}</span>.
            <br />Add door details and select a booking date for the carpenter.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Door Details:</p>
              <Button variant="outline" size="sm" onClick={addItem} className="h-6 text-xs">+ Add Door</Button>
            </div>
            {doorItems.map((item, idx) => (
              <div key={idx} className="flex items-center gap-2 bg-muted/50 rounded-lg p-2">
                <Input
                  className="h-7 text-xs flex-1"
                  placeholder="Type (e.g. Fire Door)"
                  value={item.type}
                  onChange={(e) => updateItem(idx, 'type', e.target.value)}
                />
                <Input
                  className="h-7 text-xs w-14 text-center"
                  type="number"
                  min={1}
                  value={item.quantity}
                  onChange={(e) => updateItem(idx, 'quantity', Math.max(1, parseInt(e.target.value) || 1))}
                />
                <Input
                  className="h-7 text-xs flex-1"
                  placeholder="Location (e.g. Kitchen)"
                  value={item.location}
                  onChange={(e) => updateItem(idx, 'location', e.target.value)}
                />
                {doorItems.length > 1 && (
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive" onClick={() => removeItem(idx)}>×</Button>
                )}
              </div>
            ))}
            <p className="text-xs text-muted-foreground">Total: {totalCount} door(s)</p>
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
          <Button onClick={handleConfirm} disabled={isSubmitting} className="bg-red-600 hover:bg-red-700">
            {isSubmitting ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating...</>
            ) : (
              <>{selectedDate ? 'Create & Book' : 'Create Fire Door Job'}</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
