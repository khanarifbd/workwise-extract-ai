import { useState, useEffect } from 'react';
import { X, Save, Users, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTeamSettings, TeamSetting } from '@/hooks/useTeamSettings';
import { ALLSAINTS_TEAMS } from '@/types/job';
import { cn } from '@/lib/utils';

interface TeamSettingsModalProps {
  onClose: () => void;
}

export const TeamSettingsModal = ({ onClose }: TeamSettingsModalProps) => {
  const { settings, isLoading, updateSetting } = useTeamSettings();
  const [localSettings, setLocalSettings] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    const initial: Record<string, string> = {};
    settings.forEach((s) => {
      initial[s.teamId] = s.whatsappGroup || '';
    });
    setLocalSettings(initial);
  }, [settings]);

  const handleSave = async (teamId: string) => {
    setSaving(teamId);
    await updateSetting(teamId, localSettings[teamId] || null);
    setSaving(null);
  };

  const getTeamColor = (teamId: string) => {
    return ALLSAINTS_TEAMS.find((t) => t.id === teamId)?.color || '#888';
  };

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-muted/30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Users className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Team Settings</h2>
              <p className="text-xs text-muted-foreground">Configure WhatsApp numbers for each team</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-muted rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 p-5 space-y-4 overflow-y-auto min-h-0">
          {isLoading ? (
            <div className="text-center text-muted-foreground py-8">Loading...</div>
          ) : (
            settings.map((setting) => (
              <div
                key={setting.teamId}
                className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/20"
              >
                <div
                  className="w-4 h-4 rounded-full flex-shrink-0"
                  style={{ backgroundColor: getTeamColor(setting.teamId) }}
                />
                <span className="font-medium min-w-[80px]">{setting.teamName}</span>
                <div className="flex-1 flex items-center gap-2">
                  <MessageCircle className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <Input
                    type="tel"
                    placeholder="e.g. 447123456789"
                    value={localSettings[setting.teamId] || ''}
                    onChange={(e) =>
                      setLocalSettings((prev) => ({
                        ...prev,
                        [setting.teamId]: e.target.value,
                      }))
                    }
                    className="flex-1"
                  />
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={saving === setting.teamId}
                  onClick={() => handleSave(setting.teamId)}
                  className={cn(saving === setting.teamId && 'opacity-50')}
                >
                  {saving === setting.teamId ? '...' : <Save className="w-4 h-4" />}
                </Button>
              </div>
            ))
          )}
          <p className="text-xs text-muted-foreground">
            Enter phone numbers in international format without '+' (e.g. 447123456789 for UK)
          </p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border bg-muted/30">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
};
