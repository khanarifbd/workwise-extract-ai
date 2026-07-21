import { useMemo, useRef, useState } from 'react';
import { Check, StickyNote, Award, GripVertical, Sparkles, Send } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { useNavigate, useParams } from 'react-router-dom';
import { Loader2, Plus, ArrowLeft, CalendarDays, Bell, Star, Diamond, Trash2, Settings2, FileUp, Copy, ChevronRight, ChevronDown, CornerDownRight, Wand2, FileDown } from 'lucide-react';
import { useRoadmaps, useRoadmapItems, RoadmapItem } from '@/hooks/useRoadmaps';
import { buildColumns, barPosition, parseLocalDate, toISODate, daysBetween } from '@/lib/roadmapUtils';
import { generateContractorRoadmapItems } from '@/lib/roadmapPlanner';
import { exportRoadmapPDF } from '@/lib/roadmapPdfExport';


const isCertificate = (item: RoadmapItem) => /\bcert(ificate|s|ification)?\b|\bcerts?\b/i.test(item.label || '');

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
  const { items, create, update: updateItem, remove: removeItem, refresh: refreshItems, isLoading } = useRoadmapItems(id);
  const [editing, setEditing] = useState<RoadmapItem | null>(null);
  const [addingParent, setAddingParent] = useState<string | null | undefined>(undefined);
  const [showSettings, setShowSettings] = useState(false);
  const [importing, setImporting] = useState(false);
  const [generatingPlan, setGeneratingPlan] = useState(false);

  const [openNotes, setOpenNotes] = useState<Set<string>>(new Set());
  const toggleNotes = (id: string) => setOpenNotes(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const [expandedSummary, setExpandedSummary] = useState<Set<string>>(new Set());
  const toggleSummary = (id: string) => setExpandedSummary(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // --- Row reorder (drag task up/down) ---
  const [rowDragId, setRowDragId] = useState<string | null>(null);
  const [rowDragOverId, setRowDragOverId] = useState<string | null>(null);

  // --- Text instructor state ---
  const [instruction, setInstruction] = useState('');
  const [runningInstructor, setRunningInstructor] = useState(false);



  // --- Bar drag/resize state ---
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const [drag, setDrag] = useState<null | {
    id: string; mode: 'move' | 'left' | 'right';
    startX: number; origStart: string; origEnd: string;
    newStart: string; newEnd: string; moved: boolean;
  }>(null);
  const dragRef = useRef(drag);
  dragRef.current = drag;

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

  const addDaysISO = (iso: string, n: number) => {
    const d = parseLocalDate(iso); d.setDate(d.getDate() + n); return toISODate(d);
  };

  const beginDrag = (e: React.MouseEvent, item: RoadmapItem, mode: 'move' | 'left' | 'right') => {
    if (!roadmap || item.is_milestone) return;
    e.preventDefault(); e.stopPropagation();
    const totalDays = Math.max(1, (parseLocalDate(roadmap.end_date).getTime() - parseLocalDate(roadmap.start_date).getTime()) / 86400000 + 1);
    const widthPx = timelineRef.current?.getBoundingClientRect().width || 1;
    const pxPerDay = widthPx / totalDays;
    const snap = 1; // always day-level
    const startX = e.clientX;
    const origStart = item.start_date;
    const origEnd = item.end_date;
    setDrag({ id: item.id, mode, startX, origStart, origEnd, newStart: origStart, newEnd: origEnd, moved: false });

    const move = (ev: MouseEvent) => {
      const dx = ev.clientX - startX;
      let deltaDays = Math.round(dx / pxPerDay / snap) * snap;
      let ns = origStart, ne = origEnd;
      if (mode === 'move') {
        ns = addDaysISO(origStart, deltaDays);
        ne = addDaysISO(origEnd, deltaDays);
        if (ns < roadmap.start_date) { const shift = daysBetween(parseLocalDate(ns), parseLocalDate(roadmap.start_date)); ns = addDaysISO(ns, shift); ne = addDaysISO(ne, shift); }
        if (ne > roadmap.end_date) { const shift = daysBetween(parseLocalDate(roadmap.end_date), parseLocalDate(ne)); ns = addDaysISO(ns, -shift); ne = addDaysISO(ne, -shift); }
      } else if (mode === 'left') {
        ns = addDaysISO(origStart, deltaDays);
        if (ns < roadmap.start_date) ns = roadmap.start_date;
        if (ns > origEnd) ns = origEnd;
      } else {
        ne = addDaysISO(origEnd, deltaDays);
        if (ne > roadmap.end_date) ne = roadmap.end_date;
        if (ne < origStart) ne = origStart;
      }
      setDrag(d => d ? { ...d, newStart: ns, newEnd: ne, moved: Math.abs(dx) > 3 } : d);
    };

    const up = async () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      const d = dragRef.current;
      setDrag(null);
      if (d && d.moved && (d.newStart !== d.origStart || d.newEnd !== d.origEnd)) {
        await updateItem(d.id, { start_date: d.newStart, end_date: d.newEnd });
      }
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  // Map an ISO date to the index of the column it falls within
  const colIndexForDate = (iso: string): number => {
    if (!columns.length) return 0;
    const firstStart = toISODate(columns[0].start);
    const lastEnd = toISODate(columns[columns.length - 1].end);
    if (iso <= firstStart) return 0;
    if (iso >= lastEnd) return columns.length - 1;
    for (let i = 0; i < columns.length; i++) {
      if (iso >= toISODate(columns[i].start) && iso <= toISODate(columns[i].end)) return i;
    }
    return columns.length - 1;
  };

  const gridTemplate = `repeat(${columns.length}, minmax(70px, ${'1fr'}))`;
  // weight columns by day count so week/day columns stay proportional but min-clamp aligns with header
  const gridTemplateWeighted = columns.map(c => `minmax(70px, ${c.days}fr)`).join(' ');

  const handleGenerateContractorPlan = async () => {
    if (!roadmap || generatingPlan) return;
    if (items.length > 0 && !confirm('Add the contractor programme to the existing tasks?')) return;

    setGeneratingPlan(true);
    try {
      const payload = generateContractorRoadmapItems(roadmap.start_date, roadmap.end_date)
        .map((item, index) => ({ ...item, roadmap_id: roadmap.id, sort_order: item.sort_order ?? (index + 1) * 10 }));
      const { error } = await supabase.from('roadmap_items').insert(payload as any);
      if (error) throw error;
      await refreshItems();
      toast.success(`Generated ${payload.length} contractor-planned tasks`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not generate roadmap plan');
    } finally {
      setGeneratingPlan(false);
    }
  };

  // Reorder a task relative to a target sibling. Recomputes sort_order across the same parent group.
  const reorderTask = async (draggedId: string, targetId: string, position: 'before' | 'after') => {
    if (draggedId === targetId) return;
    const dragged = items.find(i => i.id === draggedId);
    const target = items.find(i => i.id === targetId);
    if (!dragged || !target) return;
    // Move dragged into target's parent group so cross-group drag also works
    const newParent = target.parent_id;
    const siblings = items
      .filter(i => (i.parent_id || null) === (newParent || null) && i.id !== draggedId)
      .sort((a, b) => a.sort_order - b.sort_order || a.start_date.localeCompare(b.start_date));
    const targetIdx = siblings.findIndex(s => s.id === targetId);
    if (targetIdx < 0) return;
    const insertAt = position === 'after' ? targetIdx + 1 : targetIdx;
    const next = [...siblings];
    next.splice(insertAt, 0, { ...dragged, parent_id: newParent } as RoadmapItem);
    // Batch update sort_order (and parent_id for the dragged item if it changed)
    try {
      await Promise.all(next.map((it, i) => {
        const patch: Partial<RoadmapItem> = { sort_order: (i + 1) * 10 };
        if (it.id === draggedId && (dragged.parent_id || null) !== (newParent || null)) {
          (patch as any).parent_id = newParent;
        }
        return updateItem(it.id, patch);
      }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Reorder failed');
    }
  };

  // ---- Text instructor: send instruction to edge function and apply operations ----
  const applyOperations = async (ops: any[]) => {
    let applied = 0;
    for (const op of ops || []) {
      try {
        if (op.op === 'update' && op.id && op.patch) {
          await updateItem(op.id, op.patch);
          applied++;
        } else if (op.op === 'delete' && op.id) {
          await removeItem(op.id);
          applied++;
        } else if (op.op === 'create' && op.label && op.start_date && op.end_date) {
          const after = op.after_id ? items.find(i => i.id === op.after_id) : null;
          const parent_id = after?.parent_id || null;
          const sort_order = after ? after.sort_order + 5 : (items.length + 1) * 10;
          await create({
            label: op.label,
            start_date: op.start_date,
            end_date: op.end_date,
            notes: op.notes || '',
            color: op.color || '#2563eb',
            parent_id,
            sort_order,
            progress: 0,
            is_milestone: false,
          } as any);
          applied++;
        } else if (op.op === 'reorder' && op.id && (op.after_id || op.before_id)) {
          const targetId = op.after_id || op.before_id;
          await reorderTask(op.id, targetId, op.after_id ? 'after' : 'before');
          applied++;
        }
      } catch (e) {
        console.error('applyOperations op failed', op, e);
      }
    }
    return applied;
  };

  const runInstructor = async () => {
    if (!roadmap || runningInstructor) return;
    const text = instruction.trim();
    if (!text) return;
    setRunningInstructor(true);
    try {
      const { data, error } = await supabase.functions.invoke('roadmap-instructor', {
        body: { instruction: text, roadmap: { start_date: roadmap.start_date, end_date: roadmap.end_date }, items },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const ops = (data as any)?.operations || [];
      const summary = (data as any)?.summary || '';
      const applied = await applyOperations(ops);
      await refreshItems();
      if (applied) {
        toast.success(`${applied} change${applied > 1 ? 's' : ''} applied${summary ? ` · ${summary}` : ''}`);
        setInstruction('');
      } else {
        toast.info(summary || 'No changes applied — try rephrasing');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Instructor failed');
    } finally {
      setRunningInstructor(false);
    }
  };



  const renderRow = (item: RoadmapItem, depth: number, idx: number) => {
    const liveStart = drag && drag.id === item.id ? drag.newStart : item.start_date;
    const liveEnd = drag && drag.id === item.id ? drag.newEnd : item.end_date;
    const kids = childrenOf[item.id] || [];
    const hasKids = kids.length > 0;
    const dragging = drag?.id === item.id;
    // Always compute bar position at day granularity so week view still respects specific start/end days
    const pos = barPosition(liveStart, liveEnd, roadmap.start_date, roadmap.end_date, 'day');
    const notesSummary = (item.notes || '').trim().split(/\r?\n/)[0].slice(0, 140);
    const isOver = rowDragOverId === item.id;
    return (
      <div key={item.id}>
        <div
          className={cn(
            'group flex border-b last:border-b-0 hover:bg-muted/40 transition',
            idx % 2 === 1 && 'bg-muted/10',
            isOver && 'ring-2 ring-primary/60 ring-inset bg-primary/5',
            rowDragId === item.id && 'opacity-50',
          )}
          onDragOver={(e) => { if (rowDragId && rowDragId !== item.id) { e.preventDefault(); setRowDragOverId(item.id); } }}
          onDragLeave={() => { if (rowDragOverId === item.id) setRowDragOverId(null); }}
          onDrop={async (e) => {
            e.preventDefault();
            const draggedId = rowDragId;
            setRowDragOverId(null);
            setRowDragId(null);
            if (draggedId && draggedId !== item.id) {
              // Drop position: bottom half = after, top half = before
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              const pos = (e.clientY - rect.top) > rect.height / 2 ? 'after' : 'before';
              await reorderTask(draggedId, item.id, pos);
            }
          }}
        >
          <div className="w-80 shrink-0 flex items-start gap-1 px-2 py-1.5 text-sm border-r" style={{ paddingLeft: 8 + depth * 14 }}>
            <div
              draggable
              onDragStart={(e) => { setRowDragId(item.id); e.dataTransfer.effectAllowed = 'move'; }}
              onDragEnd={() => { setRowDragId(null); setRowDragOverId(null); }}
              className="mt-0.5 p-0.5 shrink-0 cursor-grab active:cursor-grabbing opacity-30 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity"
              title="Drag to reorder"
            >
              <GripVertical className="w-3.5 h-3.5" />
            </div>

            {hasKids ? (
              <button
                onClick={() => updateItem(item.id, { collapsed: !item.collapsed })}
                className="mt-0.5 p-0.5 hover:bg-muted rounded shrink-0"
                title={item.collapsed ? 'Expand' : 'Collapse'}
              >
                {item.collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
            ) : depth > 0 ? <CornerDownRight className="mt-1 w-3 h-3 text-muted-foreground/60 shrink-0" /> : <span className="w-4" />}
            <button onClick={() => setEditing(item)} className="flex-1 min-w-0 text-left font-medium">
              <span className="flex items-start gap-1.5 leading-snug break-words">
                {item.symbol && <span className="text-xs shrink-0">{item.symbol}</span>}
                <span className="whitespace-normal break-words">{item.label}</span>
                {notesSummary && (
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleSummary(item.id); }}
                    className="ml-auto shrink-0 p-0.5 rounded hover:bg-muted text-muted-foreground"
                    title={expandedSummary.has(item.id) ? 'Hide description' : 'Show description'}
                  >
                    {expandedSummary.has(item.id) ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                  </button>
                )}
              </span>
              {notesSummary && expandedSummary.has(item.id) && (
                <span className="mt-0.5 block text-[11px] font-normal text-muted-foreground leading-snug break-words whitespace-pre-wrap">
                  {item.notes}
                </span>
              )}
            </button>

            <button
              onClick={(e) => { e.stopPropagation(); toggleNotes(item.id); }}
              className={cn(
                "mt-0.5 p-0.5 hover:bg-muted rounded shrink-0 transition-opacity",
                item.notes?.trim() ? "text-primary" : "opacity-30 group-hover:opacity-100 text-muted-foreground hover:text-foreground",
              )}
              title={openNotes.has(item.id) ? 'Hide note' : (item.notes?.trim() ? 'Edit note' : 'Add note')}
            >
              <StickyNote className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setAddingParent(item.id); }}
              className="mt-0.5 opacity-30 group-hover:opacity-100 p-0.5 hover:bg-muted rounded text-muted-foreground hover:text-foreground shrink-0 transition-opacity"
              title="Add sub-task"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
          <div
            className="flex-1 relative min-h-[26px]"
            onClick={(e) => {
              if (dragRef.current) return;
              setEditing(item);
            }}
            role="button"
          >
            {item.is_milestone ? (
              <div
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2"
                style={{ left: `${pos.leftPct}%` }}
                title={item.label}
              >
                <div className="w-4 h-4 rotate-45 rounded-sm shadow flex items-center justify-center text-white" style={{ background: item.color }}>
                  <Diamond className="w-2.5 h-2.5 -rotate-45" />
                </div>
              </div>
            ) : (
              <div
                className={cn(
                  "absolute top-1/2 -translate-y-1/2 h-[20px] rounded flex items-center text-[10px] text-white font-semibold shadow-sm select-none",
                  dragging && "ring-2 ring-foreground/60 shadow-lg z-10",
                  item.progress < 100 && !dragging && liveEnd < toISODate(new Date()) && "animate-pulse",
                  isCertificate(item) && "h-[24px] rounded-none text-amber-950 font-bold ring-2 ring-amber-400 ring-offset-1 ring-offset-background shadow-[0_0_12px_rgba(251,191,36,0.55)] cert-ribbon",
                )}
                style={{
                  left: `${pos.leftPct}%`,
                  width: `${pos.widthPct}%`,
                  minWidth: '18px',
                  background: isCertificate(item)
                    ? 'repeating-linear-gradient(45deg, #fde68a 0 6px, #fbbf24 6px 12px)'
                    : item.color,
                  cursor: dragging ? 'grabbing' : 'grab',
                }}
                title={`${item.label} · ${liveStart} → ${liveEnd} · ${item.progress}%${isCertificate(item) ? ' · Certificate' : ''}`}
                onMouseDown={(e) => beginDrag(e, item, 'move')}
              >
                <div
                  className="absolute left-0 top-0 h-full w-1.5 cursor-ew-resize hover:bg-white/40 rounded-l z-10"
                  onMouseDown={(e) => beginDrag(e, item, 'left')}
                />
                {item.progress > 0 && item.progress < 100 && (
                  <div className="absolute inset-y-0 left-0 bg-black/30 pointer-events-none rounded-l" style={{ width: `${item.progress}%` }} />
                )}
                <button
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    updateItem(item.id, { progress: item.progress >= 100 ? 0 : 100 });
                  }}
                  title={item.progress >= 100 ? 'Mark incomplete' : 'Mark complete'}
                  className={cn(
                    "relative ml-1 shrink-0 w-3.5 h-3.5 rounded-sm border border-white/80 flex items-center justify-center hover:bg-white/20 transition",
                    item.progress >= 100 && "bg-white/90 text-foreground",
                  )}
                >
                  {item.progress >= 100 && <Check className="w-2.5 h-2.5" strokeWidth={3} />}
                </button>
                <span className={cn("relative truncate leading-none px-1.5 pointer-events-none flex-1 flex items-center gap-1", isCertificate(item) && "uppercase tracking-wider")}>
                  {isCertificate(item) && <Award className="w-3 h-3 shrink-0 text-amber-900" strokeWidth={2.5} />}
                  <span className="truncate">{item.symbol ? `${item.symbol} ` : ''}{item.label}</span>
                  <span className="ml-1 opacity-80">· {item.progress}%</span>
                  {dragging && <span className="ml-1 opacity-80">· {liveStart} → {liveEnd}</span>}
                </span>
                {(item.notify_on_start || item.notify_on_end) && <Bell className="w-2.5 h-2.5 mr-0.5 shrink-0 relative pointer-events-none" />}
                <button
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); toggleNotes(item.id); }}
                  title={openNotes.has(item.id) ? 'Hide notes' : 'Show notes'}
                  className={cn(
                    "relative mr-1 shrink-0 w-3.5 h-3.5 rounded-sm flex items-center justify-center hover:bg-white/25 transition",
                    item.notes?.trim() && "bg-white/20",
                  )}
                >
                  <StickyNote className="w-2.5 h-2.5" />
                </button>
                <div
                  className="absolute right-0 top-0 h-full w-1.5 cursor-ew-resize hover:bg-white/40 rounded-r z-10"
                  onMouseDown={(e) => beginDrag(e, item, 'right')}
                />
              </div>
            )}
          </div>
        </div>
        {openNotes.has(item.id) && !item.is_milestone && (
          <div className="flex border-b bg-muted/30 animate-accordion-down">
            <div className="w-80 shrink-0 px-2 py-1.5 border-r text-[11px] text-muted-foreground flex items-center gap-1" style={{ paddingLeft: 8 + depth * 14 + 16 }}>
              <StickyNote className="w-3 h-3" /> Notes · {item.progress}%
            </div>
            <div className="flex-1 px-2 py-1.5">
              <Textarea
                defaultValue={item.notes || ''}
                placeholder="What needs to be done to complete this task?"
                onBlur={(e) => { if (e.target.value !== (item.notes || '')) updateItem(item.id, { notes: e.target.value }); }}
                onClick={(e) => e.stopPropagation()}
                className="min-h-[60px] text-xs resize-y"
              />
            </div>
          </div>
        )}
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
          <Button variant="outline" size="sm" onClick={() => {
            try { exportRoadmapPDF(roadmap, items); toast.success('Roadmap PDF generated'); }
            catch (e) { toast.error(e instanceof Error ? e.message : 'PDF export failed'); }
          }} disabled={items.length === 0}>
            <FileDown className="w-4 h-4 mr-1" /> Export PDF
          </Button>
          <Button variant="outline" size="sm" onClick={() => setImporting(true)}>
            <FileUp className="w-4 h-4 mr-1" /> Import PDF
          </Button>
          <Button variant="outline" size="sm" onClick={handleGenerateContractorPlan} disabled={generatingPlan}>
            {generatingPlan ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Wand2 className="w-4 h-4 mr-1" />}
            Generate plan
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

      {/* Text instructor bar */}
      <div className="container mx-auto px-4 pt-3">
        <div className="border rounded-lg bg-gradient-to-r from-primary/5 via-background to-background p-2 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary shrink-0 ml-1" />
          <Input
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); runInstructor(); } }}
            placeholder='Type an instruction, e.g. "Move Remove wet room under Remove skirting and set dates 3rd Aug to 5th Aug"'
            className="flex-1 h-9 border-0 shadow-none focus-visible:ring-0 bg-transparent"
            disabled={runningInstructor}
          />
          <Button size="sm" onClick={runInstructor} disabled={runningInstructor || !instruction.trim()}>
            {runningInstructor ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Send className="w-4 h-4 mr-1" />}
            Apply
          </Button>
        </div>
        <p className="text-[10.5px] text-muted-foreground mt-1 px-1">
          Instructor understands: move tasks, change dates, extend/shrink bars, add or edit notes, rename, create, delete. Refers to tasks by name.
        </p>
      </div>

      {/* Gantt */}
      <div className="container mx-auto px-4 py-4">

        <div className="border rounded-lg overflow-hidden bg-card">
          {/* Column headers */}
          <div className="flex bg-[#0a2540] text-white text-sm font-semibold">
            <div className="w-80 shrink-0 px-3 py-2.5 border-r border-white/10">Task</div>
            <div className="flex-1 grid relative" style={{ gridTemplateColumns: gridTemplateWeighted }}>
              {columns.map((c, i) => (
                <div
                  key={c.key}
                  className={cn(
                    'relative px-2 py-2.5 text-center min-w-0',
                    i === columns.length - 1 ? '' : 'border-r border-white/30',
                  )}
                >
                  <div>{c.label}</div>
                  {c.sublabel && <div className="text-[10px] font-normal opacity-80">{c.sublabel}</div>}
                  {roadmap.time_unit === 'week' && c.days > 1 && (
                    <div className="pointer-events-none absolute inset-0 flex">
                      {Array.from({ length: c.days }).map((_, di) => {
                        const d = new Date(c.start); d.setDate(d.getDate() + di);
                        return (
                          <div key={di} className="flex-1 border-r border-white/10 last:border-transparent text-[9px] opacity-60 flex items-end justify-center pb-0.5">
                            {d.getDate()}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Rows with full-height grid overlay */}
          <div className="relative">
            <div ref={timelineRef} className="absolute top-0 bottom-0 left-80 right-0 pointer-events-none z-0">
              {/* Full-height column dividers (weeks or days depending on view) */}
              <div className="absolute inset-0 grid" style={{ gridTemplateColumns: gridTemplateWeighted }}>
                {columns.map((c, i) => (
                  <div
                    key={c.key}
                    className={cn(
                      'relative border-r min-w-0',
                      i === columns.length - 1 ? 'border-transparent' : 'border-border',
                    )}
                  >
                    {roadmap.time_unit === 'week' && c.days > 1 && (
                      <div className="absolute inset-0 flex">
                        {Array.from({ length: c.days - 1 }).map((_, di) => (
                          <div key={di} className="flex-1 border-r border-border/40 last:border-transparent" />
                        ))}
                        <div className="flex-1" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {/* Today line full-height */}
              {todayPct !== null && (
                <div className="absolute top-0 bottom-0 w-px bg-red-500/70" style={{ left: `${todayPct}%` }} />
              )}
            </div>


            <div className="relative z-[1]">
              {isLoading ? (
                <div className="p-10 text-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin inline" /></div>
              ) : roots.length === 0 ? (
                <div className="p-10 text-center text-muted-foreground">
                  <p className="mb-4">No tasks yet. Generate a contractor-planned programme or click <strong>Add task</strong> to create your first bar.</p>
                  <Button onClick={handleGenerateContractorPlan} disabled={generatingPlan}>
                    {generatingPlan ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Wand2 className="w-4 h-4 mr-1" />}
                    Generate contractor plan
                  </Button>
                </div>
              ) : (
                roots.map((item, idx) => renderRow(item, 0, idx))
              )}
            </div>
          </div>
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
          await refreshItems();
        }}
      />
    </div>
  );
};

export default RoadmapEditor;
