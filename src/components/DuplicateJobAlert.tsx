import { Job } from '@/types/job';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Trash2, X, Plus } from 'lucide-react';
import { format } from 'date-fns';

interface DuplicateJobAlertProps {
  newJob: Omit<Job, 'id'>;
  existingJob: Job;
  onKeepBoth: () => void;
  onReplace: () => void;
  onSkip: () => void;
  onDeleteExisting: () => void;
}

export const DuplicateJobAlert = ({
  newJob,
  existingJob,
  onKeepBoth,
  onReplace,
  onSkip,
  onDeleteExisting
}: DuplicateJobAlertProps) => {
  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-lg animate-scale-in">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border bg-warning/10">
          <div className="p-2 rounded-full bg-warning/20">
            <AlertTriangle className="w-5 h-5 text-warning" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">Duplicate Job Detected</h2>
            <p className="text-sm text-muted-foreground">
              A job with number <span className="font-mono font-semibold">{newJob.jobNumber}</span> already exists
            </p>
          </div>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {/* Existing Job */}
          <div className="border border-border rounded-lg p-3 bg-muted/30">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground">Existing Job</span>
              <span className="text-xs text-muted-foreground">
                Added {format(existingJob.dateIssued, 'dd MMM yyyy')}
              </span>
            </div>
            <p className="font-semibold">{existingJob.name}</p>
            <p className="text-sm text-muted-foreground truncate">{existingJob.address}</p>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs bg-muted px-2 py-0.5 rounded">
                {existingJob.workItems.length} work items
              </span>
              <span className="text-xs bg-muted px-2 py-0.5 rounded">
                {existingJob.progress}% complete
              </span>
            </div>
          </div>

          {/* New Job */}
          <div className="border border-primary/50 rounded-lg p-3 bg-primary/5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-primary">New Job (from upload)</span>
            </div>
            <p className="font-semibold">{newJob.name}</p>
            <p className="text-sm text-muted-foreground truncate">{newJob.address}</p>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs bg-muted px-2 py-0.5 rounded">
                {newJob.workItems.length} work items
              </span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2 px-5 pb-5">
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={onSkip}
            >
              <X className="w-4 h-4 mr-1" />
              Skip New
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              onClick={onKeepBoth}
            >
              <Plus className="w-4 h-4 mr-1" />
              Keep Both
            </Button>
          </div>
          <div className="flex gap-2">
            <Button
              variant="default"
              className="flex-1"
              onClick={onReplace}
            >
              Replace Existing
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              onClick={onDeleteExisting}
            >
              <Trash2 className="w-4 h-4 mr-1" />
              Delete Existing
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
