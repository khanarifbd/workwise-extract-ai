import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, ChevronRight, Download, Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { downloadPDF } from '@/lib/pdfDownload';
import { toast } from '@/hooks/use-toast';

type Urgency = 'critical' | 'high' | 'medium' | 'low';

export interface MaterialsReportData {
  summary: string;
  generatedAt: string;
  jobCount: number;
  materialGroups: Array<{
    category: string;
    items: Array<{
      name: string;
      qty: number;
      unit: string;
      urgency: Urgency;
      jobNumbers: string[];
    }>;
  }>;
  tradeGroups: Array<{
    trade: string;
    jobCount: number;
    jobNumbers: string[];
    topUrgency: Urgency;
  }>;
  actionList: Array<{ priority: Urgency; action: string }>;
  tbcNotes: string[];
  jobs: Array<{
    jobNumber: string;
    address: string | null;
    urgency: Urgency;
    reason: string;
  }>;
}

const URGENCY_STYLES: Record<Urgency, { dot: string; bg: string; text: string; label: string; rank: number }> = {
  critical: { dot: 'bg-destructive', bg: 'bg-destructive/10', text: 'text-destructive', label: 'Critical', rank: 0 },
  high:     { dot: 'bg-warning',     bg: 'bg-warning/10',     text: 'text-warning',     label: 'High',     rank: 1 },
  medium:   { dot: 'bg-primary',     bg: 'bg-primary/10',     text: 'text-primary',     label: 'Medium',   rank: 2 },
  low:      { dot: 'bg-muted-foreground/40', bg: 'bg-muted', text: 'text-muted-foreground', label: 'Low', rank: 3 },
};

function UrgencyBadge({ urgency }: { urgency: Urgency }) {
  const s = URGENCY_STYLES[urgency];
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide', s.bg, s.text)}>
      <span className={cn('w-1.5 h-1.5 rounded-full', s.dot)} />
      {s.label}
    </span>
  );
}

interface Props {
  report: MaterialsReportData;
  title?: string;
  onClose?: () => void;
}

export function MaterialsReport({ report, title }: Props) {
  const [copied, setCopied] = useState(false);

  const urgencyCounts = useMemo(() => {
    const c: Record<Urgency, number> = { critical: 0, high: 0, medium: 0, low: 0 };
    report.jobs.forEach((j) => { c[j.urgency]++; });
    return c;
  }, [report]);

  const sortedMaterialGroups = useMemo(() => {
    return report.materialGroups.map((g) => ({
      ...g,
      items: [...g.items].sort((a, b) => URGENCY_STYLES[a.urgency].rank - URGENCY_STYLES[b.urgency].rank),
    }));
  }, [report]);

  const propertyRows = useMemo(() => {
    const map = new Map<string, { jobNumber: string; address: string | null; urgency: Urgency; trades: Set<string>; materials: Array<{ name: string; qty: number; unit: string }> }>();
    report.jobs.forEach((j) => {
      map.set(j.jobNumber, { jobNumber: j.jobNumber, address: j.address, urgency: j.urgency, trades: new Set(), materials: [] });
    });
    report.tradeGroups.forEach((t) => {
      t.jobNumbers.forEach((jn) => { map.get(jn)?.trades.add(t.trade); });
    });
    report.materialGroups.forEach((g) => {
      g.items.forEach((it) => {
        it.jobNumbers.forEach((jn) => {
          map.get(jn)?.materials.push({ name: it.name, qty: it.qty, unit: it.unit });
        });
      });
    });
    return Array.from(map.values()).sort((a, b) => URGENCY_STYLES[a.urgency].rank - URGENCY_STYLES[b.urgency].rank);
  }, [report]);

  const handleCopy = async () => {
    const text = buildPlainText(report, title);
    await navigator.clipboard.writeText(text);
    setCopied(true);
    toast({ title: 'Copied to clipboard' });
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePDF = () => {
    try {
      const doc = buildPDF(report, title);
      downloadPDF(doc, `materials-report-${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (e) {
      toast({ title: 'PDF failed', description: e instanceof Error ? e.message : 'Unknown error', variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header strip */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title || 'Materials & Trades Report'}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {report.jobCount} jobs · Generated {new Date(report.generatedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleCopy}>
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Copied' : 'Copy'}
          </Button>
          <Button size="sm" onClick={handlePDF}>
            <Download className="w-4 h-4" />
            PDF
          </Button>
        </div>
      </div>

      {/* Executive summary */}
      {report.summary && (
        <Card className="p-4 bg-muted/30 border-l-4 border-l-primary">
          <p className="text-sm leading-relaxed">{report.summary}</p>
        </Card>
      )}

      {/* Two-column urgency + trades */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card className="p-5">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Urgency Breakdown</h2>
          <div className="space-y-2">
            {(['critical', 'high', 'medium', 'low'] as Urgency[]).map((u) => (
              <div key={u} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={cn('w-2 h-2 rounded-full', URGENCY_STYLES[u].dot)} />
                  <span className="text-sm">{URGENCY_STYLES[u].label}</span>
                </div>
                <span className="font-mono text-sm tabular-nums">{urgencyCounts[u]}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Trades to Assign</h2>
          <div className="space-y-1.5">
            {report.tradeGroups.length === 0 && <p className="text-sm text-muted-foreground">None identified.</p>}
            {report.tradeGroups.map((t) => (
              <div key={t.trade} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className={cn('w-1.5 h-1.5 rounded-full', URGENCY_STYLES[t.topUrgency].dot)} />
                  <span>{t.trade}</span>
                </div>
                <span className="font-mono text-xs text-muted-foreground tabular-nums">
                  {t.jobCount} {t.jobCount === 1 ? 'job' : 'jobs'}
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Action list */}
      {report.actionList.length > 0 && (
        <Card className="p-5">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Action List</h2>
          <ol className="space-y-2">
            {report.actionList.map((a, i) => (
              <li key={i} className="flex items-start gap-3 text-sm">
                <span className="font-mono text-xs text-muted-foreground tabular-nums mt-0.5 w-5">{i + 1}.</span>
                <UrgencyBadge urgency={a.priority} />
                <span className="flex-1">{a.action}</span>
              </li>
            ))}
          </ol>
        </Card>
      )}

      {/* Materials list */}
      <Card className="p-5">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">Materials to Order</h2>
        <div className="space-y-3">
          {sortedMaterialGroups.map((group) => (
            <MaterialGroup key={group.category} group={group} />
          ))}
        </div>
      </Card>

      {/* Properties requiring trades & materials */}
      {propertyRows.length > 0 && (
        <Card className="p-5">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Properties Requiring Trades &amp; Materials ({propertyRows.length})
          </h2>
          <div className="divide-y">
            {propertyRows.map((p) => (
              <div key={p.jobNumber} className="py-3 space-y-1.5">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-mono text-xs text-muted-foreground w-16 shrink-0">{p.jobNumber}</span>
                  <span className="flex-1 truncate">{p.address || '—'}</span>
                  <UrgencyBadge urgency={p.urgency} />
                </div>
                {p.trades.size > 0 && (
                  <div className="flex flex-wrap gap-1.5 pl-[72px]">
                    {Array.from(p.trades).map((t) => (
                      <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>
                    ))}
                  </div>
                )}
                {p.materials.length > 0 && (
                  <ul className="pl-[72px] text-xs text-muted-foreground space-y-0.5">
                    {p.materials.map((m, i) => (
                      <li key={i}>• {m.name} <span className="font-mono tabular-nums">— {m.qty} {m.unit}</span></li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* TBC notes / important notes */}
      {report.tbcNotes.length > 0 && (
        <Card className="p-5 bg-warning/5 border-warning/30">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-warning mb-3">Important Notes &amp; Site Confirmation</h2>
          <ul className="space-y-1.5 text-sm">
            {report.tbcNotes.map((n, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-warning">•</span>
                <span>{n}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function MaterialGroup({ group }: { group: MaterialsReportData['materialGroups'][number] }) {
  const [open, setOpen] = useState(true);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center gap-2 w-full text-left py-2 border-b">
        {open ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
        <h3 className="text-sm font-semibold">{group.category}</h3>
        <span className="text-xs text-muted-foreground ml-auto">{group.items.length} items</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="divide-y">
          {group.items.map((item, i) => (
            <div key={i} className="grid grid-cols-[1fr_auto_auto_auto] gap-3 items-center py-2 px-1 text-sm">
              <span className="truncate">{item.name}</span>
              <span className="font-mono tabular-nums text-muted-foreground text-xs">
                {item.qty} {item.unit}
              </span>
              <UrgencyBadge urgency={item.urgency} />
              <span className="text-[10px] font-mono text-muted-foreground truncate max-w-[140px]" title={item.jobNumbers.join(', ')}>
                {item.jobNumbers.length} {item.jobNumbers.length === 1 ? 'job' : 'jobs'}
              </span>
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function buildPlainText(r: MaterialsReportData, title?: string): string {
  const lines: string[] = [];
  lines.push(title || 'Materials & Trades Report');
  lines.push(`${r.jobCount} jobs · ${new Date(r.generatedAt).toLocaleString('en-GB')}`);
  lines.push('');
  if (r.summary) { lines.push(r.summary); lines.push(''); }
  lines.push('ACTION LIST');
  r.actionList.forEach((a, i) => lines.push(`${i + 1}. [${a.priority.toUpperCase()}] ${a.action}`));
  lines.push('');
  lines.push('TRADES');
  r.tradeGroups.forEach(t => lines.push(`- ${t.trade}: ${t.jobCount} jobs (${t.topUrgency})`));
  lines.push('');
  lines.push('MATERIALS');
  r.materialGroups.forEach(g => {
    lines.push(`\n${g.category}`);
    g.items.forEach(it => lines.push(`  - ${it.name} — ${it.qty} ${it.unit} [${it.urgency}] (${it.jobNumbers.join(', ')})`));
  });
  if (r.tbcNotes.length) {
    lines.push('\nTBC');
    r.tbcNotes.forEach(n => lines.push(`- ${n}`));
  }
  return lines.join('\n');
}

function buildPDF(r: MaterialsReportData, title?: string): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = 14;
  doc.setFontSize(16); doc.setFont('helvetica', 'bold');
  doc.text(title || 'Materials & Trades Report', 14, y); y += 6;
  doc.setFontSize(9); doc.setFont('helvetica', 'normal');
  doc.text(`${r.jobCount} jobs · ${new Date(r.generatedAt).toLocaleString('en-GB')}`, 14, y); y += 6;
  if (r.summary) {
    doc.setFontSize(10);
    const wrapped = doc.splitTextToSize(r.summary, 180);
    doc.text(wrapped, 14, y); y += wrapped.length * 5 + 2;
  }

  if (r.actionList.length) {
    autoTable(doc, {
      startY: y,
      head: [['#', 'Priority', 'Action']],
      body: r.actionList.map((a, i) => [String(i + 1), a.priority.toUpperCase(), a.action]),
      headStyles: { fillColor: [30, 41, 59] },
      styles: { fontSize: 8, cellPadding: 1.5 },
      columnStyles: { 0: { cellWidth: 8 }, 1: { cellWidth: 22 } },
      margin: { left: 14, right: 14 },
    });
    // @ts-expect-error
    y = doc.lastAutoTable.finalY + 4;
  }

  if (r.tradeGroups.length) {
    autoTable(doc, {
      startY: y,
      head: [['Trade', 'Jobs', 'Urgency']],
      body: r.tradeGroups.map(t => [t.trade, String(t.jobCount), t.topUrgency.toUpperCase()]),
      headStyles: { fillColor: [30, 41, 59] },
      styles: { fontSize: 8, cellPadding: 1.5 },
      margin: { left: 14, right: 14 },
    });
    // @ts-expect-error
    y = doc.lastAutoTable.finalY + 4;
  }

  r.materialGroups.forEach(g => {
    autoTable(doc, {
      startY: y,
      head: [[g.category, 'Qty', 'Unit', 'Urgency', 'Jobs']],
      body: g.items.map(it => [it.name, String(it.qty), it.unit, it.urgency.toUpperCase(), it.jobNumbers.join(', ')]),
      headStyles: { fillColor: [51, 65, 85] },
      styles: { fontSize: 7.5, cellPadding: 1.2 },
      columnStyles: { 1: { cellWidth: 12 }, 2: { cellWidth: 14 }, 3: { cellWidth: 18 } },
      margin: { left: 14, right: 14 },
    });
    // @ts-expect-error
    y = doc.lastAutoTable.finalY + 3;
  });

  if (r.tbcNotes.length) {
    autoTable(doc, {
      startY: y,
      head: [['Site Confirmation Needed']],
      body: r.tbcNotes.map(n => [n]),
      headStyles: { fillColor: [180, 83, 9] },
      styles: { fontSize: 8, cellPadding: 1.5 },
      margin: { left: 14, right: 14 },
    });
  }

  return doc;
}
