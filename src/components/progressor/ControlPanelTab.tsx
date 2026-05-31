import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import {
  Loader2, Plus, Save, Trash2, AlertOctagon, CheckCircle2, ChevronDown, ChevronRight,
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { ControlTeamAssignment } from './ControlTeamAssignment';

export const PROBLEM_TYPES = [
  'Tenant Issue',
  'Trade Required',
  'Upload Missing',
  'Access Delay',
  'Variation / Additional Works',
  'Complaint',
  'Team Performance Issue',
  'Other',
] as const;

export const NEXT_ACTIONS = [
  'Call tenant',
  'Visit property',
  'Leave letter (no access)',
  'Book trade',
  'Complete works',
  'Upload missing info',
  'Return to NPH',
  'Await tenant response',
] as const;

export const CONTROL_STATUSES = ['Open', 'In Progress', 'Waiting', 'Completed'] as const;

const STATUS_COLOR: Record<string, string> = {
  Open: 'bg-red-500 text-white',
  'In Progress': 'bg-amber-500 text-white',
  Waiting: 'bg-slate-500 text-white',
  Completed: 'bg-emerald-600 text-white',
};

export interface ControlRecord {
  id: string;
  job_id: string;
  problem_type: string;
  problem_description: string;
  next_action: string;
  action_details: string;
  assigned_to: string;
  deadline: string | null;
  status: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

interface ControlPanelTabProps {
  jobId: string;
  jobNumber: string;
  jobName?: string;
  jobAddress?: string;
  onCompletedChange?: (hasCompleted: boolean) => void;
}

type DraftRecord = Partial<ControlRecord> & { isNew?: boolean };

export function ControlPanelTab({ jobId, jobNumber, jobName = '', jobAddress = '', onCompletedChange }: ControlPanelTabProps) {
  const [records, setRecords] = useState<ControlRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftRecord | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('job_control_records')
      .select('*')
      .eq('job_id', jobId)
      .order('created_at', { ascending: false });
    if (error) {
      toast({ title: 'Failed to load CONTROL records', description: error.message, variant: 'destructive' });
    } else {
      const list = (data || []) as ControlRecord[];
      setRecords(list);
      onCompletedChange?.(list.some((r) => r.status === 'Completed'));
      // expand first record by default
      setExpanded((prev) => {
        const next = { ...prev };
        if (list.length > 0 && next[list[0].id] === undefined) next[list[0].id] = true;
        return next;
      });
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  const startNew = () => {
    setDraft({
      isNew: true,
      job_id: jobId,
      problem_type: '',
      problem_description: '',
      next_action: '',
      action_details: '',
      assigned_to: '',
      deadline: null,
      status: 'Open',
    });
  };

  const validate = (d: DraftRecord): string | null => {
    if (!d.problem_type) return 'Problem Type is required';
    if (!d.problem_description?.trim()) return 'Problem Description is required';
    if (!d.next_action) return 'Next Action is required';
    if (!d.status) return 'Status is required';
    return null;
  };

  const saveDraft = async () => {
    if (!draft) return;
    const err = validate(draft);
    if (err) {
      toast({ title: 'Missing required field', description: err, variant: 'destructive' });
      return;
    }
    setSaving('draft');
    const payload = {
      job_id: jobId,
      problem_type: draft.problem_type!,
      problem_description: draft.problem_description || '',
      next_action: draft.next_action!,
      action_details: draft.action_details || '',
      assigned_to: draft.assigned_to || '',
      deadline: draft.deadline || null,
      status: draft.status!,
    };
    const { error } = await supabase.from('job_control_records').insert(payload);
    setSaving(null);
    if (error) {
      toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'CONTROL record created', description: `Job ${jobNumber}` });
    setDraft(null);
    await load();
  };

  const updateRecord = async (id: string, patch: Partial<ControlRecord>) => {
    setSaving(id);
    const { error } = await supabase.from('job_control_records').update(patch).eq('id', id);
    setSaving(null);
    if (error) {
      toast({ title: 'Update failed', description: error.message, variant: 'destructive' });
      return;
    }
    await load();
  };

  const deleteRecord = async (id: string) => {
    if (!confirm('Delete this CONTROL record?')) return;
    const { error } = await supabase.from('job_control_records').delete().eq('id', id);
    if (error) {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
      return;
    }
    await load();
  };

  const hasCompleted = records.some((r) => r.status === 'Completed');

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between rounded-lg border-2 border-red-500 bg-red-50 dark:bg-red-950/30 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <AlertOctagon className="h-5 w-5 text-red-600" />
          <span className="font-bold uppercase tracking-wide text-sm text-red-700 dark:text-red-300">
            Control — Master Resolution
          </span>
          <Badge variant="outline" className="ml-2 text-xs">{records.length} record{records.length === 1 ? '' : 's'}</Badge>
          {hasCompleted && (
            <Badge className="bg-emerald-600 text-white text-xs flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" /> Resolved
            </Badge>
          )}
        </div>
        {!draft && (
          <Button size="sm" onClick={startNew} className="h-7">
            <Plus className="h-3.5 w-3.5 mr-1" /> Add Control Entry
          </Button>
        )}
      </div>

      {/* Draft new */}
      {draft && (
        <DraftEditor
          draft={draft}
          setDraft={setDraft}
          onSave={saveDraft}
          onCancel={() => setDraft(null)}
          saving={saving === 'draft'}
          jobId={jobId}
          jobNumber={jobNumber}
          jobName={jobName}
          jobAddress={jobAddress}
        />
      )}

      {/* Existing records */}
      {loading ? (
        <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading control records…
        </div>
      ) : records.length === 0 && !draft ? (
        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          No CONTROL record yet. A job cannot be closed until a Control entry is added and marked Completed.
        </div>
      ) : (
        <div className="max-h-[70vh] overflow-y-auto pr-1 space-y-3 scroll-smooth">
          {records.map((r, idx) => (
            <RecordCard
              key={r.id}
              index={idx + 1}
              total={records.length}
              record={r}
              jobId={jobId}
              jobNumber={jobNumber}
              jobName={jobName}
              jobAddress={jobAddress}
              isExpanded={expanded[r.id] ?? false}
              onToggle={() => setExpanded((p) => ({ ...p, [r.id]: !p[r.id] }))}
              saving={saving === r.id}
              onUpdate={(patch) => updateRecord(r.id, patch)}
              onDelete={() => deleteRecord(r.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------- helper components ------------------- */

function FieldRow({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{children}</div>;
}

function DraftEditor({
  draft,
  setDraft,
  onSave,
  onCancel,
  saving,
  jobId,
  jobNumber,
  jobName,
  jobAddress,
}: {
  draft: DraftRecord;
  setDraft: (d: DraftRecord) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  jobId: string;
  jobNumber: string;
  jobName: string;
  jobAddress: string;
}) {
  const set = (patch: Partial<DraftRecord>) => setDraft({ ...draft, ...patch });
  return (
    <div className="rounded-lg border-2 border-red-400 bg-background p-4 space-y-3">
      <div className="text-sm font-semibold text-red-700 dark:text-red-300">New CONTROL Entry</div>
      <FieldRow>
        <div className="space-y-1">
          <Label className="text-xs">Problem Type *</Label>
          <Select value={draft.problem_type || ''} onValueChange={(v) => set({ problem_type: v })}>
            <SelectTrigger className="h-9"><SelectValue placeholder="Select problem type" /></SelectTrigger>
            <SelectContent>
              {PROBLEM_TYPES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Next Action *</Label>
          <Select value={draft.next_action || ''} onValueChange={(v) => set({ next_action: v })}>
            <SelectTrigger className="h-9"><SelectValue placeholder="Select next action" /></SelectTrigger>
            <SelectContent>
              {NEXT_ACTIONS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </FieldRow>
      <div className="space-y-1">
        <Label className="text-xs">What is stopping this job from being completed? *</Label>
        <Textarea
          value={draft.problem_description || ''}
          onChange={(e) => set({ problem_description: e.target.value })}
          placeholder="Describe the blocker in detail…"
          className="min-h-[80px]"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Action Details</Label>
        <Textarea
          value={draft.action_details || ''}
          onChange={(e) => set({ action_details: e.target.value })}
          placeholder="Specifics of the next action (who, when, how)…"
          className="min-h-[60px]"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Deadline</Label>
        <Input
          type="date"
          value={draft.deadline ? draft.deadline.slice(0, 10) : ''}
          onChange={(e) => set({ deadline: e.target.value ? new Date(e.target.value).toISOString() : null })}
          className="h-9 w-full md:w-60"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Status *</Label>
        <Select value={draft.status || 'Open'} onValueChange={(v) => set({ status: v })}>
          <SelectTrigger className="h-9 w-full md:w-60"><SelectValue /></SelectTrigger>
          <SelectContent>
            {CONTROL_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <ControlTeamAssignment
        jobId={jobId}
        jobNumber={jobNumber}
        jobName={jobName}
        jobAddress={jobAddress}
      />
      <div className="flex justify-end gap-2 pt-1">
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button size="sm" onClick={onSave} disabled={saving}>
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Save className="h-3.5 w-3.5 mr-1" />}
          Save Entry
        </Button>
      </div>
    </div>
  );
}

function RecordCard({
  record,
  index,
  total,
  jobId,
  jobNumber,
  jobName,
  jobAddress,
  isExpanded,
  onToggle,
  saving,
  onUpdate,
  onDelete,
}: {
  record: ControlRecord;
  index: number;
  total: number;
  jobId: string;
  jobNumber: string;
  jobName: string;
  jobAddress: string;
  isExpanded: boolean;
  onToggle: () => void;
  saving: boolean;
  onUpdate: (patch: Partial<ControlRecord>) => void;
  onDelete: () => void;
}) {
  const [local, setLocal] = useState<ControlRecord>(record);
  useEffect(() => setLocal(record), [record]);

  const dirty =
    local.problem_description !== record.problem_description ||
    local.action_details !== record.action_details ||
    local.problem_type !== record.problem_type ||
    local.next_action !== record.next_action ||
    local.deadline !== record.deadline ||
    local.status !== record.status;

  const title = local.problem_type || 'Untitled Problem';

  return (
    <div className={cn(
      'rounded-lg border-2 bg-background shadow-sm overflow-hidden',
      local.status === 'Completed'
        ? 'border-emerald-500'
        : 'border-red-300 dark:border-red-900',
    )}>
      {/* Bold collapsible title bar */}
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors',
          local.status === 'Completed'
            ? 'bg-emerald-50 dark:bg-emerald-950/30 hover:bg-emerald-100/70'
            : 'bg-red-50 dark:bg-red-950/30 hover:bg-red-100/70',
        )}
      >
        {isExpanded
          ? <ChevronDown className="h-5 w-5 shrink-0 text-red-700 dark:text-red-300" />
          : <ChevronRight className="h-5 w-5 shrink-0 text-red-700 dark:text-red-300" />}
        <span className="text-[11px] font-mono font-bold text-red-700 dark:text-red-300 shrink-0">
          #{index}/{total}
        </span>
        <span className="text-base font-extrabold uppercase tracking-wide text-red-800 dark:text-red-200 truncate">
          {title}
        </span>
        <Badge className={cn('text-xs ml-auto shrink-0', STATUS_COLOR[local.status] || 'bg-muted')}>
          {local.status}
        </Badge>
        <span className="text-[10px] text-muted-foreground shrink-0 hidden sm:inline">
          {format(new Date(record.updated_at), 'd MMM HH:mm')}
        </span>
      </button>

      {isExpanded && (
        <div className="p-3 space-y-3 border-t bg-background">
          <div className="flex items-center justify-end gap-1">
            {dirty && (
              <Button size="sm" className="h-7" onClick={() => onUpdate({
                problem_type: local.problem_type,
                problem_description: local.problem_description,
                next_action: local.next_action,
                action_details: local.action_details,
                deadline: local.deadline,
                status: local.status,
              })} disabled={saving}>
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Save className="h-3.5 w-3.5 mr-1" />}
                Save
              </Button>
            )}
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-600" onClick={onDelete}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>

          <FieldRow>
            <div className="space-y-1">
              <Label className="text-[10px] uppercase text-muted-foreground">Problem Type</Label>
              <Select value={local.problem_type} onValueChange={(v) => setLocal({ ...local, problem_type: v })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PROBLEM_TYPES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] uppercase text-muted-foreground">Next Action</Label>
              <Select value={local.next_action} onValueChange={(v) => setLocal({ ...local, next_action: v })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {NEXT_ACTIONS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </FieldRow>

          <div className="space-y-1">
            <Label className="text-[10px] uppercase text-muted-foreground">Problem Description</Label>
            <Textarea
              value={local.problem_description}
              onChange={(e) => setLocal({ ...local, problem_description: e.target.value })}
              className="min-h-[60px] text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase text-muted-foreground">Action Details</Label>
            <Textarea
              value={local.action_details}
              onChange={(e) => setLocal({ ...local, action_details: e.target.value })}
              className="min-h-[50px] text-xs"
            />
          </div>

          <FieldRow>
            <div className="space-y-1">
              <Label className="text-[10px] uppercase text-muted-foreground">Deadline</Label>
              <Input
                type="date"
                value={local.deadline ? local.deadline.slice(0, 10) : ''}
                onChange={(e) => setLocal({ ...local, deadline: e.target.value ? new Date(e.target.value).toISOString() : null })}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] uppercase text-muted-foreground">Status</Label>
              <Select value={local.status} onValueChange={(v) => setLocal({ ...local, status: v })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CONTROL_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </FieldRow>

          {/* Assign Team — replaces the old Assigned To dropdown */}
          <ControlTeamAssignment
            jobId={jobId}
            jobNumber={jobNumber}
            jobName={jobName}
            jobAddress={jobAddress}
          />
        </div>
      )}
    </div>
  );
}
