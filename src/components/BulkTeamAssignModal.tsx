import { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Users, X, Check, AlertTriangle, Replace } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { useTeamSettings, TeamSetting } from '@/hooks/useTeamSettings';
import { useCategories } from '@/hooks/useCategories';
import { useTeamAvailability } from '@/hooks/useTeamAvailability';
import { format } from 'date-fns';
import { Job } from '@/types/job';

interface BulkTeamAssignModalProps {
  selectedJobs: Job[];
  onAssign: (jobIds: string[], team1: string | null, team2: string | null, replaceExisting: boolean) => void;
  onClose: () => void;
}

export const BulkTeamAssignModal = ({ selectedJobs, onAssign, onClose }: BulkTeamAssignModalProps) => {
  const [selectedTeams, setSelectedTeams] = useState<string[]>([]);
  const [replaceExisting, setReplaceExisting] = useState(true);
  const { settings: teamSettings } = useTeamSettings();
  const { categories } = useCategories();
  const { isTeamUnavailableByName } = useTeamAvailability();

  // Group teams by category
  const teamsByCategory = useMemo(() => {
    const grouped = new Map<string, { categoryName: string; color: string; teams: TeamSetting[] }>();

    // Teams with category assignments
    for (const team of teamSettings) {
      if (team.categoryId) {
        const cat = categories.find(c => c.id === team.categoryId);
        const key = team.categoryId;
        if (!grouped.has(key)) {
          grouped.set(key, {
            categoryName: cat?.name || 'Unknown',
            color: cat?.color || '#6B7280',
            teams: [],
          });
        }
        // Avoid duplicates
        const group = grouped.get(key)!;
        if (!group.teams.some(t => t.teamName === team.teamName)) {
          group.teams.push(team);
        }
      }
    }

    // Global teams (no category)
    const globalTeams = teamSettings.filter(t => !t.categoryId);
    if (globalTeams.length > 0) {
      grouped.set('global', {
        categoryName: 'Global Teams',
        color: '#6B7280',
        teams: globalTeams,
      });
    }

    return grouped;
  }, [teamSettings, categories]);

  // Deduplicated flat list of unique team names
  const uniqueTeamNames = useMemo(() => {
    const seen = new Set<string>();
    const result: TeamSetting[] = [];
    for (const team of teamSettings) {
      if (!seen.has(team.teamName)) {
        seen.add(team.teamName);
        result.push(team);
      }
    }
    return result;
  }, [teamSettings]);

  const toggleTeam = (teamName: string) => {
    setSelectedTeams(prev => {
      if (prev.includes(teamName)) {
        return prev.filter(t => t !== teamName);
      }
      if (prev.length >= 2) {
        // Replace the oldest selection
        return [prev[1], teamName];
      }
      return [...prev, teamName];
    });
  };

  const handleConfirm = () => {
    if (selectedTeams.length === 0) return;
    const team1 = selectedTeams[0] || null;
    const team2 = selectedTeams[1] || null;
    const jobIds = selectedJobs.map(j => j.id);
    onAssign(jobIds, team1, team2, replaceExisting);
  };

  const handleUnassignAll = () => {
    const jobIds = selectedJobs.map(j => j.id);
    onAssign(jobIds, null, null, true);
  };

  // Count how many selected jobs already have teams
  const jobsWithTeams = selectedJobs.filter(j => j.team).length;

  const content = (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-[min(560px,calc(100vw-2rem))] max-h-[85vh] rounded-xl border border-border text-card-foreground shadow-2xl flex flex-col overflow-hidden"
        style={{ backgroundColor: 'hsl(var(--card))' }}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold">
              Bulk Assign — {selectedJobs.length} job{selectedJobs.length !== 1 ? 's' : ''}
            </span>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Options */}
        <div className="px-4 py-2 border-b border-border space-y-2">
          {jobsWithTeams > 0 && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Replace className="w-3.5 h-3.5" />
                <span>Replace existing team assignments ({jobsWithTeams} jobs have teams)</span>
              </div>
              <Switch checked={replaceExisting} onCheckedChange={setReplaceExisting} />
            </div>
          )}
          <div className="text-xs text-muted-foreground">
            Select up to <strong>2 team members</strong> to assign to all selected jobs.
          </div>
        </div>

        {/* Team list grouped by category */}
        <div
          className="flex-1 overflow-y-auto overscroll-contain"
          style={{
            maxHeight: 'min(55vh, 450px)',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          <div className="p-2 space-y-3">
            {Array.from(teamsByCategory.entries()).map(([catId, group]) => {
              // Deduplicate teams within group by name
              const seenNames = new Set<string>();
              const uniqueGroupTeams = group.teams.filter(t => {
                if (seenNames.has(t.teamName)) return false;
                seenNames.add(t.teamName);
                return true;
              });

              return (
                <div key={catId}>
                  <div className="flex items-center gap-2 px-2 py-1">
                    <div
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: group.color }}
                    />
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {group.categoryName}
                    </span>
                    <span className="text-xs text-muted-foreground">({uniqueGroupTeams.length})</span>
                  </div>
                  <div className="space-y-0.5">
                    {uniqueGroupTeams.map((team) => {
                      const isSelected = selectedTeams.includes(team.teamName);

                      return (
                        <button
                          key={`${catId}-${team.teamId}`}
                          onClick={() => toggleTeam(team.teamName)}
                          className={cn(
                            'w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-left',
                            isSelected && 'bg-primary/10 ring-1 ring-primary/30',
                            !isSelected && 'hover:bg-muted'
                          )}
                        >
                          <Checkbox checked={isSelected} className="pointer-events-none" />
                          <div
                            className="w-3 h-3 rounded-full flex-shrink-0"
                            style={{ backgroundColor: team.color || 'hsl(var(--muted-foreground))' }}
                          />
                          <span className="font-medium text-sm flex-1 truncate">{team.teamName}</span>
                          {isSelected && (
                            <Badge variant="outline" className="text-xs">
                              Team {selectedTeams.indexOf(team.teamName) + 1}
                            </Badge>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div
          className="border-t border-border p-3 space-y-2 flex-shrink-0"
          style={{ backgroundColor: 'hsl(var(--card))' }}
        >
          {selectedTeams.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {selectedTeams.map((name, i) => (
                <span
                  key={name}
                  className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/10 text-primary rounded text-xs"
                >
                  Team {i + 1}: {name}
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleTeam(name); }}
                    className="hover:bg-primary/20 rounded-full p-0.5"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="flex-1" onClick={onClose}>
              Cancel
            </Button>
            {jobsWithTeams > 0 && (
              <Button size="sm" variant="destructive" onClick={handleUnassignAll}>
                Unassign All
              </Button>
            )}
            <Button
              size="sm"
              className="flex-1"
              onClick={handleConfirm}
              disabled={selectedTeams.length === 0}
            >
              <Check className="w-3.5 h-3.5 mr-1" />
              Assign to {selectedJobs.length} Job{selectedJobs.length !== 1 ? 's' : ''}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(content, document.body) : content;
};
