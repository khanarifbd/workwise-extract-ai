import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { ROADMAP_COLORS, ROADMAP_SYMBOLS, parseLocalDate, toISODate, daysBetween } from '@/lib/roadmapUtils';
import { RoadmapItem } from '@/hooks/useRoadmaps';
import { Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const addDays = (iso: string, n: number) => {
  const d = parseLocalDate(iso); d.setDate(d.getDate() + n); return toISODate(d);
};
const durationDays = (s?: string, e?: string) =>
  s && e ? Math.max(1, daysBetween(parseLocalDate(s), parseLocalDate(e)) + 1) : 1;

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  item?: RoadmapItem | null;
  roadmapStart: string;
  roadmapEnd: string;
  onSave: (patch: Partial<RoadmapItem>) => Promise<void>;
  onDelete?: () => Promise<void>;
}

export const RoadmapItemDialog = ({ open, onOpenChange, item, roadmapStart, roadmapEnd, onSave, onDelete }: Props) => {
  const [form, setForm] = useState<Partial<RoadmapItem>>({});

  useEffect(() => {
    if (open) {
      setForm(item ? { ...item } : {
        label: '',
        start_date: roadmapStart,
        end_date: roadmapStart,
        color: ROADMAP_COLORS[0].value,
        symbol: '',
        progress: 0,
        is_milestone: false,
        notify_on_start: false,
        notify_on_end: false,
        notify_lead_minutes: 0,
        notes: '',
        assigned_team: '',
      });
    }
  }, [open, item, roadmapStart]);

  const set = <K extends keyof RoadmapItem>(k: K, v: RoadmapItem[K]) => setForm(p => ({ ...p, [k]: v }));

  const handleSave = async () => {
    if (!form.label?.trim() || !form.start_date || !form.end_date) return;
    await onSave(form);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{item ? 'Edit task' : 'Add task'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label>Task</Label>
            <Input value={form.label || ''} onChange={e => set('label', e.target.value)} placeholder="e.g. Plumbing 1st fix" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Start date</Label>
              <Input type="date" min={roadmapStart} max={roadmapEnd}
                value={form.start_date || ''}
                onChange={e => set('start_date', e.target.value)} />
            </div>
            <div>
              <Label>End date</Label>
              <Input type="date" min={form.start_date || roadmapStart} max={roadmapEnd}
                value={form.end_date || ''}
                onChange={e => set('end_date', e.target.value)} />
            </div>
          </div>

          <div>
            <Label>Colour</Label>
            <div className="flex flex-wrap gap-2 mt-1">
              {ROADMAP_COLORS.map(c => (
                <button key={c.value} type="button"
                  onClick={() => set('color', c.value)}
                  title={c.name}
                  className={cn(
                    'w-7 h-7 rounded-md ring-offset-2 ring-offset-background transition',
                    form.color === c.value && 'ring-2 ring-foreground'
                  )}
                  style={{ background: c.value }} />
              ))}
            </div>
          </div>

          <div>
            <Label>Symbol</Label>
            <div className="flex flex-wrap gap-1 mt-1">
              {ROADMAP_SYMBOLS.map((s, i) => (
                <button key={i} type="button"
                  onClick={() => set('symbol', s)}
                  className={cn(
                    'w-8 h-8 rounded-md border text-base flex items-center justify-center hover:bg-muted',
                    (form.symbol || '') === s && 'border-foreground bg-muted'
                  )}>
                  {s || '∅'}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Progress %</Label>
              <Input type="number" min={0} max={100}
                value={form.progress ?? 0}
                onChange={e => set('progress', Math.max(0, Math.min(100, Number(e.target.value) || 0)))} />
            </div>
            <div>
              <Label>Assigned team</Label>
              <Input value={form.assigned_team || ''} onChange={e => set('assigned_team', e.target.value)} placeholder="Optional" />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox id="ms" checked={!!form.is_milestone} onCheckedChange={v => set('is_milestone', !!v)} />
            <Label htmlFor="ms" className="cursor-pointer">Milestone (single-day marker)</Label>
          </div>

          <div className="border-t pt-3 space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Audible alerts</Label>
            <div className="flex items-center gap-2">
              <Checkbox id="nstart" checked={!!form.notify_on_start} onCheckedChange={v => set('notify_on_start', !!v)} />
              <Label htmlFor="nstart" className="cursor-pointer">Alert when task starts</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="nend" checked={!!form.notify_on_end} onCheckedChange={v => set('notify_on_end', !!v)} />
              <Label htmlFor="nend" className="cursor-pointer">Alert when task ends</Label>
            </div>
            <div>
              <Label className="text-xs">Lead-time before start (minutes)</Label>
              <Input type="number" min={0} value={form.notify_lead_minutes ?? 0}
                onChange={e => set('notify_lead_minutes', Math.max(0, Number(e.target.value) || 0))} />
            </div>
          </div>

          <div>
            <Label>Notes</Label>
            <Textarea rows={3} value={form.notes || ''} onChange={e => set('notes', e.target.value)} />
          </div>
        </div>

        <DialogFooter className="flex sm:justify-between gap-2">
          <div>
            {item && onDelete && (
              <Button variant="destructive" size="sm" onClick={async () => { await onDelete(); onOpenChange(false); }}>
                <Trash2 className="w-4 h-4 mr-1" /> Delete
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleSave}>{item ? 'Save' : 'Add task'}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
