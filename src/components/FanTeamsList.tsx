import { useState } from 'react';
import { ALLSAINTS_TEAMS, Job } from '@/types/job';
import { MessageCircle, ExternalLink, ChevronDown, ChevronUp, Users } from 'lucide-react';
import { sendWhatsAppNotification, saveNotificationToHistory } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { useTeamSettings } from '@/hooks/useTeamSettings';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

interface FanTeamsListProps {
  jobs: Job[];
  onUpdateJob: (job: Job) => void;
}

export const FanTeamsList = ({ jobs, onUpdateJob }: FanTeamsListProps) => {
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set());
  const [sendingJobId, setSendingJobId] = useState<string | null>(null);
  const { toast } = useToast();
  const { settings } = useTeamSettings();

  const toggleTeam = (teamId: string) => {
    setExpandedTeams(prev => {
      const next = new Set(prev);
      if (next.has(teamId)) {
        next.delete(teamId);
      } else {
        next.add(teamId);
      }
      return next;
    });
  };

  const getTeamWhatsApp = (teamId: string) => {
    const setting = settings.find((s) => s.teamId === teamId);
    return setting?.whatsappGroup || undefined;
  };

  const getJobsForTeam = (teamName: string) => {
    return jobs.filter(job => job.team === teamName);
  };

  const getUnassignedJobs = () => {
    return jobs.filter(job => !job.team);
  };

  const handleAssignTeam = async (job: Job, teamId: string, teamName: string) => {
    setSendingJobId(job.id);
    try {
      // Update the job with the new team
      onUpdateJob({ ...job, team: teamName });
      
      // Get WhatsApp number from DB settings
      const whatsappNumber = getTeamWhatsApp(teamId);
      
      // Send WhatsApp notification
      const result = await sendWhatsAppNotification(teamName, whatsappNumber, job);
      
      if (result?.sentViaTwilio) {
        await saveNotificationToHistory({
          jobId: job.id,
          jobNumber: job.jobNumber,
          teamName: teamName,
          whatsappNumber: whatsappNumber || null,
          message: result.notificationMessage,
          sentVia: 'twilio',
          status: 'sent',
        });
        
        toast({
          title: "Team Assigned & Notified",
          description: `Job #${job.jobNumber} assigned to ${teamName}. WhatsApp sent.`,
        });
      } else if (result?.whatsappLink) {
        await saveNotificationToHistory({
          jobId: job.id,
          jobNumber: job.jobNumber,
          teamName: teamName,
          whatsappNumber: whatsappNumber || null,
          message: result.notificationMessage,
          sentVia: 'link',
          status: 'pending',
        });
        
        toast({
          title: "Team Assigned",
          description: (
            <div className="flex flex-col gap-2">
              <span>Job #{job.jobNumber} assigned to {teamName}</span>
              <a
                href={result.whatsappLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 bg-green-500 text-white px-3 py-1.5 rounded-md text-sm font-medium hover:bg-green-600 transition-colors w-fit"
              >
                <MessageCircle className="w-4 h-4" />
                Open WhatsApp
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          ),
          duration: 10000,
        });
      } else {
        toast({
          title: "Team Assigned",
          description: `Job assigned to ${teamName}`,
        });
      }
    } catch (error) {
      console.error('Error assigning team:', error);
      toast({
        title: "Assignment Failed",
        description: "Could not assign team to job.",
        variant: "destructive",
      });
    } finally {
      setSendingJobId(null);
    }
  };

  const unassignedJobs = getUnassignedJobs();

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-sm">Fan Teams</h3>
          <Badge variant="secondary" className="ml-auto text-xs">
            {jobs.length} jobs
          </Badge>
        </div>
      </div>
      
      <ScrollArea className="max-h-[400px]">
        <div className="divide-y divide-border">
          {/* Teams List */}
          {ALLSAINTS_TEAMS.map(team => {
            const teamJobs = getJobsForTeam(team.name);
            const isExpanded = expandedTeams.has(team.id);
            const hasWhatsApp = !!getTeamWhatsApp(team.id);
            
            return (
              <div key={team.id} className="bg-card">
                <button
                  onClick={() => toggleTeam(team.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors"
                >
                  <div 
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: team.color }}
                  />
                  <span className="font-medium text-sm flex-1 text-left">{team.name}</span>
                  {hasWhatsApp && (
                    <MessageCircle className="w-4 h-4 text-success flex-shrink-0" />
                  )}
                  <Badge variant="outline" className="text-xs">
                    {teamJobs.length}
                  </Badge>
                  {isExpanded ? (
                    <ChevronUp className="w-4 h-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  )}
                </button>
                
                {isExpanded && (
                  <div className="px-4 pb-3 space-y-2">
                    {teamJobs.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-2 text-center">
                        No jobs assigned to this team
                      </p>
                    ) : (
                      teamJobs.map(job => (
                        <div 
                          key={job.id}
                          className={cn(
                            "flex items-center gap-2 p-2 rounded-lg bg-muted/30 text-sm",
                            job.isCompleted && "opacity-60"
                          )}
                        >
                          <span className="font-mono font-medium text-primary">
                            {job.jobNumber}
                          </span>
                          <span className="truncate flex-1 text-muted-foreground">
                            {job.name}
                          </span>
                          {job.fanInfo && job.fanInfo.length > 0 && (
                            <Badge className="bg-cyan-500/20 text-cyan-700 dark:text-cyan-400 text-xs">
                              {job.fanInfo.reduce((sum, f) => sum + f.quantity, 0)} fan(s)
                            </Badge>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}
          
          {/* Unassigned Section */}
          {unassignedJobs.length > 0 && (
            <div className="bg-card">
              <button
                onClick={() => toggleTeam('unassigned')}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors"
              >
                <div className="w-3 h-3 rounded-full flex-shrink-0 bg-muted-foreground/30" />
                <span className="font-medium text-sm flex-1 text-left text-muted-foreground">Unassigned</span>
                <Badge variant="outline" className="text-xs">
                  {unassignedJobs.length}
                </Badge>
                {expandedTeams.has('unassigned') ? (
                  <ChevronUp className="w-4 h-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                )}
              </button>
              
              {expandedTeams.has('unassigned') && (
                <div className="px-4 pb-3 space-y-2">
                  {unassignedJobs.map(job => (
                    <div 
                      key={job.id}
                      className="flex items-center gap-2 p-2 rounded-lg bg-muted/30 text-sm"
                    >
                      <span className="font-mono font-medium text-primary">
                        {job.jobNumber}
                      </span>
                      <span className="truncate flex-1 text-muted-foreground">
                        {job.name}
                      </span>
                      {job.fanInfo && job.fanInfo.length > 0 && (
                        <Badge className="bg-cyan-500/20 text-cyan-700 dark:text-cyan-400 text-xs">
                          {job.fanInfo.reduce((sum, f) => sum + f.quantity, 0)} fan(s)
                        </Badge>
                      )}
                      <div className="flex gap-1">
                        {ALLSAINTS_TEAMS.slice(0, 3).map(team => (
                          <Button
                            key={team.id}
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={() => handleAssignTeam(job, team.id, team.name)}
                            disabled={sendingJobId === job.id}
                            title={`Assign to ${team.name}`}
                          >
                            <div 
                              className="w-3 h-3 rounded-full"
                              style={{ backgroundColor: team.color }}
                            />
                          </Button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
};