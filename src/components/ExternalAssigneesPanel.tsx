import { useMemo, useState } from 'react';
import { useSubcontractors } from '@/hooks/useSubcontractors';
import { useJobExternalAssignees } from '@/hooks/useJobExternalAssignees';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { UserPlus, Trash2, Phone, Briefcase, Loader2, Plus } from 'lucide-react';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { toast } from 'sonner';

interface Props {
  jobId: string;
}

export const ExternalAssigneesPanel = ({ jobId }: Props) => {
  const { items: subs, isLoading: subsLoading, create: createSub } = useSubcontractors({ activeOnly: true });
  const { items: assigned, isLoading: assignedLoading, add, remove } = useJobExternalAssignees(jobId);
  const { canEdit } = useAdminAuth();
  const [pickedId, setPickedId] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  // Inline "new tradesman" form
  const [mode, setMode] = useState<'pick' | 'new'>(subs.length === 0 ? 'new' : 'pick');
  const [newName, setNewName] = useState('');
  const [newCompany, setNewCompany] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newTrade, setNewTrade] = useState('');

  const assignedIds = useMemo(() => new Set(assigned.map(a => a.subcontractor_id)), [assigned]);
  const available = useMemo(() => subs.filter(s => !assignedIds.has(s.id)), [subs, assignedIds]);

  const handleAdd = async () => {
    if (!pickedId) return;
    setBusy(true);
    const res = await add(pickedId, notes);
    setBusy(false);
    if (res) { setPickedId(''); setNotes(''); }
  };

  const handleCreateAndAssign = async () => {
    const name = newName.trim();
    if (!name) {
      toast.error('Name is required');
      return;
    }
    setBusy(true);
    try {
      const created = await createSub({
        name,
        company: newCompany.trim() || null,
        phone: newPhone.trim() || null,
        trade: newTrade.trim() || null,
        email: null,
        notes: null,
        is_active: true,
      });
      if (!created) return;
      const res = await add(created.id, notes);
      if (res) {
        setNewName(''); setNewCompany(''); setNewPhone(''); setNewTrade(''); setNotes('');
        setMode('pick');
      }
    } finally {
      setBusy(false);
    }
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
          {/* Mode toggle */}
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="sm"
              variant={mode === 'pick' ? 'default' : 'outline'}
              className="h-7 text-xs px-2"
              onClick={() => setMode('pick')}
              disabled={busy}
            >
              From directory
            </Button>
            <Button
              type="button"
              size="sm"
              variant={mode === 'new' ? 'default' : 'outline'}
              className="h-7 text-xs px-2"
              onClick={() => setMode('new')}
              disabled={busy}
            >
              <Plus className="h-3 w-3 mr-1" /> New tradesman
            </Button>
          </div>

          {mode === 'pick' && (
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <label className="text-[11px] text-muted-foreground">Add from directory</label>
                <Select value={pickedId} onValueChange={setPickedId} disabled={subsLoading || available.length === 0}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder={subsLoading ? 'Loading…' : available.length === 0 ? 'Directory empty — use "New tradesman"' : 'Pick a sub-contractor'} />
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
          )}

          {mode === 'new' && (
            <div className="space-y-2 rounded-md border border-dashed border-border p-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-muted-foreground">Name *</label>
                  <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g. John Smith"
                    className="h-8 text-sm"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground">Trade</label>
                  <Input
                    value={newTrade}
                    onChange={(e) => setNewTrade(e.target.value)}
                    placeholder="e.g. Plumber"
                    className="h-8 text-sm"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground">Company</label>
                  <Input
                    value={newCompany}
                    onChange={(e) => setNewCompany(e.target.value)}
                    placeholder="Optional"
                    className="h-8 text-sm"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground">Phone</label>
                  <Input
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    placeholder="Optional"
                    className="h-8 text-sm"
                  />
                </div>
              </div>
              <Button
                size="sm"
                onClick={handleCreateAndAssign}
                disabled={!newName.trim() || busy}
                className="h-8 w-full"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
                <span className="ml-1">Create &amp; assign to this job</span>
              </Button>
              <p className="text-[10px] text-muted-foreground">
                Saved to directory so you can reuse them later.
              </p>
            </div>
          )}

          <Input
            placeholder="Optional assignment notes…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="h-8 text-xs"
          />
          <p className="text-[11px] text-muted-foreground">
            Manage the full directory in Settings → Sub-Contractors.
          </p>
        </div>
      )}
    </div>
  );
};
