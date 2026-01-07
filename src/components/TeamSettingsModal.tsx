import React, { useState, useEffect } from 'react';
import { X, Save, Users, MessageCircle, Plus, Trash2, Pencil, Phone, Pause, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTeamSettings, TeamSetting } from '@/hooks/useTeamSettings';
import { useCategories } from '@/hooks/useCategories';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ChevronDown } from 'lucide-react';

interface TeamSettingsModalProps {
  onClose: () => void;
}

export const TeamSettingsModal = ({ onClose }: TeamSettingsModalProps) => {
  const { settings, isLoading, addTeamMember, removeTeamMember, updateTeamMember, toggleTeamPause, getTeamsForCategory, getGlobalTeams } = useTeamSettings();
  const { categories, isLoading: categoriesLoading } = useCategories();
  const [showAddTeam, setShowAddTeam] = useState<string | null>(null); // category id or 'global'
  const [editingTeam, setEditingTeam] = useState<TeamSetting | null>(null);
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamColor, setNewTeamColor] = useState('#3B82F6');
  const [newTeamWhatsapp, setNewTeamWhatsapp] = useState('');
  const [isAddingTeam, setIsAddingTeam] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  const toggleExpanded = (categoryId: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      return next;
    });
  };

  const handleEditTeam = (setting: TeamSetting) => {
    setEditingTeam(setting);
    setNewTeamName(setting.teamName);
    setNewTeamColor(setting.color || '#3B82F6');
    setNewTeamWhatsapp(setting.whatsappGroup || '');
  };

  const handleSaveEdit = async () => {
    if (!editingTeam || !newTeamName.trim()) return;
    setIsAddingTeam(true);
    try {
      await updateTeamMember(editingTeam.teamId, {
        name: newTeamName.trim(),
        color: newTeamColor,
        whatsappGroup: newTeamWhatsapp || null,
        categoryId: editingTeam.categoryId,
      });
      setEditingTeam(null);
      setNewTeamName('');
      setNewTeamColor('#3B82F6');
      setNewTeamWhatsapp('');
    } finally {
      setIsAddingTeam(false);
    }
  };

  const handleAddTeamMember = async () => {
    if (!newTeamName.trim() || !showAddTeam) return;
    setIsAddingTeam(true);
    try {
      await addTeamMember({
        name: newTeamName.trim(),
        color: newTeamColor,
        whatsappGroup: newTeamWhatsapp || null,
        type: 'dm', // Default type
        categoryId: showAddTeam === 'global' ? null : showAddTeam,
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

  const TeamMemberCard = React.forwardRef<HTMLDivElement, { setting: TeamSetting }>(
    ({ setting }, forwardedRef) => {
      return (
        <div
          ref={forwardedRef}
          className={cn(
            "flex items-center gap-2 p-3 rounded-lg border border-border bg-muted/20",
            setting.isPaused && "opacity-50 bg-muted/40"
          )}
        >
          <div
            className={cn(
              "w-4 h-4 rounded-full flex-shrink-0",
              setting.isPaused && "grayscale"
            )}
            style={{ backgroundColor: setting.color || '#888' }}
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className={cn(
                "font-medium text-sm block truncate",
                setting.isPaused && "line-through text-muted-foreground"
              )}>{setting.teamName}</span>
              {setting.isPaused && (
                <span className="text-xs bg-amber-500/20 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded">PAUSED</span>
              )}
            </div>
            {setting.whatsappGroup && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Phone className="w-3 h-3" />
                {setting.whatsappGroup}
              </span>
            )}
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => toggleTeamPause(setting.teamId)}
            className={cn("h-7 w-7 p-0", setting.isPaused ? "text-green-600 hover:text-green-700" : "text-amber-600 hover:text-amber-700")}
            title={setting.isPaused ? "Resume team" : "Pause team"}
          >
            {setting.isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => handleEditTeam(setting)}
            className="h-7 w-7 p-0"
          >
            <Pencil className="w-3.5 h-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive hover:text-destructive h-7 w-7 p-0"
            onClick={() => handleRemoveTeamMember(setting.teamId, setting.teamName)}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      );
    }
  );
  TeamMemberCard.displayName = 'TeamMemberCard';

  const CategoryTeamList = ({ categoryId, categoryName, categoryColor }: { categoryId: string; categoryName: string; categoryColor: string }) => {
    const categoryTeams = getTeamsForCategory(categoryId);
    const globalTeamsForCategory = getGlobalTeams();
    const allTeamsForCategory = [...categoryTeams, ...globalTeamsForCategory];
    const isExpanded = expandedCategories.has(categoryId);

    return (
      <Collapsible open={isExpanded} onOpenChange={() => toggleExpanded(categoryId)}>
        <CollapsibleTrigger asChild>
          <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-card hover:bg-muted/50 cursor-pointer transition-colors">
            <div className="flex items-center gap-2">
              <div
                className="w-4 h-4 rounded-full flex-shrink-0"
                style={{ backgroundColor: categoryColor }}
              />
              <span className="font-medium">{categoryName}</span>
              <span className="text-xs text-muted-foreground">({allTeamsForCategory.length} members)</span>
            </div>
            <ChevronDown className={cn("w-4 h-4 transition-transform", isExpanded && "rotate-180")} />
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="pl-4 pt-2 space-y-2">
            <ScrollArea className="max-h-[200px]">
              <div className="space-y-2 pr-2">
                {categoryTeams.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground font-medium">Category-specific:</p>
                    {categoryTeams.map((setting) => (
                      <TeamMemberCard key={setting.teamId} setting={setting} />
                    ))}
                  </div>
                )}
                {globalTeamsForCategory.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground font-medium">Global teams (available in all categories):</p>
                    {globalTeamsForCategory.map((setting) => (
                      <TeamMemberCard key={setting.teamId} setting={setting} />
                    ))}
                  </div>
                )}
                {allTeamsForCategory.length === 0 && (
                  <p className="text-sm text-muted-foreground py-2">No team members available</p>
                )}
              </div>
            </ScrollArea>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAddTeam(categoryId)}
              className="h-8 gap-1 w-full"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Team Member to {categoryName}
            </Button>
          </div>
        </CollapsibleContent>
      </Collapsible>
    );
  };

  const globalTeams = getGlobalTeams();

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] p-0 flex flex-col">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border bg-muted/30 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Users className="w-5 h-5 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-lg font-semibold">Team Settings</DialogTitle>
              <DialogDescription className="text-xs">
                Manage team members for each category with WhatsApp notifications
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Content - Scrollable */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="p-5">
            {isLoading || categoriesLoading ? (
              <div className="text-center text-muted-foreground py-8">Loading...</div>
            ) : (
              <Tabs defaultValue="categories" className="w-full">
                <TabsList className="grid w-full grid-cols-2 mb-4">
                  <TabsTrigger value="categories">By Category</TabsTrigger>
                  <TabsTrigger value="global">Global Teams ({globalTeams.length})</TabsTrigger>
                </TabsList>

                <TabsContent value="categories" className="space-y-3">
                  <p className="text-sm text-muted-foreground mb-4">
                    Assign team members to specific categories. Click a category to expand and manage its team.
                  </p>
                  <ScrollArea className="h-[400px]">
                    <div className="grid gap-3 md:grid-cols-2 pr-2">
                      {categories.map((category) => (
                        <CategoryTeamList
                          key={category.id}
                          categoryId={category.id}
                          categoryName={category.name}
                          categoryColor={category.color}
                        />
                      ))}
                    </div>
                  </ScrollArea>
                </TabsContent>

                <TabsContent value="global" className="space-y-3">
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-sm text-muted-foreground">
                      Global teams are available across all categories.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowAddTeam('global')}
                      className="h-8 gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add Global Team
                    </Button>
                  </div>
                  <ScrollArea className="h-[400px]">
                    <div className="space-y-2 pr-2">
                      {globalTeams.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-4 text-center">
                          No global team members. Add teams to specific categories instead.
                        </p>
                      ) : (
                        globalTeams.map((setting) => (
                          <TeamMemberCard key={setting.teamId} setting={setting} />
                        ))
                      )}
                    </div>
                  </ScrollArea>
                </TabsContent>
              </Tabs>
            )}

            <p className="text-xs text-muted-foreground mt-4">
              Enter phone numbers in international format without '+' (e.g. 447123456789 for UK)
            </p>
          </div>
        </ScrollArea>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border bg-muted/30 flex-shrink-0">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>

        {/* Add/Edit Team Member Dialog */}
        {(showAddTeam || editingTeam) && (
          <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
            <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-sm p-5 space-y-4">
              <h3 className="text-lg font-semibold">
                {editingTeam 
                  ? `Edit ${editingTeam.teamName}` 
                  : `Add Team Member ${showAddTeam !== 'global' ? `to ${categories.find(c => c.id === showAddTeam)?.name || 'Category'}` : '(Global)'}`
                }
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
                <Button variant="outline" onClick={() => { setShowAddTeam(null); setEditingTeam(null); setNewTeamName(''); setNewTeamColor('#3B82F6'); setNewTeamWhatsapp(''); }}>
                  Cancel
                </Button>
                <Button 
                  onClick={editingTeam ? handleSaveEdit : handleAddTeamMember} 
                  disabled={!newTeamName.trim() || isAddingTeam}
                >
                  {isAddingTeam ? 'Saving...' : editingTeam ? 'Save Changes' : 'Add Member'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};