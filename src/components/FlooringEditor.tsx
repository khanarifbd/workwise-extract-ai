import { useState } from 'react';
import { Minus, Plus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { syncLinkedFlooringJob } from '@/lib/api';
import { Job } from '@/types/job';
import { FlooringInfo } from '@/types/job';

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

  const totalCount = (flooringInfo || [])
    .filter(f => f.type !== '__SCANNED_NO_FLOORING__')
    .reduce((sum, f) => sum + f.quantity, 0);

  const handleQuantityChange = async (delta: number) => {
    const newCount = Math.max(0, totalCount + delta);
    const newFlooringInfo: FlooringInfo[] = newCount > 0
      ? [{ type: 'Flooring', quantity: newCount, location: '', manualOverride: true }]
      : [];

    if (job && flooringCategoryId) {
      setIsSyncing(true);
      try {
        const result = await syncLinkedFlooringJob(job, newFlooringInfo, flooringCategoryId);
        onUpdate(newFlooringInfo);
        if (result.created && onJobUpdated) {
          onJobUpdated({ linkedFlooringJobId: result.linkedFlooringJobId });
        }
      } catch (error) {
        console.error('Error syncing flooring job:', error);
      } finally {
        setIsSyncing(false);
      }
    } else {
      onUpdate(newFlooringInfo);
    }
  };

  if (totalCount === 0 && (!flooringInfo || flooringInfo.length === 0)) {
    return null;
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Badge
          variant="outline"
          className="cursor-pointer bg-teal-500/10 text-teal-700 dark:text-teal-400 border-teal-300 hover:bg-teal-500/20 gap-1"
        >
          🪵 FLOOR {totalCount > 0 ? `×${totalCount}` : '0'}
          {isSyncing && <Loader2 className="w-3 h-3 animate-spin" />}
        </Badge>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-3" align="start">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium">Flooring Qty</span>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="outline" className="h-6 w-6 p-0" onClick={() => handleQuantityChange(-1)} disabled={isSyncing}>
              <Minus className="w-3 h-3" />
            </Button>
            <span className="w-6 text-center text-sm font-bold">{totalCount}</span>
            <Button size="sm" variant="outline" className="h-6 w-6 p-0" onClick={() => handleQuantityChange(1)} disabled={isSyncing}>
              <Plus className="w-3 h-3" />
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};
