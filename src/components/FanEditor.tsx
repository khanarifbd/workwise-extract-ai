import { useState, useEffect } from 'react';
import { FanInfo, Job } from '@/types/job';
import { Fan, Check, Loader2, CalendarIcon, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { format, parseISO, isValid } from 'date-fns';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { syncLinkedFanJob } from '@/lib/api';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface FanEditorProps {
  fanInfo: FanInfo[] | null;
  onUpdate: (fanInfo: FanInfo[]) => void;
  job?: Job;
  fanCategoryId?: string;
  onJobUpdated?: (updates: Partial<Job>) => void;
}

const parseDate = (value: string | Date | null | undefined): Date | undefined => {
  if (!value) return undefined;
  if (value instanceof Date) return isValid(value) ? value : undefined;
  const d = parseISO(value);
  return isValid(d) ? d : undefined;
};

export const FanEditor = ({ fanInfo, onUpdate, job, fanCategoryId, onJobUpdated }: FanEditorProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [quantity, setQuantity] = useState<string>('');
  const [bookedDate, setBookedDate] = useState<Date | undefined>(undefined);
  const [assignedTeam, setAssignedTeam] = useState<string | null>(null);
  const [loadingBooking, setLoadingBooking] = useState(false);

  // Calculate current total from fanInfo
  const actualFans = fanInfo?.filter(f => f.type !== '__SCANNED_NO_FANS__') || [];
  const currentTotal = actualFans.reduce((sum, fan) => sum + fan.quantity, 0);

  // Sync quantity state when fanInfo changes (e.g., from realtime update)
  useEffect(() => {
    if (!isOpen) {
      setQuantity(currentTotal.toString());
    }
  }, [currentTotal, isOpen]);

  // When the popover opens, load the current booking of the linked fan job (if any)
  useEffect(() => {
    if (!isOpen) return;
    setQuantity(currentTotal.toString());

    const loadLinkedBooking = async () => {
      if (job?.linkedFanJobId) {
        setLoadingBooking(true);
        try {
          const { data, error } = await supabase
            .from('jobs')
            .select('booked_date, team')
            .eq('id', job.linkedFanJobId)
            .maybeSingle();
          if (error) throw error;
          setBookedDate(parseDate(data?.booked_date as any));
          setAssignedTeam((data?.team as string | null) ?? null);
        } catch (err) {
          console.error('Failed to load linked fan booking:', err);
          setBookedDate(parseDate(job?.bookedDate as any));
        } finally {
          setLoadingBooking(false);
        }
      } else {
        // No linked job yet — default to parent job's booked date
        setBookedDate(parseDate(job?.bookedDate as any));
        setAssignedTeam(null);
      }
    };
    loadLinkedBooking();
  }, [isOpen, job?.linkedFanJobId, job?.bookedDate, currentTotal]);

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
  };

  const handleConfirm = async () => {
    const numQuantity = parseInt(quantity) || 0;

    if (numQuantity < 0) {
      toast.error('Quantity cannot be negative');
      return;
    }

    const newFanInfo: FanInfo[] = numQuantity > 0
      ? [{ type: 'Extractor Fan', quantity: numQuantity, location: '', manualOverride: true }]
      : [];

    if (job && fanCategoryId) {
      setIsSyncing(true);
      try {
        // Pass explicit booked date (null clears; Date sets)
        const result = await syncLinkedFanJob(job, newFanInfo, fanCategoryId, bookedDate ?? null);

        onUpdate(newFanInfo);

        if (onJobUpdated && result.linkedFanJobId) {
          onJobUpdated({ linkedFanJobId: result.linkedFanJobId, fanInfo: newFanInfo });
        }

        toast.success(result.created ? 'Fan job created' : 'Fan job updated');
        setIsOpen(false);
      } catch (error) {
        console.error('Error syncing fan job:', error);
        toast.error('Failed to save fan job');
      } finally {
        setIsSyncing(false);
      }
    } else {
      onUpdate(newFanInfo);
      setIsOpen(false);
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        {currentTotal > 0 ? (
          <button type="button" className="flex items-center">
            <Badge className="bg-cyan-500/20 text-cyan-700 dark:text-cyan-400 border-cyan-500/30 cursor-pointer hover:bg-cyan-500/30">
              <Fan className="w-3 h-3 mr-1" />
              FAN {currentTotal}
            </Badge>
          </button>
        ) : (
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs">
            <Fan className="w-3 h-3 mr-1" />
            FAN
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-80 p-3" align="start">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Fan className="w-4 h-4 text-cyan-500" />
              <span className="text-sm font-medium">Fan Booking</span>
            </div>
            {job?.linkedFanJobId && (
              <Badge variant="outline" className="text-[10px] bg-green-500/10 text-green-700 dark:text-green-400">
                Linked
              </Badge>
            )}
          </div>

          {/* Quantity */}
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Fan quantity</label>
            <Input
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="0"
              className="text-center text-lg font-semibold h-9"
              min={0}
            />
          </div>

          {/* Booked date */}
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Booking date</label>
            <div className="flex items-center gap-1">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      "flex-1 justify-start text-left font-normal h-9",
                      !bookedDate && "text-muted-foreground"
                    )}
                    disabled={loadingBooking}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {loadingBooking
                      ? 'Loading…'
                      : bookedDate
                        ? format(bookedDate, 'EEE, dd MMM yyyy')
                        : 'Select a date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 z-[60]" align="start">
                  <Calendar
                    mode="single"
                    selected={bookedDate}
                    onSelect={(d) => setBookedDate(d ?? undefined)}
                    initialFocus
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
              {bookedDate && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  onClick={() => setBookedDate(undefined)}
                  title="Clear date"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
            {assignedTeam && (
              <p className="text-[11px] text-muted-foreground">
                Assigned to <span className="font-medium text-foreground">{assignedTeam}</span>
              </p>
            )}
          </div>

          <Button
            size="sm"
            className="w-full bg-cyan-600 hover:bg-cyan-700"
            onClick={handleConfirm}
            disabled={isSyncing || loadingBooking}
          >
            {isSyncing ? (
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
            ) : (
              <Check className="w-4 h-4 mr-1" />
            )}
            {job?.linkedFanJobId ? 'Save Booking' : 'Create & Book'}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};
