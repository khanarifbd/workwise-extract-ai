import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CheckCircle2, Image, Video, FileText, Wrench, Clock, User, ChevronDown, ShieldCheck, Loader2, UserCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { useJobExternalAssignees } from '@/hooks/useJobExternalAssignees';

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
  signed_off_by_admin?: boolean | null;
  override_reason?: string | null;
  on_behalf_of?: string | null;
  external_assignee_id?: string | null;
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

const INITIAL_LIMIT = 20;
const LOAD_MORE_COUNT = 40;

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
  const [displayCount, setDisplayCount] = useState(INITIAL_LIMIT);
  const [totalCount, setTotalCount] = useState(0);
  const [signingOffTeam, setSigningOffTeam] = useState<string | null>(null);
  const [signingOffExternalId, setSigningOffExternalId] = useState<string | null>(null);
  const [reasonByTeam, setReasonByTeam] = useState<Record<string, string>>({});
  const [reasonByExternal, setReasonByExternal] = useState<Record<string, string>>({});
  const { toast } = useToast();
  const { canEdit, user } = useAdminAuth();
  const { items: externalAssignees } = useJobExternalAssignees(isOpen ? jobId : null);

  useEffect(() => {
    if (isOpen && jobId) {
      fetchSignOffs();
      setDisplayCount(INITIAL_LIMIT);
    }
  }, [isOpen, jobId]);

  const fetchSignOffs = async () => {
    setIsLoading(true);
    try {
      // Get count first
      const { count } = await supabase
        .from('team_sign_offs')
        .select('*', { count: 'exact', head: true })
        .eq('job_id', jobId);
      
      setTotalCount(count || 0);

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

  const loadMore = useCallback(() => {
    setDisplayCount(prev => prev + LOAD_MORE_COUNT);
  }, []);

  const displayedSignOffs = signOffs.slice(0, displayCount);
  const hasMore = displayCount < signOffs.length;

  const assignedTeams = [team1, team2].filter(Boolean) as string[];
  const signedOffTeams = signOffs.filter(s => (s.on_behalf_of ?? 'team') === 'team').map(s => s.team_name);
  const pendingTeams = assignedTeams.filter(t => !signedOffTeams.includes(t));

  const signedOffExternalIds = new Set(
    signOffs.filter(s => s.on_behalf_of === 'external' && s.external_assignee_id).map(s => s.external_assignee_id as string)
  );
  const pendingExternals = externalAssignees.filter(a => !signedOffExternalIds.has(a.id));

  const checkAndMarkComplete = async () => {
    // Use server-side derive to be safe
    const { data } = await supabase.rpc('derive_job_completion_state', { _job_id: jobId });
    if (data === 'complete') {
      await supabase.from('jobs').update({
        is_completed: true,
        status: 'complete',
        progress: 100,
        completion_date: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', jobId);
      return true;
    }
    return false;
  };

  // Admin sign-off on behalf of a pending team
  const handleAdminSignOff = useCallback(async (teamName: string) => {
    if (!canEdit) return;
    setSigningOffTeam(teamName);
    try {
      const { data: codeRow } = await supabase
        .from('team_access_codes')
        .select('team_id')
        .eq('team_name', teamName)
        .eq('is_active', true)
        .maybeSingle();

      const teamId = codeRow?.team_id || teamName.toLowerCase().replace(/\s+/g, '_');
      const adminLabel = user?.email ? `Admin (${user.email})` : 'Admin';
      const reason = (reasonByTeam[teamName] || '').trim();

      const { error: signOffErr } = await supabase
        .from('team_sign_offs')
        .insert({
          job_id: jobId,
          team_id: teamId,
          team_name: teamName,
          photos_count: 0,
          videos_count: 0,
          documents_count: 0,
          work_items_total: 0,
          work_items_modified: 0,
          progress_notes: `Signed off by ${adminLabel} on behalf of ${teamName} (admin override)${reason ? ` — ${reason}` : ''}.`,
          signed_off_by_admin: true,
          admin_user_id: user?.id ?? null,
          override_reason: reason || null,
          on_behalf_of: 'team',
        });
      if (signOffErr) throw signOffErr;

      await supabase.from('team_sign_off_notifications').insert({
        job_id: jobId,
        job_number: jobNumber,
        job_name: jobName,
        team_id: teamId,
        team_name: teamName,
        photos_count: 0,
        videos_count: 0,
        documents_count: 0,
        work_items_total: 0,
        work_items_modified: 0,
        progress_notes: `Admin sign-off on behalf of ${teamName}${reason ? ` — ${reason}` : ''}`,
      });

      const completed = await checkAndMarkComplete();

      toast({
        title: 'Sign-off recorded ✓',
        description: `${teamName} signed off by admin${completed ? ' — job marked complete' : ''}.`,
      });
      setReasonByTeam(prev => { const n = { ...prev }; delete n[teamName]; return n; });
      await fetchSignOffs();
    } catch (err: any) {
      console.error('Admin sign-off failed:', err);
      toast({
        title: 'Sign-off failed',
        description: err.message || 'Unable to record admin sign-off',
        variant: 'destructive',
      });
    } finally {
      setSigningOffTeam(null);
    }
  }, [canEdit, user, jobId, jobNumber, jobName, reasonByTeam, toast]);

  // Admin sign-off on behalf of an external assignee
  const handleExternalSignOff = useCallback(async (assigneeId: string, label: string) => {
    if (!canEdit) return;
    setSigningOffExternalId(assigneeId);
    try {
      const adminLabel = user?.email ? `Admin (${user.email})` : 'Admin';
      const reason = (reasonByExternal[assigneeId] || '').trim();
      const externalTeamId = `external_${assigneeId.slice(0, 8)}`;

      const { error: signOffErr } = await supabase
        .from('team_sign_offs')
        .insert({
          job_id: jobId,
          team_id: externalTeamId,
          team_name: `External: ${label}`,
          photos_count: 0,
          videos_count: 0,
          documents_count: 0,
          work_items_total: 0,
          work_items_modified: 0,
          progress_notes: `Signed off by ${adminLabel} on behalf of external assignee ${label}${reason ? ` — ${reason}` : ''}.`,
          signed_off_by_admin: true,
          admin_user_id: user?.id ?? null,
          override_reason: reason || null,
          on_behalf_of: 'external',
          external_assignee_id: assigneeId,
        });
      if (signOffErr) throw signOffErr;

      const completed = await checkAndMarkComplete();

      toast({
        title: 'External sign-off recorded ✓',
        description: `${label} signed off by admin${completed ? ' — job marked complete' : ''}.`,
      });
      setReasonByExternal(prev => { const n = { ...prev }; delete n[assigneeId]; return n; });
      await fetchSignOffs();
    } catch (err: any) {
      console.error('External sign-off failed:', err);
      toast({
        title: 'Sign-off failed',
        description: err.message || 'Unable to record sign-off',
        variant: 'destructive',
      });
    } finally {
      setSigningOffExternalId(null);
    }
  }, [canEdit, user, jobId, reasonByExternal, toast]);




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
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg space-y-2">
              <p className="text-sm text-amber-700 dark:text-amber-400">
                <Clock className="h-4 w-4 inline mr-1" />
                Awaiting sign-off from: {pendingTeams.join(', ')}
              </p>
              {canEdit && (
                <div className="flex flex-col gap-2 pt-1">
                  <p className="text-[11px] text-muted-foreground">
                    Admin override — sign off on behalf of pending team(s):
                  </p>
                  {pendingTeams.map(team => (
                    <div key={team} className="space-y-1">
                      <Input
                        placeholder="Optional reason (e.g. confirmed by phone)…"
                        value={reasonByTeam[team] || ''}
                        onChange={(e) => setReasonByTeam(p => ({ ...p, [team]: e.target.value }))}
                        className="h-7 text-xs"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        className="justify-start gap-2 h-8 w-full border-amber-500/40 bg-background hover:bg-amber-500/10"
                        disabled={signingOffTeam !== null}
                        onClick={() => handleAdminSignOff(team)}
                      >
                        {signingOffTeam === team ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <ShieldCheck className="h-3.5 w-3.5 text-success" />
                        )}
                        <span className="text-xs">Admin sign-off as <strong>{team}</strong></span>
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* External Assignees */}
          {externalAssignees.length > 0 && (
            <div className="p-3 bg-slate-500/10 border border-slate-400/30 rounded-lg space-y-2">
              <p className="text-sm font-medium flex items-center gap-1.5">
                <UserCircle2 className="h-4 w-4" />
                External assignees ({externalAssignees.length - pendingExternals.length}/{externalAssignees.length} signed off)
              </p>
              <div className="flex flex-col gap-2">
                {externalAssignees.map(a => {
                  const signed = signedOffExternalIds.has(a.id);
                  const label = a.subcontractor?.name ?? 'External';
                  const sub = a.subcontractor?.company ? ` — ${a.subcontractor.company}` : '';
                  return (
                    <div key={a.id} className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs">
                          👤 <strong>{label}</strong>{sub}
                        </span>
                        {signed ? (
                          <Badge className="bg-success text-success-foreground text-[10px] h-5">
                            <CheckCircle2 className="h-3 w-3 mr-1" />Signed
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] h-5 text-muted-foreground">
                            <Clock className="h-3 w-3 mr-1" />Pending
                          </Badge>
                        )}
                      </div>
                      {!signed && canEdit && (
                        <>
                          <Input
                            placeholder="Optional reason…"
                            value={reasonByExternal[a.id] || ''}
                            onChange={(e) => setReasonByExternal(p => ({ ...p, [a.id]: e.target.value }))}
                            className="h-7 text-xs"
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            className="justify-start gap-2 h-8 w-full border-slate-400/50 bg-background hover:bg-slate-500/10"
                            disabled={signingOffExternalId !== null}
                            onClick={() => handleExternalSignOff(a.id, label)}
                          >
                            {signingOffExternalId === a.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <ShieldCheck className="h-3.5 w-3.5 text-success" />
                            )}
                            <span className="text-xs">Admin sign-off for <strong>{label}</strong></span>
                          </Button>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
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
                {displayedSignOffs.map(signOff => (
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

                {/* Load More Button */}
                {hasMore && (
                  <div className="flex justify-center pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={loadMore}
                      className="gap-2"
                    >
                      <ChevronDown className="h-4 w-4" />
                      Show More ({signOffs.length - displayCount} remaining)
                    </Button>
                  </div>
                )}

                {!hasMore && signOffs.length > INITIAL_LIMIT && (
                  <p className="text-center text-xs text-muted-foreground pt-2">
                    Showing all {signOffs.length} sign-offs
                  </p>
                )}
              </div>
            )}
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
};
