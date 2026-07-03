import { useState, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { FileText, Calendar as CalendarIcon } from 'lucide-react';
import { Job, ScheduledTrade } from '@/types/job';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { downloadPDF, preparePDFWindow } from '@/lib/pdfDownload';
import {
  format,
  isWithinInterval,
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
} from 'date-fns';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useTeamAccessCodes } from '@/hooks/useTeamAccessCodes';

type RangeMode = 'day' | 'week' | 'month';
const ALL_TEAMS_VALUE = '__all__';

interface Props {
  jobs: Job[];
  categoryName?: string;
}

const stripHtml = (s: string | null | undefined) =>
  (s ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const isCompleteJob = (job: Job) => job.status === 'complete' || job.isCompleted;

const isBookedJob = (job: Job) => Boolean(job.bookedDate);

const normalizeTeamName = (name: string | null | undefined) => (name ?? '').trim().toLowerCase();

export const CompletedJobInvoicePDFButton = ({ jobs, categoryName = 'Damp & Mold' }: Props) => {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<RangeMode>('month');
  const [anchorDate, setAnchorDate] = useState<Date>(new Date());
  const [teamFilter, setTeamFilter] = useState<string>(ALL_TEAMS_VALUE);

  const range = useMemo(() => {
    if (mode === 'day') return { start: startOfDay(anchorDate), end: endOfDay(anchorDate) };
    if (mode === 'week')
      return {
        start: startOfWeek(anchorDate, { weekStartsOn: 1 }),
        end: endOfWeek(anchorDate, { weekStartsOn: 1 }),
      };
    return { start: startOfMonth(anchorDate), end: endOfMonth(anchorDate) };
  }, [mode, anchorDate]);

  const invoiceEligibleJobs = useMemo(
    () => jobs.filter((j) => isCompleteJob(j) || isBookedJob(j) || j.isOngoing),
    [jobs],
  );

  // Include booked, completed, and ongoing jobs if their booked OR completion date
  // falls inside the selected period. This keeps May booked jobs such as N2640150
  // in the May invoice even when completion is recorded later.
  const inRange = useCallback((job: Job) => {
    const b = job.bookedDate ? new Date(job.bookedDate) : null;
    const c = job.completionDate ? new Date(job.completionDate) : null;
    if (b && isWithinInterval(b, range)) return true;
    if (c && isWithinInterval(c, range)) return true;
    return false;
  }, [range]);

  const { codes: allTeamCodes } = useTeamAccessCodes();

  const availableTeams = useMemo(() => {
    // Only show teams that actually have jobs in this category. Case-insensitive
    // dedupe so "YAM" and "Yam" don't appear twice. Prefer the canonical roster
    // spelling from team_access_codes when available (fixes typos like Shakhti vs Shakthi).
    const canonical = new Map<string, string>();
    allTeamCodes.forEach((c) => {
      if (!c.isActive || !c.teamName) return;
      const key = normalizeTeamName(c.teamName);
      if (key && !canonical.has(key)) canonical.set(key, c.teamName.trim());
    });
    const map = new Map<string, string>();
    const add = (name?: string | null) => {
      if (!name) return;
      const key = normalizeTeamName(name);
      if (!key) return;
      if (!map.has(key)) map.set(key, canonical.get(key) ?? name.trim());
    };
    invoiceEligibleJobs.forEach((j) => { add(j.team); add(j.team2); });
    return Array.from(map.values()).sort((a, b) => a.localeCompare(b));
  }, [invoiceEligibleJobs, allTeamCodes]);

  const filteredJobs = useMemo(
    () => invoiceEligibleJobs.filter((j) => {
      if (!inRange(j)) return false;
      if (teamFilter === ALL_TEAMS_VALUE) return true;
      const target = normalizeTeamName(teamFilter);
      const t1 = normalizeTeamName(j.team);
      const t2 = normalizeTeamName(j.team2);
      return t1 === target || t2 === target;
    }),
    [invoiceEligibleJobs, inRange, teamFilter],
  );

  const isSelectedTeamValid = useMemo(() => {
    if (teamFilter === ALL_TEAMS_VALUE) return true;
    const target = normalizeTeamName(teamFilter);
    return availableTeams.some((team) => normalizeTeamName(team) === target);
  }, [availableTeams, teamFilter]);

  const hasRequiredInputs = Boolean(mode && anchorDate && teamFilter && isSelectedTeamValid);

  const handleTeamSelect = useCallback((value: string) => {
    setTeamFilter(value);
  }, []);

  const rangeLabel = useMemo(() => {
    if (mode === 'day') return format(range.start, 'EEEE, dd MMM yyyy');
    if (mode === 'week')
      return `Week of ${format(range.start, 'dd MMM')} - ${format(range.end, 'dd MMM yyyy')}`;
    return format(range.start, 'MMMM yyyy');
  }, [mode, range]);

  // Accuracy checker: verify every job in selected range has all required fields
  const accuracyReport = useMemo(() => {
    const issues: { jobNumber: string; missing: string[] }[] = [];
    filteredJobs.forEach((job) => {
      const missing: string[] = [];
      if (!job.jobNumber) missing.push('Job Number');
      if (!job.address) missing.push('Address');
      if (!job.name) missing.push('Tenant Name');
      if (!stripHtml(job.summaryOfWorks || job.description)) missing.push('Description');
      if (!stripHtml(job.progressNotes) && !stripHtml(job.ongoingReason)) missing.push('Progress / Ongoing Notes');
      if (!job.team && !job.team2) missing.push('Assigned Team');
      if (!inRange(job)) missing.push('Out of range');
      if (missing.length > 0) issues.push({ jobNumber: job.jobNumber || '(no #)', missing });
    });
    return {
      total: filteredJobs.length,
      clean: filteredJobs.length - issues.length,
      issues,
    };
  }, [filteredJobs, inRange]);

  const formatGBP = (n: number) =>
    `£${(Number.isFinite(n) ? n : 0).toFixed(2)}`;

  const handleGenerate = (targetWindow: Window | null) => {
    try {
      if (!hasRequiredInputs) {
        alert('Please select a valid team and date range before generating the invoice PDF.');
        return;
      }

      if (filteredJobs.length === 0) {
        alert('No invoice jobs found for the selected ' + mode);
        return;
      }

      const strictJobs = filteredJobs.filter(inRange);

      const doc = new jsPDF('landscape', 'mm', 'a4');

      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text('INVOICE DATA - BOOKED & COMPLETED JOBS', 14, 16);

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Category: ${categoryName}`, 14, 23);
      doc.text(`Team: ${teamFilter === ALL_TEAMS_VALUE ? 'All Teams' : teamFilter}`, 120, 23);
      doc.text(`Range (${mode}): ${rangeLabel}`, 14, 29);
      doc.text(`Generated: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 14, 35);
      doc.text(`Total Jobs: ${strictJobs.length}`, 14, 41);

      const accColor: [number, number, number] =
        accuracyReport.issues.length === 0 ? [16, 129, 81] : [185, 28, 28];
      doc.setTextColor(...accColor);
      doc.setFont('helvetica', 'bold');
      doc.text(
        `Accuracy: ${accuracyReport.clean}/${accuracyReport.total} complete${
          accuracyReport.issues.length > 0 ? ` • ${accuracyReport.issues.length} with missing fields` : ' • all fields present'
        }`,
        80,
        41,
      );
      doc.setTextColor(0, 0, 0);
      doc.setFont('helvetica', 'normal');

      const tableData = strictJobs.map((job) => {
        const ongoingInfo: string[] = [];
        const reason = stripHtml(job.ongoingReason);
        if (job.isOngoing) ongoingInfo.push('ONGOING');
        if (reason) ongoingInfo.push(reason);
        if (Array.isArray(job.scheduledTrades) && job.scheduledTrades.length > 0) {
          const trades = job.scheduledTrades
            .map((t: ScheduledTrade & { tradeType?: string }) => {
              return [t.tradeType || t.trade, t.tradesman, t.date].filter(Boolean).join(' • ');
            })
            .filter(Boolean)
            .join('\n');
          if (trades) ongoingInfo.push(trades);
        }
        const dateLine = [
          job.bookedDate ? `Booked: ${format(new Date(job.bookedDate), 'dd/MM/yyyy')}` : null,
          job.completionDate ? `Completed: ${format(new Date(job.completionDate), 'dd/MM/yyyy')}` : null,
        ].filter(Boolean).join(' • ');
        if (dateLine) ongoingInfo.unshift(dateLine);

        const teams = [job.team, job.team2].filter(Boolean).join(' + ') || '-';
        const statusLabel = isCompleteJob(job) ? 'Complete' : job.isOngoing ? 'Ongoing / Booked' : 'Booked';

        const allSors = [...(job.workItems || []), ...(job.additionalWorks || [])]
          .filter((w) => w && (w.isConfirmed !== false));
        const sorTotal = allSors.reduce((s, w) => s + (Number(w.cost) || 0) * (Number(w.qty) || 1), 0);
        const sorList = allSors.length > 0
          ? allSors
              .map((w) => {
                const code = (w.sorCode || '').trim() || 'NO-CODE';
                const desc = stripHtml(w.description) || '(no description)';
                const qty = Number(w.qty) || 1;
                const line = (Number(w.cost) || 0) * qty;
                return `• ${code} — ${desc} (x${qty}, ${formatGBP(line)})`;
              })
              .join('\n') + `\n──────\nTotal: ${formatGBP(sorTotal)} (${allSors.length} item${allSors.length === 1 ? '' : 's'})`
          : 'No SOR items';

        return [
          job.jobNumber || '-',
          statusLabel,
          job.address || '-',
          job.name || '-',
          teams,
          stripHtml(job.summaryOfWorks || job.description) || '-',
          sorList,
          ongoingInfo.join('\n') || '-',
        ];
      });

      autoTable(doc, {
        head: [['Job Number', 'Status', 'Address', 'Tenant', 'Teams', 'Description', 'SOR Codes & Descriptions', 'Notes']],
        body: tableData,
        startY: 46,
        styles: { fontSize: 7, cellPadding: 2, overflow: 'linebreak', valign: 'top' },
        headStyles: { fillColor: [34, 139, 34], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'left' },
        columnStyles: {
          0: { cellWidth: 20 }, 1: { cellWidth: 20 }, 2: { cellWidth: 36 },
          3: { cellWidth: 24 }, 4: { cellWidth: 20 }, 5: { cellWidth: 42 },
          6: { cellWidth: 64 }, 7: { cellWidth: 41 },
        },
        alternateRowStyles: { fillColor: [245, 245, 245] },
        didDrawPage: (data) => {
          const pageCount = doc.getNumberOfPages();
          doc.setFontSize(8);
          doc.text(
            `Page ${data.pageNumber} of ${pageCount}`,
            doc.internal.pageSize.width / 2,
            doc.internal.pageSize.height - 8,
            { align: 'center' },
          );
        },
      });

      // === SOR breakdown per job ===
      doc.addPage('a4', 'landscape');
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('SOR BREAKDOWN BY JOB', 14, 16);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text(`Range (${mode}): ${rangeLabel} • ${strictJobs.length} jobs`, 14, 22);

      let cursorY = 28;
      const pageHeight = doc.internal.pageSize.height;
      const pageWidth = doc.internal.pageSize.width;
      let grandTotal = 0;

      strictJobs.forEach((job) => {
        const items = [...(job.workItems || []), ...(job.additionalWorks || [])]
          .filter((w) => w && (w.isConfirmed !== false));

        if (cursorY > pageHeight - 40) {
          doc.addPage('a4', 'landscape');
          cursorY = 16;
        }
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.setFillColor(230, 240, 255);
        doc.rect(14, cursorY - 4, pageWidth - 28, 7, 'F');
        const header = `${job.jobNumber || '-'} — ${job.address || '-'} — ${job.name || '-'}`;
        doc.text(header.substring(0, 140), 16, cursorY + 1);
        cursorY += 6;

        if (items.length === 0) {
          doc.setFont('helvetica', 'italic');
          doc.setFontSize(8);
          doc.setTextColor(120, 120, 120);
          doc.text('No SOR items recorded for this job.', 16, cursorY + 4);
          doc.setTextColor(0, 0, 0);
          cursorY += 9;
          return;
        }

        const jobSubtotal = items.reduce((s, w) => s + (Number(w.cost) || 0) * (Number(w.qty) || 1), 0);
        grandTotal += jobSubtotal;

        autoTable(doc, {
          head: [['SOR Code', 'Description', 'Qty', 'Unit Cost', 'Line Total', 'Variation']],
          body: items.map((w) => {
            const qty = Number(w.qty) || 1;
            const unit = Number(w.cost) || 0;
            return [
              w.sorCode || '-',
              stripHtml(w.description) || '-',
              String(qty),
              formatGBP(unit),
              formatGBP(unit * qty),
              w.hasModification ? stripHtml(w.variation) || '-' : '-',
            ];
          }),
          foot: [['', 'Subtotal', '', '', formatGBP(jobSubtotal), '']],
          startY: cursorY,
          margin: { left: 14, right: 14 },
          styles: { fontSize: 7.5, cellPadding: 1.6, overflow: 'linebreak', valign: 'top' },
          headStyles: { fillColor: [59, 130, 246], textColor: [255, 255, 255], fontStyle: 'bold' },
          footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold' },
          columnStyles: {
            0: { cellWidth: 28 },
            1: { cellWidth: 120 },
            2: { cellWidth: 14, halign: 'right' },
            3: { cellWidth: 24, halign: 'right' },
            4: { cellWidth: 26, halign: 'right' },
            5: { cellWidth: 56 },
          },
        });
        const docAny = doc as unknown as { lastAutoTable?: { finalY: number } };
        cursorY = (docAny.lastAutoTable?.finalY ?? cursorY) + 6;
      });

      if (cursorY > pageHeight - 20) {
        doc.addPage('a4', 'landscape');
        cursorY = 16;
      }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text(`GRAND TOTAL (${strictJobs.length} jobs): ${formatGBP(grandTotal)}`, 14, cursorY + 4);

      // === Accuracy appendix ===
      doc.addPage('a4', 'landscape');
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('ACCURACY REPORT', 14, 16);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Range (${mode}): ${rangeLabel}`, 14, 23);
      doc.text(`Jobs checked: ${accuracyReport.total}`, 14, 29);
      doc.text(`Fully populated: ${accuracyReport.clean}`, 14, 35);
      doc.text(`With missing fields: ${accuracyReport.issues.length}`, 14, 41);

      if (accuracyReport.issues.length > 0) {
        autoTable(doc, {
          head: [['Job Number', 'Missing / Issue']],
          body: accuracyReport.issues.map((i) => [i.jobNumber, i.missing.join(', ')]),
          startY: 48,
          styles: { fontSize: 9, cellPadding: 2.5 },
          headStyles: { fillColor: [185, 28, 28], textColor: [255, 255, 255], fontStyle: 'bold' },
          columnStyles: { 0: { cellWidth: 40 }, 1: { cellWidth: 220 } },
        });
      } else {
        doc.setTextColor(16, 129, 81);
        doc.setFont('helvetica', 'bold');
        doc.text('All jobs in this range have complete data.', 14, 52);
        doc.setTextColor(0, 0, 0);
      }

      const stamp = format(new Date(), 'yyyyMMdd');
      const filename = `invoice-data_${mode}_${format(range.start, 'yyyyMMdd')}-${format(range.end, 'yyyyMMdd')}_${stamp}.pdf`;
      downloadPDF(doc, filename, { targetWindow });
      setIsOpen(false);
    } catch (error) {
      console.error('[invoice-pdf] generation/download failed', error);
      alert(`The invoice PDF could not be generated.\n\n${error instanceof Error ? error.message : String(error)}`);
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100 hover:text-blue-800"
          disabled={invoiceEligibleJobs.length === 0}
        >
          <FileText className="w-4 h-4 mr-2" />
          Invoice Data PDF
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(360px,calc(100vw-2rem))] max-h-[85vh] overflow-y-auto p-4" align="end">
        <div className="space-y-4">
          <div>
            <h4 className="font-medium text-sm">Completed Jobs - Invoice Data</h4>
            <p className="text-xs text-muted-foreground">
              Job number, address, tenant, description, progress &amp; ongoing info.
            </p>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Range</Label>
            <RadioGroup
              value={mode}
              onValueChange={(v) => setMode(v as RangeMode)}
              className="flex gap-3"
            >
              {(['day', 'week', 'month'] as RangeMode[]).map((m) => (
                <div key={m} className="flex items-center space-x-1">
                  <RadioGroupItem value={m} id={`invoice-mode-${m}`} />
                  <Label htmlFor={`invoice-mode-${m}`} className="text-xs capitalize cursor-pointer">
                    {m}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Team filter</Label>
            <div
              className="rounded-md border border-border bg-background overflow-y-auto overscroll-contain"
              style={{ maxHeight: 'min(50vh, 320px)', WebkitOverflowScrolling: 'touch' }}
            >
              <div className="p-1 space-y-0.5">
                {[{ value: ALL_TEAMS_VALUE, label: 'All teams' }, ...availableTeams.map((t) => ({ value: t, label: t }))].map((opt) => {
                  const active = opt.value === ALL_TEAMS_VALUE
                    ? teamFilter === ALL_TEAMS_VALUE
                    : normalizeTeamName(teamFilter) === normalizeTeamName(opt.value);
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      aria-pressed={active}
                      onPointerDown={(event) => {
                        event.preventDefault();
                        handleTeamSelect(opt.value);
                      }}
                      onClick={() => handleTeamSelect(opt.value)}
                      className={`w-full text-left text-xs px-2 py-1.5 rounded transition-colors cursor-pointer ${
                        active ? 'bg-primary/10 ring-1 ring-primary/30 font-medium' : 'hover:bg-muted'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>




          <div className="space-y-2">
            <Label className="text-xs">
              {mode === 'day' ? 'Select date' : mode === 'week' ? 'Pick any date in the week' : 'Pick any date in the month'}
            </Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="w-full justify-start text-left font-normal">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {rangeLabel}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 pointer-events-auto" align="start">
                <CalendarComponent
                  mode="single"
                  selected={anchorDate}
                  onSelect={(d) => d && setAnchorDate(d)}
                  initialFocus
                  className="pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="text-xs space-y-1">
            <div className="text-muted-foreground">
              {filteredJobs.length} booked / completed job{filteredJobs.length === 1 ? '' : 's'} in this {mode}.
            </div>
            <div className={isSelectedTeamValid ? 'text-muted-foreground' : 'text-destructive font-medium'}>
              Team: {teamFilter === ALL_TEAMS_VALUE ? 'All teams' : teamFilter}
            </div>
            {filteredJobs.length > 0 && (
              <div className={accuracyReport.issues.length === 0 ? 'text-emerald-600 font-medium' : 'text-amber-600 font-medium'}>
                Accuracy: {accuracyReport.clean}/{accuracyReport.total} fully populated
                {accuracyReport.issues.length > 0 && ` • ${accuracyReport.issues.length} need attention`}
              </div>
            )}
          </div>

          <Button
            onPointerDown={() => {
              // iOS-only pre-opened tab (preparePDFWindow returns null elsewhere).
              (window as Window & { __invoicePdfWindow?: Window | null }).__invoicePdfWindow = preparePDFWindow();
            }}
            onClick={() => {
              const w = window as Window & { __invoicePdfWindow?: Window | null };
              const invoiceWindow = w.__invoicePdfWindow ?? preparePDFWindow();
              w.__invoicePdfWindow = null;
              handleGenerate(invoiceWindow);
            }}
            className="w-full bg-blue-600 hover:bg-blue-700"
            disabled={!hasRequiredInputs}
          >
            <FileText className="w-4 h-4 mr-2" />
            Generate PDF ({filteredJobs.length})
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};
