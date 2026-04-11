import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { FireDoorInfo, Job } from '@/types/job';
import { createLinkedFireDoorJob, syncLinkedFireDoorJob } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { FireDoorBookingDateDialog } from './FireDoorBookingDateDialog';

interface FireDoorEditorProps {
  fireDoorInfo: FireDoorInfo[] | null;
  onUpdate: (info: FireDoorInfo[]) => void;
  job: Job;
  fireDoorCategoryId?: string;
  onJobUpdated?: (updates?: Partial<Job>) => void;
  onDeleteLinkedJob?: () => void;
}

export const FireDoorEditor = ({
  fireDoorInfo,
  onUpdate,
  job,
  fireDoorCategoryId,
  onJobUpdated,
}: FireDoorEditorProps) => {
  const [showBookingDialog, setShowBookingDialog] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const { toast } = useToast();

  const hasData = fireDoorInfo && fireDoorInfo.length > 0 && !fireDoorInfo.some(f => f.type === '__NO_FIRE_DOORS__');
  const totalCount = hasData ? fireDoorInfo!.reduce((sum, d) => sum + d.quantity, 0) : 0;
  const isLinked = !!job.linkedFireDoorJobId;

  const handleCreateJob = () => {
    setPopoverOpen(false);
    setShowBookingDialog(true);
  };

  const handleBookingConfirm = async (bookedDate: Date | null, doorInfo: FireDoorInfo[]) => {
    if (!fireDoorCategoryId) return;

    try {
      const isUpdate = !!job.linkedFireDoorJobId;
      if (isUpdate && job.linkedFireDoorJobId) {
        await syncLinkedFireDoorJob(job, doorInfo, fireDoorCategoryId, bookedDate);
        toast({ title: "Fire Door Job Updated!" });
      } else {
        await createLinkedFireDoorJob(job, doorInfo, fireDoorCategoryId, bookedDate);
        toast({ title: "Fire Door Job Created!" });
      }
      onUpdate(doorInfo);
      onJobUpdated?.();
    } catch (error) {
      toast({ title: "Error", description: "Failed to create fire door job.", variant: "destructive" });
      throw error;
    }
  };

  if (hasData) {
    return (
      <>
        <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
          <PopoverTrigger asChild>
            <Badge
              variant="outline"
              className={`cursor-pointer text-xs font-semibold ${
                isLinked
                  ? 'bg-green-500/10 text-green-700 dark:text-green-400 border-green-300'
                  : 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-300'
              } hover:bg-red-500/20`}
            >
              DOOR ×{totalCount} {isLinked ? '✓' : ''}
            </Badge>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-3" align="start">
            <div className="space-y-2">
              <p className="text-sm font-semibold text-red-700 dark:text-red-400">Fire Door Details</p>
              {fireDoorInfo!.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <Input
                    className="h-7 text-xs flex-1"
                    value={item.type}
                    onChange={(e) => {
                      const updated = [...fireDoorInfo!];
                      updated[idx] = { ...updated[idx], type: e.target.value, manualOverride: true };
                      onUpdate(updated);
                    }}
                  />
                  <Input
                    className="h-7 text-xs w-14 text-center"
                    type="number"
                    min={1}
                    value={item.quantity}
                    onChange={(e) => {
                      const updated = [...fireDoorInfo!];
                      updated[idx] = { ...updated[idx], quantity: Math.max(1, parseInt(e.target.value) || 1), manualOverride: true };
                      onUpdate(updated);
                    }}
                  />
                  <Input
                    className="h-7 text-xs flex-1"
                    value={item.location}
                    placeholder="Location"
                    onChange={(e) => {
                      const updated = [...fireDoorInfo!];
                      updated[idx] = { ...updated[idx], location: e.target.value, manualOverride: true };
                      onUpdate(updated);
                    }}
                  />
                </div>
              ))}
              {fireDoorCategoryId && (
                <Button
                  size="sm"
                  className="w-full mt-2 bg-red-600 hover:bg-red-700 text-white text-xs"
                  onClick={handleCreateJob}
                >
                  {isLinked ? 'Update Fire Door Job' : 'Create Fire Door Job'}
                </Button>
              )}
              {isLinked && (
                <Badge variant="outline" className="text-xs bg-green-500/10 text-green-700">Linked ✓</Badge>
              )}
            </div>
          </PopoverContent>
        </Popover>

        <FireDoorBookingDateDialog
          open={showBookingDialog}
          onOpenChange={setShowBookingDialog}
          job={job}
          fireDoorInfo={fireDoorInfo!}
          totalDoorCount={totalCount}
          onConfirm={handleBookingConfirm}
        />
      </>
    );
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="h-5 px-1.5 text-[10px] gap-0.5 font-semibold"
        onClick={() => setShowBookingDialog(true)}
        title="Add fire door"
      >
        DOOR
      </Button>

      <FireDoorBookingDateDialog
        open={showBookingDialog}
        onOpenChange={setShowBookingDialog}
        job={job}
        fireDoorInfo={[{ type: 'Fire Door', quantity: 1, location: 'Kitchen' }]}
        totalDoorCount={1}
        onConfirm={handleBookingConfirm}
      />
    </>
  );
};
