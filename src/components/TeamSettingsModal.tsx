import { useState, useEffect } from 'react';
import { X, Save, Users, MessageCircle, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTeamSettings, TeamSetting } from '@/hooks/useTeamSettings';
import { ALLSAINTS_TEAMS, FAN_TEAMS, Team } from '@/types/job';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

interface TeamSettingsModalProps {
  onClose: () => void;
}

export const TeamSettingsModal = ({ onClose }: TeamSettingsModalProps) => {
  const { settings, isLoading, updateSetting, addTeamMember, removeTeamMember } = useTeamSettings();
  const [localSettings, setLocalSettings] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [showAddTeam, setShowAddTeam] = useState<'dm' | 'fan' | null>(null);
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamColor, setNewTeamColor] = useState('#3B82F6');
  const [newTeamWhatsapp, setNewTeamWhatsapp] = useState('');
  const [isAddingTeam, setIsAddingTeam] = useState(false);

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

  const handleAddTeamMember = async () => {
    if (!newTeamName.trim() || !showAddTeam) return;
    setIsAddingTeam(true);
    try {
      await addTeamMember({
        name: newTeamName.trim(),
        color: newTeamColor,
        whatsappGroup: newTeamWhatsapp || null,
        type: showAddTeam,
      });
      setNewTeamName('');
      setNewTeamColor('#3B82F6');
      setNewTeamWhatsapp('');
      setShowAddTeam(null);
    } finally {
      setIsAddingTeam(false);
    }
  };

  const handleRemoveTeamMember = async (teamId: string, teamName: string) => {
    if (window.confirm(`Remove ${teamName} from the team list?`)) {
      await removeTeamMember(teamId);
    }
  };

  const getTeamColor = (teamId: string) => {
    return ALLSAINTS_TEAMS.find((t) => t.id === teamId)?.color || 
           FAN_TEAMS.find((t) => t.id === teamId)?.color || 
           settings.find(s => s.teamId === teamId)?.color || '#888';
  };

  // Separate DM teams from Fan teams for display
  const dmTeamSettings = settings.filter(s => 
    s.type === 'dm' || ALLSAINTS_TEAMS.some(t => t.id === s.teamId)
  );
  const fanTeamSettings = settings.filter(s => 
    s.type === 'fan' || FAN_TEAMS.some(t => t.id === s.teamId)
  );

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] p-0 flex flex-col">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border bg-muted/30 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Users className="w-5 h-5 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-lg font-semibold">Team Settings</DialogTitle>
              <DialogDescription className="text-xs">
                Configure WhatsApp numbers and manage team members
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Content - Scrollable */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="p-5 space-y-6">
            {isLoading ? (
              <div className="text-center text-muted-foreground py-8">Loading...</div>
            ) : (
              <>
                {/* DM Teams Section */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">DM Teams</h3>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => setShowAddTeam('dm')}
                      className="h-7 gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add
                    </Button>
                  </div>
                  {dmTeamSettings.map((setting) => (
                    <div
                      key={setting.teamId}
                      className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/20"
                    >
                      <div
                        className="w-4 h-4 rounded-full flex-shrink-0"
                        style={{ backgroundColor: setting.color || getTeamColor(setting.teamId) }}
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
                      {setting.isCustom && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          onClick={() => handleRemoveTeamMember(setting.teamId, setting.teamName)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>

                {/* Fan Installers Section */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Fan Installers</h3>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => setShowAddTeam('fan')}
                      className="h-7 gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add
                    </Button>
                  </div>
                  {fanTeamSettings.map((setting) => (
                    <div
                      key={setting.teamId}
                      className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/20"
                    >
                      <div
                        className="w-4 h-4 rounded-full flex-shrink-0"
                        style={{ backgroundColor: setting.color || getTeamColor(setting.teamId) }}
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
                      {setting.isCustom && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          onClick={() => handleRemoveTeamMember(setting.teamId, setting.teamName)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>

                <p className="text-xs text-muted-foreground">
                  Enter phone numbers in international format without '+' (e.g. 447123456789 for UK)
                </p>
              </>
            )}
          </div>
        </ScrollArea>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border bg-muted/30 flex-shrink-0">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>

        {/* Add Team Member Dialog */}
        {showAddTeam && (
          <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
            <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-sm p-5 space-y-4">
              <h3 className="text-lg font-semibold">
                Add {showAddTeam === 'dm' ? 'DM Team' : 'Fan Installer'} Member
              </h3>
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Name</label>
                  <Input
                    value={newTeamName}
                    onChange={(e) => setNewTeamName(e.target.value)}
                    placeholder="Team member name"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Color</label>
                  <div className="flex gap-2 items-center">
                    <input
                      type="color"
                      value={newTeamColor}
                      onChange={(e) => setNewTeamColor(e.target.value)}
                      className="w-10 h-10 rounded cursor-pointer"
                    />
                    <Input
                      value={newTeamColor}
                      onChange={(e) => setNewTeamColor(e.target.value)}
                      className="flex-1"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">WhatsApp Number (optional)</label>
                  <Input
                    type="tel"
                    value={newTeamWhatsapp}
                    onChange={(e) => setNewTeamWhatsapp(e.target.value)}
                    placeholder="e.g. 447123456789"
                  />
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setShowAddTeam(null)}>
                  Cancel
                </Button>
                <Button onClick={handleAddTeamMember} disabled={!newTeamName.trim() || isAddingTeam}>
                  {isAddingTeam ? 'Adding...' : 'Add Member'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
