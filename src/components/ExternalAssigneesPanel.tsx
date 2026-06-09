import { useMemo, useState } from 'react';
import { useSubcontractors } from '@/hooks/useSubcontractors';
import { useJobExternalAssignees } from '@/hooks/useJobExternalAssignees';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { UserPlus, Trash2, Phone, Briefcase, Loader2 } from 'lucide-react';
import { useAdminAuth } from '@/hooks/useAdminAuth';

interface Props {
  jobId: string;
}

export const ExternalAssigneesPanel = ({ jobId }: Props) => {
  const { items: subs, isLoading: subsLoading } = useSubcontractors({ activeOnly: true });
  const { items: assigned, isLoading: assignedLoading, add, remove } = useJobExternalAssignees(jobId);
  const { canEdit } = useAdminAuth();
  const [pickedId, setPickedId] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const assignedIds = useMemo(() => new Set(assigned.map(a => a.subcontractor_id)), [assigned]);
  const available = useMemo(() => subs.filter(s => !assignedIds.has(s.id)), [subs, assignedIds]);

  const handleAdd = async () => {
    if (!pickedId) return;
    setBusy(true);
    const res = await add(pickedId, notes);
    setBusy(false);
    if (res) { setPickedId(''); setNotes(''); }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <UserPlus className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">External / Sub-Contractor Assignees</h3>
        <Badge variant="outline" className="ml-auto text-xs">{assigned.length}</Badge>
      </div>

      <p className="text-xs text-muted-foreground">
        Manually-assigned operatives that don't use the team portal. They count toward job completion — admin signs off on their behalf.
      </p>

      {/* Currently assigned */}
      {assignedLoading ? (
        <div className="text-xs text-muted-foreground py-2">Loading…</div>
      ) : assigned.length === 0 ? (
        <div className="text-xs text-muted-foreground italic py-2">No external assignees on this job.</div>
      ) : (
        <div className="space-y-1.5">
          {assigned.map(a => {
            const s = a.subcontractor;
            return (
              <div key={a.id} className="flex items-center gap-2 p-2 rounded-md border border-slate-300/50 bg-slate-100/50 dark:bg-slate-800/30">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">👤 {s?.name ?? 'Unknown'}</span>
                    <Badge variant="outline" className="text-[10px] h-4 px-1 border-slate-400/50">External</Badge>
                    {s?.company && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Briefcase className="h-3 w-3" />{s.company}
                      </span>
                    )}
                    {s?.trade && <span className="text-xs text-muted-foreground">· {s.trade}</span>}
                  </div>
                  {s?.phone && (
                    <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <Phone className="h-3 w-3" />{s.phone}
                    </div>
                  )}
                  {a.assignment_notes && (
                    <div className="text-xs text-muted-foreground mt-0.5 italic">{a.assignment_notes}</div>
                  )}
                </div>
                {canEdit && (
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => remove(a.id)} title="Remove">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add new */}
      {canEdit && (
        <div className="pt-2 border-t border-border space-y-2">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className="text-[11px] text-muted-foreground">Add from directory</label>
              <Select value={pickedId} onValueChange={setPickedId} disabled={subsLoading || available.length === 0}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder={subsLoading ? 'Loading…' : available.length === 0 ? 'No sub-contractors available' : 'Pick a sub-contractor'} />
                </SelectTrigger>
                <SelectContent>
                  {available.map(s => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}{s.company ? ` — ${s.company}` : ''}{s.trade ? ` · ${s.trade}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button size="sm" onClick={handleAdd} disabled={!pickedId || busy} className="h-9">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
              <span className="ml-1">Assign</span>
            </Button>
          </div>
          <Input
            placeholder="Optional assignment notes…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="h-8 text-xs"
          />
          <p className="text-[11px] text-muted-foreground">
            Manage the directory in Settings → Sub-Contractors.
          </p>
        </div>
      )}
    </div>
  );
};
