import { Button } from '@/components/ui/button';
import { FileDown } from 'lucide-react';
import { Job } from '@/types/job';
import { SubTask } from '@/types/subTask';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { downloadPDF } from '@/lib/pdfDownload';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';

interface SubTaskJobSheetPDFProps {
  subTask: SubTask;
  job: Job;
}

export function SubTaskJobSheetPDF({ subTask, job }: SubTaskJobSheetPDFProps) {
  const { toast } = useToast();

  const handleGenerate = (e: React.MouseEvent) => {
    e.stopPropagation();

    const doc = new jsPDF();
    const pw = doc.internal.pageSize.width;

    // === HEADER ===
    doc.setFillColor(30, 41, 59); // slate-800
    doc.rect(0, 0, pw, 38, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('TRADESMAN JOB SHEET', 14, 16);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Trade: ${subTask.trade}`, 14, 24);
    doc.text(`Job #${job.jobNumber}`, 14, 30);
    doc.text(`Generated: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, pw - 14, 24, { align: 'right' });
    if (subTask.bookedDate) {
      doc.text(`Booked: ${format(subTask.bookedDate, 'dd/MM/yyyy')}`, pw - 14, 30, { align: 'right' });
    }

    let y = 46;

    // === PROPERTY & CONTACT DETAILS ===
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('PROPERTY & CONTACT DETAILS', 14, y);
    y += 2;

    const contactData: string[][] = [
      ['Tenant Name', job.name || '—'],
      ['Property Address', job.address || '—'],
      ['Phone Number', job.phoneNumber || '—'],
      ['Assigned Team', [job.team, job.team2].filter(Boolean).join(' + ') || '—'],
    ];
    if (subTask.assignedTeam) {
      contactData.push(['Sub-Task Assigned To', subTask.assignedTeam]);
    }

    autoTable(doc, {
      body: contactData,
      startY: y,
      theme: 'plain',
      styles: { fontSize: 10, cellPadding: 3 },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 50, textColor: [100, 100, 100] },
        1: { cellWidth: pw - 78 },
      },
      margin: { left: 14, right: 14 },
    });

    y = (doc as any).lastAutoTable.finalY + 8;

    // === JOB DESCRIPTION ===
    if (job.description || job.summaryOfWorks) {
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('JOB DESCRIPTION', 14, y);
      y += 6;

      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(50, 50, 50);

      const descText = job.description || job.summaryOfWorks || '';
      const lines = doc.splitTextToSize(descText, pw - 28);
      doc.text(lines, 14, y);
      y += lines.length * 4.5 + 6;
    }

    // === WORK ITEMS ===
    if (job.workItems && job.workItems.length > 0) {
      doc.setTextColor(30, 41, 59);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('WORK ITEMS / SCHEDULE OF RATES', 14, y);
      y += 2;

      const workData = job.workItems.map((w, i) => [
        String(i + 1),
        w.sorCode || '—',
        w.description,
        String(w.qty),
      ]);

      autoTable(doc, {
        head: [['#', 'SOR Code', 'Description', 'Qty']],
        body: workData,
        startY: y,
        styles: { fontSize: 8, cellPadding: 2.5 },
        headStyles: { fillColor: [51, 65, 85], textColor: [255, 255, 255], fontStyle: 'bold' },
        columnStyles: {
          0: { cellWidth: 10 },
          1: { cellWidth: 25 },
          2: { cellWidth: pw - 77 },
          3: { cellWidth: 14 },
        },
        alternateRowStyles: { fillColor: [241, 245, 249] },
        margin: { left: 14, right: 14 },
      });

      y = (doc as any).lastAutoTable.finalY + 8;
    }

    // === SUB-TASK SPECIFIC INFO ===
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('SUB-TASK DETAILS', 14, y);
    y += 2;

    const subTaskData: string[][] = [
      ['Trade Required', subTask.trade],
      ['Status', subTask.status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())],
    ];
    if (subTask.bookedDate) subTaskData.push(['Booked Date', format(subTask.bookedDate, 'dd/MM/yyyy')]);
    if (subTask.deadlineDate) subTaskData.push(['Deadline', format(subTask.deadlineDate, 'dd/MM/yyyy')]);
    if (subTask.description) subTaskData.push(['Notes', subTask.description]);
    if (subTask.notes) subTaskData.push(['Additional Notes', subTask.notes]);

    // Ongoing reason from parent
    if (job.ongoingReason) subTaskData.push(['Ongoing Reason', job.ongoingReason]);

    autoTable(doc, {
      body: subTaskData,
      startY: y,
      theme: 'plain',
      styles: { fontSize: 10, cellPadding: 3 },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 50, textColor: [100, 100, 100] },
        1: { cellWidth: pw - 78 },
      },
      margin: { left: 14, right: 14 },
    });

    y = (doc as any).lastAutoTable.finalY + 8;

    // === FAN INFO ===
    if (job.fanInfo && job.fanInfo.length > 0) {
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('FAN INFORMATION', 14, y);
      y += 2;

      const fanData = job.fanInfo.map(f => [f.type, String(f.quantity), f.location]);
      autoTable(doc, {
        head: [['Type', 'Qty', 'Location']],
        body: fanData,
        startY: y,
        styles: { fontSize: 9, cellPadding: 2.5 },
        headStyles: { fillColor: [14, 165, 233], textColor: [255, 255, 255] },
        margin: { left: 14, right: 14 },
      });

      y = (doc as any).lastAutoTable.finalY + 8;
    }

    // === SIGN-OFF SECTION ===
    // Check page space
    if (y > doc.internal.pageSize.height - 80) {
      doc.addPage();
      y = 20;
    }

    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.5);
    doc.line(14, y, pw - 14, y);
    y += 10;

    doc.setTextColor(30, 41, 59);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('COMPLETION & SIGN-OFF', 14, y);
    y += 8;

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(80, 80, 80);

    const signOffFields = [
      'Date Work Completed: ______________________',
      '',
      'Work Summary / Notes:',
      '___________________________________________________________________________',
      '___________________________________________________________________________',
      '___________________________________________________________________________',
      '',
      'Any Issues / Follow-up Required:',
      '___________________________________________________________________________',
      '___________________________________________________________________________',
      '',
      'Tradesman Name (Print): ______________________',
      '',
      'Tradesman Signature: ______________________     Date: ______________',
      '',
      'Tenant Signature: ______________________          Date: ______________',
    ];

    signOffFields.forEach(line => {
      doc.text(line, 14, y);
      y += 6;
    });

    // === FOOTER ===
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(7);
      doc.setTextColor(150);
      doc.text(
        `Page ${i} of ${pageCount} — Job #${job.jobNumber} — ${subTask.trade} — CONFIDENTIAL`,
        pw / 2,
        doc.internal.pageSize.height - 6,
        { align: 'center' }
      );
    }

    const filename = `job-sheet-${job.jobNumber}-${subTask.trade.replace(/\s+/g, '-').toLowerCase()}-${format(new Date(), 'yyyy-MM-dd')}.pdf`;
    downloadPDF(doc, filename);

    toast({
      title: 'Job Sheet Downloaded',
      description: `${subTask.trade} job sheet for #${job.jobNumber}`,
    });
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleGenerate}
      className="h-7 w-7 p-0"
      title={`Download ${subTask.trade} job sheet PDF`}
    >
      <FileDown className="h-3.5 w-3.5" />
    </Button>
  );
}
