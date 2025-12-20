import { ALLSAINTS_TEAMS, Job } from '@/types/job';
import { MessageCircle, ExternalLink } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { sendWhatsAppNotification } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';

interface TeamSelectorProps {
  job: Job;
  onSelect: (teamId: string) => void;
  onClose: () => void;
}

export const TeamSelector = ({ job, onSelect, onClose }: TeamSelectorProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const [isSending, setIsSending] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const handleTeamClick = async (teamId: string, teamName: string, whatsappGroup?: string) => {
    setIsSending(true);
    try {
      // Always select the team first
      onSelect(teamId);
      
      // Then prepare WhatsApp notification
      const result = await sendWhatsAppNotification(teamName, whatsappGroup, job);
      
      if (result?.whatsappLink) {
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
        description: `Job assigned to ${teamName}. Notification preparation failed.`,
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
        Allsaints Teams
      </div>
      <div className="space-y-1 max-h-48 overflow-y-auto">
        {ALLSAINTS_TEAMS.map((team) => (
          <button
            key={team.id}
            onClick={() => handleTeamClick(team.id, team.name, team.whatsappGroup)}
            disabled={isSending}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted transition-colors text-left disabled:opacity-50"
          >
            <div 
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: team.color }}
            />
            <span className="flex-1 font-medium text-sm">{team.name}</span>
            {team.whatsappGroup && (
              <div className="flex items-center gap-1">
                <MessageCircle className="w-4 h-4 text-success" />
                <ExternalLink className="w-3 h-3 text-muted-foreground" />
              </div>
            )}
          </button>
        ))}
      </div>
      {isSending && (
        <div className="px-2 py-1 text-xs text-muted-foreground text-center">
          Preparing WhatsApp...
        </div>
      )}
    </div>
  );
};
