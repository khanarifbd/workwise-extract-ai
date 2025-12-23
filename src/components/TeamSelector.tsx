import { Job, Team } from '@/types/job';
import { Category } from '@/types/category';
import { MessageCircle, ExternalLink, UserX, Loader2, ChevronLeft, Check, Copy } from 'lucide-react';
import { useEffect, useRef, useState, useMemo } from 'react';
import { sendWhatsAppNotification, saveNotificationToHistory } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { useTeamSettings, TeamSetting } from '@/hooks/useTeamSettings';
import { useCategories } from '@/hooks/useCategories';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';

interface TeamAssignment {
  categoryId: string;
  categoryName: string;
  teamId: string;
  teamName: string;
}

interface TeamSelectorProps {
  job: Job;
  currentCategoryId?: string;
  onSelect: (teamId: string | null) => void;
  onClose: () => void;
  onDuplicateToCategory?: (jobId: string, targetCategoryId: string, teamId: string) => void;
}

export const TeamSelector = ({ job, currentCategoryId, onSelect, onClose, onDuplicateToCategory }: TeamSelectorProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const [isSending, setIsSending] = useState(false);
  const [view, setView] = useState<'categories' | 'teams'>('categories');
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [assignments, setAssignments] = useState<TeamAssignment[]>([]);
  const { toast } = useToast();
  const { settings, isLoading, getTeamsForCategory, getGlobalTeams } = useTeamSettings();
  const { categories, isLoading: categoriesLoading } = useCategories();

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
    setAssignments([]);
    toast({
      title: 'Team Unassigned',
      description: `Job #${job.jobNumber} is now unassigned.`,
    });
    onClose();
  };

  const handleCategorySelect = (category: Category) => {
    setSelectedCategory(category);
    setView('teams');
  };

  const handleTeamToggle = (category: Category, team: TeamSetting) => {
    const existingIndex = assignments.findIndex(
      a => a.categoryId === category.id && a.teamId === team.teamId
    );

    if (existingIndex >= 0) {
      // Remove assignment
      setAssignments(prev => prev.filter((_, i) => i !== existingIndex));
    } else {
      // Add assignment (only one per category)
      setAssignments(prev => {
        // Remove any existing assignment for this category
        const filtered = prev.filter(a => a.categoryId !== category.id);
        return [...filtered, {
          categoryId: category.id,
          categoryName: category.name,
          teamId: team.teamId,
          teamName: team.teamName,
        }];
      });
    }
  };

  const isTeamSelected = (categoryId: string, teamId: string) => {
    return assignments.some(a => a.categoryId === categoryId && a.teamId === teamId);
  };

  const handleConfirmAssignments = async () => {
    if (assignments.length === 0) {
      toast({ title: 'No teams selected', variant: 'destructive' });
      return;
    }

    setIsSending(true);
    try {
      for (const assignment of assignments) {
        const isSameCategory = assignment.categoryId === currentCategoryId;
        
        if (isSameCategory) {
          // Assign to team in current category
          onSelect(assignment.teamId);
        } else if (onDuplicateToCategory) {
          // Duplicate job to other category and assign team
          onDuplicateToCategory(job.id, assignment.categoryId, assignment.teamId);
        }

        // Send WhatsApp notification
        const whatsappNumber = getTeamWhatsApp(assignment.teamId);
        try {
          const result = await sendWhatsAppNotification(assignment.teamName, whatsappNumber, job);
          
          if (result?.sentViaTwilio || result?.whatsappLink) {
            await saveNotificationToHistory({
              jobId: job.id,
              jobNumber: job.jobNumber,
              teamName: assignment.teamName,
              whatsappNumber: whatsappNumber || null,
              message: result.notificationMessage,
              sentVia: result.sentViaTwilio ? 'twilio' : 'link',
              status: result.sentViaTwilio ? 'sent' : 'pending',
            });
          }
        } catch (e) {
          console.error('Failed to send notification:', e);
        }
      }

      const categoryNames = assignments.map(a => a.categoryName).join(', ');
      toast({
        title: 'Teams Assigned',
        description: `Job #${job.jobNumber} assigned to ${assignments.length} team(s) in: ${categoryNames}`,
        duration: 5000,
      });
      onClose();
    } catch (error) {
      console.error('Assignment error:', error);
      toast({
        title: 'Assignment Error',
        description: 'Some assignments may have failed.',
        variant: 'destructive',
      });
    } finally {
      setIsSending(false);
    }
  };

  const getTeamsForDisplay = (categoryId: string): TeamSetting[] => {
    const categoryTeams = getTeamsForCategory(categoryId);
    const globalTeams = getGlobalTeams();
    return [...categoryTeams, ...globalTeams];
  };

  if (isLoading || categoriesLoading) {
    return (
      <div 
        ref={ref}
        className="absolute top-full left-0 mt-2 z-50 bg-popover border border-border rounded-xl shadow-lg p-4 min-w-[280px]"
      >
        <div className="flex items-center justify-center py-4">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div 
      ref={ref}
      className="absolute top-full left-0 mt-2 z-50 bg-popover border border-border rounded-xl shadow-lg min-w-[320px] animate-scale-in"
    >
      {/* Header */}
      <div className="px-3 py-2 border-b border-border flex items-center gap-2">
        {view === 'teams' && (
          <button 
            onClick={() => setView('categories')} 
            className="p-1 hover:bg-muted rounded"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          {view === 'categories' ? 'Select Category' : selectedCategory?.name || 'Teams'}
        </span>
      </div>

      <ScrollArea className="h-[320px]">
        <div className="p-2 space-y-1">
          {view === 'categories' ? (
            <>
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

              {/* Category list */}
              {categories.map((category) => {
                const teamsCount = getTeamsForDisplay(category.id).length;
                const selectedInCategory = assignments.find(a => a.categoryId === category.id);
                const isCurrent = category.id === currentCategoryId;
                
                return (
                  <button
                    key={category.id}
                    onClick={() => handleCategorySelect(category)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted transition-colors text-left",
                      isCurrent && "ring-2 ring-primary/50"
                    )}
                  >
                    <div 
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: category.color }}
                    />
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-sm block">{category.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {teamsCount} teams {isCurrent && '(current)'}
                      </span>
                    </div>
                    {selectedInCategory && (
                      <div className="flex items-center gap-1 text-xs text-primary">
                        <Check className="w-3 h-3" />
                        <span className="truncate max-w-[80px]">{selectedInCategory.teamName}</span>
                      </div>
                    )}
                    {!isCurrent && (
                      <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                    )}
                  </button>
                );
              })}
            </>
          ) : (
            <>
              {/* Team list for selected category */}
              {selectedCategory && getTeamsForDisplay(selectedCategory.id).map((team) => {
                const isSelected = isTeamSelected(selectedCategory.id, team.teamId);
                const hasWhatsApp = !!team.whatsappGroup;
                
                return (
                  <button
                    key={team.teamId}
                    onClick={() => handleTeamToggle(selectedCategory, team)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted transition-colors text-left",
                      isSelected && "bg-primary/10 ring-1 ring-primary/30"
                    )}
                  >
                    <Checkbox checked={isSelected} className="pointer-events-none" />
                    <div 
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: team.color || '#888' }}
                    />
                    <span className="flex-1 font-medium text-sm truncate">{team.teamName}</span>
                    {hasWhatsApp && (
                      <MessageCircle className="w-4 h-4 text-success flex-shrink-0" />
                    )}
                  </button>
                );
              })}
              
              {selectedCategory && getTeamsForDisplay(selectedCategory.id).length === 0 && (
                <div className="px-3 py-4 text-sm text-muted-foreground text-center">
                  No team members for this category
                </div>
              )}
            </>
          )}
        </div>
      </ScrollArea>

      {/* Footer with assignments summary */}
      {assignments.length > 0 && (
        <div className="border-t border-border p-3 space-y-2">
          <div className="text-xs text-muted-foreground">
            <strong>{assignments.length}</strong> assignment(s) selected:
          </div>
          <div className="flex flex-wrap gap-1">
            {assignments.map((a) => (
              <span 
                key={`${a.categoryId}-${a.teamId}`}
                className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/10 text-primary rounded text-xs"
              >
                {a.categoryName}: {a.teamName}
              </span>
            ))}
          </div>
          <Button 
            size="sm" 
            className="w-full" 
            onClick={handleConfirmAssignments}
            disabled={isSending}
          >
            {isSending ? 'Assigning...' : 'Confirm Assignments'}
          </Button>
        </div>
      )}

      {isSending && (
        <div className="px-2 py-1 text-xs text-muted-foreground text-center border-t border-border">
          Processing...
        </div>
      )}
    </div>
  );
};