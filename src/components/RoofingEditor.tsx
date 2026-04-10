import { useState, useEffect } from 'react';
import { RoofingInfo, Job } from '@/types/job';
import { Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { syncLinkedRoofingJob } from '@/lib/api';
import { toast } from 'sonner';

interface RoofingEditorProps {
  roofingInfo: RoofingInfo[] | null;
  onUpdate: (roofingInfo: RoofingInfo[]) => void;
  job?: Job;
  roofingCategoryId?: string;
  onJobUpdated?: (updates: Partial<Job>) => void;
}

export const RoofingEditor = ({ roofingInfo, onUpdate, job, roofingCategoryId, onJobUpdated }: RoofingEditorProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [quantity, setQuantity] = useState<string>('');
  
  const actualRoofing = roofingInfo?.filter(r => r.type !== '__SCANNED_NO_ROOFING__') || [];
  const currentTotal = actualRoofing.reduce((sum, r) => sum + r.quantity, 0);

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

    const newRoofingInfo: RoofingInfo[] = numQuantity > 0 
      ? [{ type: 'Roof Repair', quantity: numQuantity, location: '', manualOverride: true }]
      : [];

    if (job && roofingCategoryId) {
      setIsSyncing(true);
      try {
        const result = await syncLinkedRoofingJob(job, newRoofingInfo, roofingCategoryId);
        
        onUpdate(newRoofingInfo);
        
        if (onJobUpdated && result.linkedRoofingJobId) {
          onJobUpdated({ linkedRoofingJobId: result.linkedRoofingJobId, roofingInfo: newRoofingInfo });
        }

        toast.success(result.created ? 'Roofing job created' : 'Roofing job updated');
        setIsOpen(false);
      } catch (error) {
        console.error('Error syncing roofing job:', error);
        toast.error('Failed to save roofing job');
      } finally {
        setIsSyncing(false);
      }
    } else {
      onUpdate(newRoofingInfo);
      setIsOpen(false);
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button className="flex items-center">
          {currentTotal > 0 ? (
            <Badge className="bg-orange-500/20 text-orange-700 dark:text-orange-400 border-orange-500/30 cursor-pointer hover:bg-orange-500/30">
              <svg className="w-3 h-3 mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 21h18l-9-18z" />
              </svg>
              ROOF {currentTotal}
            </Badge>
          ) : (
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs">
              <svg className="w-3 h-3 mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 21h18l-9-18z" />
              </svg>
              ROOF
            </Button>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-3" align="start">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-orange-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 21h18l-9-18z" />
            </svg>
            <span className="text-sm font-medium">Roof Items</span>
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
            className="w-full bg-orange-600 hover:bg-orange-700"
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
