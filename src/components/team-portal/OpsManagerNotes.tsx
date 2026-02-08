import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
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
} from 'lucide-react';
import { format, parseISO, isToday, isYesterday } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { VoiceNoteRecorder } from './VoiceNoteRecorder';
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

interface OpsManagerNotesProps {
  teamId: string;
  teamName: string;
}

const urgencyConfig = {
  immediate: { 
    color: 'bg-red-600 text-white', 
    icon: AlertCircle, 
    label: '🚨 IMMEDIATE',
    border: 'border-l-4 border-red-600',
  },
  high: { 
    color: 'bg-orange-500 text-white', 
    icon: AlertTriangle, 
    label: '⚠️ High',
    border: 'border-l-4 border-orange-500',
  },
  normal: { 
    color: 'bg-blue-500 text-white', 
    icon: Bell, 
    label: 'Normal',
    border: 'border-l-4 border-blue-500',
  },
  low: { 
    color: 'bg-gray-400 text-white', 
    icon: Clock, 
    label: 'Low',
    border: 'border-l-4 border-gray-400',
  },
};

const categoryConfig = {
  issue: { icon: XCircle, color: 'text-red-600', label: 'Issue' },
  instruction: { icon: MessageSquare, color: 'text-blue-600', label: 'Instruction' },
  reminder: { icon: Bell, color: 'text-amber-600', label: 'Reminder' },
  feedback: { icon: Lightbulb, color: 'text-green-600', label: 'Feedback' },
  general: { icon: MessageSquare, color: 'text-gray-600', label: 'General' },
};

export const OpsManagerNotes = ({ teamId, teamName }: OpsManagerNotesProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isRecorderOpen, setIsRecorderOpen] = useState(false);
  const [notes, setNotes] = useState<OpsNote[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  const fetchNotes = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('ops_manager_notes')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setNotes((data || []) as OpsNote[]);
    } catch (err) {
      console.error('Error fetching notes:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isExpanded) {
      fetchNotes();
    }
  }, [isExpanded, fetchNotes]);

  // Subscribe to realtime updates
  useEffect(() => {
    const channel = supabase
      .channel('ops-notes-realtime')
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
  }, [fetchNotes]);

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

  const formatNoteDate = (dateStr: string) => {
    const date = parseISO(dateStr);
    if (isToday(date)) {
      return `Today ${format(date, 'HH:mm')}`;
    }
    if (isYesterday(date)) {
      return `Yesterday ${format(date, 'HH:mm')}`;
    }
    return format(date, 'dd MMM HH:mm');
  };

  const unresolvedCount = notes.filter(n => !n.is_resolved).length;
  const immediateCount = notes.filter(n => n.urgency === 'immediate' && !n.is_resolved).length;

  return (
    <div className="w-full">
      {/* Collapsible Header Button */}
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <div className="flex items-center gap-2 mb-2">
          <CollapsibleTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={cn(
                "h-8 px-3 gap-2 font-medium",
                immediateCount > 0 && "border-red-400 bg-red-50 dark:bg-red-900/20 animate-pulse"
              )}
            >
              <Mic className="h-4 w-4" />
              <span className="hidden sm:inline">Voice Notes</span>
              {unresolvedCount > 0 && (
                <Badge 
                  variant="secondary" 
                  className={cn(
                    "ml-1 h-5 px-1.5 text-xs",
                    immediateCount > 0 ? "bg-red-600 text-white" : "bg-orange-500 text-white"
                  )}
                >
                  {unresolvedCount}
                </Badge>
              )}
              {isExpanded ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
            </Button>
          </CollapsibleTrigger>

          {/* Record New Button */}
          <Button
            size="sm"
            onClick={() => setIsRecorderOpen(true)}
            className="h-8 px-3 bg-orange-600 hover:bg-orange-700 gap-1"
          >
            <Mic className="h-4 w-4" />
            <span className="hidden sm:inline">Record</span>
          </Button>
        </div>

        <CollapsibleContent>
          <Card className="mt-2">
            <CardContent className="p-3 space-y-2 max-h-[400px] overflow-y-auto">
              {isLoading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : notes.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground">
                  <Mic className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No voice notes yet</p>
                  <p className="text-xs">Tap Record to create your first note</p>
                </div>
              ) : (
                notes.map(note => {
                  const urgency = urgencyConfig[note.urgency];
                  const category = categoryConfig[note.category];
                  const CategoryIcon = category.icon;
                  const isNoteExpanded = expandedNotes.has(note.id);

                  return (
                    <div
                      key={note.id}
                      className={cn(
                        "rounded-lg p-3 bg-card border transition-all",
                        urgency.border,
                        note.is_resolved && "opacity-60"
                      )}
                    >
                      <div className="flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                          {/* Header row */}
                          <div className="flex items-center gap-2 flex-wrap">
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
                              <Badge variant="secondary" className="h-5 text-xs gap-1">
                                <Briefcase className="h-3 w-3" />
                                #{note.job_number}
                              </Badge>
                            )}
                          </div>

                          {/* Title */}
                          <h4 
                            className={cn(
                              "font-medium mt-1.5 cursor-pointer",
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
                          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {formatNoteDate(note.created_at)}
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
                            className="h-7 w-7 text-red-500 hover:text-red-600"
                            onClick={() => deleteNote(note.id)}
                            title="Delete note"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </CollapsibleContent>
      </Collapsible>

      {/* Voice Recorder Modal */}
      <VoiceNoteRecorder
        isOpen={isRecorderOpen}
        onClose={() => setIsRecorderOpen(false)}
        teamId={teamId}
        teamName={teamName}
        onNoteCreated={fetchNotes}
      />
    </div>
  );
};
