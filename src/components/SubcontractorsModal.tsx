import { useState, useMemo } from 'react';
import { Plus, Pencil, Trash2, Pause, Play, Search, HardHat, Phone, Mail, Building2, Save, X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useSubcontractors, Subcontractor } from '@/hooks/useSubcontractors';
import { cn } from '@/lib/utils';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const empty = { name: '', company: '', phone: '', email: '', trade: '', notes: '' };

export const SubcontractorsModal = ({ open, onOpenChange }: Props) => {
  const { items, isLoading, create, update, remove, toggleActive } = useSubcontractors();
  const [query, setQuery] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Subcontractor | null>(null);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items
      .filter(i => showInactive || i.is_active)
      .filter(i => !q || [i.name, i.company, i.trade, i.phone, i.email].some(v => v?.toLowerCase().includes(q)));
  }, [items, query, showInactive]);

  const openAdd = () => { setForm(empty); setEditing(null); setShowAdd(true); };
  const openEdit = (s: Subcontractor) => {
    setEditing(s);
    setForm({
      name: s.name, company: s.company ?? '', phone: s.phone ?? '',
      email: s.email ?? '', trade: s.trade ?? '', notes: s.notes ?? '',
    });
    setShowAdd(true);
  };
  const closeForm = () => { setShowAdd(false); setEditing(null); setForm(empty); };

  const save = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    const ok = editing
      ? await update(editing.id, form)
      : !!(await create(form));
    setSaving(false);
    if (ok) closeForm();
  };

  const onDelete = async (s: Subcontractor) => {
    if (!confirm(`Delete ${s.name}? If they're assigned to any job, they'll be deactivated instead.`)) return;
    await remove(s.id);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HardHat className="w-5 h-5 text-amber-600" />
            Sub-Contractors Directory
          </DialogTitle>
          <DialogDescription>
            Manage external operatives (not on the team portal). Assign them to jobs and admin signs off on their behalf when work is complete.
          </DialogDescription>
        </DialogHeader>

        {showAdd ? (
          <div className="space-y-3 py-2 border rounded-lg p-4 bg-muted/30">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm">{editing ? 'Edit sub-contractor' : 'Add sub-contractor'}</h3>
              <button onClick={closeForm} className="p-1 hover:bg-muted rounded"><X className="w-4 h-4" /></button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-xs font-medium text-muted-foreground">Name *</label>
                <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. John Smith" autoFocus />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Company</label>
                <Input value={form.company} onChange={e => setForm({ ...form, company: e.target.value })} placeholder="e.g. Smith Roofing Ltd" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Trade</label>
                <Input value={form.trade} onChange={e => setForm({ ...form, trade: e.target.value })} placeholder="e.g. Roofer, Electrician" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Phone</label>
                <Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="07..." />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Email</label>
                <Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="optional" />
              </div>
              <div className="col-span-2">
                <label className="text-xs font-medium text-muted-foreground">Notes</label>
                <Textarea rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Rates, day rates, preferred areas, etc." />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={closeForm} disabled={saving}>Cancel</Button>
              <Button size="sm" onClick={save} disabled={saving || !form.name.trim()}>
                <Save className="w-4 h-4 mr-1" />
                {editing ? 'Save changes' : 'Add'}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search name, company, trade…" className="pl-8 h-9" />
            </div>
            <Button variant="outline" size="sm" onClick={() => setShowInactive(v => !v)}>
              {showInactive ? 'Hide inactive' : 'Show inactive'}
            </Button>
            <Button size="sm" onClick={openAdd}>
              <Plus className="w-4 h-4 mr-1" />
              Add
            </Button>
          </div>
        )}

        <ScrollArea className="flex-1 -mx-2 px-2">
          {isLoading ? (
            <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              {query ? 'No sub-contractors match your search.' : 'No sub-contractors yet. Add your first one above.'}
            </div>
          ) : (
            <div className="space-y-2 py-2">
              {filtered.map(s => (
                <div
                  key={s.id}
                  className={cn(
                    'flex items-start gap-3 p-3 rounded-lg border bg-card hover:shadow-sm transition',
                    !s.is_active && 'opacity-60'
                  )}
                >
                  <div className="w-9 h-9 rounded-full bg-amber-100 dark:bg-amber-950 flex items-center justify-center shrink-0">
                    <HardHat className="w-4 h-4 text-amber-700 dark:text-amber-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{s.name}</span>
                      {s.trade && <Badge variant="secondary" className="text-[10px]">{s.trade}</Badge>}
                      {!s.is_active && <Badge variant="outline" className="text-[10px]">Inactive</Badge>}
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5 text-xs text-muted-foreground">
                      {s.company && <span className="flex items-center gap-1"><Building2 className="w-3 h-3" />{s.company}</span>}
                      {s.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{s.phone}</span>}
                      {s.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{s.email}</span>}
                    </div>
                    {s.notes && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{s.notes}</p>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => toggleActive(s.id, !s.is_active)}
                      className="p-1.5 hover:bg-muted rounded text-muted-foreground hover:text-foreground"
                      title={s.is_active ? 'Pause (deactivate)' : 'Reactivate'}
                    >
                      {s.is_active ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                    </button>
                    <button onClick={() => openEdit(s)} className="p-1.5 hover:bg-muted rounded text-muted-foreground hover:text-foreground" title="Edit">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={() => onDelete(s)} className="p-1.5 hover:bg-destructive/10 rounded text-muted-foreground hover:text-destructive" title="Delete">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};
