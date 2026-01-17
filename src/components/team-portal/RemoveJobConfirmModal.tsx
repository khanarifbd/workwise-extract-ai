import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { EyeOff, Loader2 } from 'lucide-react';
import { Job } from '@/types/job';

interface RemoveJobConfirmModalProps {
  job: Job | null;
  isOpen: boolean;
  isRemoving: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const RemoveJobConfirmModal = ({
  job,
  isOpen,
  isRemoving,
  onConfirm,
  onCancel,
}: RemoveJobConfirmModalProps) => {
  if (!job) return null;

  return (
    <AlertDialog open={isOpen} onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent className="max-w-[90vw] sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <EyeOff className="h-5 w-5 text-muted-foreground" />
            Remove job from list?
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-2 text-left">
            <p>
              This will hide <span className="font-medium text-foreground break-all">{job.jobNumber}</span> from your portal.
            </p>
            <p className="font-medium text-foreground break-words">
              {job.name}
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              The admin can reassign this job to you if needed.
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col sm:flex-row gap-2">
          <AlertDialogCancel disabled={isRemoving} className="w-full sm:w-auto">
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={isRemoving}
            className="w-full sm:w-auto bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isRemoving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Removing...
              </>
            ) : (
              <>
                <EyeOff className="h-4 w-4 mr-2" />
                Remove from List
              </>
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
