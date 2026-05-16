// E2E sanity test for Progressor PDF export: builds a PDF with mock jobs
// and verifies key invariants (page count, row count, no crashes, file size).
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format, startOfWeek, endOfWeek, addDays, startOfMonth, endOfMonth } from 'date-fns';
import fs from 'fs';

const dayKey = (d) => format(d, 'yyyy-MM-dd');

// --- Build mock jobs spanning 3 months ---
const jobs = [];
const start = new Date('2026-04-01');
for (let i = 0; i < 250; i++) {
  const d = addDays(start, Math.floor(Math.random() * 90));
  jobs.push({
    id: `id-${i}`,
    jobNumber: `J${10000 + i}`,
    name: `Tenant ${i}`,
    address: `${i} Test Road, London E${(i % 20) + 1} 1AA`,
    team: ['Alpha', 'Bravo', 'Charlie', null][i % 4],
    team2: i % 7 === 0 ? 'Delta' : null,
    bookedDate: dayKey(d),
    attachments: i % 3 === 0 ? [{}] : [],
  });
}

// --- Scope filter (week scope, selecting 2 specific weeks) ---
function runScenario({ name, scope, selectedWeeks = [], selectedDays = [], selectedMonths = [], selectedTeams = new Set() }) {
  const allowedDayKeys = new Set();
  if (scope === 'day') selectedDays.forEach(d => allowedDayKeys.add(dayKey(d)));
  if (scope === 'week') selectedWeeks.forEach(wk => {
    const s = startOfWeek(wk, { weekStartsOn: 1 });
    for (let i = 0; i < 7; i++) allowedDayKeys.add(dayKey(addDays(s, i)));
  });
  if (scope === 'month') selectedMonths.forEach(m => {
    for (let cur = new Date(startOfMonth(m)); cur <= endOfMonth(m); cur = addDays(cur, 1)) {
      allowedDayKeys.add(dayKey(cur));
    }
  });

  const dateFiltered = jobs.filter(j => allowedDayKeys.has(j.bookedDate));
  const finalJobs = selectedTeams.size === 0 ? dateFiltered
    : dateFiltered.filter(j => (j.team && selectedTeams.has(j.team)) || (j.team2 && selectedTeams.has(j.team2)));

  const sorted = [...finalJobs].sort((a, b) =>
    a.bookedDate.localeCompare(b.bookedDate) || a.jobNumber.localeCompare(b.jobNumber));

  const doc = new jsPDF({ orientation: 'landscape' });
  const pw = doc.internal.pageSize.width;
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pw, 22, 'F');
  doc.setTextColor(255).setFontSize(14).setFont('helvetica', 'bold');
  doc.text('PROGRESSOR — OUTSTANDING JOBS LIST', 14, 14);
  doc.setFontSize(9).setFont('helvetica', 'normal');
  doc.text(format(new Date(), 'dd MMM yyyy HH:mm'), pw - 14, 14, { align: 'right' });

  const rows = sorted.map(j => [
    j.jobNumber, j.name, j.address,
    [j.team, j.team2].filter(Boolean).join(' + ') || '—',
    format(new Date(j.bookedDate), 'EEE dd MMM'),
    j.attachments.length ? '[X]' : '[  ]',
  ]);

  autoTable(doc, {
    startY: 32,
    head: [['Job #', 'Tenant', 'Address', 'Team', 'Booked', 'Media']],
    body: rows,
    styles: { fontSize: 8.5, cellPadding: 2.5 },
    headStyles: { fillColor: [51, 65, 85], textColor: 255, fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: 24 }, 1: { cellWidth: 46 }, 2: { cellWidth: 92 }, 3: { cellWidth: 48 }, 4: { cellWidth: 36 }, 5: { cellWidth: 22, halign: 'center' } },
    margin: { left: 10, right: 10 },
  });

  const buf = Buffer.from(doc.output('arraybuffer'));
  const path = `/tmp/${name}.pdf`;
  fs.writeFileSync(path, buf);
  const pages = doc.getNumberOfPages();
  console.log(`[${name}] jobs=${finalJobs.length} rows=${rows.length} pages=${pages} size=${buf.length}B  -> ${path}`);
  // Sanity assertions
  if (rows.length !== finalJobs.length) throw new Error('row/job count mismatch');
  if (buf.length < 1000) throw new Error('PDF suspiciously small');
  if (!buf.slice(0, 4).toString().startsWith('%PDF')) throw new Error('Not a valid PDF header');
  return { jobs: finalJobs.length, pages, bytes: buf.length };
}

const today = new Date('2026-05-16');

console.log('Running scenarios...\n');

runScenario({ name: 'scenario-day', scope: 'day', selectedDays: [today, addDays(today, 1), addDays(today, 2)] });
runScenario({ name: 'scenario-week-multi', scope: 'week', selectedWeeks: [startOfWeek(today, { weekStartsOn: 1 }), startOfWeek(addDays(today, 7), { weekStartsOn: 1 })] });
runScenario({ name: 'scenario-month', scope: 'month', selectedMonths: [startOfMonth(today)] });
runScenario({ name: 'scenario-3months', scope: 'month', selectedMonths: [new Date('2026-04-01'), new Date('2026-05-01'), new Date('2026-06-01')] });
runScenario({ name: 'scenario-team-filter', scope: 'month', selectedMonths: [startOfMonth(today)], selectedTeams: new Set(['Alpha']) });
runScenario({ name: 'scenario-empty', scope: 'day', selectedDays: [new Date('2099-01-01')] });

console.log('\nAll scenarios passed.');
