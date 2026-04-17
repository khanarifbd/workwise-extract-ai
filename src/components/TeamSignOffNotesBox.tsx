import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { CheckCircle2, MessageSquare, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { Job } from '@/types/job';
import { cn } from '@/lib/utils';

interface SignOffNote {
  id: string;
  team_name: string;
  signed_off_at: string;
  progress_notes: string | null;
}

interface TeamSignOffNotesBoxProps {
  job: Job;
  searchTerm?: string;
}

/**
 * Displays all team sign-off notes + the live progressNotes for a job
 * in a clearly bordered box, separate from the main description.
 * Shown beneath the InlineDescriptionEditor inside the Description column.
 */
export const TeamSignOffNotesBox = ({ job, searchTerm }: TeamSignOffNotesBoxProps) => {
  const [signOffNotes, setSignOffNotes] = useState<SignOffNote[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // Fetch sign-off notes for this job
  useEffect(() => {
    let cancelled = false;
    const fetchNotes = async () => {
      if (!job.id) return;
      setLoading(true);
      const { data, error } = await supabase
        .from('team_sign_offs')
        .select('id, team_name, signed_off_at, progress_notes')
        .eq('job_id', job.id)
        .not('progress_notes', 'is', null)
        .order('signed_off_at', { ascending: false });

      if (!cancelled) {
        if (!error && data) {
          // Filter out empty notes
          setSignOffNotes(
            (data as SignOffNote[]).filter(n => n.progress_notes && n.progress_notes.trim().length > 0)
          );
        }
        setLoading(false);
      }
    };
    fetchNotes();

    // Realtime subscription so notes appear instantly when teams sign off
    const channel = supabase
      .channel(`signoff-notes-${job.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'team_sign_offs', filter: `job_id=eq.${job.id}` },
        () => fetchNotes()
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [job.id]);

  const liveNote = (job.progressNotes || '').trim();
  const hasLiveNote = liveNote.length > 0;
  const hasAnyNote = hasLiveNote || signOffNotes.length > 0;

  if (loading && !hasAnyNote) return null;
  if (!hasAnyNote) return null;

  // Combine for ordering: live progress note first (if present), then sign-off history
  const totalCount = signOffNotes.length + (hasLiveNote ? 1 : 0);
  const PREVIEW_COUNT = 1;
  const visibleSignOffs = expanded ? signOffNotes : signOffNotes.slice(0, hasLiveNote ? 0 : PREVIEW_COUNT);

  const highlight = (text: string) => {
    if (!searchTerm || !searchTerm.trim()) return text;
    const term = searchTerm.trim();
    const idx = text.toLowerCase().indexOf(term.toLowerCase());
    if (idx === -1) return text;
    return (
      <>
        {text.slice(0, idx)}
        <mark className="bg-yellow-200 dark:bg-yellow-900/60 text-foreground rounded px-0.5">
          {text.slice(idx, idx + term.length)}
        </mark>
        {text.slice(idx + term.length)}
      </>
    );
  };

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className={cn(
        'mt-2 rounded-md border-2 border-dashed border-[hsl(var(--success))]/40 bg-[hsl(var(--success))]/5 p-2 space-y-1.5'
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[hsl(var(--success))]">
          <MessageSquare className="h-3 w-3" />
          Team Notes ({totalCount})
        </div>
        {totalCount > 1 && (
          <button
            onClick={() => setExpanded(e => !e)}
            className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5"
          >
            {expanded ? (<><ChevronUp className="h-3 w-3" />Less</>) : (<><ChevronDown className="h-3 w-3" />Show all</>)}
          </button>
        )}
      </div>

      {/* Live progress note (latest unsaved/in-progress) */}
      {hasLiveNote && (
        <div className="rounded bg-card border border-border/60 p-2">
          <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-muted-foreground mb-0.5">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
            Live progress note
          </div>
          <p className="text-xs text-foreground whitespace-pre-wrap break-words">
            {highlight(liveNote)}
          </p>
        </div>
      )}

      {/* Sign-off history notes */}
      {visibleSignOffs.map((note) => (
        <div key={note.id} className="rounded bg-card border border-border/60 p-2">
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <div className="flex items-center gap-1 text-[10px] font-medium text-[hsl(var(--success))]">
              <CheckCircle2 className="h-3 w-3" />
              {note.team_name}
            </div>
            <span className="text-[9px] text-muted-foreground">
              {format(new Date(note.signed_off_at), 'dd MMM yyyy, HH:mm')}
            </span>
          </div>
          <p className="text-xs text-foreground whitespace-pre-wrap break-words">
            {highlight(note.progress_notes || '')}
          </p>
        </div>
      ))}

      {!expanded && signOffNotes.length > visibleSignOffs.length && (
        <button
          onClick={() => setExpanded(true)}
          className="text-[10px] text-primary hover:underline"
        >
          + {signOffNotes.length - visibleSignOffs.length} more sign-off note{signOffNotes.length - visibleSignOffs.length !== 1 ? 's' : ''}
        </button>
      )}
    </div>
  );
};
