import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { ConvertResponse } from '@/lib/api';
import { downloadPDF, preparePDFWindow } from '@/lib/pdfDownload';

type Severity = 'critical' | 'warning' | 'info';
interface Flag {
  severity: Severity;
  tier: string;
  line: number;
  code: string;
  description: string;
  issue: string;
  confidence: number | null;
}

const TIERS = ['baseline', 'enhanced', 'premium'] as const;

export function buildConversionValidationFlags(result: ConvertResponse): Flag[] {
  const flags: Flag[] = [];
  for (const t of TIERS) {
    const tier = result.tiers[t];
    if (!tier) continue;
    if (tier.items.length === 0) {
      flags.push({ severity: 'critical', tier: t, line: 0, code: '—', description: '(no items)', issue: 'Tier has no items generated', confidence: null });
      continue;
    }
    tier.items.forEach((it, i) => {
      const conf = typeof (it as any).confidence === 'number' ? (it as any).confidence : null;
      const evidence = (it as any).evidence;
      const desc = (it.description || '').trim();
      const code = (it.code || '').trim();
      const push = (severity: Severity, issue: string) =>
        flags.push({ severity, tier: t, line: i + 1, code: code || '—', description: desc || '(missing)', issue, confidence: conf });

      if (!code) push('critical', 'Missing SOR code');
      else if (!it.valid) push('critical', 'SOR code not found in NPH catalogue');
      if (!desc) push('critical', 'Missing description');
      if (!(it.qty > 0)) push('critical', 'Invalid quantity');
      if (!(it.cost > 0)) push('warning', 'Missing or zero cost');
      if (conf === null) push('warning', 'No confidence score returned');
      else if (conf < 45) push('critical', `Very low confidence (${conf}%)`);
      else if (conf < 65) push('warning', `Low confidence (${conf}%)`);
      if (!evidence) push('info', 'No source evidence quoted from description');
    });
  }
  return flags;
}

export function exportConversionValidationPDF(result: ConvertResponse, sourceDescription: string) {
  const w = preparePDFWindow();
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 32;

  const flags = buildConversionValidationFlags(result);
  const counts = {
    critical: flags.filter(f => f.severity === 'critical').length,
    warning: flags.filter(f => f.severity === 'warning').length,
    info: flags.filter(f => f.severity === 'info').length,
  };
  const totalItems = TIERS.reduce((n, t) => n + (result.tiers[t]?.items.length || 0), 0);

  // Header
  doc.setFillColor(10, 37, 64);
  doc.rect(0, 0, pageW, 70, 'F');
  doc.setTextColor(255);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(18);
  doc.text('SOR Conversion — Validation Report', margin, 30);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  doc.text(
    `${totalItems} line items across ${TIERS.length} tiers   ·   ${flags.length} flags   ·   Generated ${new Date().toLocaleString('en-GB')}`,
    margin, 50,
  );
  doc.setTextColor(0);

  // Summary cards
  const cardY = 90;
  const cardW = (pageW - margin * 2 - 24) / 3;
  const cards: [string, number, [number, number, number]][] = [
    ['Critical', counts.critical, [220, 38, 38]],
    ['Warnings', counts.warning, [217, 119, 6]],
    ['Info', counts.info, [37, 99, 235]],
  ];
  cards.forEach(([label, n, rgb], i) => {
    const x = margin + i * (cardW + 12);
    doc.setFillColor(...rgb);
    doc.roundedRect(x, cardY, cardW, 60, 6, 6, 'F');
    doc.setTextColor(255);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(26);
    doc.text(String(n), x + 14, cardY + 38);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(11);
    doc.text(label, x + 14, cardY + 52);
  });
  doc.setTextColor(0);

  // Source description snippet
  doc.setFontSize(9); doc.setFont('helvetica', 'bold');
  doc.text('Source description:', margin, cardY + 82);
  doc.setFont('helvetica', 'normal');
  const snippet = (sourceDescription || '(none)').slice(0, 500);
  const wrapped = doc.splitTextToSize(snippet, pageW - margin * 2);
  doc.text(wrapped, margin, cardY + 96);

  const tableStart = cardY + 96 + wrapped.length * 11 + 12;

  if (flags.length === 0) {
    doc.setFontSize(14); doc.setFont('helvetica', 'bold');
    doc.setTextColor(16, 122, 87);
    doc.text('✓ No issues detected — every line has a valid SOR code, description, cost and high confidence.', margin, tableStart + 20);
    doc.setTextColor(0);
  } else {
    autoTable(doc, {
      startY: tableStart,
      head: [['Severity', 'Tier', 'Line', 'SOR Code', 'Description', 'Confidence', 'Issue']],
      body: flags.map(f => [
        f.severity.toUpperCase(),
        f.tier,
        String(f.line),
        f.code,
        f.description.slice(0, 120),
        f.confidence === null ? '—' : `${f.confidence}%`,
        f.issue,
      ]),
      styles: { fontSize: 8, cellPadding: 3, overflow: 'linebreak', valign: 'top' },
      headStyles: { fillColor: [10, 37, 64], textColor: 255, fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: 56, fontStyle: 'bold' },
        1: { cellWidth: 60 },
        2: { cellWidth: 32, halign: 'right' },
        3: { cellWidth: 70 },
        4: { cellWidth: 220 },
        5: { cellWidth: 60, halign: 'right' },
        6: { cellWidth: 'auto' },
      },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 0) {
          const sev = String(data.cell.raw).toLowerCase();
          if (sev === 'critical') { data.cell.styles.textColor = [255, 255, 255]; data.cell.styles.fillColor = [220, 38, 38]; }
          else if (sev === 'warning') { data.cell.styles.textColor = [255, 255, 255]; data.cell.styles.fillColor = [217, 119, 6]; }
          else if (sev === 'info') { data.cell.styles.textColor = [255, 255, 255]; data.cell.styles.fillColor = [37, 99, 235]; }
        }
      },
      margin: { left: margin, right: margin },
      didDrawPage: () => {
        const pn = (doc as any).internal.getNumberOfPages();
        doc.setFontSize(8); doc.setTextColor(120);
        doc.text(`Validation Report — Page ${pn}`, margin, pageH - 12);
        doc.text('Generated by Genie · Convert AI', pageW - margin, pageH - 12, { align: 'right' });
        doc.setTextColor(0);
      },
    });
  }

  const stamp = new Date().toISOString().slice(0, 10);
  downloadPDF(doc, `sor-validation-${stamp}.pdf`, { targetWindow: w });
  return { flags, counts };
}
