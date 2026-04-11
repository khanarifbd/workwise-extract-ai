import { useState, useEffect } from 'react';
import { FlooringInfo, Job } from '@/types/job';
import { Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { syncLinkedFlooringJob } from '@/lib/api';
import { toast } from 'sonner';

interface FlooringEditorProps {
  flooringInfo: FlooringInfo[] | null;
  onUpdate: (flooringInfo: FlooringInfo[]) => void;
  job?: Job;
  flooringCategoryId?: string;
  onJobUpdated?: (updates: Partial<Job>) => void;
}

export const FlooringEditor = ({ flooringInfo, onUpdate, job, flooringCategoryId, onJobUpdated }: FlooringEditorProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [quantity, setQuantity] = useState<string>('');

  const actualFlooring = flooringInfo?.filter(f => f.type !== '__SCANNED_NO_FLOORING__') || [];
  const currentTotal = actualFlooring.reduce((sum, f) => sum + f.quantity, 0);

  useEffect(() => {
    if (!isOpen) {
      setQuantity(currentTotal.toString());
    }
  }, [currentTotal, isOpen]);

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (open) {
      setQuantity(currentTotal.toString());
    }
  };

  const handleConfirm = async () => {
    const numQuantity = parseInt(quantity) || 0;

    if (numQuantity < 0) {
      toast.error('Quantity cannot be negative');
      return;
    }

    const newFlooringInfo: FlooringInfo[] = numQuantity > 0
      ? [{ type: 'Flooring', quantity: numQuantity, location: '', manualOverride: true }]
      : [];

    if (job && flooringCategoryId) {
      setIsSyncing(true);
      try {
        const result = await syncLinkedFlooringJob(job, newFlooringInfo, flooringCategoryId);

        onUpdate(newFlooringInfo);

        if (onJobUpdated && result.linkedFlooringJobId) {
          onJobUpdated({ linkedFlooringJobId: result.linkedFlooringJobId, flooringInfo: newFlooringInfo });
        }

        toast.success(result.created ? 'Flooring job created' : 'Flooring job updated');
        setIsOpen(false);
      } catch (error) {
        console.error('Error syncing flooring job:', error);
        toast.error('Failed to save flooring job');
      } finally {
        setIsSyncing(false);
      }
    } else {
      onUpdate(newFlooringInfo);
      setIsOpen(false);
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button className="flex items-center">
          {currentTotal > 0 ? (
            <Badge className="bg-teal-500/20 text-teal-700 dark:text-teal-400 border-teal-500/30 cursor-pointer hover:bg-teal-500/30">
              <svg className="w-3 h-3 mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="6" width="20" height="12" rx="2" />
                <line x1="2" y1="12" x2="22" y2="12" />
                <line x1="12" y1="6" x2="12" y2="18" />
              </svg>
              FLOOR {currentTotal}
            </Badge>
          ) : (
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs">
              <svg className="w-3 h-3 mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="6" width="20" height="12" rx="2" />
                <line x1="2" y1="12" x2="22" y2="12" />
                <line x1="12" y1="6" x2="12" y2="18" />
              </svg>
              FLOOR
            </Button>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-3" align="start">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-teal-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="6" width="20" height="12" rx="2" />
              <line x1="2" y1="12" x2="22" y2="12" />
              <line x1="12" y1="6" x2="12" y2="18" />
            </svg>
            <span className="text-sm font-medium">Floor Items</span>
          </div>

          <Input
            type="number"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="0"
            className="text-center text-lg font-semibold"
            min={0}
            autoFocus
          />

          <Button
            size="sm"
            className="w-full bg-teal-600 hover:bg-teal-700"
            onClick={handleConfirm}
            disabled={isSyncing}
          >
            {isSyncing ? (
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
            ) : (
              <Check className="w-4 h-4 mr-1" />
            )}
            Confirm
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};