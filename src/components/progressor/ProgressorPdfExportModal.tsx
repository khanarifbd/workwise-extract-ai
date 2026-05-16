import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
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
  CalendarIcon, Users, X,
} from 'lucide-react';
import {
  format, startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  isSameDay, isSameMonth, getISOWeek,
} from 'date-fns';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { downloadPDF } from '@/lib/pdfDownload';
import { IncompleteJob } from '@/hooks/useProgressorIncompleteJobs';
import { assertCount } from '@/lib/metricsIntegrity';
import { cn } from '@/lib/utils';
import { CheckCircle2 } from 'lucide-react';

type Scope = 'day' | 'week' | 'month' | 'individual';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  jobs: IncompleteJob[];
}

// Key helpers
const dayKey = (d: Date) => format(d, 'yyyy-MM-dd');
const weekKey = (d: Date) => format(startOfWeek(d, { weekStartsOn: 1 }), 'yyyy-MM-dd');
const monthKey = (d: Date) => format(d, 'yyyy-MM');

export function ProgressorPdfExportModal({ open, onOpenChange, jobs }: Props) {
  const { toast } = useToast();

  const [scope, setScope] = useState<Scope>('week');
  // Multi-select anchors per scope
  const [selectedDays, setSelectedDays] = useState<Date[]>([]);
  const [selectedWeeks, setSelectedWeeks] = useState<Date[]>([]); // store week-start dates
  const [selectedMonths, setSelectedMonths] = useState<Date[]>([]); // store month-start dates
  const [selectedTeams, setSelectedTeams] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => { setSelectedIds(new Set()); }, [scope]);

  // Build set of allowed date-keys for filtering
  const allowedDayKeys = useMemo(() => {
    const s = new Set<string>();
    if (scope === 'day') {
      selectedDays.forEach(d => s.add(dayKey(d)));
    } else if (scope === 'week') {
      selectedWeeks.forEach(wkStart => {
        const start = startOfWeek(wkStart, { weekStartsOn: 1 });
        for (let i = 0; i < 7; i++) {
          const d = new Date(start); d.setDate(start.getDate() + i);
          s.add(dayKey(d));
        }
      });
    } else if (scope === 'month') {
      selectedMonths.forEach(m => {
        const start = startOfMonth(m);
        const end = endOfMonth(m);
        const cur = new Date(start);
        while (cur <= end) { s.add(dayKey(cur)); cur.setDate(cur.getDate() + 1); }
      });
    }
    return s;
  }, [scope, selectedDays, selectedWeeks, selectedMonths]);

  const hasAnyDateSelection =
    (scope === 'day' && selectedDays.length > 0) ||
    (scope === 'week' && selectedWeeks.length > 0) ||
    (scope === 'month' && selectedMonths.length > 0) ||
    scope === 'individual';

  // Teams
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
      // bookedDate is local YYYY-MM-DD; normalize
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

  // Media map
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

  // Accuracy checksum
  useEffect(() => {
    if (!open) return;
    const recomputed = (scope === 'individual')
      ? teamFiltered.filter(j => selectedIds.has(j.id)).length
      : teamFiltered.length;
    assertCount('progressor-export:finalJobs', finalJobs.length, recomputed);
  }, [open, finalJobs, teamFiltered, selectedIds, scope]);

  // Toggle helpers (multi-select)
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

  const toggleTeam = (t: string) => setSelectedTeams(p => {
    const n = new Set(p); n.has(t) ? n.delete(t) : n.add(t); return n;
  });
  const toggleId = (id: string) => setSelectedIds(p => {
    const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  // Pretty chips of selections
  const selectionChips = useMemo(() => {
    if (scope === 'day') {
      return selectedDays
        .slice()
        .sort((a, b) => a.getTime() - b.getTime())
        .map(d => ({ key: dayKey(d), label: format(d, 'EEE dd MMM'), onRemove: () => toggleDay(d) }));
    }
    if (scope === 'week') {
      return selectedWeeks
        .slice()
        .sort((a, b) => a.getTime() - b.getTime())
        .map(d => ({
          key: weekKey(d),
          label: `W${getISOWeek(d)} · ${format(d, 'dd MMM')}–${format(endOfWeek(d, { weekStartsOn: 1 }), 'dd MMM')}`,
          onRemove: () => toggleWeek(d),
        }));
    }
    if (scope === 'month') {
      return selectedMonths
        .slice()
        .sort((a, b) => a.getTime() - b.getTime())
        .map(d => ({ key: monthKey(d), label: format(d, 'MMM yyyy'), onRemove: () => toggleMonth(d) }));
    }
    return [];
  }, [scope, selectedDays, selectedWeeks, selectedMonths]);

  const clearScopeSelection = () => {
    if (scope === 'day') setSelectedDays([]);
    if (scope === 'week') setSelectedWeeks([]);
    if (scope === 'month') setSelectedMonths([]);
  };

  // Build calendar modifiers to highlight selections
  const calendarSelected: Date[] = useMemo(() => {
    if (scope === 'day') return selectedDays;
    if (scope === 'week') {
      const out: Date[] = [];
      selectedWeeks.forEach(wk => {
        for (let i = 0; i < 7; i++) {
          const d = new Date(wk); d.setDate(wk.getDate() + i);
          out.push(d);
        }
      });
      return out;
    }
    if (scope === 'month') {
      const out: Date[] = [];
      selectedMonths.forEach(m => {
        const start = startOfMonth(m); const end = endOfMonth(m);
        const cur = new Date(start);
        while (cur <= end) { out.push(new Date(cur)); cur.setDate(cur.getDate() + 1); }
      });
      return out;
    }
    return [];
  }, [scope, selectedDays, selectedWeeks, selectedMonths]);

  // PDF
  const generatePdf = () => {
    if (finalJobs.length === 0) {
      toast({ title: 'Nothing to export', description: 'No jobs match your filters.', variant: 'destructive' });
      return;
    }
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

    const rows = finalJobs.map(j => [
      j.jobNumber,
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
  };

  const COLS = 'minmax(0,1fr) 8rem 6rem 3rem';

  // Picker button label
  const pickerLabel = useMemo(() => {
    if (scope === 'individual') return '';
    const n = selectionChips.length;
    if (n === 0) return `Pick ${scope}${scope === 'day' ? 's' : 's'}…`;
    if (n === 1) return selectionChips[0].label;
    return `${n} ${scope}s selected`;
  }, [scope, selectionChips]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileDown className="h-5 w-5 text-progressor" /> Export Jobs PDF
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 flex flex-col gap-3 overflow-hidden">
          {/* Scope tabs */}
          <Tabs value={scope} onValueChange={(v) => setScope(v as Scope)}>
            <TabsList className="grid grid-cols-4 w-full h-10">
              <TabsTrigger value="day">Days</TabsTrigger>
              <TabsTrigger value="week">Weeks</TabsTrigger>
              <TabsTrigger value="month">Months</TabsTrigger>
              <TabsTrigger value="individual">Individual</TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Multi-pick calendar */}
          {scope !== 'individual' && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="flex-1 h-10 justify-start font-medium">
                      <CalendarIcon className="h-4 w-4 mr-2 text-progressor" />
                      {pickerLabel}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <div className="px-3 pt-3 pb-1 text-[11px] text-muted-foreground">
                      {scope === 'day' && 'Click days to toggle. Multi-select supported.'}
                      {scope === 'week' && 'Click any day to toggle that whole week.'}
                      {scope === 'month' && 'Click any day to toggle that whole month.'}
                    </div>
                    <Calendar
                      mode="multiple"
                      selected={calendarSelected}
                      onDayClick={(d) => {
                        if (scope === 'day') toggleDay(d);
                        else if (scope === 'week') toggleWeek(d);
                        else if (scope === 'month') toggleMonth(d);
                      }}
                      weekStartsOn={1}
                      showOutsideDays
                      initialFocus
                      className={cn('p-3 pointer-events-auto')}
                    />
                    <div className="flex items-center justify-between px-3 py-2 border-t">
                      <button
                        className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
                        onClick={clearScopeSelection}
                        disabled={selectionChips.length === 0}
                      >
                        Clear
                      </button>
                      <button
                        className="text-xs text-progressor font-medium"
                        onClick={() => {
                          const today = new Date();
                          if (scope === 'day') toggleDay(today);
                          else if (scope === 'week') toggleWeek(today);
                          else if (scope === 'month') toggleMonth(today);
                        }}
                      >
                        + {scope === 'day' ? 'Today' : scope === 'week' ? 'This week' : 'This month'}
                      </button>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>

              {/* Selection chips */}
              {selectionChips.length > 0 && (
                <div className="flex flex-wrap gap-1.5 p-2 border rounded-md bg-muted/30 max-h-20 overflow-y-auto">
                  {selectionChips.map(c => (
                    <Badge key={c.key} variant="secondary" className="text-[10px] gap-1 pl-2 pr-1 py-0.5">
                      {c.label}
                      <button onClick={c.onRemove} className="hover:bg-muted rounded-sm p-0.5" aria-label="Remove">
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                  <button
                    onClick={clearScopeSelection}
                    className="text-[10px] underline text-muted-foreground ml-1"
                  >
                    clear all
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Team filter chips */}
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

            <div className="px-3 py-1.5 border-b bg-muted/30 flex items-center justify-between text-xs">
              <span className="font-semibold">
                {scope === 'individual'
                  ? `${selectedIds.size} selected of ${teamFiltered.length}`
                  : `${finalJobs.length} job${finalJobs.length === 1 ? '' : 's'}`}
              </span>
              {loadingMedia && (
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> loading media…
                </span>
              )}
            </div>

            <ScrollArea className="flex-1">
              <div className="divide-y">
                {!hasAnyDateSelection && scope !== 'individual' && (
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
            </ScrollArea>
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
