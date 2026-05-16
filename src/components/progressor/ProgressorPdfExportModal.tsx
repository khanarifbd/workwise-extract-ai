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
  Loader2, FileDown, Filter, CheckCircle2, Image as ImageIcon,
  ChevronLeft, ChevronRight, CalendarIcon, Users,
} from 'lucide-react';
import {
  format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, isWithinInterval,
  addDays, addWeeks, addMonths, isSameDay, getISOWeek,
} from 'date-fns';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { downloadPDF } from '@/lib/pdfDownload';
import { IncompleteJob } from '@/hooks/useProgressorIncompleteJobs';
import { assertCount } from '@/lib/metricsIntegrity';
import { cn } from '@/lib/utils';

type Scope = 'day' | 'week' | 'month' | 'individual';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  jobs: IncompleteJob[];
}

export function ProgressorPdfExportModal({ open, onOpenChange, jobs }: Props) {
  const { toast } = useToast();

  // ── Scope state ────────────────────────────────────
  const [scope, setScope] = useState<Scope>('week');
  const [anchor, setAnchor] = useState<Date>(() => new Date());
  const [selectedTeams, setSelectedTeams] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Reset selection when scope changes
  useEffect(() => { setSelectedIds(new Set()); }, [scope]);

  // ── Compute window ─────────────────────────────────
  const window = useMemo(() => {
    const a = new Date(anchor);
    if (scope === 'day') {
      const start = new Date(a); start.setHours(0,0,0,0);
      const end   = new Date(a); end.setHours(23,59,59,999);
      return { start, end };
    }
    if (scope === 'week')  return { start: startOfWeek(a, { weekStartsOn: 1 }), end: endOfWeek(a, { weekStartsOn: 1 }) };
    if (scope === 'month') return { start: startOfMonth(a), end: endOfMonth(a) };
    return null;
  }, [scope, anchor]);

  // ── Navigation ─────────────────────────────────────
  const shift = (dir: -1 | 1) => {
    setAnchor(prev =>
      scope === 'day'   ? addDays(prev, dir)
      : scope === 'week'  ? addWeeks(prev, dir)
      : scope === 'month' ? addMonths(prev, dir)
      : prev
    );
  };

  // ── Team list ──────────────────────────────────────
  const allTeams = useMemo(() => {
    const s = new Set<string>();
    jobs.forEach(j => { if (j.team) s.add(j.team); if (j.team2) s.add(j.team2); });
    return Array.from(s).sort();
  }, [jobs]);

  // ── Date filtered ──────────────────────────────────
  const dateFiltered = useMemo(() => {
    if (scope === 'individual' || !window) return jobs;
    return jobs.filter(j => j.bookedDate && isWithinInterval(new Date(j.bookedDate), window));
  }, [jobs, scope, window]);

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

  // ── Pull team_job_updates for media detection ──────
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

  // ── Accuracy checksum: verify the preview count reconciles ─────────────
  useEffect(() => {
    if (!open) return;
    // recompute independently and compare
    const recomputed = (scope === 'individual')
      ? teamFiltered.filter(j => selectedIds.has(j.id)).length
      : teamFiltered.length;
    assertCount('progressor-export:finalJobs', finalJobs.length, recomputed);
    // every job in finalJobs must be in source jobs[]
    const sourceIds = new Set(jobs.map(j => j.id));
    const drift = finalJobs.filter(j => !sourceIds.has(j.id)).length;
    if (drift > 0) {
      // eslint-disable-next-line no-console
      console.warn('[progressor-export] drift: jobs in preview not in source', drift);
    }
  }, [open, finalJobs, teamFiltered, selectedIds, scope, jobs]);

  // ── PDF generation ─────────────────────────────────
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
    if (window) subtitle += `  ·  ${format(window.start, 'dd MMM')} – ${format(window.end, 'dd MMM yyyy')}`;
    if (selectedTeams.size > 0) subtitle += `  ·  Teams: ${Array.from(selectedTeams).join(', ')}`;
    subtitle += `  ·  ${finalJobs.length} job${finalJobs.length === 1 ? '' : 's'}`;
    doc.setTextColor(80); doc.setFontSize(9);
    doc.text(subtitle, 14, 28);

    const rows = finalJobs.map(j => [
      j.jobNumber,
      j.name || '—',
      j.address || '—',
      [j.team, j.team2].filter(Boolean).join(' + ') || '—',
      j.bookedDate ? format(new Date(j.bookedDate), 'EEE dd MMM') : '—',
      hasMedia(j) ? '[X]' : '[  ]',
    ]);

    autoTable(doc, {
      startY: 34,
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

  const toggleTeam = (t: string) => setSelectedTeams(p => {
    const n = new Set(p); n.has(t) ? n.delete(t) : n.add(t); return n;
  });
  const toggleId = (id: string) => setSelectedIds(p => {
    const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  // ── Scope label for the picker button ──────────────
  const scopeLabel = useMemo(() => {
    if (scope === 'day')   return format(anchor, 'EEE dd MMM yyyy');
    if (scope === 'week')  return `Week ${getISOWeek(anchor)}  ·  ${format(startOfWeek(anchor,{weekStartsOn:1}),'dd MMM')} – ${format(endOfWeek(anchor,{weekStartsOn:1}),'dd MMM yyyy')}`;
    if (scope === 'month') return format(anchor, 'MMMM yyyy');
    return 'Pick jobs manually';
  }, [scope, anchor]);

  // Column template: name(flex) · team(w-32) · date(w-24) · media(w-12)
  const COLS = 'minmax(0,1fr) 8rem 6rem 3rem';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileDown className="h-5 w-5 text-progressor" /> Export Jobs PDF
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 flex flex-col gap-3 overflow-hidden">
          {/* ── Scope tabs ─────────────────────────────── */}
          <Tabs value={scope} onValueChange={(v) => setScope(v as Scope)}>
            <TabsList className="grid grid-cols-4 w-full h-10">
              <TabsTrigger value="day">Day</TabsTrigger>
              <TabsTrigger value="week">Week</TabsTrigger>
              <TabsTrigger value="month">Month</TabsTrigger>
              <TabsTrigger value="individual">Individual</TabsTrigger>
            </TabsList>
          </Tabs>

          {/* ── Date navigator ─────────────────────────── */}
          {scope !== 'individual' && (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" className="h-10 w-10 shrink-0" onClick={() => shift(-1)} aria-label="Previous">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="flex-1 h-10 justify-start font-medium">
                    <CalendarIcon className="h-4 w-4 mr-2 text-progressor" />
                    {scopeLabel}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={anchor}
                    onSelect={(d) => d && setAnchor(d)}
                    weekStartsOn={1}
                    showOutsideDays
                    modifiers={
                      scope === 'week' && window
                        ? { range: { from: window.start, to: window.end } }
                        : scope === 'month' && window
                          ? { range: { from: window.start, to: window.end } }
                          : undefined
                    }
                    modifiersClassNames={{ range: 'bg-progressor/20 text-foreground' }}
                    initialFocus
                    className={cn('p-3 pointer-events-auto')}
                  />
                </PopoverContent>
              </Popover>
              <Button variant="outline" size="icon" className="h-10 w-10 shrink-0" onClick={() => shift(1)} aria-label="Next">
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" className="h-10" onClick={() => setAnchor(new Date())} disabled={isSameDay(anchor, new Date())}>
                Today
              </Button>
            </div>
          )}

          {/* ── Team filter chips ──────────────────────── */}
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

          {/* ── Preview list (aligned grid) ─────────────── */}
          <div className="flex-1 min-h-0 border rounded-md overflow-hidden flex flex-col">
            {/* Header row */}
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

            {/* Status strip */}
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
                {teamFiltered.length === 0 && (
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
