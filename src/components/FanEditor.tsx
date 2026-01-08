import { useState } from 'react';
import { FanInfo, Job } from '@/types/job';
import { Fan, Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { syncLinkedFanJob } from '@/lib/api';
import { toast } from 'sonner';

interface FanEditorProps {
  fanInfo: FanInfo[] | null;
  onUpdate: (fanInfo: FanInfo[]) => void;
  job?: Job;
  fanCategoryId?: string;
  onJobUpdated?: (updates: Partial<Job>) => void;
}

export const FanEditor = ({ fanInfo, onUpdate, job, fanCategoryId, onJobUpdated }: FanEditorProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  
  // Calculate current total from fanInfo
  const actualFans = fanInfo?.filter(f => f.type !== '__SCANNED_NO_FANS__') || [];
  const currentTotal = actualFans.reduce((sum, fan) => sum + fan.quantity, 0);
  
  const [quantity, setQuantity] = useState<string>(currentTotal.toString());

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (open) {
      // Reset to current value when opening
      setQuantity(currentTotal.toString());
    }
  };

  const handleConfirm = async () => {
    const numQuantity = parseInt(quantity) || 0;
    
    if (numQuantity < 0) {
      toast.error('Quantity cannot be negative');
      return;
    }

    // Create a single fan entry with the total quantity
    const newFanInfo: FanInfo[] = numQuantity > 0 
      ? [{ type: 'Extractor Fan', quantity: numQuantity, location: '' }]
      : [];

    // Update local state first
    onUpdate(newFanInfo);

    // Sync to database if we have job context
    if (job && fanCategoryId) {
      setIsSyncing(true);
      try {
        const result = await syncLinkedFanJob(job, newFanInfo, fanCategoryId);
        
        if (onJobUpdated && result.linkedFanJobId) {
          onJobUpdated({ linkedFanJobId: result.linkedFanJobId });
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
      setIsOpen(false);
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button className="flex items-center">
          {currentTotal > 0 ? (
            <Badge className="bg-cyan-500/20 text-cyan-700 dark:text-cyan-400 border-cyan-500/30 cursor-pointer hover:bg-cyan-500/30">
              <Fan className="w-3 h-3 mr-1" />
              {currentTotal}
            </Badge>
          ) : (
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs">
              <Fan className="w-3 h-3 mr-1" />
              Add
            </Button>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-3" align="start">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Fan className="w-4 h-4 text-cyan-500" />
            <span className="text-sm font-medium">Fan Quantity</span>
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
            className="w-full bg-cyan-600 hover:bg-cyan-700"
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
