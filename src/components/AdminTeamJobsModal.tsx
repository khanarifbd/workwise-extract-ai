import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Users, Trash2, MapPin, Phone, Briefcase, Loader2, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useTeamSettings } from '@/hooks/useTeamSettings';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface TeamJob {
  id: string;
  job_number: string;
  name: string;
  address: string | null;
  phone_number: string | null;
  team: string | null;
  team2: string | null;
  booked_date: string | null;
  status: string | null;
  progress: number | null;
  is_completed: boolean | null;
}

interface AdminTeamJobsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onJobRemoved?: () => void;
}

export const AdminTeamJobsModal = ({
  isOpen,
  onClose,
  onJobRemoved,
}: AdminTeamJobsModalProps) => {
  const { settings, isLoading: teamsLoading } = useTeamSettings();
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);
  const [jobs, setJobs] = useState<TeamJob[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [jobToRemove, setJobToRemove] = useState<{ job: TeamJob; teamField: 'team' | 'team2' } | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);

  // Get unique team names
  const teamNames = useMemo(() => {
    const names = new Set<string>();
    settings.forEach(s => names.add(s.teamName));
    return Array.from(names).sort();
  }, [settings]);

  useEffect(() => {
    if (isOpen && selectedTeam) {
      fetchTeamJobs();
    }
  }, [isOpen, selectedTeam]);

  const fetchTeamJobs = async () => {
    if (!selectedTeam) return;
    
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('jobs')
        .select('id, job_number, name, address, phone_number, team, team2, booked_date, status, progress, is_completed')
        .or(`team.eq.${selectedTeam},team2.eq.${selectedTeam}`)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setJobs(data || []);
    } catch (error) {
      console.error('Failed to fetch team jobs:', error);
      toast.error('Failed to load jobs');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemoveFromTeam = async () => {
    if (!jobToRemove) return;
    
    setIsRemoving(true);
    try {
      const updateData: Record<string, string | null> = {};
      updateData[jobToRemove.teamField] = null;

      const { error } = await supabase
        .from('jobs')
        .update(updateData as any)
        .eq('id', jobToRemove.job.id);

      if (error) throw error;

      toast.success(`Removed ${jobToRemove.job.job_number} from ${selectedTeam}'s portal`);
      
      // Refresh the list
      await fetchTeamJobs();
      onJobRemoved?.();
    } catch (error) {
      console.error('Failed to remove job from team:', error);
      toast.error('Failed to remove job from team');
    } finally {
      setIsRemoving(false);
      setJobToRemove(null);
    }
  };

  const getTeamField = (job: TeamJob): 'team' | 'team2' => {
    if (job.team === selectedTeam) return 'team';
    return 'team2';
  };

  const getStatusBadge = (job: TeamJob) => {
    if (job.is_completed || job.progress === 100) {
      return <Badge className="bg-success text-success-foreground text-xs">Completed</Badge>;
    }
    if (job.progress && job.progress > 0) {
      return <Badge variant="outline" className="text-xs">{job.progress}%</Badge>;
    }
    return <Badge variant="secondary" className="text-xs">Pending</Badge>;
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b bg-muted/30 flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Briefcase className="w-5 h-5 text-primary" />
              </div>
              <div>
                <DialogTitle className="text-lg font-semibold">Team Portal Jobs</DialogTitle>
                <DialogDescription className="text-xs">
                  View and manage jobs visible to each team's mobile portal
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
            {/* Team Selector */}
            <div className="px-6 py-4 border-b bg-background">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Select Team:</span>
                </div>
                <Select
                  value={selectedTeam || ''}
                  onValueChange={(val) => setSelectedTeam(val || null)}
                >
                  <SelectTrigger className="w-64">
                    <SelectValue placeholder="Choose a team..." />
                  </SelectTrigger>
                  <SelectContent>
                    {teamNames.map(name => (
                      <SelectItem key={name} value={name}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedTeam && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={fetchTeamJobs}
                    disabled={isLoading}
                  >
                    <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                  </Button>
                )}
              </div>
            </div>

            {/* Jobs List - scrollable container */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {!selectedTeam ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Select a team to view their assigned jobs</p>
                </div>
              ) : isLoading ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Loader2 className="h-8 w-8 mx-auto mb-4 animate-spin" />
                  <p>Loading jobs...</p>
                </div>
              ) : jobs.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Briefcase className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No jobs assigned to {selectedTeam}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-sm text-muted-foreground">
                      {jobs.length} job{jobs.length !== 1 ? 's' : ''} assigned to <span className="font-medium text-foreground">{selectedTeam}</span>
                    </p>
                  </div>
                  
                  {jobs.map(job => (
                    <div
                      key={job.id}
                      className="p-4 bg-muted/50 rounded-lg border border-border hover:border-primary/30 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0 space-y-2">
                          {/* Job Header */}
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-sm font-medium">{job.job_number}</span>
                            {getStatusBadge(job)}
                            {job.team && job.team2 && (
                              <Badge variant="outline" className="text-xs gap-1">
                                <Users className="h-3 w-3" />
                                Dual Team
                              </Badge>
                            )}
                          </div>
                          
                          {/* Job Name */}
                          <p className="font-medium truncate">{job.name}</p>
                          
                          {/* Details */}
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                            {job.address && (
                              <span className="flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                <span className="truncate max-w-[200px]">{job.address}</span>
                              </span>
                            )}
                            {job.phone_number && (
                              <span className="flex items-center gap-1">
                                <Phone className="h-3 w-3" />
                                {job.phone_number}
                              </span>
                            )}
                            {job.booked_date && (
                              <span>
                                Booked: {format(new Date(job.booked_date), 'dd MMM yyyy')}
                              </span>
                            )}
                          </div>

                          {/* Team assignments */}
                          <div className="flex gap-2 flex-wrap">
                            {job.team && (
                              <Badge 
                                variant={job.team === selectedTeam ? 'default' : 'secondary'}
                                className="text-xs"
                              >
                                Team 1: {job.team}
                              </Badge>
                            )}
                            {job.team2 && (
                              <Badge 
                                variant={job.team2 === selectedTeam ? 'default' : 'secondary'}
                                className="text-xs"
                              >
                                Team 2: {job.team2}
                              </Badge>
                            )}
                          </div>
                        </div>

                        {/* Remove Button */}
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => setJobToRemove({ job, teamField: getTeamField(job) })}
                          className="flex-shrink-0"
                        >
                          <Trash2 className="h-4 w-4 mr-1" />
                          Remove
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t bg-muted/30 flex-shrink-0">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Removing a job unassigns the team, making it disappear from their mobile portal
              </p>
              <Button variant="outline" onClick={onClose}>Close</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialog */}
      <AlertDialog open={!!jobToRemove} onOpenChange={() => setJobToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove job from team portal?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                This will remove <span className="font-medium">{jobToRemove?.job.job_number}</span> from{' '}
                <span className="font-medium">{selectedTeam}'s</span> mobile portal.
              </p>
              <p className="text-muted-foreground">
                The job will no longer be visible to {selectedTeam} in their app.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRemoving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemoveFromTeam}
              disabled={isRemoving}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isRemoving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Removing...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Remove from Portal
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
