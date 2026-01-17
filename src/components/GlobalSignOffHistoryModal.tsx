import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Image, Video, FileText, Wrench, User, ChevronDown, Maximize2, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';

interface SignOff {
  id: string;
  job_id: string;
  team_id: string;
  team_name: string;
  signed_off_at: string;
  photos_count: number;
  videos_count: number;
  documents_count: number;
  work_items_modified: number;
  work_items_total: number;
  progress_notes: string | null;
}

interface JobInfo {
  job_number: string;
  name: string;
}

interface GlobalSignOffHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onJobClick?: (jobId: string) => void;
}

const INITIAL_LIMIT = 20;
const LOAD_MORE_COUNT = 20;
const FULL_PAGE_LIMIT = 100;

export const GlobalSignOffHistoryModal = ({
  isOpen,
  onClose,
  onJobClick,
}: GlobalSignOffHistoryModalProps) => {
  const [signOffs, setSignOffs] = useState<(SignOff & { job?: JobInfo })[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [displayCount, setDisplayCount] = useState(INITIAL_LIMIT);
  const [totalCount, setTotalCount] = useState(0);
  const [isFullPage, setIsFullPage] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchSignOffs();
      setDisplayCount(INITIAL_LIMIT);
      setIsFullPage(false);
    }
  }, [isOpen]);

  const fetchSignOffs = async () => {
    setIsLoading(true);
    try {
      // Get count first
      const { count } = await supabase
        .from('team_sign_offs')
        .select('*', { count: 'exact', head: true });
      
      setTotalCount(count || 0);

      // Fetch sign-offs with job info
      const { data, error } = await supabase
        .from('team_sign_offs')
        .select('*')
        .order('signed_off_at', { ascending: false })
        .limit(FULL_PAGE_LIMIT);

      if (error) throw error;

      // Fetch job details for each sign-off
      const signOffData = (data as SignOff[]) || [];
      const jobIds = [...new Set(signOffData.map(s => s.job_id))];
      
      const { data: jobsData } = await supabase
        .from('jobs')
        .select('id, job_number, name')
        .in('id', jobIds);

      const jobsMap = new Map(
        (jobsData || []).map(j => [j.id, { job_number: j.job_number, name: j.name }])
      );

      const signOffsWithJobs = signOffData.map(s => ({
        ...s,
        job: jobsMap.get(s.job_id),
      }));

      setSignOffs(signOffsWithJobs);
    } catch (error) {
      console.error('Failed to fetch sign-offs:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadMore = useCallback(() => {
    setDisplayCount(prev => prev + LOAD_MORE_COUNT);
  }, []);

  const handleExpandFullPage = () => {
    setIsFullPage(true);
    setDisplayCount(FULL_PAGE_LIMIT);
  };

  const handleJobClick = (jobId: string) => {
    onJobClick?.(jobId);
    onClose();
  };

  const displayedSignOffs = signOffs.slice(0, displayCount);
  const hasMore = displayCount < signOffs.length && !isFullPage;

  const SignOffCard = ({ signOff }: { signOff: SignOff & { job?: JobInfo } }) => (
    <div
      className="p-4 bg-muted/50 rounded-lg space-y-3 cursor-pointer hover:bg-muted/70 transition-colors"
      onClick={() => handleJobClick(signOff.job_id)}
    >
      {/* Job Info */}
      {signOff.job && (
        <div className="border-b border-border pb-2 mb-2">
          <p className="font-medium text-sm truncate">{signOff.job.name}</p>
          <p className="text-xs font-mono text-muted-foreground">{signOff.job.job_number}</p>
        </div>
      )}
      
      {/* Team & Time */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <User className="h-4 w-4 text-primary" />
          <span className="font-medium text-sm">{signOff.team_name}</span>
        </div>
        <span className="text-xs text-muted-foreground">
          {format(new Date(signOff.signed_off_at), 'dd MMM yyyy, HH:mm')}
        </span>
      </div>

      {/* Stats */}
      <div className="flex flex-wrap gap-2">
        <Badge variant="secondary" className="text-xs gap-1">
          <Wrench className="h-3 w-3" />
          {signOff.work_items_modified}/{signOff.work_items_total} items
        </Badge>
        {signOff.photos_count > 0 && (
          <Badge variant="secondary" className="text-xs gap-1">
            <Image className="h-3 w-3" />
            {signOff.photos_count}
          </Badge>
        )}
        {signOff.videos_count > 0 && (
          <Badge variant="secondary" className="text-xs gap-1">
            <Video className="h-3 w-3" />
            {signOff.videos_count}
          </Badge>
        )}
        {signOff.documents_count > 0 && (
          <Badge variant="secondary" className="text-xs gap-1">
            <FileText className="h-3 w-3" />
            {signOff.documents_count}
          </Badge>
        )}
      </div>

      {/* Notes */}
      {signOff.progress_notes && (
        <div className="text-sm text-muted-foreground border-t pt-2 mt-2">
          <p className="text-xs font-medium mb-1">Notes:</p>
          <p className="line-clamp-2">{signOff.progress_notes}</p>
        </div>
      )}
    </div>
  );

  // Full page expanded view
  if (isFullPage) {
    return (
      <div className="fixed inset-0 z-50 bg-background">
        <div className="h-full flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b bg-muted/30">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-6 w-6 text-success" />
              <div>
                <h2 className="text-lg font-semibold">Sign-Off History</h2>
                <p className="text-sm text-muted-foreground">
                  Showing {displayedSignOffs.length} of {totalCount} sign-offs
                </p>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* Multi-column grid */}
          <div className="flex-1 overflow-auto p-4">
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading...</div>
            ) : signOffs.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">No sign-offs recorded yet</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {displayedSignOffs.map(signOff => (
                  <SignOffCard key={signOff.id} signOff={signOff} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-success" />
            Sign-Off History
          </DialogTitle>
          <DialogDescription>
            Recent sign-offs from all teams ({totalCount} total)
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto pr-2">
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              Loading...
            </div>
          ) : signOffs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No sign-offs recorded yet
            </div>
          ) : (
            <div className="space-y-3 pb-4">
              {displayedSignOffs.map(signOff => (
                <SignOffCard key={signOff.id} signOff={signOff} />
              ))}

              {/* Load More / Expand Button */}
              <div className="flex flex-col gap-2 pt-2 sticky bottom-0 bg-background pb-2">
                {hasMore && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={loadMore}
                    className="gap-2 w-full"
                  >
                    <ChevronDown className="h-4 w-4" />
                    Show More ({Math.min(LOAD_MORE_COUNT, signOffs.length - displayCount)} more)
                  </Button>
                )}
                
                {signOffs.length > INITIAL_LIMIT && (
                  <Button
                    variant="default"
                    size="sm"
                    onClick={handleExpandFullPage}
                    className="gap-2 w-full"
                  >
                    <Maximize2 className="h-4 w-4" />
                    View Full Page ({Math.min(FULL_PAGE_LIMIT, totalCount)} sign-offs)
                  </Button>
                )}
              </div>

              {!hasMore && displayCount >= signOffs.length && signOffs.length > 0 && signOffs.length <= INITIAL_LIMIT && (
                <p className="text-center text-xs text-muted-foreground pb-2">
                  Showing all {signOffs.length} sign-offs
                </p>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
