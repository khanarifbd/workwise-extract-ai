import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { Job } from '@/types/job';
import { ContactHistory, CONTACT_OUTCOMES } from '@/types/contactHistory';
import { downloadPDF } from '@/lib/pdfDownload';

function getOutcomeLabel(outcome: string): string {
  const found = CONTACT_OUTCOMES.find(o => o.value === outcome);
  return found ? found.label : outcome.replace(/_/g, ' ');
}

export function generateReferBackJobPDF(job: Job, contactHistory: ContactHistory[]): jsPDF {
  const doc = new jsPDF({ orientation: 'portrait' });

  // ── Header ──
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(220, 38, 38);
  doc.text('REFER BACK REPORT', 14, 18);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100);
  doc.text(`Generated: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 14, 25);
  doc.text('CONFIDENTIAL — For NPH Use Only', 14, 30);

  // ── Job Details Table ──
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30);
  doc.text('Job Details', 14, 40);

  autoTable(doc, {
    startY: 44,
    body: [
      ['Job Number', job.jobNumber],
      ['Tenant Name', job.name || '-'],
      ['Address', job.address || '-'],
      ['Phone Number', job.phoneNumber || '-'],
      ['Date Issued', job.dateIssued ? format(job.dateIssued, 'dd/MM/yyyy') : '-'],
      ['Booked Date', job.bookedDate ? format(job.bookedDate, 'dd/MM/yyyy') : 'Not booked'],
      ['Referred Back Date', job.referBackDate ? format(job.referBackDate, 'dd/MM/yyyy') : format(new Date(), 'dd/MM/yyyy')],
      ['Status', job.status?.replace(/_/g, ' ').toUpperCase() || 'PENDING'],
    ],
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 3 },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 45, fillColor: [245, 245, 245] },
      1: { cellWidth: 140 },
    },
    headStyles: { fillColor: [220, 38, 38] },
  });

  let currentY = (doc as any).lastAutoTable.finalY + 8;

  // ── Job Description ──
  if (job.description || job.summaryOfWorks) {
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30);
    doc.text('Job Description', 14, currentY);
    currentY += 5;

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(60);
    const descText = job.description || job.summaryOfWorks || '';
    const descLines = doc.splitTextToSize(descText.substring(0, 500), 180);
    doc.text(descLines, 14, currentY);
    currentY += descLines.length * 4 + 6;
  }

  // ── Reason for Refer Back ──
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(220, 38, 38);
  doc.text('Reason for Refer Back', 14, currentY);
  currentY += 5;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(60);
  const reason = job.referBackReason || 'No specific reason provided';
  const reasonLines = doc.splitTextToSize(reason, 180);
  doc.text(reasonLines, 14, currentY);
  currentY += reasonLines.length * 4 + 6;

  // ── Contact History Summary ──
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30);
  doc.text('Contact History Summary', 14, currentY);
  currentY += 2;

  const sorted = [...contactHistory].sort(
    (a, b) => new Date(a.contactDate).getTime() - new Date(b.contactDate).getTime()
  );

  if (sorted.length === 0) {
    currentY += 4;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(120);
    doc.text('No contact attempts recorded for this job.', 14, currentY);
    currentY += 8;
  } else {
    const contactRows = sorted.map((c, i) => [
      String(i + 1),
      format(new Date(c.contactDate), 'dd/MM/yyyy HH:mm'),
      getOutcomeLabel(c.outcome),
      c.notes || '-',
    ]);

    autoTable(doc, {
      startY: currentY + 2,
      head: [['#', 'Date', 'Outcome', 'Notes']],
      body: contactRows,
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [100, 100, 100], textColor: [255, 255, 255], fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: 10 },
        1: { cellWidth: 35 },
        2: { cellWidth: 40 },
        3: { cellWidth: 95 },
      },
    });

    currentY = (doc as any).lastAutoTable.finalY + 6;
  }

  // ── Narrative Summary ──
  const narrative = buildNarrative(job, sorted);

  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30);

  // Check if we need a new page
  if (currentY > 250) {
    doc.addPage();
    currentY = 20;
  }

  doc.text('Summary', 14, currentY);
  currentY += 5;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(60);
  const narrativeLines = doc.splitTextToSize(narrative, 180);
  doc.text(narrativeLines, 14, currentY);
  currentY += narrativeLines.length * 4 + 6;

  // ── Admin Notes ──
  if (job.progressNotes || job.privateNotes) {
    if (currentY > 260) {
      doc.addPage();
      currentY = 20;
    }

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30);
    doc.text('Additional Notes', 14, currentY);
    currentY += 5;

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(60);
    const notes = [job.progressNotes, job.privateNotes].filter(Boolean).join('\n\n');
    const noteLines = doc.splitTextToSize(notes.substring(0, 600), 180);
    doc.text(noteLines, 14, currentY);
  }

  // ── Footer on all pages ──
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(150);
    doc.text(
      `Page ${i} of ${pageCount} — REFER BACK Report — Job #${job.jobNumber} — CONFIDENTIAL`,
      doc.internal.pageSize.width / 2,
      doc.internal.pageSize.height - 8,
      { align: 'center' }
    );
  }

  return doc;
}

function buildNarrative(job: Job, contactHistory: ContactHistory[]): string {
  const parts: string[] = [];

  parts.push(
    `Job #${job.jobNumber} for ${job.name || 'the tenant'} at ${job.address || 'the property'} has been referred back to NPH.`
  );

  if (contactHistory.length === 0) {
    parts.push('No contact attempts were recorded prior to referral.');
  } else {
    const totalAttempts = contactHistory.length;
    const noAnswerCount = contactHistory.filter(c => c.outcome === 'no_answer').length;
    const voicemailCount = contactHistory.filter(c => c.outcome === 'voicemail_left').length;
    const wrongNumberCount = contactHistory.filter(c => c.outcome === 'wrong_number').length;
    const refusedCount = contactHistory.filter(c => c.outcome === 'tenant_refused').length;
    const spokeCount = contactHistory.filter(c => c.outcome === 'spoke_not_booked').length;

    parts.push(`A total of ${totalAttempts} contact attempt(s) were made.`);

    const details: string[] = [];
    if (noAnswerCount > 0) details.push(`${noAnswerCount} resulted in no answer`);
    if (voicemailCount > 0) details.push(`${voicemailCount} voicemail(s) were left`);
    if (spokeCount > 0) details.push(`${spokeCount} time(s) the tenant was spoken to but did not book`);
    if (wrongNumberCount > 0) details.push(`${wrongNumberCount} attempt(s) reached a wrong number`);
    if (refusedCount > 0) details.push(`${refusedCount} time(s) the tenant refused access`);

    if (details.length > 0) {
      parts.push(details.join('; ') + '.');
    }

    // Include any notes from contact attempts
    const significantNotes = contactHistory
      .filter(c => c.notes && c.notes.trim().length > 3)
      .map(c => `[${format(new Date(c.contactDate), 'dd/MM')}] ${c.notes!.trim()}`);

    if (significantNotes.length > 0) {
      parts.push('Notable comments: ' + significantNotes.slice(0, 5).join('; ') + '.');
    }
  }

  // Reason
  if (job.referBackReason) {
    parts.push(`Stated reason: ${job.referBackReason}`);
  }

  return parts.join(' ');
}

export function downloadReferBackJobPDF(job: Job, contactHistory: ContactHistory[]) {
  const doc = generateReferBackJobPDF(job, contactHistory);
  downloadPDF(doc, `refer-back-${job.jobNumber}-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
}
