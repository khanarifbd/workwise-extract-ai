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

type RangeMode = 'day' | 'week' | 'month';

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

export const CompletedJobInvoicePDFButton = ({ jobs, categoryName = 'Damp & Mold' }: Props) => {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<RangeMode>('month');
  const [anchorDate, setAnchorDate] = useState<Date>(new Date());

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

  const filteredJobs = useMemo(
    () => invoiceEligibleJobs.filter(inRange),
    [invoiceEligibleJobs, inRange],
  );

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

  const handleGenerate = () => {
    if (filteredJobs.length === 0) {
      alert('No invoice jobs found for the selected ' + mode);
      return;
    }

    const targetWindow = preparePDFWindow();

    // Use the same range definition as the preview/accuracy report so every counted job is included.
    const strictJobs = filteredJobs.filter(inRange);

    const doc = new jsPDF('landscape', 'mm', 'a4');

    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('INVOICE DATA - BOOKED & COMPLETED JOBS', 14, 16);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Category: ${categoryName}`, 14, 23);
    doc.text(`Range (${mode}): ${rangeLabel}`, 14, 29);
    doc.text(`Generated: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 14, 35);
    doc.text(`Total Jobs: ${strictJobs.length}`, 14, 41);

    // Accuracy summary line
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
      if (job.isOngoing) ongoingInfo.push('ONGOING');
      const reason = stripHtml(job.ongoingReason);
      if (reason) ongoingInfo.push(reason);
      if (Array.isArray(job.scheduledTrades) && job.scheduledTrades.length > 0) {
        const trades = job.scheduledTrades
          .map((t: ScheduledTrade & { tradeType?: string }) => {
            const parts = [t.tradeType || t.trade, t.tradesman, t.date]
              .filter(Boolean)
              .join(' • ');
            return parts;
          })
          .filter(Boolean)
          .join('\n');
        if (trades) ongoingInfo.push(trades);
      }
      // Booking + completion dates so invoicing sees both
      const dateLine = [
        job.bookedDate ? `Booked: ${format(new Date(job.bookedDate), 'dd/MM/yyyy')}` : null,
        job.completionDate ? `Completed: ${format(new Date(job.completionDate), 'dd/MM/yyyy')}` : null,
        job.isOngoing ? 'ONGOING' : null,
      ].filter(Boolean).join(' • ');
      if (dateLine) ongoingInfo.unshift(dateLine);

      const teams = [job.team, job.team2].filter(Boolean).join(' + ') || '-';
      const statusLabel = isCompleteJob(job) ? 'Complete' : job.isOngoing ? 'Ongoing / Booked' : 'Booked';

      return [
        job.jobNumber || '-',
        statusLabel,
        job.address || '-',
        job.name || '-',
        teams,
        stripHtml(job.summaryOfWorks || job.description) || '-',
        stripHtml(job.progressNotes) || '-',
        ongoingInfo.join('\n') || '-',
      ];
    });

    autoTable(doc, {
      head: [['Job Number', 'Status', 'Address', 'Tenant Name', 'Assigned Teams', 'Description', 'Progress Description', 'Ongoing Information']],
      body: tableData,
      startY: 46,
      styles: {
        fontSize: 7,
        cellPadding: 2,
        overflow: 'linebreak',
        valign: 'top',
      },
      headStyles: {
        fillColor: [34, 139, 34],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        halign: 'left',
      },
      columnStyles: {
        0: { cellWidth: 22 },
        1: { cellWidth: 22 },
        2: { cellWidth: 43 },
        3: { cellWidth: 27 },
        4: { cellWidth: 25 },
        5: { cellWidth: 52 },
        6: { cellWidth: 41 },
        7: { cellWidth: 35 },
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

    // Accuracy report appendix
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
      doc.text('✓ All jobs in this range have complete data.', 14, 52);
      doc.setTextColor(0, 0, 0);
    }

    const stamp = format(new Date(), 'yyyyMMdd');
    const filename = `invoice-data_${mode}_${format(range.start, 'yyyyMMdd')}-${format(range.end, 'yyyyMMdd')}_${stamp}.pdf`;
    downloadPDF(doc, filename, { targetWindow });
    setIsOpen(false);
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
      <PopoverContent className="w-80 p-4" align="end">
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
            {filteredJobs.length > 0 && (
              <div className={accuracyReport.issues.length === 0 ? 'text-emerald-600 font-medium' : 'text-amber-600 font-medium'}>
                Accuracy: {accuracyReport.clean}/{accuracyReport.total} fully populated
                {accuracyReport.issues.length > 0 && ` • ${accuracyReport.issues.length} need attention`}
              </div>
            )}
          </div>

          <Button
            onClick={handleGenerate}
            className="w-full bg-blue-600 hover:bg-blue-700"
            disabled={filteredJobs.length === 0}
          >
            <FileText className="w-4 h-4 mr-2" />
            Generate PDF ({filteredJobs.length})
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};
