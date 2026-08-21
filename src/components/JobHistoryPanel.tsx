import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { History, RotateCcw, Trash2, Plus, Pencil, Scissors, Loader2 } from 'lucide-react';
import { format } from 'date-fns';

export interface JobFieldVersion {
  id: string;
  job_id: string;
  job_number: string | null;
  field_name: string;
  version: number;
  old_value: string | null;
  new_value: string | null;
  changed_by: string | null;
  changed_by_email: string | null;
  changed_by_label: string | null;
  change_kind: string;
  chars_removed: number;
  chars_added: number;
  created_at: string;
}

const FIELD_LABELS: Record<string, string> = {
  description: 'Description',
  summary_of_works: 'Summary of Works',
  progress_notes: 'Progress Notes',
  private_notes: 'Private Notes',
  booking_notes: 'Booking Notes',
  ongoing_reason: 'Ongoing / Progressor Notes',
  blocker_notes: 'Blocker Notes',
  refer_back_reason: 'Refer Back Reason',
  name: 'Tenant Name',
  address: 'Address',
};

const KIND_STYLES: Record<string, { label: string; className: string; icon: typeof Pencil }> = {
  baseline: { label: 'Baseline', className: 'bg-muted text-muted-foreground', icon: History },
  created: { label: 'Added', className: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400', icon: Plus },
  edit: { label: 'Edited', className: 'bg-blue-500/15 text-blue-600 dark:text-blue-400', icon: Pencil },
  shortened: { label: 'Text removed', className: 'bg-amber-500/15 text-amber-600 dark:text-amber-400', icon: Scissors },
  cleared: { label: 'Deleted', className: 'bg-destructive/15 text-destructive', icon: Trash2 },
};

interface JobHistoryPanelProps {
  jobId: string;
  /** Called when the user restores a previous value for a field. */
  onRestore?: (fieldName: string, value: string) => void;
}

export const JobHistoryPanel = ({ jobId, onRestore }: JobHistoryPanelProps) => {
  const [versions, setVersions] = useState<JobFieldVersion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fieldFilter, setFieldFilter] = useState<string>('all');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setIsLoading(true);
      setError(null);
      const { data, error: err } = await supabase
        .from('job_field_versions')
        .select('*')
        .eq('job_id', jobId)
        .order('created_at', { ascending: false })
        .limit(500);
      if (cancelled) return;
      if (err) setError(err.message);
      else setVersions((data as JobFieldVersion[]) || []);
      setIsLoading(false);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  const fieldsPresent = useMemo(
    () => Array.from(new Set(versions.map((v) => v.field_name))),
    [versions],
  );

  const filtered = useMemo(
    () => (fieldFilter === 'all' ? versions : versions.filter((v) => v.field_name === fieldFilter)),
    [versions, fieldFilter],
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading edit history…
      </div>
    );
  }

  if (error) {
    return <p className="py-6 text-sm text-destructive">Could not load history: {error}</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Edit history</span>
          <Badge variant="secondary" className="text-xs">{versions.length} versions</Badge>
        </div>
        <Select value={fieldFilter} onValueChange={setFieldFilter}>
          <SelectTrigger className="h-8 w-[220px] text-xs">
            <SelectValue placeholder="All fields" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All fields</SelectItem>
            {fieldsPresent.map((f) => (
              <SelectItem key={f} value={f}>{FIELD_LABELS[f] || f}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 && (
        <p className="py-6 text-center text-xs text-muted-foreground">
          No recorded changes for this job yet. Future edits will appear here automatically.
        </p>
      )}

      <div className="space-y-3">
        {filtered.map((v) => {
          const kind = KIND_STYLES[v.change_kind] || KIND_STYLES.edit;
          const KindIcon = kind.icon;
          const removedText = v.old_value && v.old_value !== v.new_value ? v.old_value : null;
          return (
            <Card key={v.id} className="border-border/70">
              <CardHeader className="pb-2">
                <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="flex flex-wrap items-center gap-2">
                    <Badge className={`gap-1 text-[10px] ${kind.className}`} variant="secondary">
                      <KindIcon className="h-3 w-3" />
                      {kind.label}
                    </Badge>
                    <span className="font-semibold">{FIELD_LABELS[v.field_name] || v.field_name}</span>
                    <span className="text-muted-foreground">v{v.version}</span>
                  </span>
                  <span className="text-[11px] font-normal text-muted-foreground">
                    {format(new Date(v.created_at), 'dd MMM yyyy, HH:mm')} ·{' '}
                    {v.changed_by_label || v.changed_by_email || 'system / mobile portal'}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 pt-0">
                {(v.chars_removed > 0 || v.chars_added > 0) && (
                  <div className="flex gap-3 text-[11px]">
                    {v.chars_removed > 0 && (
                      <span className="text-destructive">−{v.chars_removed} characters</span>
                    )}
                    {v.chars_added > 0 && (
                      <span className="text-emerald-600 dark:text-emerald-400">+{v.chars_added} characters</span>
                    )}
                  </div>
                )}

                {removedText && (
                  <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-destructive">
                        Previous value (recoverable)
                      </p>
                      {onRestore && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 gap-1 px-2 text-[10px]"
                          onClick={() => onRestore(v.field_name, v.old_value || '')}
                        >
                          <RotateCcw className="h-3 w-3" />
                          Restore
                        </Button>
                      )}
                    </div>
                    <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words font-sans text-[11px] leading-relaxed">
                      {v.old_value}
                    </pre>
                  </div>
                )}

                {v.new_value && (
                  <div className="rounded-md border border-border bg-muted/30 p-2">
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {v.change_kind === 'baseline' ? 'Recorded value' : 'New value'}
                    </p>
                    <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words font-sans text-[11px] leading-relaxed">
                      {v.new_value}
                    </pre>
                  </div>
                )}

                {!v.new_value && (
                  <p className="text-[11px] italic text-muted-foreground">Field was left empty by this change.</p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};
