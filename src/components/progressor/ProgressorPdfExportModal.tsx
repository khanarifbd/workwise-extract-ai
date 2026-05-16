import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, FileDown, Filter, CheckCircle2, Image as ImageIcon, FileText } from 'lucide-react';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, isWithinInterval, parseISO } from 'date-fns';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { downloadPDF } from '@/lib/pdfDownload';
import { IncompleteJob } from '@/hooks/useProgressorIncompleteJobs';

type Scope = 'day' | 'week' | 'month' | 'individual';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** All overdue DM + A&A jobs already loaded in the workspace. */
  jobs: IncompleteJob[];
}

interface TeamUpdateInfo {
  hasMedia: boolean;
  notes: string;
}

export function ProgressorPdfExportModal({ open, onOpenChange, jobs }: Props) {
  const { toast } = useToast();

  // ── Filters ─────────────────────────────────────────
  const [scope, setScope] = useState<Scope>('week');
  const [anchorDate, setAnchorDate] = useState<string>(() => format(new Date(), 'yyyy-MM-dd'));
  const [selectedTeams, setSelectedTeams] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // ── Team list derived from jobs ────────────────────
  const allTeams = useMemo(() => {
    const s = new Set<string>();
    jobs.forEach(j => { if (j.team) s.add(j.team); if (j.team2) s.add(j.team2); });
    return Array.from(s).sort();
  }, [jobs]);

  // ── Date scope filter ──────────────────────────────
  const dateFiltered = useMemo(() => {
    if (scope === 'individual') return jobs;
    const anchor = parseISO(anchorDate);
    let start: Date, end: Date;
    if (scope === 'day') { start = new Date(anchor); start.setHours(0,0,0,0); end = new Date(anchor); end.setHours(23,59,59,999); }
    else if (scope === 'week') { start = startOfWeek(anchor, { weekStartsOn: 1 }); end = endOfWeek(anchor, { weekStartsOn: 1 }); }
    else { start = startOfMonth(anchor); end = endOfMonth(anchor); }
    return jobs.filter(j => j.bookedDate && isWithinInterval(new Date(j.bookedDate), { start, end }));
  }, [jobs, scope, anchorDate]);

  const teamFiltered = useMemo(() => {
    if (selectedTeams.size === 0) return dateFiltered;
    return dateFiltered.filter(j =>
      (j.team && selectedTeams.has(j.team)) || (j.team2 && selectedTeams.has(j.team2))
    );
  }, [dateFiltered, selectedTeams]);

  /** Final list shown in preview & exported. In individual mode we only export selected ids. */
  const finalJobs = useMemo(() => {
    if (scope === 'individual') return teamFiltered.filter(j => selectedIds.has(j.id));
    return teamFiltered;
  }, [scope, teamFiltered, selectedIds]);

  // ── Pull team_job_updates for the candidate jobs to detect media + team notes ──
  const candidateIds = useMemo(() => teamFiltered.map(j => j.id), [teamFiltered]);
  const [updateMap, setUpdateMap] = useState<Record<string, TeamUpdateInfo>>({});
  const [loadingUpdates, setLoadingUpdates] = useState(false);

  useEffect(() => {
    if (!open || candidateIds.length === 0) { setUpdateMap({}); return; }
    let cancelled = false;
    (async () => {
      setLoadingUpdates(true);
      try {
        const { data, error } = await supabase
          .from('team_job_updates')
          .select('job_id, photos, notes')
          .in('job_id', candidateIds)
          .limit(5000);
        if (error) throw error;
        const map: Record<string, TeamUpdateInfo> = {};
        (data || []).forEach((row: any) => {
          const cur = map[row.job_id] || { hasMedia: false, notes: '' };
          cur.hasMedia = cur.hasMedia || (Array.isArray(row.photos) && row.photos.length > 0);
          if (row.notes) cur.notes = (cur.notes ? cur.notes + '\n' : '') + row.notes;
          map[row.job_id] = cur;
        });
        if (!cancelled) setUpdateMap(map);
      } catch (e) {
        console.error('team_job_updates fetch', e);
      } finally {
        if (!cancelled) setLoadingUpdates(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, candidateIds.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Media + description tickbox detection ──────────
  const hasMedia = (j: IncompleteJob): boolean => {
    if (j.attachments && j.attachments.length > 0) return true;
    return !!updateMap[j.id]?.hasMedia;
  };

  // ── AI gauge for "team description present" ────────
  const [aiMap, setAiMap] = useState<Record<string, boolean>>({});
  const [aiLoading, setAiLoading] = useState(false);

  const runAiScan = async (list: IncompleteJob[]) => {
    setAiLoading(true);
    try {
      const payload = list.map(j => ({
        id: j.id,
        jobNumber: j.jobNumber,
        text: [j.description || '', j.privateNotes || '', updateMap[j.id]?.notes || '']
          .filter(Boolean).join('\n---\n'),
      }));
      const { data, error } = await supabase.functions.invoke('gauge-team-description', {
        body: { jobs: payload },
      });
      if (error) throw error;
      setAiMap(prev => ({ ...prev, ...(data?.results || {}) }));
    } catch (e: any) {
      toast({ title: 'AI scan failed', description: e.message ?? 'Unknown error', variant: 'destructive' });
    } finally {
      setAiLoading(false);
    }
  };

  // Auto-run AI scan whenever the final list changes meaningfully
  useEffect(() => {
    if (!open) return;
    if (finalJobs.length === 0) return;
    const missing = finalJobs.filter(j => !(j.id in aiMap));
    if (missing.length > 0) runAiScan(missing);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, finalJobs.map(j => j.id).join(','), Object.keys(updateMap).length]);

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
    if (scope !== 'individual') subtitle += `  ·  Anchor: ${format(parseISO(anchorDate), 'dd MMM yyyy')}`;
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
      aiMap[j.id] ? '[X]' : '[  ]',
    ]);

    autoTable(doc, {
      startY: 34,
      head: [['Job #', 'Tenant', 'Address', 'Team', 'Booked', 'Media', 'Team Desc']],
      body: rows,
      styles: { fontSize: 8.5, cellPadding: 2.5, valign: 'middle' },
      headStyles: { fillColor: [51, 65, 85], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 22, fontStyle: 'bold' },
        1: { cellWidth: 40 },
        2: { cellWidth: 78 },
        3: { cellWidth: 42 },
        4: { cellWidth: 32 },
        5: { cellWidth: 18, halign: 'center' },
        6: { cellWidth: 24, halign: 'center' },
      },
      margin: { left: 10, right: 10 },
    });

    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(7); doc.setTextColor(140);
      doc.text(
        `Page ${i} of ${pageCount}  ·  Tickboxes: Media = team has uploaded photos; Team Desc = team has written completion notes`,
        pw / 2, doc.internal.pageSize.height - 6, { align: 'center' },
      );
    }

    const fname = `progressor-jobs-${scope}-${format(new Date(), 'yyyy-MM-dd-HHmm')}.pdf`;
    downloadPDF(doc, fname);
    toast({ title: 'PDF generated', description: `${finalJobs.length} jobs exported.` });
  };

  // ── Render ─────────────────────────────────────────
  const toggleTeam = (t: string) => setSelectedTeams(p => {
    const n = new Set(p); n.has(t) ? n.delete(t) : n.add(t); return n;
  });
  const toggleId = (id: string) => setSelectedIds(p => {
    const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

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
            <TabsList className="grid grid-cols-4 w-full">
              <TabsTrigger value="day">Day</TabsTrigger>
              <TabsTrigger value="week">Week</TabsTrigger>
              <TabsTrigger value="month">Month</TabsTrigger>
              <TabsTrigger value="individual">Individual</TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Filters row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {scope !== 'individual' && (
              <div>
                <Label className="text-xs">Anchor date</Label>
                <Input type="date" value={anchorDate} onChange={(e) => setAnchorDate(e.target.value)} className="h-9" />
              </div>
            )}
            <div className={scope === 'individual' ? 'md:col-span-2' : ''}>
              <Label className="text-xs flex items-center gap-1"><Filter className="h-3 w-3" /> Teams (none = all)</Label>
              <div className="flex flex-wrap gap-1.5 mt-1 p-2 border rounded-md bg-muted/30 max-h-24 overflow-y-auto">
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
          </div>

          {/* Preview list */}
          <div className="flex-1 min-h-0 border rounded-md overflow-hidden flex flex-col">
            <div className="px-3 py-2 border-b bg-muted/50 flex items-center justify-between text-xs">
              <span className="font-semibold">
                {scope === 'individual'
                  ? `${selectedIds.size} selected of ${teamFiltered.length}`
                  : `${finalJobs.length} jobs`}
              </span>
              <div className="flex items-center gap-3 text-muted-foreground">
                {loadingUpdates && <span className="flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> media…</span>}
                {aiLoading && <span className="flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> ai…</span>}
                <span className="flex items-center gap-1"><ImageIcon className="h-3 w-3" /> Media</span>
                <span className="flex items-center gap-1"><FileText className="h-3 w-3" /> Team desc</span>
              </div>
            </div>
            <ScrollArea className="flex-1">
              <div className="divide-y">
                {teamFiltered.length === 0 && (
                  <div className="p-6 text-center text-sm text-muted-foreground">No jobs match the current filters.</div>
                )}
                {teamFiltered.map(j => {
                  const media = hasMedia(j);
                  const desc = aiMap[j.id];
                  const checked = scope === 'individual' && selectedIds.has(j.id);
                  return (
                    <div
                      key={j.id}
                      className={`px-3 py-2 flex items-center gap-3 text-sm ${scope === 'individual' ? 'cursor-pointer hover:bg-muted/40' : ''}`}
                      onClick={() => scope === 'individual' && toggleId(j.id)}
                    >
                      {scope === 'individual' && (
                        <Checkbox checked={checked} onCheckedChange={() => toggleId(j.id)} />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs">#{j.jobNumber}</span>
                          <span className="truncate">{j.name}</span>
                        </div>
                        <div className="text-[11px] text-muted-foreground truncate">{j.address}</div>
                      </div>
                      <div className="text-[10px] text-muted-foreground w-28 truncate">
                        {[j.team, j.team2].filter(Boolean).join(' + ') || '—'}
                      </div>
                      <div className="text-[10px] text-muted-foreground w-24 truncate">
                        {j.bookedDate ? format(new Date(j.bookedDate), 'dd MMM') : '—'}
                      </div>
                      <div className="w-6 flex justify-center">
                        {media
                          ? <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                          : <span className="inline-block h-3.5 w-3.5 border rounded-sm" />}
                      </div>
                      <div className="w-6 flex justify-center">
                        {desc === undefined
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                          : desc
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
          {scope === 'individual' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedIds(new Set(teamFiltered.map(j => j.id)))}
            >Select all</Button>
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
