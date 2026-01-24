import { useState, useEffect } from 'react';
import { InsulationInfo } from '@/types/insulation';
import { Job } from '@/types/job';
import { Home, Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { syncLinkedInsulationJob } from '@/lib/api';
import { toast } from 'sonner';

interface InsulationEditorProps {
  insulationInfo: InsulationInfo[] | null;
  onUpdate: (insulationInfo: InsulationInfo[]) => void;
  job?: Job;
  insulationCategoryId?: string;
  onJobUpdated?: (updates: Partial<Job>) => void;
}

export const InsulationEditor = ({ 
  insulationInfo, 
  onUpdate, 
  job, 
  insulationCategoryId, 
  onJobUpdated 
}: InsulationEditorProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [quantity, setQuantity] = useState<string>('');
  
  // Calculate current total from insulationInfo
  const actualUnits = insulationInfo?.filter(i => i.type !== '__SCANNED_NO_INSULATION__') || [];
  const currentTotal = actualUnits.reduce((sum, unit) => sum + unit.quantity, 0);

  // Sync quantity state when insulationInfo changes
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

    // Create a single insulation entry with manual override flag
    const newInsulationInfo: InsulationInfo[] = numQuantity > 0 
      ? [{ type: 'Insulation Unit', quantity: numQuantity, location: '', manualOverride: true }]
      : [];

    // Sync to database if we have job context
    if (job && insulationCategoryId) {
      setIsSyncing(true);
      try {
        const result = await syncLinkedInsulationJob(job, newInsulationInfo, insulationCategoryId);
        
        // Update local state after successful sync
        onUpdate(newInsulationInfo);
        
        if (onJobUpdated && result.linkedInsulationJobId) {
          onJobUpdated({ linkedInsulationJobId: result.linkedInsulationJobId, insulationInfo: newInsulationInfo } as any);
        }

        toast.success(result.created ? 'Insulation job created' : 'Insulation job updated');
        setIsOpen(false);
      } catch (error) {
        console.error('Error syncing insulation job:', error);
        toast.error('Failed to save insulation job');
      } finally {
        setIsSyncing(false);
      }
    } else {
      // Just update local state
      onUpdate(newInsulationInfo);
      setIsOpen(false);
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button className="flex items-center">
          {currentTotal > 0 ? (
            <Badge className="bg-success/20 text-success border-success/30 cursor-pointer hover:bg-success/30">
              <Home className="w-3 h-3 mr-1" />
              {currentTotal}
            </Badge>
          ) : (
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs">
              <Home className="w-3 h-3 mr-1" />
              Add
            </Button>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-3" align="start">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Home className="w-4 h-4 text-success" />
            <span className="text-sm font-medium">Insulation Units</span>
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
            className="w-full bg-success hover:bg-success/90"
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
