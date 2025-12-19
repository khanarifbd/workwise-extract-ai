import { ALLSAINTS_TEAMS } from '@/types/job';
import { Users, MessageCircle } from 'lucide-react';
import { useEffect, useRef } from 'react';

interface TeamSelectorProps {
  onSelect: (teamId: string) => void;
  onClose: () => void;
}

export const TeamSelector = ({ onSelect, onClose }: TeamSelectorProps) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const handleTeamClick = (teamId: string, teamName: string, whatsappGroup?: string) => {
    onSelect(teamId);
    
    // Simulate sending to WhatsApp group
    if (whatsappGroup) {
      console.log(`Notification sent to ${teamName} WhatsApp group: ${whatsappGroup}`);
    }
  };

  return (
    <div 
      ref={ref}
      className="absolute top-full left-0 mt-2 z-50 bg-popover border border-border rounded-xl shadow-lg p-2 min-w-[200px] animate-scale-in"
    >
      <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        Allsaints Teams
      </div>
      <div className="space-y-1">
        {ALLSAINTS_TEAMS.map((team) => (
          <button
            key={team.id}
            onClick={() => handleTeamClick(team.id, team.name, team.whatsappGroup)}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted transition-colors text-left"
          >
            <div 
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: team.color }}
            />
            <span className="flex-1 font-medium text-sm">{team.name}</span>
            {team.whatsappGroup && (
              <MessageCircle className="w-4 h-4 text-success" />
            )}
          </button>
        ))}
      </div>
    </div>
  );
};
