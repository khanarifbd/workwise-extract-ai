import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { 
  Users, 
  ChevronDown, 
  Clock, 
  Image, 
  Video, 
  FileText,
  CheckCircle2,
  AlertCircle,
  Wrench,
  Edit3
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { Attachment, WorkItem } from '@/types/job';

interface TeamJobUpdate {
  id: string;
  team_id: string;
  job_id: string;
  status: string | null;
  progress: number | null;
  notes: string | null;
  photos: string[] | null;
  updated_by: string;
  created_at: string;
}

interface TeamSignOff {
  id: string;
  team_name: string;
  signed_off_at: string;
  photos_count: number;
  videos_count: number;
  documents_count: number;
  work_items_modified: number;
  work_items_total: number;
}

interface TeamUpdatesSectionProps {
  jobId: string;
  attachments: Attachment[];
  workItems: WorkItem[];
  team1?: string | null;
  team2?: string | null;
}

export const TeamUpdatesSection = ({ jobId, attachments, workItems, team1, team2 }: TeamUpdatesSectionProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [updates, setUpdates] = useState<TeamJobUpdate[]>([]);
  const [signOffs, setSignOffs] = useState<TeamSignOff[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Filter attachments uploaded by team
  const teamPhotos = attachments.filter(a => 
    a.type === 'image' && (a as any).category === 'team-photo'
  );
  const teamVideos = attachments.filter(a => 
    a.type === 'video' && (a as any).category === 'team-video'
  );
  const teamDocuments = attachments.filter(a => 
    a.type === 'document' && (a as any).category === 'team-document'
  );

  // Calculate work item stats
  const confirmedItems = workItems.filter(item => item.isConfirmed !== false);
  const modifiedItems = workItems.filter(item => item.hasModification === true);
  const hasTeamData = teamPhotos.length > 0 || teamVideos.length > 0 || teamDocuments.length > 0 || modifiedItems.length > 0;

  const assignedTeams = [team1, team2].filter(Boolean) as string[];
  const signedOffTeamNames = signOffs.map(s => s.team_name);
  const allTeamsSignedOff = assignedTeams.length > 0 && assignedTeams.every(t => signedOffTeamNames.includes(t));

  useEffect(() => {
    const fetchUpdates = async () => {
      if (!isExpanded) return;
      
      setIsLoading(true);
      try {
        // Fetch updates and sign-offs in parallel
        const [updatesResult, signOffsResult] = await Promise.all([
          supabase
            .from('team_job_updates')
            .select('*')
            .eq('job_id', jobId)
            .order('created_at', { ascending: false })
            .limit(10),
          supabase
            .from('team_sign_offs')
            .select('*')
            .eq('job_id', jobId)
            .order('signed_off_at', { ascending: false })
        ]);

        if (updatesResult.error) throw updatesResult.error;
        if (signOffsResult.error) throw signOffsResult.error;
        
        setUpdates(updatesResult.data || []);
        setSignOffs((signOffsResult.data as TeamSignOff[]) || []);
      } catch (error) {
        console.error('Failed to fetch team updates:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchUpdates();
  }, [jobId, isExpanded]);

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
      <Card className={hasTeamData || allTeamsSignedOff ? 'border-primary/30 bg-primary/5' : ''}>
        <CollapsibleTrigger asChild>
          <CardHeader className="pb-2 cursor-pointer hover:bg-muted/50 transition-colors">
            <CardTitle className="text-sm flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Team Updates
                {allTeamsSignedOff && (
                  <Badge variant="default" className="text-xs bg-success text-success-foreground">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    All Signed Off
                  </Badge>
                )}
                {!allTeamsSignedOff && signOffs.length > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    {signOffs.length}/{assignedTeams.length} Signed Off
                  </Badge>
                )}
                {!allTeamsSignedOff && signOffs.length === 0 && hasTeamData && (
                  <Badge variant="secondary" className="text-xs">
                    Has Data
                  </Badge>
                )}
              </span>
              <span className="flex items-center gap-2">
                <a
                  href="#/?tab=eod"
                  onClick={(e) => e.stopPropagation()}
                  className="text-[11px] font-semibold text-rose-600 hover:underline"
                >
                  View EOD →
                </a>
                <ChevronDown className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
              </span>
            </CardTitle>
          </CardHeader>
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          <CardContent className="pt-0 space-y-4">
            {/* Sign-Off Status Section */}
            {assignedTeams.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Sign-Off Status:</p>
                <div className="flex flex-wrap gap-2">
                  {assignedTeams.map(team => {
                    const signOff = signOffs.find(s => s.team_name === team);
                    return (
                      <div
                        key={team}
                        className={`p-2 rounded-lg flex items-center gap-2 ${
                          signOff ? 'bg-success/10 border border-success/30' : 'bg-muted/50'
                        }`}
                      >
                        {signOff ? (
                          <CheckCircle2 className="h-4 w-4 text-success" />
                        ) : (
                          <Clock className="h-4 w-4 text-muted-foreground" />
                        )}
                        <span className="text-sm font-medium">{team}</span>
                        {signOff && (
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(signOff.signed_off_at), 'dd MMM, HH:mm')}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Team Data Summary */}
            <div className="grid grid-cols-2 gap-2">
              {/* Work Items Status */}
              <div className="p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Wrench className="h-4 w-4 text-primary" />
                  <span className="text-xs font-medium">Work Items</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    {confirmedItems.length}/{workItems.length} done
                  </Badge>
                </div>
              </div>

              {/* Modifications */}
              <div className="p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Edit3 className="h-4 w-4 text-amber-500" />
                  <span className="text-xs font-medium">Modifications</span>
                </div>
                <Badge variant={modifiedItems.length > 0 ? "default" : "secondary"} className="text-xs">
                  {modifiedItems.length} items
                </Badge>
              </div>

              {/* Team Photos */}
              <div className="p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Image className="h-4 w-4 text-blue-500" />
                  <span className="text-xs font-medium">Team Photos</span>
                </div>
                <Badge variant={teamPhotos.length > 0 ? "default" : "secondary"} className="text-xs">
                  {teamPhotos.length}
                </Badge>
              </div>

              {/* Team Videos */}
              <div className="p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Video className="h-4 w-4 text-purple-500" />
                  <span className="text-xs font-medium">Team Videos</span>
                </div>
                <Badge variant={teamVideos.length > 0 ? "default" : "secondary"} className="text-xs">
                  {teamVideos.length}
                </Badge>
              </div>
            </div>

            {/* Documents List */}
            {teamDocuments.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Team Documents:</p>
                <div className="space-y-1">
                  {teamDocuments.map((doc, index) => (
                    <a
                      key={doc.id || index}
                      href={doc.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 p-2 bg-muted/30 rounded hover:bg-muted/50 transition-colors"
                    >
                      <FileText className="h-4 w-4 text-orange-500" />
                      <span className="text-xs truncate flex-1">{doc.name}</span>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Modified Work Items */}
            {modifiedItems.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Modified Work Items:</p>
                <div className="space-y-2">
                  {modifiedItems.map((item, index) => (
                    <div 
                      key={item.id || index}
                      className="p-2 bg-amber-500/10 border border-amber-500/20 rounded-lg"
                    >
                      <p className="text-xs font-medium">{item.description}</p>
                      {item.variation && (
                        <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                          Modification: {item.variation}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Team Photo Gallery */}
            {teamPhotos.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Team Photos:</p>
                <div className="grid grid-cols-4 gap-2">
                  {teamPhotos.map((photo, index) => (
                    <a
                      key={photo.id || index}
                      href={photo.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="aspect-square rounded-lg overflow-hidden bg-muted hover:opacity-80 transition-opacity"
                    >
                      <img
                        src={photo.url}
                        alt={photo.name}
                        className="w-full h-full object-cover"
                      />
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Update History */}
            {updates.length > 0 && (
              <div className="space-y-2 border-t pt-3">
                <p className="text-xs font-medium text-muted-foreground">Update History:</p>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {updates.map((update) => (
                    <div 
                      key={update.id}
                      className="p-2 bg-muted/30 rounded-lg"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <Badge variant="outline" className="text-xs">
                          {update.updated_by}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {format(new Date(update.created_at), 'MMM d, HH:mm')}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {update.status && (
                          <span className="text-xs">Status: {update.status}</span>
                        )}
                        {update.progress !== null && (
                          <span className="text-xs">Progress: {update.progress}%</span>
                        )}
                        {update.photos && update.photos.length > 0 && (
                          <span className="text-xs text-blue-500">
                            +{update.photos.length} photos
                          </span>
                        )}
                      </div>
                      {update.notes && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          {update.notes}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* No Data State */}
            {!hasTeamData && updates.length === 0 && !isLoading && (
              <div className="flex items-center gap-2 p-3 text-center justify-center">
                <AlertCircle className="h-4 w-4 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">
                  No team updates for this job yet
                </p>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
};
