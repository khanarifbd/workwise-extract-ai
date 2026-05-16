import { useCallback, useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import {
  Loader2, FileDown, Image as ImageIcon,
  CalendarIcon, Users, X, CheckCircle2, ChevronLeft, ChevronRight,
} from 'lucide-react';
import {
  format, startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  getISOWeek, addDays, addWeeks, addMonths, subDays,
  isSameDay, isWithinInterval,
} from 'date-fns';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { downloadPDF, preparePDFWindow } from '@/lib/pdfDownload';
import { IncompleteJob } from '@/hooks/useProgressorIncompleteJobs';
import { assertCount } from '@/lib/metricsIntegrity';
import { cn } from '@/lib/utils';

type Scope = 'day' | 'week' | 'month' | 'individual';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  jobs: IncompleteJob[];
  verifyAccuracy?: () => Promise<{ local: number; db: number; ok: boolean }>;
}

const dayKey = (d: Date) => format(d, 'yyyy-MM-dd');
const weekKey = (d: Date) => format(startOfWeek(d, { weekStartsOn: 1 }), 'yyyy-MM-dd');
const monthKey = (d: Date) => format(d, 'yyyy-MM');

export function ProgressorPdfExportModal({ open, onOpenChange, jobs, verifyAccuracy }: Props) {
  const { toast } = useToast();

  const [scope, setScope] = useState<Scope>('week');
  const [selectedDays, setSelectedDays] = useState<Date[]>([]);
  const [selectedWeeks, setSelectedWeeks] = useState<Date[]>([]);
  const [selectedMonths, setSelectedMonths] = useState<Date[]>([]);
  const [selectedTeams, setSelectedTeams] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Range-pick state for days
  const [rangeAnchor, setRangeAnchor] = useState<Date | null>(null);

  // Navigation cursors for week/month browsers
  const [weekCursor, setWeekCursor] = useState<Date>(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [monthCursor, setMonthCursor] = useState<Date>(() => startOfMonth(new Date()));

  useEffect(() => { setSelectedIds(new Set()); setRangeAnchor(null); }, [scope]);
  useEffect(() => { if (!open) { setRangeAnchor(null); } }, [open]);

  // ---- Allowed day-keys for filter ----
  const allowedDayKeys = useMemo(() => {
    const s = new Set<string>();
    if (scope === 'day') selectedDays.forEach(d => s.add(dayKey(d)));
    else if (scope === 'week') selectedWeeks.forEach(wk => {
      const start = startOfWeek(wk, { weekStartsOn: 1 });
      for (let i = 0; i < 7; i++) s.add(dayKey(addDays(start, i)));
    });
    else if (scope === 'month') selectedMonths.forEach(m => {
      const start = startOfMonth(m); const end = endOfMonth(m);
      for (let cur = new Date(start); cur <= end; cur = addDays(cur, 1)) s.add(dayKey(cur));
    });
    return s;
  }, [scope, selectedDays, selectedWeeks, selectedMonths]);

  const hasAnyDateSelection =
    (scope === 'day' && selectedDays.length > 0) ||
    (scope === 'week' && selectedWeeks.length > 0) ||
    (scope === 'month' && selectedMonths.length > 0) ||
    scope === 'individual';

  const allTeams = useMemo(() => {
    const s = new Set<string>();
    jobs.forEach(j => { if (j.team) s.add(j.team); if (j.team2) s.add(j.team2); });
    return Array.from(s).sort();
  }, [jobs]);

  const dateFiltered = useMemo(() => {
    if (scope === 'individual') return jobs;
    if (allowedDayKeys.size === 0) return [];
    return jobs.filter(j => {
      if (!j.bookedDate) return false;
      const key = j.bookedDate.length >= 10 ? j.bookedDate.slice(0, 10) : dayKey(new Date(j.bookedDate));
      return allowedDayKeys.has(key);
    });
  }, [jobs, scope, allowedDayKeys]);

  const teamFiltered = useMemo(() => {
    if (selectedTeams.size === 0) return dateFiltered;
    return dateFiltered.filter(j =>
      (j.team && selectedTeams.has(j.team)) || (j.team2 && selectedTeams.has(j.team2))
    );
  }, [dateFiltered, selectedTeams]);

  const finalJobs = useMemo(() => {
    if (scope === 'individual') return teamFiltered.filter(j => selectedIds.has(j.id));
    return teamFiltered;
  }, [scope, teamFiltered, selectedIds]);

  // ---- Media map ----
  const candidateIds = useMemo(() => teamFiltered.map(j => j.id), [teamFiltered]);
  const [mediaMap, setMediaMap] = useState<Record<string, boolean>>({});
  const [loadingMedia, setLoadingMedia] = useState(false);

  useEffect(() => {
    if (!open || candidateIds.length === 0) { setMediaMap({}); return; }
    let cancelled = false;
    (async () => {
      setLoadingMedia(true);
      try {
        const { data, error } = await supabase
          .from('team_job_updates')
          .select('job_id, photos')
          .in('job_id', candidateIds)
          .limit(5000);
        if (error) throw error;
        const map: Record<string, boolean> = {};
        (data || []).forEach((row: any) => {
          if (Array.isArray(row.photos) && row.photos.length > 0) map[row.job_id] = true;
        });
        if (!cancelled) setMediaMap(map);
      } catch (e) {
        console.error('team_job_updates fetch', e);
      } finally {
        if (!cancelled) setLoadingMedia(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, candidateIds.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  const hasMedia = (j: IncompleteJob): boolean =>
    (j.attachments && j.attachments.length > 0) || !!mediaMap[j.id];

  // ---- Integrity ----
  useEffect(() => {
    if (!open) return;
    const recomputed = (scope === 'individual')
      ? teamFiltered.filter(j => selectedIds.has(j.id)).length
      : teamFiltered.length;
    assertCount('progressor-export:finalJobs', finalJobs.length, recomputed);
  }, [open, finalJobs, teamFiltered, selectedIds, scope]);

  // ---- DB accuracy detector (live sync check against main database) ----
  const [accuracy, setAccuracy] = useState<{ local: number; db: number; ok: boolean; checking: boolean; checkedAt?: number }>({
    local: 0, db: 0, ok: true, checking: false,
  });

  const runAccuracyCheck = useCallback(async () => {
    if (!verifyAccuracy) return;
    setAccuracy(a => ({ ...a, checking: true }));
    try {
      const res = await verifyAccuracy();
      setAccuracy({ ...res, checking: false, checkedAt: Date.now() });
    } catch (e) {
      console.error('accuracy check failed', e);
      setAccuracy(a => ({ ...a, checking: false }));
    }
  }, [verifyAccuracy]);

  useEffect(() => {
    if (!open) return;
    runAccuracyCheck();
    const id = setInterval(runAccuracyCheck, 15000);
    return () => clearInterval(id);
  }, [open, runAccuracyCheck]);

  // ---- Toggle helpers ----
  const isDaySelected = (d: Date) => selectedDays.some(x => dayKey(x) === dayKey(d));
  const isWeekSelected = (d: Date) => selectedWeeks.some(x => weekKey(x) === weekKey(d));
  const isMonthSelected = (d: Date) => selectedMonths.some(x => monthKey(x) === monthKey(d));

  const toggleDay = (d: Date) => setSelectedDays(prev => {
    const k = dayKey(d);
    return prev.some(x => dayKey(x) === k) ? prev.filter(x => dayKey(x) !== k) : [...prev, d];
  });
  const toggleWeek = (d: Date) => {
    const start = startOfWeek(d, { weekStartsOn: 1 });
    const k = weekKey(start);
    setSelectedWeeks(prev =>
      prev.some(x => weekKey(x) === k) ? prev.filter(x => weekKey(x) !== k) : [...prev, start]
    );
  };
  const toggleMonth = (d: Date) => {
    const start = startOfMonth(d);
    const k = monthKey(start);
    setSelectedMonths(prev =>
      prev.some(x => monthKey(x) === k) ? prev.filter(x => monthKey(x) !== k) : [...prev, start]
    );
  };

  // Range add for days
  const addDayRange = (a: Date, b: Date) => {
    const start = a <= b ? a : b;
    const end = a <= b ? b : a;
    setSelectedDays(prev => {
      const map = new Map(prev.map(d => [dayKey(d), d]));
      for (let cur = new Date(start); cur <= end; cur = addDays(cur, 1)) {
        map.set(dayKey(cur), new Date(cur));
      }
      return Array.from(map.values());
    });
  };

  const handleCalendarDayClick = (d: Date, e?: React.MouseEvent) => {
    if (scope !== 'day') {
      if (scope === 'week') toggleWeek(d);
      else if (scope === 'month') toggleMonth(d);
      return;
    }
    if (e?.shiftKey && rangeAnchor) {
      addDayRange(rangeAnchor, d);
      setRangeAnchor(d);
      return;
    }
    toggleDay(d);
    setRangeAnchor(d);
  };

  const toggleTeam = (t: string) => setSelectedTeams(p => {
    const n = new Set(p); n.has(t) ? n.delete(t) : n.add(t); return n;
  });
  const toggleId = (id: string) => setSelectedIds(p => {
    const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  const clearScopeSelection = () => {
    if (scope === 'day') { setSelectedDays([]); setRangeAnchor(null); }
    if (scope === 'week') setSelectedWeeks([]);
    if (scope === 'month') setSelectedMonths([]);
  };

  // ---- Quick presets ----
  const applyPreset = (preset: string) => {
    const today = new Date();
    if (scope === 'day') {
      if (preset === 'today') setSelectedDays([today]);
      else if (preset === 'tomorrow') setSelectedDays([addDays(today, 1)]);
      else if (preset === 'yesterday') setSelectedDays([subDays(today, 1)]);
      else if (preset === 'next7') {
        const days: Date[] = [];
        for (let i = 0; i < 7; i++) days.push(addDays(today, i));
        setSelectedDays(days);
      } else if (preset === 'last7') {
        const days: Date[] = [];
        for (let i = 6; i >= 0; i--) days.push(subDays(today, i));
        setSelectedDays(days);
      }
    } else if (scope === 'week') {
      if (preset === 'this') setSelectedWeeks([startOfWeek(today, { weekStartsOn: 1 })]);
      else if (preset === 'next') setSelectedWeeks([startOfWeek(addWeeks(today, 1), { weekStartsOn: 1 })]);
      else if (preset === 'last') setSelectedWeeks([startOfWeek(subDays(today, 7), { weekStartsOn: 1 })]);
      else if (preset === 'next4') {
        const out: Date[] = [];
        for (let i = 0; i < 4; i++) out.push(startOfWeek(addWeeks(today, i), { weekStartsOn: 1 }));
        setSelectedWeeks(out);
      }
    } else if (scope === 'month') {
      if (preset === 'this') setSelectedMonths([startOfMonth(today)]);
      else if (preset === 'next') setSelectedMonths([startOfMonth(addMonths(today, 1))]);
      else if (preset === 'last') setSelectedMonths([startOfMonth(addMonths(today, -1))]);
      else if (preset === 'next3') {
        const out: Date[] = [];
        for (let i = 0; i < 3; i++) out.push(startOfMonth(addMonths(today, i)));
        setSelectedMonths(out);
      }
    }
  };

  // ---- Chips ----
  const selectionChips = useMemo(() => {
    if (scope === 'day') {
      return selectedDays.slice().sort((a, b) => a.getTime() - b.getTime())
        .map(d => ({ key: dayKey(d), label: format(d, 'EEE dd MMM'), onRemove: () => toggleDay(d) }));
    }
    if (scope === 'week') {
      return selectedWeeks.slice().sort((a, b) => a.getTime() - b.getTime()).map(d => ({
        key: weekKey(d),
        label: `W${getISOWeek(d)} · ${format(d, 'dd MMM')}–${format(endOfWeek(d, { weekStartsOn: 1 }), 'dd MMM')}`,
        onRemove: () => toggleWeek(d),
      }));
    }
    if (scope === 'month') {
      return selectedMonths.slice().sort((a, b) => a.getTime() - b.getTime())
        .map(d => ({ key: monthKey(d), label: format(d, 'MMM yyyy'), onRemove: () => toggleMonth(d) }));
    }
    return [];
  }, [scope, selectedDays, selectedWeeks, selectedMonths]);

  // Calendar highlighting for day scope
  const calendarSelected = scope === 'day' ? selectedDays : [];

  // ---- Week browser: list of 12 weeks centred on cursor ----
  const weekList = useMemo(() => {
    const start = addWeeks(weekCursor, -4);
    return Array.from({ length: 12 }, (_, i) => addWeeks(start, i));
  }, [weekCursor]);

  const monthList = useMemo(() => {
    const start = addMonths(monthCursor, -4);
    return Array.from({ length: 12 }, (_, i) => addMonths(start, i));
  }, [monthCursor]);

  // ---- PDF generation ----
  const generatePdf = () => {
    if (finalJobs.length === 0) {
      toast({ title: 'Nothing to export', description: 'No jobs match your filters.', variant: 'destructive' });
      return;
    }
    try {
      const doc = new jsPDF({ orientation: 'landscape' });
      const pw = doc.internal.pageSize.width;

      doc.setFillColor(15, 23, 42);
      doc.rect(0, 0, pw, 22, 'F');
      doc.setTextColor(255);
      doc.setFontSize(14); doc.setFont('helvetica', 'bold');
      doc.text('PROGRESSOR — OUTSTANDING JOBS LIST', 14, 14);
      doc.setFontSize(9); doc.setFont('helvetica', 'normal');
      doc.text(format(new Date(), 'dd MMM yyyy HH:mm'), pw - 14, 14, { align: 'right' });

      let subtitle = `Scope: ${scope.toUpperCase()}`;
      if (selectionChips.length > 0) subtitle += `  ·  ${selectionChips.map(c => c.label).join(', ')}`;
      if (selectedTeams.size > 0) subtitle += `  ·  Teams: ${Array.from(selectedTeams).join(', ')}`;
      subtitle += `  ·  ${finalJobs.length} job${finalJobs.length === 1 ? '' : 's'}`;
      doc.setTextColor(80); doc.setFontSize(9);
      const wrapped = doc.splitTextToSize(subtitle, pw - 28);
      doc.text(wrapped, 14, 28);

      const tableStart = 28 + (Array.isArray(wrapped) ? wrapped.length : 1) * 5;

      const sorted = [...finalJobs].sort((a, b) => {
        const ax = a.bookedDate || '';
        const bx = b.bookedDate || '';
        if (ax !== bx) return ax.localeCompare(bx);
        return (a.jobNumber || '').localeCompare(b.jobNumber || '');
      });

      const rows = sorted.map(j => [
        j.jobNumber || '—',
        j.name || '—',
        j.address || '—',
        [j.team, j.team2].filter(Boolean).join(' + ') || '—',
        j.bookedDate ? format(new Date(j.bookedDate), 'EEE dd MMM') : '—',
        hasMedia(j) ? '[X]' : '[  ]',
      ]);

      autoTable(doc, {
        startY: tableStart,
        head: [['Job #', 'Tenant', 'Address', 'Team', 'Booked', 'Media']],
        body: rows,
        styles: { fontSize: 8.5, cellPadding: 2.5, valign: 'middle' },
        headStyles: { fillColor: [51, 65, 85], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: {
          0: { cellWidth: 24, fontStyle: 'bold' },
          1: { cellWidth: 46 },
          2: { cellWidth: 92 },
          3: { cellWidth: 48 },
          4: { cellWidth: 36 },
          5: { cellWidth: 22, halign: 'center' },
        },
        margin: { left: 10, right: 10 },
      });

      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(7); doc.setTextColor(140);
        doc.text(
          `Page ${i} of ${pageCount}  ·  Media tickbox = team has uploaded photos for this job`,
          pw / 2, doc.internal.pageSize.height - 6, { align: 'center' },
        );
      }

      const fname = `progressor-jobs-${scope}-${format(new Date(), 'yyyy-MM-dd-HHmm')}.pdf`;
      downloadPDF(doc, fname);
      toast({ title: 'PDF generated', description: `${finalJobs.length} jobs exported.` });
    } catch (e: any) {
      console.error('PDF generation failed', e);
      toast({ title: 'PDF generation failed', description: e?.message || 'Unknown error', variant: 'destructive' });
    }
  };

  const COLS = 'minmax(0,1fr) 8rem 6rem 3rem';

  // Apply team filter so counts match what users will actually see after filtering
  const teamFilteredAll = useMemo(() => {
    if (selectedTeams.size === 0) return jobs;
    return jobs.filter(j =>
      (j.team && selectedTeams.has(j.team)) || (j.team2 && selectedTeams.has(j.team2))
    );
  }, [jobs, selectedTeams]);

  const weekJobCount = (wkStart: Date) => {
    const wkEnd = endOfWeek(wkStart, { weekStartsOn: 1 });
    return teamFilteredAll.filter(j => {
      if (!j.bookedDate) return false;
      const d = new Date(j.bookedDate.slice(0, 10));
      return isWithinInterval(d, { start: wkStart, end: wkEnd });
    }).length;
  };
  const monthJobCount = (m: Date) => {
    const s = startOfMonth(m); const e = endOfMonth(m);
    return teamFilteredAll.filter(j => {
      if (!j.bookedDate) return false;
      const d = new Date(j.bookedDate.slice(0, 10));
      return isWithinInterval(d, { start: s, end: e });
    }).length;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[92vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileDown className="h-5 w-5 text-progressor" /> Export Jobs PDF
          </DialogTitle>
          <DialogDescription className="sr-only">
            Select days, weeks, months or individual jobs and export a PDF list.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 flex flex-col gap-3 overflow-hidden">
          <Tabs value={scope} onValueChange={(v) => setScope(v as Scope)}>
            <TabsList className="grid grid-cols-4 w-full h-10">
              <TabsTrigger value="day">Days</TabsTrigger>
              <TabsTrigger value="week">Weeks</TabsTrigger>
              <TabsTrigger value="month">Months</TabsTrigger>
              <TabsTrigger value="individual">Individual</TabsTrigger>
            </TabsList>
          </Tabs>

          {/* ---- DAY SCOPE ---- */}
          {scope === 'day' && (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-1.5">
                {[
                  { k: 'today', label: 'Today' },
                  { k: 'tomorrow', label: 'Tomorrow' },
                  { k: 'yesterday', label: 'Yesterday' },
                  { k: 'last7', label: 'Last 7 days' },
                  { k: 'next7', label: 'Next 7 days' },
                ].map(p => (
                  <Button key={p.k} size="sm" variant="outline" className="h-7 text-xs" onClick={() => applyPreset(p.k)}>
                    {p.label}
                  </Button>
                ))}
                <Popover>
                  <PopoverTrigger asChild>
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1">
                      <CalendarIcon className="h-3 w-3" /> Pick days
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <div className="px-3 pt-3 pb-1 text-[11px] text-muted-foreground">
                      Click to toggle. <kbd className="px-1 py-0.5 border rounded bg-muted">Shift</kbd>+click to pick a range.
                    </div>
                    <Calendar
                      mode="multiple"
                      selected={calendarSelected}
                      onDayClick={(d, _mods, e) => handleCalendarDayClick(d, e as any)}
                      weekStartsOn={1}
                      showOutsideDays
                      initialFocus
                      className={cn('p-3 pointer-events-auto')}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          )}

          {/* ---- WEEK SCOPE ---- */}
          {scope === 'week' && (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-1.5">
                {[
                  { k: 'last', label: 'Last week' },
                  { k: 'this', label: 'This week' },
                  { k: 'next', label: 'Next week' },
                  { k: 'next4', label: 'Next 4 weeks' },
                ].map(p => (
                  <Button key={p.k} size="sm" variant="outline" className="h-7 text-xs" onClick={() => applyPreset(p.k)}>
                    {p.label}
                  </Button>
                ))}
              </div>
              <div className="border rounded-md p-2 bg-muted/20">
                <div className="flex items-center justify-between mb-2">
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setWeekCursor(addWeeks(weekCursor, -4))}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <button
                    className="text-xs font-medium hover:underline"
                    onClick={() => setWeekCursor(startOfWeek(new Date(), { weekStartsOn: 1 }))}
                  >
                    Jump to this week
                  </button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setWeekCursor(addWeeks(weekCursor, 4))}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {weekList.map(wk => {
                    const selected = isWeekSelected(wk);
                    const count = weekJobCount(wk);
                    const isThisWeek = weekKey(wk) === weekKey(new Date());
                    return (
                      <button
                        key={weekKey(wk)}
                        onClick={() => toggleWeek(wk)}
                        className={cn(
                          'text-left px-2 py-1.5 rounded border text-xs flex items-center justify-between gap-2 transition',
                          selected ? 'bg-progressor text-progressor-foreground border-progressor' : 'bg-background hover:bg-muted/60',
                          isThisWeek && !selected && 'ring-1 ring-progressor/40'
                        )}
                      >
                        <span className="truncate">
                          <span className="font-semibold">W{getISOWeek(wk)}</span>
                          <span className="opacity-80 ml-1">
                            {format(wk, 'dd MMM')}–{format(endOfWeek(wk, { weekStartsOn: 1 }), 'dd MMM')}
                          </span>
                        </span>
                        <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full', selected ? 'bg-white/20' : 'bg-muted')}>
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ---- MONTH SCOPE ---- */}
          {scope === 'month' && (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-1.5">
                {[
                  { k: 'last', label: 'Last month' },
                  { k: 'this', label: 'This month' },
                  { k: 'next', label: 'Next month' },
                  { k: 'next3', label: 'Next 3 months' },
                ].map(p => (
                  <Button key={p.k} size="sm" variant="outline" className="h-7 text-xs" onClick={() => applyPreset(p.k)}>
                    {p.label}
                  </Button>
                ))}
              </div>
              <div className="border rounded-md p-2 bg-muted/20">
                <div className="flex items-center justify-between mb-2">
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setMonthCursor(addMonths(monthCursor, -4))}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <button
                    className="text-xs font-medium hover:underline"
                    onClick={() => setMonthCursor(startOfMonth(new Date()))}
                  >
                    Jump to this month
                  </button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setMonthCursor(addMonths(monthCursor, 4))}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
                  {monthList.map(m => {
                    const selected = isMonthSelected(m);
                    const count = monthJobCount(m);
                    const isThisMonth = monthKey(m) === monthKey(new Date());
                    return (
                      <button
                        key={monthKey(m)}
                        onClick={() => toggleMonth(m)}
                        className={cn(
                          'text-left px-2 py-1.5 rounded border text-xs flex items-center justify-between gap-2 transition',
                          selected ? 'bg-progressor text-progressor-foreground border-progressor' : 'bg-background hover:bg-muted/60',
                          isThisMonth && !selected && 'ring-1 ring-progressor/40'
                        )}
                      >
                        <span className="font-medium truncate">{format(m, 'MMM yyyy')}</span>
                        <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full', selected ? 'bg-white/20' : 'bg-muted')}>
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Selection chips */}
          {scope !== 'individual' && selectionChips.length > 0 && (
            <div className="flex flex-wrap gap-1.5 p-2 border rounded-md bg-muted/30 max-h-20 overflow-y-auto">
              {selectionChips.map(c => (
                <Badge key={c.key} variant="secondary" className="text-[10px] gap-1 pl-2 pr-1 py-0.5">
                  {c.label}
                  <button onClick={c.onRemove} className="hover:bg-muted rounded-sm p-0.5" aria-label="Remove">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
              <button onClick={clearScopeSelection} className="text-[10px] underline text-muted-foreground ml-1">
                clear all
              </button>
            </div>
          )}

          {/* Team filter */}
          <div>
            <Label className="text-xs flex items-center gap-1 mb-1">
              <Users className="h-3 w-3" /> Teams
              <span className="text-muted-foreground font-normal">
                ({selectedTeams.size === 0 ? 'all' : `${selectedTeams.size} selected`})
              </span>
              {selectedTeams.size > 0 && (
                <button className="ml-auto text-[10px] underline text-muted-foreground" onClick={() => setSelectedTeams(new Set())}>
                  clear
                </button>
              )}
            </Label>
            <div className="flex flex-wrap gap-1.5 p-2 border rounded-md bg-muted/30 max-h-24 overflow-y-auto">
              {allTeams.length === 0 && <span className="text-xs text-muted-foreground">No teams in current jobs.</span>}
              {allTeams.map(t => (
                <Badge
                  key={t}
                  variant={selectedTeams.has(t) ? 'default' : 'outline'}
                  className="cursor-pointer text-[10px]"
                  onClick={() => toggleTeam(t)}
                >
                  {t}
                </Badge>
              ))}
            </div>
          </div>

          {/* Preview list */}
          <div className="flex-1 min-h-0 border rounded-md overflow-hidden flex flex-col">
            <div
              className="px-3 py-2 border-b bg-muted/60 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground items-center grid gap-3"
              style={{ gridTemplateColumns: scope === 'individual' ? `1.25rem ${COLS}` : COLS }}
            >
              {scope === 'individual' && <span />}
              <span>Job / Tenant</span>
              <span>Team</span>
              <span>Booked</span>
              <span className="flex items-center justify-center gap-1">
                <ImageIcon className="h-3 w-3" /> Media
              </span>
            </div>

            <div className="px-3 py-1.5 border-b bg-muted/30 flex items-center justify-between text-xs gap-2">
              <span className="font-semibold">
                {scope === 'individual'
                  ? `${selectedIds.size} selected of ${teamFiltered.length}`
                  : `${finalJobs.length} job${finalJobs.length === 1 ? '' : 's'}`}
              </span>
              <div className="flex items-center gap-2">
                {loadingMedia && (
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" /> loading media…
                  </span>
                )}
                {verifyAccuracy && (
                  <button
                    onClick={runAccuracyCheck}
                    title={`Local cache: ${accuracy.local}  ·  Database: ${accuracy.db}${accuracy.checkedAt ? `  ·  checked ${format(new Date(accuracy.checkedAt), 'HH:mm:ss')}` : ''}`}
                    className={cn(
                      'flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-medium transition',
                      accuracy.checking && 'opacity-70',
                      accuracy.ok
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                        : 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100 animate-pulse'
                    )}
                  >
                    {accuracy.checking
                      ? <Loader2 className="h-3 w-3 animate-spin" />
                      : accuracy.ok
                        ? <CheckCircle2 className="h-3 w-3" />
                        : <X className="h-3 w-3" />}
                    {accuracy.checking
                      ? 'Verifying…'
                      : accuracy.ok
                        ? `DB synced (${accuracy.db})`
                        : `Drift: local ${accuracy.local} ≠ DB ${accuracy.db} — click to resync`}
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
              <div className="divide-y">
                {!hasAnyDateSelection && (
                  <div className="p-6 text-center text-sm text-muted-foreground">
                    Pick one or more {scope}s above to begin.
                  </div>
                )}
                {hasAnyDateSelection && teamFiltered.length === 0 && (
                  <div className="p-6 text-center text-sm text-muted-foreground">
                    No jobs match the current filters.
                  </div>
                )}
                {teamFiltered.map(j => {
                  const media = hasMedia(j);
                  const checked = scope === 'individual' && selectedIds.has(j.id);
                  return (
                    <div
                      key={j.id}
                      className={cn(
                        'px-3 py-2 text-sm items-center grid gap-3',
                        scope === 'individual' && 'cursor-pointer hover:bg-muted/40'
                      )}
                      style={{ gridTemplateColumns: scope === 'individual' ? `1.25rem ${COLS}` : COLS }}
                      onClick={() => scope === 'individual' && toggleId(j.id)}
                    >
                      {scope === 'individual' && (
                        <Checkbox checked={checked} onCheckedChange={() => toggleId(j.id)} />
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs">#{j.jobNumber}</span>
                          <span className="truncate">{j.name}</span>
                        </div>
                        <div className="text-[11px] text-muted-foreground truncate">{j.address}</div>
                      </div>
                      <div className="text-[10px] text-muted-foreground truncate">
                        {[j.team, j.team2].filter(Boolean).join(' + ') || '—'}
                      </div>
                      <div className="text-[10px] text-muted-foreground truncate">
                        {j.bookedDate ? format(new Date(j.bookedDate), 'dd MMM') : '—'}
                      </div>
                      <div className="flex justify-center">
                        {media
                          ? <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                          : <span className="inline-block h-3.5 w-3.5 border rounded-sm" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          {scope === 'individual' && teamFiltered.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setSelectedIds(prev =>
                  prev.size === teamFiltered.length
                    ? new Set()
                    : new Set(teamFiltered.map(j => j.id))
                )
              }
            >
              {selectedIds.size === teamFiltered.length ? 'Clear all' : 'Select all'}
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button onClick={generatePdf} disabled={finalJobs.length === 0}>
            <FileDown className="h-4 w-4 mr-1.5" /> Generate PDF ({finalJobs.length})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
