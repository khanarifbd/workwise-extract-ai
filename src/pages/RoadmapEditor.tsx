import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Loader2, Plus, ArrowLeft, CalendarDays, Bell, Star, Diamond, Trash2, Settings2, FileUp } from 'lucide-react';
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
  const [adding, setAdding] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [importing, setImporting] = useState(false);

  useRoadmapAlerts(items);

  const columns = useMemo(() => {
    if (!roadmap) return [];
    return buildColumns(roadmap.start_date, roadmap.end_date, roadmap.time_unit);
  }, [roadmap]);

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

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b">
        <div className="container mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/roadmaps')}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Roadmaps
          </Button>
          <div className="flex-1">
            <h1 className="text-lg font-bold tracking-tight">{roadmap.name}</h1>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <CalendarDays className="w-3 h-3" />
              {roadmap.start_date} → {roadmap.end_date} · {roadmap.time_unit === 'week' ? 'Week view' : 'Day view'} · {items.length} tasks
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setShowSettings(s => !s)}>
            <Settings2 className="w-4 h-4 mr-1" /> Settings
          </Button>
          <Button size="sm" onClick={() => setAdding(true)}>
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
            <div className="w-64 shrink-0 px-3 py-3 border-r border-white/10">Task</div>
            <div className="flex-1 flex">
              {columns.map(c => (
                <div key={c.key} className="flex-1 min-w-[80px] px-2 py-3 text-center border-r border-white/10">
                  <div>{c.label}</div>
                  {c.sublabel && <div className="text-[10px] font-normal opacity-80">{c.sublabel}</div>}
                </div>
              ))}
            </div>
          </div>

          {/* Rows */}
          {isLoading ? (
            <div className="p-10 text-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin inline" /></div>
          ) : items.length === 0 ? (
            <div className="p-10 text-center text-muted-foreground">
              No tasks yet. Click <strong>Add task</strong> to create your first bar.
            </div>
          ) : (
            items.map((item, idx) => {
              const pos = barPosition(item.start_date, item.end_date, roadmap.start_date, roadmap.end_date);
              return (
                <div key={item.id} className={cn('flex border-b last:border-b-0 hover:bg-muted/40 transition', idx % 2 === 1 && 'bg-muted/20')}>
                  <button onClick={() => setEditing(item)} className="w-64 shrink-0 px-3 py-3 text-left text-sm font-medium truncate border-r flex items-center gap-2">
                    {item.symbol && <span>{item.symbol}</span>}
                    <span className="truncate">{item.label}</span>
                  </button>
                  <div className="flex-1 relative min-h-[44px]" onClick={() => setEditing(item)} role="button">
                    {/* grid lines */}
                    <div className="absolute inset-0 flex">
                      {columns.map(c => <div key={c.key} className="flex-1 border-r border-border/40" />)}
                    </div>
                    {/* today line */}
                    {todayPct !== null && (
                      <div className="absolute top-0 bottom-0 w-px bg-red-500/70" style={{ left: `${todayPct}%` }} />
                    )}
                    {/* bar */}
                    {item.is_milestone ? (
                      <div className="absolute top-1/2 -translate-y-1/2"
                        style={{ left: `calc(${pos.leftPct}% - 10px)` }}
                        title={item.label}>
                        <div className="w-5 h-5 rotate-45 rounded-sm shadow flex items-center justify-center text-[10px] text-white font-bold"
                          style={{ background: item.color }}>
                          <Diamond className="w-3 h-3 -rotate-45" />
                        </div>
                      </div>
                    ) : (
                      <div
                        className="absolute top-1/2 -translate-y-1/2 h-6 rounded-md flex items-center px-2 text-[11px] text-white font-semibold shadow-sm overflow-hidden"
                        style={{ left: `${pos.leftPct}%`, width: `${pos.widthPct}%`, background: item.color }}
                        title={`${item.label} · ${item.start_date} → ${item.end_date}`}>
                        {/* progress overlay */}
                        {item.progress > 0 && item.progress < 100 && (
                          <div className="absolute inset-y-0 left-0 bg-black/20" style={{ width: `${item.progress}%` }} />
                        )}
                        <span className="relative truncate">
                          {item.symbol ? `${item.symbol} ` : ''}{item.label}
                        </span>
                        {(item.notify_on_start || item.notify_on_end) && <Bell className="w-3 h-3 ml-1 shrink-0 relative" />}
                        {item.is_milestone && <Star className="w-3 h-3 ml-1 shrink-0 relative" />}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <p className="text-[11px] text-muted-foreground mt-2 flex items-center gap-3">
          <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> Today</span>
          <span className="inline-flex items-center gap-1"><Bell className="w-3 h-3" /> Audible alert set</span>
          <span className="inline-flex items-center gap-1"><Diamond className="w-3 h-3" /> Milestone</span>
          <span>Click any row to edit · {toISODate(new Date())}</span>
        </p>
      </div>

      <RoadmapItemDialog
        open={adding}
        onOpenChange={setAdding}
        roadmapStart={roadmap.start_date}
        roadmapEnd={roadmap.end_date}
        onSave={async (p) => { await create(p); toast.success('Task added'); }}
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
    </div>
  );
};

export default RoadmapEditor;
