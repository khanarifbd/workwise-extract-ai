import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Loader2, Plus, ArrowLeft, CalendarDays, Bell, Star, Diamond, Trash2, Settings2, FileUp, Copy, ChevronRight, ChevronDown, CornerDownRight } from 'lucide-react';
import { useRoadmaps, useRoadmapItems, RoadmapItem } from '@/hooks/useRoadmaps';
import { buildColumns, barPosition, parseLocalDate, toISODate } from '@/lib/roadmapUtils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RoadmapItemDialog } from '@/components/roadmap/RoadmapItemDialog';
import { RoadmapPdfImportModal } from '@/components/roadmap/RoadmapPdfImportModal';
import { useRoadmapAlerts } from '@/hooks/useRoadmapAlerts';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

const RoadmapEditor = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { roadmaps, update, remove } = useRoadmaps();
  const roadmap = roadmaps.find(r => r.id === id);
  const { items, create, update: updateItem, remove: removeItem, isLoading } = useRoadmapItems(id);
  const [editing, setEditing] = useState<RoadmapItem | null>(null);
  const [addingParent, setAddingParent] = useState<string | null | undefined>(undefined); // undefined=closed, null=root, string=child of
  const [showSettings, setShowSettings] = useState(false);
  const [importing, setImporting] = useState(false);

  useRoadmapAlerts(items);

  const columns = useMemo(() => {
    if (!roadmap) return [];
    return buildColumns(roadmap.start_date, roadmap.end_date, roadmap.time_unit);
  }, [roadmap]);

  // Build hierarchy: roots + children-by-parent
  const { roots, childrenOf } = useMemo(() => {
    const childrenOf: Record<string, RoadmapItem[]> = {};
    const roots: RoadmapItem[] = [];
    for (const it of items) {
      if (it.parent_id) {
        (childrenOf[it.parent_id] = childrenOf[it.parent_id] || []).push(it);
      } else {
        roots.push(it);
      }
    }
    return { roots, childrenOf };
  }, [items]);

  const todayPct = useMemo(() => {
    if (!roadmap) return null;
    const s = parseLocalDate(roadmap.start_date);
    const e = parseLocalDate(roadmap.end_date);
    const now = new Date(); now.setHours(0,0,0,0);
    if (now < s || now > e) return null;
    const total = (e.getTime() - s.getTime()) / 86400000 + 1;
    const off = (now.getTime() - s.getTime()) / 86400000;
    return (off / total) * 100;
  }, [roadmap]);

  if (!roadmap) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        {roadmaps.length === 0 ? <Loader2 className="w-6 h-6 animate-spin" /> : (
          <div className="text-center">
            <p className="text-muted-foreground mb-3">Roadmap not found.</p>
            <Button onClick={() => navigate('/roadmaps')}>Back to roadmaps</Button>
          </div>
        )}
      </div>
    );
  }

  const renderRow = (item: RoadmapItem, depth: number, idx: number) => {
    const pos = barPosition(item.start_date, item.end_date, roadmap.start_date, roadmap.end_date, roadmap.time_unit);
    const kids = childrenOf[item.id] || [];
    const hasKids = kids.length > 0;
    return (
      <div key={item.id}>
        <div className={cn('group flex border-b last:border-b-0 hover:bg-muted/40 transition', idx % 2 === 1 && 'bg-muted/10')}>
          <div className="w-64 shrink-0 flex items-center gap-1 px-2 py-1 text-sm border-r" style={{ paddingLeft: 8 + depth * 14 }}>
            {hasKids ? (
              <button
                onClick={() => updateItem(item.id, { collapsed: !item.collapsed })}
                className="p-0.5 hover:bg-muted rounded shrink-0"
                title={item.collapsed ? 'Expand' : 'Collapse'}
              >
                {item.collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
            ) : depth > 0 ? <CornerDownRight className="w-3 h-3 text-muted-foreground/60 shrink-0" /> : <span className="w-4" />}
            <button onClick={() => setEditing(item)} className="flex-1 text-left truncate font-medium flex items-center gap-1.5">
              {item.symbol && <span className="text-xs">{item.symbol}</span>}
              <span className="truncate">{item.label}</span>
            </button>
            <button
              onClick={() => setAddingParent(item.id)}
              className="opacity-0 group-hover:opacity-100 hover:opacity-100 p-0.5 hover:bg-muted rounded text-muted-foreground hover:text-foreground shrink-0"
              title="Add sub-task"
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>
          <div className="flex-1 relative min-h-[26px] group" onClick={() => setEditing(item)} role="button">
            {/* week grid lines */}
            <div className="absolute inset-0 flex pointer-events-none">
              {columns.map((c, i) => (
                <div
                  key={c.key}
                  className={cn(
                    'border-r',
                    i === columns.length - 1 ? 'border-transparent' : 'border-border/60',
                  )}
                  style={{ flexGrow: c.days, flexBasis: 0 }}
                />
              ))}
            </div>
            {/* today line */}
            {todayPct !== null && (
              <div className="absolute top-0 bottom-0 w-px bg-red-500/70 pointer-events-none" style={{ left: `${todayPct}%` }} />
            )}
            {/* bar */}
            {item.is_milestone ? (
              <div className="absolute top-1/2 -translate-y-1/2" style={{ left: `calc(${pos.leftPct}% - 8px)` }} title={item.label}>
                <div className="w-4 h-4 rotate-45 rounded-sm shadow flex items-center justify-center text-white" style={{ background: item.color }}>
                  <Diamond className="w-2.5 h-2.5 -rotate-45" />
                </div>
              </div>
            ) : (
              <div
                className="absolute top-1/2 -translate-y-1/2 h-[18px] rounded flex items-center px-1.5 text-[10px] text-white font-semibold shadow-sm overflow-hidden"
                style={{ left: `${pos.leftPct}%`, width: `${pos.widthPct}%`, background: item.color }}
                title={`${item.label} · ${item.start_date} → ${item.end_date}`}
              >
                {item.progress > 0 && item.progress < 100 && (
                  <div className="absolute inset-y-0 left-0 bg-black/25" style={{ width: `${item.progress}%` }} />
                )}
                <span className="relative truncate leading-none">
                  {item.symbol ? `${item.symbol} ` : ''}{item.label}
                </span>
                {(item.notify_on_start || item.notify_on_end) && <Bell className="w-2.5 h-2.5 ml-1 shrink-0 relative" />}
              </div>
            )}
          </div>
        </div>
        {hasKids && !item.collapsed && kids.map((k, i) => renderRow(k, depth + 1, idx + 1 + i))}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b">
        <div className="container mx-auto px-4 py-3 flex items-center gap-3 flex-wrap">
          <Button variant="ghost" size="sm" onClick={() => navigate('/roadmaps')}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Roadmaps
          </Button>
          <div className="flex-1 min-w-[200px]">
            <h1 className="text-lg font-bold tracking-tight">{roadmap.name}</h1>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <CalendarDays className="w-3 h-3" />
              {roadmap.start_date} → {roadmap.end_date} · {roadmap.time_unit === 'week' ? 'Week view' : 'Day view'} · {items.length} tasks
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={async () => {
            const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
            const seen = new Map<string, RoadmapItem>();
            const dupes: RoadmapItem[] = [];
            const sorted = [...items].sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
            for (const it of sorted) {
              const key = `${it.parent_id || 'root'}|${norm(it.label)}|${it.start_date}|${it.end_date}`;
              if (seen.has(key)) dupes.push(it); else seen.set(key, it);
            }
            if (!dupes.length) { toast.info('No duplicates found'); return; }
            if (!confirm(`Remove ${dupes.length} duplicate task${dupes.length > 1 ? 's' : ''}?`)) return;
            const { error } = await supabase.from('roadmap_items').delete().in('id', dupes.map(d => d.id));
            if (error) toast.error(error.message); else toast.success(`Removed ${dupes.length} duplicate${dupes.length > 1 ? 's' : ''}`);
          }}>
            <Copy className="w-4 h-4 mr-1" /> Dedupe
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowSettings(s => !s)}>
            <Settings2 className="w-4 h-4 mr-1" /> Settings
          </Button>
          <Button variant="outline" size="sm" onClick={() => setImporting(true)}>
            <FileUp className="w-4 h-4 mr-1" /> Import PDF
          </Button>
          <Button size="sm" onClick={() => setAddingParent(null)}>
            <Plus className="w-4 h-4 mr-1" /> Add task
          </Button>
        </div>
        {showSettings && (
          <div className="border-t bg-muted/30">
            <div className="container mx-auto px-4 py-3 grid sm:grid-cols-2 md:grid-cols-5 gap-3 items-end">
              <div>
                <Label className="text-xs">Name</Label>
                <Input defaultValue={roadmap.name} onBlur={e => e.target.value !== roadmap.name && update(roadmap.id, { name: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Start</Label>
                <Input type="date" defaultValue={roadmap.start_date} onChange={e => update(roadmap.id, { start_date: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">End</Label>
                <Input type="date" defaultValue={roadmap.end_date} onChange={e => update(roadmap.id, { end_date: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">View</Label>
                <Select value={roadmap.time_unit} onValueChange={(v: 'week'|'day') => update(roadmap.id, { time_unit: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="week">Weeks</SelectItem>
                    <SelectItem value="day">Days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Button variant="destructive" size="sm" onClick={async () => {
                  if (confirm('Delete this roadmap? Tasks will be removed too.')) {
                    await remove(roadmap.id);
                    navigate('/roadmaps');
                  }
                }}>
                  <Trash2 className="w-4 h-4 mr-1" /> Delete roadmap
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Gantt */}
      <div className="container mx-auto px-4 py-4">
        <div className="border rounded-lg overflow-hidden bg-card">
          {/* Column headers */}
          <div className="flex bg-[#0a2540] text-white text-sm font-semibold">
            <div className="w-64 shrink-0 px-3 py-2.5 border-r border-white/10">Task</div>
            <div className="flex-1 flex">
              {columns.map((c, i) => (
                <div
                  key={c.key}
                  className={cn(
                    'min-w-[70px] px-2 py-2.5 text-center',
                    i === columns.length - 1 ? '' : 'border-r border-white/30',
                  )}
                  style={{ flexGrow: c.days, flexBasis: 0 }}
                >
                  <div>{c.label}</div>
                  {c.sublabel && <div className="text-[10px] font-normal opacity-80">{c.sublabel}</div>}
                </div>
              ))}
            </div>
          </div>

          {/* Rows */}
          {isLoading ? (
            <div className="p-10 text-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin inline" /></div>
          ) : roots.length === 0 ? (
            <div className="p-10 text-center text-muted-foreground">
              No tasks yet. Click <strong>Add task</strong> to create your first bar.
            </div>
          ) : (
            roots.map((item, idx) => renderRow(item, 0, idx))
          )}
        </div>

        <p className="text-[11px] text-muted-foreground mt-2 flex items-center gap-3 flex-wrap">
          <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> Today</span>
          <span className="inline-flex items-center gap-1"><Bell className="w-3 h-3" /> Audible alert set</span>
          <span className="inline-flex items-center gap-1"><Diamond className="w-3 h-3" /> Milestone</span>
          <span className="inline-flex items-center gap-1"><ChevronDown className="w-3 h-3" /> Click chevron to collapse sub-tasks</span>
          <span>Click row to edit · Hover row to add sub-task · {toISODate(new Date())}</span>
        </p>
      </div>

      <RoadmapItemDialog
        open={addingParent !== undefined}
        onOpenChange={(o) => !o && setAddingParent(undefined)}
        roadmapStart={roadmap.start_date}
        roadmapEnd={roadmap.end_date}
        onSave={async (p) => { await create({ ...p, parent_id: addingParent || null }); toast.success('Task added'); }}
      />
      <RoadmapItemDialog
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        item={editing}
        roadmapStart={roadmap.start_date}
        roadmapEnd={roadmap.end_date}
        onSave={async (p) => { if (editing) { await updateItem(editing.id, p); toast.success('Task saved'); } }}
        onDelete={editing ? async () => { await removeItem(editing.id); toast.success('Task deleted'); } : undefined}
      />
      <RoadmapPdfImportModal
        open={importing}
        onOpenChange={setImporting}
        roadmap={roadmap}
        existingItems={items}
        onImport={async ({ toInsert, toUpdate, roadmapPatch }) => {
          if (toInsert.length) {
            const payload = toInsert.map(p => ({ ...p, roadmap_id: roadmap.id }));
            const { error } = await supabase.from('roadmap_items').insert(payload as any);
            if (error) throw error;
          }
          for (const u of toUpdate) await updateItem(u.id, u.patch);
          if (roadmapPatch) await update(roadmap.id, roadmapPatch);
        }}
      />
    </div>
  );
};

export default RoadmapEditor;
