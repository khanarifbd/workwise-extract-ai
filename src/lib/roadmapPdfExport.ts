import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Roadmap, RoadmapItem } from '@/hooks/useRoadmaps';
import { parseLocalDate } from '@/lib/roadmapUtils';
import { downloadPDF, preparePDFWindow } from '@/lib/pdfDownload';

const fmtDate = (iso: string) => {
  const d = parseLocalDate(iso);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const daysInclusive = (a: string, b: string) => {
  const s = parseLocalDate(a).getTime();
  const e = parseLocalDate(b).getTime();
  return Math.max(1, Math.round((e - s) / 86400000) + 1);
};

/**
 * Export a roadmap to a landscape PDF containing a summary, a per-week milestone
 * strip, a small Gantt-style visual, and a detailed task table with notes.
 */
export function exportRoadmapPDF(roadmap: Roadmap, items: RoadmapItem[]) {
  const w = preparePDFWindow();
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 32;

  // Sort items hierarchically: roots then children
  const roots = items.filter(i => !i.parent_id).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || a.start_date.localeCompare(b.start_date));
  const childrenOf: Record<string, RoadmapItem[]> = {};
  for (const it of items) if (it.parent_id) (childrenOf[it.parent_id] = childrenOf[it.parent_id] || []).push(it);
  for (const k in childrenOf) childrenOf[k].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || a.start_date.localeCompare(b.start_date));

  const flat: { item: RoadmapItem; depth: number }[] = [];
  const walk = (it: RoadmapItem, depth: number) => {
    flat.push({ item: it, depth });
    (childrenOf[it.id] || []).forEach(c => walk(c, depth + 1));
  };
  roots.forEach(r => walk(r, 0));

  // ---------- Header ----------
  doc.setFillColor(10, 37, 64);
  doc.rect(0, 0, pageW, 70, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(18);
  doc.text(roadmap.name || 'Roadmap', margin, 30);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  const totalDays = daysInclusive(roadmap.start_date, roadmap.end_date);
  const weeks = Math.ceil(totalDays / 7);
  const done = items.filter(i => i.progress >= 100).length;
  doc.text(
    `${fmtDate(roadmap.start_date)}  →  ${fmtDate(roadmap.end_date)}   ·   ${totalDays} days (${weeks} wks)   ·   ${items.length} tasks   ·   ${done} complete`,
    margin, 50,
  );
  doc.setFontSize(8);
  doc.text(`Generated ${new Date().toLocaleString('en-GB')}`, pageW - margin, 30, { align: 'right' });
  doc.setTextColor(0, 0, 0);

  // ---------- Mini Gantt ----------
  const gTop = 90;
  const gLeft = margin + 190;
  const gRight = pageW - margin;
  const gWidth = gRight - gLeft;
  const rowH = 12;
  const maxGanttRows = Math.min(flat.length, 26);
  const gHeight = maxGanttRows * rowH + 24;

  // Header timeline (weeks)
  doc.setFillColor(240, 244, 249);
  doc.rect(margin, gTop, pageW - margin * 2, gHeight, 'F');
  doc.setDrawColor(210); doc.setLineWidth(0.5);
  doc.rect(margin, gTop, pageW - margin * 2, gHeight);

  doc.setFontSize(9); doc.setFont('helvetica', 'bold');
  doc.text('Task', margin + 6, gTop + 14);
  doc.text('Timeline', gLeft + 4, gTop + 14);

  // Week grid
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7);
  const startMs = parseLocalDate(roadmap.start_date).getTime();
  for (let wk = 0; wk <= weeks; wk++) {
    const x = gLeft + (wk / weeks) * gWidth;
    doc.setDrawColor(200);
    doc.line(x, gTop + 18, x, gTop + gHeight - 4);
    if (wk < weeks) {
      const d = new Date(startMs + wk * 7 * 86400000);
      doc.setTextColor(90);
      doc.text(`W${wk + 1}`, x + 2, gTop + 14);
      doc.text(d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }), x + 2, gTop + 22);
    }
  }
  doc.setTextColor(0);

  flat.slice(0, maxGanttRows).forEach((row, idx) => {
    const y = gTop + 28 + idx * rowH;
    const { item, depth } = row;
    // Task label
    doc.setFontSize(7); doc.setTextColor(20);
    const label = `${'  '.repeat(depth)}${item.label}`.slice(0, 40);
    doc.text(label, margin + 6, y + 8);
    // Bar
    const s = (parseLocalDate(item.start_date).getTime() - startMs) / 86400000;
    const e = (parseLocalDate(item.end_date).getTime() - startMs) / 86400000 + 1;
    const bx = gLeft + Math.max(0, s / totalDays) * gWidth;
    const bw = Math.max(3, ((e - s) / totalDays) * gWidth);
    const color = (item.color || '#3b82f6').replace('#', '');
    const r = parseInt(color.slice(0, 2), 16) || 59;
    const g = parseInt(color.slice(2, 4), 16) || 130;
    const b = parseInt(color.slice(4, 6), 16) || 246;
    if (item.is_milestone) {
      doc.setFillColor(r, g, b);
      doc.triangle(bx - 4, y + 4, bx + 4, y + 4, bx, y + 10, 'F');
    } else {
      doc.setFillColor(r, g, b);
      doc.rect(bx, y + 3, bw, 6, 'F');
      if (item.progress > 0 && item.progress < 100) {
        doc.setFillColor(0, 0, 0);
        doc.setGState(new (doc as any).GState({ opacity: 0.3 }));
        doc.rect(bx, y + 3, bw * (item.progress / 100), 6, 'F');
        doc.setGState(new (doc as any).GState({ opacity: 1 }));
      }
    }
    doc.setTextColor(0);
  });

  if (flat.length > maxGanttRows) {
    doc.setFontSize(7); doc.setTextColor(120);
    doc.text(`+ ${flat.length - maxGanttRows} more tasks — see detailed schedule below`, margin + 6, gTop + gHeight - 6);
    doc.setTextColor(0);
  }

  // ---------- Detailed schedule table ----------
  autoTable(doc, {
    startY: gTop + gHeight + 16,
    head: [['#', 'Task', 'Start', 'End', 'Days', 'Progress', 'Assigned', 'Notes']],
    body: flat.map((row, i) => {
      const it = row.item;
      const indent = '  '.repeat(row.depth);
      return [
        String(i + 1),
        `${indent}${it.is_milestone ? '◆ ' : ''}${it.label}`,
        fmtDate(it.start_date),
        fmtDate(it.end_date),
        String(daysInclusive(it.start_date, it.end_date)),
        `${it.progress || 0}%`,
        it.assigned_team || '—',
        (it.notes || '').slice(0, 220),
      ];
    }),
    styles: { fontSize: 8, cellPadding: 3, overflow: 'linebreak', valign: 'top' },
    headStyles: { fillColor: [10, 37, 64], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [247, 250, 253] },
    columnStyles: {
      0: { cellWidth: 22, halign: 'right' },
      1: { cellWidth: 210 },
      2: { cellWidth: 60 },
      3: { cellWidth: 60 },
      4: { cellWidth: 36, halign: 'right' },
      5: { cellWidth: 46, halign: 'right' },
      6: { cellWidth: 70 },
      7: { cellWidth: 'auto' },
    },
    margin: { left: margin, right: margin },
    didDrawPage: () => {
      const pn = (doc as any).internal.getNumberOfPages();
      doc.setFontSize(8); doc.setTextColor(120);
      doc.text(`${roadmap.name} — Page ${pn}`, margin, pageH - 12);
      doc.text('Generated by Genie · Roadmap export', pageW - margin, pageH - 12, { align: 'right' });
      doc.setTextColor(0);
    },
  });

  const safe = (roadmap.name || 'roadmap').replace(/[^a-z0-9]+/gi, '-').slice(0, 40).replace(/^-+|-+$/g, '') || 'roadmap';
  const stamp = new Date().toISOString().slice(0, 10);
  downloadPDF(doc, `roadmap-${safe}-${stamp}.pdf`, { targetWindow: w });
}
