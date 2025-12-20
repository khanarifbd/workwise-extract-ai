import { ALLSAINTS_TEAMS, FAN_TEAMS, Job, Team } from '@/types/job';
import { MessageCircle, ExternalLink, UserX } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { sendWhatsAppNotification, saveNotificationToHistory } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { useTeamSettings } from '@/hooks/useTeamSettings';

interface TeamSelectorProps {
  job: Job;
  onSelect: (teamId: string | null) => void;
  onClose: () => void;
  isFanCategory?: boolean;
}

export const TeamSelector = ({ job, onSelect, onClose, isFanCategory = false }: TeamSelectorProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const [isSending, setIsSending] = useState(false);
  const { toast } = useToast();
  const { settings } = useTeamSettings();
  
  // Use fan teams if this is a fan category job
  const teams: Team[] = isFanCategory ? FAN_TEAMS : ALLSAINTS_TEAMS;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const getTeamWhatsApp = (teamId: string) => {
    const setting = settings.find((s) => s.teamId === teamId);
    return setting?.whatsappGroup || undefined;
  };

  const handleUnassign = () => {
    onSelect(null);
    toast({
      title: 'Team Unassigned',
      description: `Job #${job.jobNumber} is now unassigned.`,
    });
  };

  const handleTeamClick = async (teamId: string, teamName: string) => {
    setIsSending(true);
    try {
      // Always select the team first
      onSelect(teamId);
      
      // Get WhatsApp number from DB settings
      const whatsappNumber = getTeamWhatsApp(teamId);
      
      // Then send WhatsApp notification via Twilio
      const result = await sendWhatsAppNotification(teamName, whatsappNumber, job);
      
      if (result?.sentViaTwilio) {
        // Save to notification history
        try {
          await saveNotificationToHistory({
            jobId: job.id,
            jobNumber: job.jobNumber,
            teamName: teamName,
            whatsappNumber: whatsappNumber || null,
            message: result.notificationMessage,
            sentVia: 'twilio',
            status: 'sent',
          });
        } catch (e) {
          console.error('Failed to save notification history:', e);
        }
        
        // Message was sent automatically via Twilio
        toast({
          title: "Team Assigned & Notified",
          description: `Job #${job.jobNumber} assigned to ${teamName}. WhatsApp message sent automatically.`,
          duration: 5000,
        });
      } else if (result?.whatsappLink) {
        // Save to notification history as link
        try {
          await saveNotificationToHistory({
            jobId: job.id,
            jobNumber: job.jobNumber,
            teamName: teamName,
            whatsappNumber: whatsappNumber || null,
            message: result.notificationMessage,
            sentVia: 'link',
            status: 'pending',
          });
        } catch (e) {
          console.error('Failed to save notification history:', e);
        }
        
        // Fallback to manual link if Twilio not configured
        toast({
          title: "Team Assigned - Send WhatsApp?",
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
      console.error('WhatsApp error:', error);
      toast({
        title: "Team Assigned",
        description: `Job assigned to ${teamName}. Notification failed.`,
      });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div 
      ref={ref}
      className="absolute top-full left-0 mt-2 z-50 bg-popover border border-border rounded-xl shadow-lg p-2 min-w-[220px] animate-scale-in"
    >
      <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        {isFanCategory ? 'Fan Installers' : 'Allsaints Teams'}
      </div>
      <div className="space-y-1 max-h-48 overflow-y-auto">
        {/* Unassign option */}
        {job.team && (
          <button
            onClick={handleUnassign}
            disabled={isSending}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-destructive/10 transition-colors text-left disabled:opacity-50 text-destructive"
          >
            <UserX className="w-4 h-4" />
            <span className="flex-1 font-medium text-sm">Unassign Team</span>
          </button>
        )}
        
        {teams.map((team) => {
          const hasWhatsApp = !!getTeamWhatsApp(team.id);
          return (
            <button
              key={team.id}
              onClick={() => handleTeamClick(team.id, team.name)}
              disabled={isSending}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted transition-colors text-left disabled:opacity-50"
            >
              <div 
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: team.color }}
              />
              <span className="flex-1 font-medium text-sm">{team.name}</span>
              {hasWhatsApp && (
                <div className="flex items-center gap-1">
                  <MessageCircle className="w-4 h-4 text-success" />
                  <ExternalLink className="w-3 h-3 text-muted-foreground" />
                </div>
              )}
            </button>
          );
        })}
      </div>
      {isSending && (
        <div className="px-2 py-1 text-xs text-muted-foreground text-center">
          Preparing WhatsApp...
        </div>
      )}
    </div>
  );
};
