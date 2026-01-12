import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CheckCircle2, Image, Video, FileText, Wrench, Clock, User } from 'lucide-react';
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

interface SignOffHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  jobId: string;
  jobNumber: string;
  jobName: string;
  team1?: string | null;
  team2?: string | null;
}

export const SignOffHistoryModal = ({
  isOpen,
  onClose,
  jobId,
  jobNumber,
  jobName,
  team1,
  team2,
}: SignOffHistoryModalProps) => {
  const [signOffs, setSignOffs] = useState<SignOff[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (isOpen && jobId) {
      fetchSignOffs();
    }
  }, [isOpen, jobId]);

  const fetchSignOffs = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('team_sign_offs')
        .select('*')
        .eq('job_id', jobId)
        .order('signed_off_at', { ascending: false });

      if (error) throw error;
      setSignOffs((data as SignOff[]) || []);
    } catch (error) {
      console.error('Failed to fetch sign-offs:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const assignedTeams = [team1, team2].filter(Boolean) as string[];
  const signedOffTeams = signOffs.map(s => s.team_name);
  const pendingTeams = assignedTeams.filter(t => !signedOffTeams.includes(t));

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-success" />
            Sign-Off History
          </DialogTitle>
          <DialogDescription className="space-y-1">
            <span className="block font-medium text-foreground">{jobName}</span>
            <span className="block font-mono text-xs">{jobNumber}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Status Summary */}
          <div className="flex flex-wrap gap-2">
            {assignedTeams.map(team => {
              const hasSigned = signedOffTeams.includes(team);
              return (
                <Badge
                  key={team}
                  variant={hasSigned ? 'default' : 'outline'}
                  className={hasSigned ? 'bg-success text-success-foreground' : 'text-muted-foreground'}
                >
                  {hasSigned ? (
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                  ) : (
                    <Clock className="h-3 w-3 mr-1" />
                  )}
                  {team}
                </Badge>
              );
            })}
          </div>

          {/* Pending Teams */}
          {pendingTeams.length > 0 && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
              <p className="text-sm text-amber-700 dark:text-amber-400">
                <Clock className="h-4 w-4 inline mr-1" />
                Awaiting sign-off from: {pendingTeams.join(', ')}
              </p>
            </div>
          )}

          {/* Sign-Off Records */}
          <ScrollArea className="max-h-[400px]">
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">
                Loading...
              </div>
            ) : signOffs.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No sign-offs recorded yet
              </div>
            ) : (
              <div className="space-y-3">
                {signOffs.map(signOff => (
                  <div
                    key={signOff.id}
                    className="p-4 bg-muted/50 rounded-lg space-y-3"
                  >
                    {/* Team & Time */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-primary" />
                        <span className="font-medium">{signOff.team_name}</span>
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
                        <p className="line-clamp-3">{signOff.progress_notes}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
};
