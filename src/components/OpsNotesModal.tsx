import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Mic, 
  ChevronDown, 
  ChevronRight,
  Clock,
  User,
  Briefcase,
  CheckCircle,
  XCircle,
  AlertTriangle,
  AlertCircle,
  Bell,
  MessageSquare,
  Lightbulb,
  Loader2,
  Trash2,
  Calendar,
} from 'lucide-react';
import { format, parseISO, startOfMonth, isSameDay, isSameMonth } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface OpsNote {
  id: string;
  created_by: string;
  created_by_name: string;
  transcribed_text: string;
  enhanced_text: string;
  title: string;
  urgency: 'immediate' | 'high' | 'normal' | 'low';
  team_association: string | null;
  job_number: string | null;
  job_id: string | null;
  category: 'issue' | 'instruction' | 'reminder' | 'feedback' | 'general';
  is_resolved: boolean;
  resolved_at: string | null;
  created_at: string;
}

interface OpsNotesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onJobClick?: (jobId: string) => void;
}

const urgencyConfig = {
  immediate: { 
    color: 'bg-red-600 text-white', 
    icon: AlertCircle, 
    label: '🚨 IMMEDIATE',
  },
  high: { 
    color: 'bg-orange-500 text-white', 
    icon: AlertTriangle, 
    label: '⚠️ High',
  },
  normal: { 
    color: 'bg-blue-500 text-white', 
    icon: Bell, 
    label: 'Normal',
  },
  low: { 
    color: 'bg-gray-400 text-white', 
    icon: Clock, 
    label: 'Low',
  },
};

const categoryConfig = {
  issue: { icon: XCircle, color: 'text-red-600', label: 'Issue' },
  instruction: { icon: MessageSquare, color: 'text-blue-600', label: 'Instruction' },
  reminder: { icon: Bell, color: 'text-amber-600', label: 'Reminder' },
  feedback: { icon: Lightbulb, color: 'text-green-600', label: 'Feedback' },
  general: { icon: MessageSquare, color: 'text-gray-600', label: 'General' },
};

interface GroupedNotes {
  [monthKey: string]: {
    month: Date;
    days: {
      [dayKey: string]: {
        date: Date;
        notes: OpsNote[];
      };
    };
  };
}

export const OpsNotesModal = ({ isOpen, onClose, onJobClick }: OpsNotesModalProps) => {
  const [notes, setNotes] = useState<OpsNote[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  const fetchNotes = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('ops_manager_notes')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) throw error;
      setNotes((data || []) as OpsNote[]);
      
      // Auto-expand current month
      if (data && data.length > 0) {
        const currentMonth = format(new Date(), 'yyyy-MM');
        setExpandedMonths(new Set([currentMonth]));
        
        // Auto-expand today
        const today = format(new Date(), 'yyyy-MM-dd');
        setExpandedDays(new Set([today]));
      }
    } catch (err) {
      console.error('Error fetching notes:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchNotes();
    }
  }, [isOpen, fetchNotes]);

  // Subscribe to realtime updates
  useEffect(() => {
    if (!isOpen) return;

    const channel = supabase
      .channel('ops-notes-admin-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ops_manager_notes',
        },
        () => {
          fetchNotes();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isOpen, fetchNotes]);

  const toggleMonth = (monthKey: string) => {
    setExpandedMonths(prev => {
      const next = new Set(prev);
      if (next.has(monthKey)) {
        next.delete(monthKey);
      } else {
        next.add(monthKey);
      }
      return next;
    });
  };

  const toggleDay = (dayKey: string) => {
    setExpandedDays(prev => {
      const next = new Set(prev);
      if (next.has(dayKey)) {
        next.delete(dayKey);
      } else {
        next.add(dayKey);
      }
      return next;
    });
  };

  const toggleNoteExpand = (noteId: string) => {
    setExpandedNotes(prev => {
      const next = new Set(prev);
      if (next.has(noteId)) {
        next.delete(noteId);
      } else {
        next.add(noteId);
      }
      return next;
    });
  };

  const toggleResolved = async (note: OpsNote) => {
    try {
      const { error } = await supabase
        .from('ops_manager_notes')
        .update({
          is_resolved: !note.is_resolved,
          resolved_at: !note.is_resolved ? new Date().toISOString() : null,
        })
        .eq('id', note.id);

      if (error) throw error;

      setNotes(prev => 
        prev.map(n => 
          n.id === note.id 
            ? { ...n, is_resolved: !n.is_resolved, resolved_at: !n.is_resolved ? new Date().toISOString() : null }
            : n
        )
      );

      toast({
        title: note.is_resolved ? 'Marked as Active' : 'Marked as Resolved',
        description: note.title,
      });
    } catch (err) {
      console.error('Error toggling resolved:', err);
      toast({
        title: 'Error',
        description: 'Failed to update note status',
        variant: 'destructive',
      });
    }
  };

  const deleteNote = async (noteId: string) => {
    try {
      const { error } = await supabase
        .from('ops_manager_notes')
        .delete()
        .eq('id', noteId);

      if (error) throw error;

      setNotes(prev => prev.filter(n => n.id !== noteId));
      toast({
        title: 'Note Deleted',
        description: 'Voice note has been removed',
      });
    } catch (err) {
      console.error('Error deleting note:', err);
      toast({
        title: 'Error',
        description: 'Failed to delete note',
        variant: 'destructive',
      });
    }
  };

  // Group notes by month and day
  const groupedNotes: GroupedNotes = notes.reduce((acc, note) => {
    const noteDate = parseISO(note.created_at);
    const monthKey = format(noteDate, 'yyyy-MM');
    const dayKey = format(noteDate, 'yyyy-MM-dd');

    if (!acc[monthKey]) {
      acc[monthKey] = {
        month: startOfMonth(noteDate),
        days: {},
      };
    }

    if (!acc[monthKey].days[dayKey]) {
      acc[monthKey].days[dayKey] = {
        date: noteDate,
        notes: [],
      };
    }

    acc[monthKey].days[dayKey].notes.push(note);
    return acc;
  }, {} as GroupedNotes);

  const unresolvedCount = notes.filter(n => !n.is_resolved).length;
  const immediateCount = notes.filter(n => n.urgency === 'immediate' && !n.is_resolved).length;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <Mic className="h-5 w-5" />
            <span>Operations Manager Notes</span>
            {unresolvedCount > 0 && (
              <Badge 
                variant="secondary" 
                className={cn(
                  immediateCount > 0 ? "bg-red-600 text-white" : "bg-orange-500 text-white"
                )}
              >
                {unresolvedCount} active
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 -mx-6 px-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : notes.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Mic className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p className="text-lg font-medium">No voice notes yet</p>
              <p className="text-sm">Operations Manager notes will appear here</p>
            </div>
          ) : (
            <div className="space-y-3 pb-4">
              {Object.entries(groupedNotes)
                .sort(([a], [b]) => b.localeCompare(a))
                .map(([monthKey, monthData]) => {
                  const isMonthExpanded = expandedMonths.has(monthKey);
                  const monthNoteCount = Object.values(monthData.days).reduce(
                    (sum, day) => sum + day.notes.length, 0
                  );
                  const monthUnresolvedCount = Object.values(monthData.days).reduce(
                    (sum, day) => sum + day.notes.filter(n => !n.is_resolved).length, 0
                  );

                  return (
                    <Collapsible key={monthKey} open={isMonthExpanded} onOpenChange={() => toggleMonth(monthKey)}>
                      <CollapsibleTrigger asChild>
                        <Button
                          variant="ghost"
                          className="w-full justify-between h-10 px-3 hover:bg-muted"
                        >
                          <div className="flex items-center gap-2">
                            {isMonthExpanded ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            <span className="font-semibold">
                              {format(monthData.month, 'MMMM yyyy')}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">
                              {monthNoteCount} notes
                            </Badge>
                            {monthUnresolvedCount > 0 && (
                              <Badge className="bg-orange-500 text-white text-xs">
                                {monthUnresolvedCount} active
                              </Badge>
                            )}
                          </div>
                        </Button>
                      </CollapsibleTrigger>

                      <CollapsibleContent className="pl-4 space-y-2 mt-2">
                        {Object.entries(monthData.days)
                          .sort(([a], [b]) => b.localeCompare(a))
                          .map(([dayKey, dayData]) => {
                            const isDayExpanded = expandedDays.has(dayKey);
                            const dayUnresolvedCount = dayData.notes.filter(n => !n.is_resolved).length;
                            const isToday = isSameDay(dayData.date, new Date());

                            return (
                              <Collapsible key={dayKey} open={isDayExpanded} onOpenChange={() => toggleDay(dayKey)}>
                                <CollapsibleTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className={cn(
                                      "w-full justify-between h-8 px-2 hover:bg-muted",
                                      isToday && "bg-green-50 dark:bg-green-900/20"
                                    )}
                                  >
                                    <div className="flex items-center gap-2">
                                      {isDayExpanded ? (
                                        <ChevronDown className="h-3 w-3" />
                                      ) : (
                                        <ChevronRight className="h-3 w-3" />
                                      )}
                                      <span className={cn("text-sm", isToday && "font-semibold text-green-700 dark:text-green-400")}>
                                        {isToday ? 'Today' : format(dayData.date, 'EEEE, d MMM')}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <Badge variant="outline" className="text-xs h-5">
                                        {dayData.notes.length}
                                      </Badge>
                                      {dayUnresolvedCount > 0 && (
                                        <Badge className="bg-orange-500 text-white text-xs h-5">
                                          {dayUnresolvedCount}
                                        </Badge>
                                      )}
                                    </div>
                                  </Button>
                                </CollapsibleTrigger>

                                <CollapsibleContent className="pl-4 space-y-2 mt-2">
                                  {dayData.notes.map(note => {
                                    const urgency = urgencyConfig[note.urgency];
                                    const category = categoryConfig[note.category];
                                    const CategoryIcon = category.icon;
                                    const isNoteExpanded = expandedNotes.has(note.id);

                                    return (
                                      <div
                                        key={note.id}
                                        className={cn(
                                          "rounded-lg p-3 bg-card border transition-all",
                                          note.urgency === 'immediate' && !note.is_resolved && "border-l-4 border-l-red-600",
                                          note.urgency === 'high' && !note.is_resolved && "border-l-4 border-l-orange-500",
                                          note.is_resolved && "opacity-60"
                                        )}
                                      >
                                        <div className="flex items-start gap-2">
                                          <div className="flex-1 min-w-0">
                                            {/* Header badges */}
                                            <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
                                              <Badge className={cn("h-5 text-xs", urgency.color)}>
                                                {urgency.label}
                                              </Badge>
                                              <Badge variant="outline" className={cn("h-5 text-xs gap-1", category.color)}>
                                                <CategoryIcon className="h-3 w-3" />
                                                {category.label}
                                              </Badge>
                                              {note.team_association && (
                                                <Badge variant="secondary" className="h-5 text-xs gap-1">
                                                  <User className="h-3 w-3" />
                                                  {note.team_association}
                                                </Badge>
                                              )}
                                              {note.job_number && (
                                                <Badge 
                                                  variant="secondary" 
                                                  className={cn(
                                                    "h-5 text-xs gap-1",
                                                    note.job_id && onJobClick && "cursor-pointer hover:bg-primary hover:text-primary-foreground"
                                                  )}
                                                  onClick={() => {
                                                    if (note.job_id && onJobClick) {
                                                      onJobClick(note.job_id);
                                                      onClose();
                                                    }
                                                  }}
                                                >
                                                  <Briefcase className="h-3 w-3" />
                                                  #{note.job_number}
                                                </Badge>
                                              )}
                                            </div>

                                            {/* Title */}
                                            <h4 
                                              className={cn(
                                                "font-medium cursor-pointer hover:text-primary",
                                                note.is_resolved && "line-through"
                                              )}
                                              onClick={() => toggleNoteExpand(note.id)}
                                            >
                                              {note.title}
                                            </h4>

                                            {/* Enhanced text (collapsible) */}
                                            {isNoteExpanded && (
                                              <div className="mt-2 text-sm text-muted-foreground bg-muted/50 rounded p-2">
                                                <p className="whitespace-pre-wrap">{note.enhanced_text}</p>
                                                <div className="mt-2 pt-2 border-t border-border/50 text-xs italic">
                                                  <strong>Original:</strong> "{note.transcribed_text}"
                                                </div>
                                              </div>
                                            )}

                                            {/* Footer */}
                                            <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                                              <span className="flex items-center gap-1">
                                                <Clock className="h-3 w-3" />
                                                {format(parseISO(note.created_at), 'HH:mm')}
                                              </span>
                                              <span>by {note.created_by_name}</span>
                                            </div>
                                          </div>

                                          {/* Action buttons */}
                                          <div className="flex flex-col gap-1">
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              className="h-7 w-7"
                                              onClick={() => toggleResolved(note)}
                                              title={note.is_resolved ? 'Mark as active' : 'Mark as resolved'}
                                            >
                                              {note.is_resolved ? (
                                                <XCircle className="h-4 w-4 text-muted-foreground" />
                                              ) : (
                                                <CheckCircle className="h-4 w-4 text-green-600" />
                                              )}
                                            </Button>
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              className="h-7 w-7 text-destructive hover:text-destructive"
                                              onClick={() => deleteNote(note.id)}
                                              title="Delete note"
                                            >
                                              <Trash2 className="h-4 w-4" />
                                            </Button>
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </CollapsibleContent>
                              </Collapsible>
                            );
                          })}
                      </CollapsibleContent>
                    </Collapsible>
                  );
                })}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};
