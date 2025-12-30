import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  CheckCircle2, 
  Image, 
  Video, 
  FileText, 
  Wrench, 
  AlertTriangle,
  Loader2,
  X,
  Check
} from 'lucide-react';
import { WorkItem } from '@/types/job';

interface SignOffSummary {
  jobNumber: string;
  jobName: string;
  photosCount: number;
  videosCount: number;
  documentsCount: number;
  workItemsTotal: number;
  workItemsCompleted: number;
  workItemsModified: number;
  progressNotes: string;
}

interface SignOffConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isSubmitting: boolean;
  summary: SignOffSummary;
}

export const SignOffConfirmationModal: React.FC<SignOffConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  isSubmitting,
  summary,
}) => {
  const hasAnyData = 
    summary.photosCount > 0 || 
    summary.videosCount > 0 || 
    summary.documentsCount > 0 ||
    summary.workItemsModified > 0 ||
    summary.progressNotes.trim().length > 0;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md mx-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <CheckCircle2 className="h-5 w-5 text-success" />
            Sign-Off Confirmation
          </DialogTitle>
          <DialogDescription>
            Review the data that will be transferred to the admin dashboard.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Job Info */}
          <div className="bg-muted/50 rounded-lg p-3">
            <p className="text-sm font-medium">{summary.jobName}</p>
            <p className="text-xs text-muted-foreground font-mono">{summary.jobNumber}</p>
          </div>

          {/* Summary Items */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-muted-foreground">Data to be transferred:</h4>
            
            <div className="grid gap-2">
              {/* Work Items */}
              <div className="flex items-center justify-between p-2 bg-muted/30 rounded-lg">
                <div className="flex items-center gap-2">
                  <Wrench className="h-4 w-4 text-primary" />
                  <span className="text-sm">Work Items</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs">
                    <Check className="h-3 w-3 mr-1" />
                    {summary.workItemsCompleted}/{summary.workItemsTotal}
                  </Badge>
                  {summary.workItemsModified > 0 && (
                    <Badge variant="outline" className="text-xs text-amber-600 border-amber-600">
                      {summary.workItemsModified} modified
                    </Badge>
                  )}
                </div>
              </div>

              {/* Photos */}
              <div className="flex items-center justify-between p-2 bg-muted/30 rounded-lg">
                <div className="flex items-center gap-2">
                  <Image className="h-4 w-4 text-blue-500" />
                  <span className="text-sm">Photos</span>
                </div>
                <Badge variant={summary.photosCount > 0 ? "default" : "secondary"} className="text-xs">
                  {summary.photosCount}
                </Badge>
              </div>

              {/* Videos */}
              <div className="flex items-center justify-between p-2 bg-muted/30 rounded-lg">
                <div className="flex items-center gap-2">
                  <Video className="h-4 w-4 text-purple-500" />
                  <span className="text-sm">Videos</span>
                </div>
                <Badge variant={summary.videosCount > 0 ? "default" : "secondary"} className="text-xs">
                  {summary.videosCount}
                </Badge>
              </div>

              {/* Documents */}
              <div className="flex items-center justify-between p-2 bg-muted/30 rounded-lg">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-orange-500" />
                  <span className="text-sm">Documents</span>
                </div>
                <Badge variant={summary.documentsCount > 0 ? "default" : "secondary"} className="text-xs">
                  {summary.documentsCount}
                </Badge>
              </div>

              {/* Progress Notes */}
              {summary.progressNotes.trim().length > 0 && (
                <div className="p-2 bg-muted/30 rounded-lg">
                  <p className="text-xs text-muted-foreground mb-1">Progress Notes:</p>
                  <p className="text-sm line-clamp-2">{summary.progressNotes}</p>
                </div>
              )}
            </div>
          </div>

          {/* Warning if no data */}
          {!hasAnyData && (
            <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
              <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-amber-700 dark:text-amber-400">
                No photos, videos, documents, or work item modifications to transfer. 
                Consider adding documentation before signing off.
              </p>
            </div>
          )}

          {/* Confirmation Text */}
          <p className="text-xs text-muted-foreground text-center">
            This will mark the job as complete and transfer all data to the admin database.
          </p>
        </div>

        <DialogFooter className="flex gap-2">
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            <X className="h-4 w-4 mr-1" />
            Cancel
          </Button>
          <Button 
            onClick={onConfirm} 
            disabled={isSubmitting}
            className="bg-success hover:bg-success/90 text-success-foreground"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                Signing Off...
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4 mr-1" />
                Confirm Sign-Off
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
