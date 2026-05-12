import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Download, Copy, Check, ChevronRight, Package, Wrench, AlertTriangle, Search, ShieldCheck, ShieldAlert, ChevronDown } from 'lucide-react';
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

const URGENCY_STYLES: Record<Urgency, { dot: string; bg: string; text: string; label: string; rank: number; pdf: [number, number, number] }> = {
  critical: { dot: 'bg-destructive', bg: 'bg-destructive/10', text: 'text-destructive', label: 'Critical', rank: 0, pdf: [220, 38, 38] },
  high:     { dot: 'bg-warning',     bg: 'bg-warning/10',     text: 'text-warning',     label: 'High',     rank: 1, pdf: [217, 119, 6] },
  medium:   { dot: 'bg-primary',     bg: 'bg-primary/10',     text: 'text-primary',     label: 'Medium',   rank: 2, pdf: [37, 99, 235] },
  low:      { dot: 'bg-muted-foreground/40', bg: 'bg-muted', text: 'text-muted-foreground', label: 'Low', rank: 3, pdf: [100, 116, 139] },
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

export interface SourceJobLite {
  jobNumber: string;
  address?: string | null;
  isCompleted?: boolean;
  status?: string | null;
}

interface Props {
  report: MaterialsReportData;
  title?: string;
  onClose?: () => void;
  /** Original jobs sent to the AI — used by the audit panel to verify accuracy */
  sourceJobs?: SourceJobLite[];
}

export function MaterialsReport({ report, title, sourceJobs }: Props) {
  const [copied, setCopied] = useState(false);
  const [drilldownJob, setDrilldownJob] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [urgencyFilter, setUrgencyFilter] = useState<'all' | Urgency>('all');
  const [auditOpen, setAuditOpen] = useState(true);

  // Grand totals: aggregate every material across the report (collapsed by name+unit)
  const grandMaterials = useMemo(() => {
    const map = new Map<string, { name: string; unit: string; qty: number; urgency: Urgency; jobs: Set<string> }>();
    report.materialGroups.forEach((g) => {
      g.items.forEach((it) => {
        const key = `${it.name.toLowerCase().trim()}|${it.unit.toLowerCase().trim()}`;
        const existing = map.get(key);
        if (existing) {
          existing.qty += it.qty;
          if (URGENCY_STYLES[it.urgency].rank < URGENCY_STYLES[existing.urgency].rank) existing.urgency = it.urgency;
          it.jobNumbers.forEach((j) => existing.jobs.add(j));
        } else {
          map.set(key, { name: it.name, unit: it.unit, qty: it.qty, urgency: it.urgency, jobs: new Set(it.jobNumbers) });
        }
      });
    });
    return Array.from(map.values()).sort((a, b) => URGENCY_STYLES[a.urgency].rank - URGENCY_STYLES[b.urgency].rank || b.qty - a.qty);
  }, [report]);

  const grandTrades = useMemo(() => {
    return [...report.tradeGroups].sort((a, b) => URGENCY_STYLES[a.topUrgency].rank - URGENCY_STYLES[b.topUrgency].rank || b.jobCount - a.jobCount);
  }, [report]);

  const propertyMap = useMemo(() => {
    const map = new Map<string, { jobNumber: string; address: string | null; urgency: Urgency; trades: Set<string>; materials: Array<{ name: string; qty: number; unit: string; urgency: Urgency }> }>();
    report.jobs.forEach((j) => {
      map.set(j.jobNumber, { jobNumber: j.jobNumber, address: j.address, urgency: j.urgency, trades: new Set(), materials: [] });
    });
    report.tradeGroups.forEach((t) => {
      t.jobNumbers.forEach((jn) => { map.get(jn)?.trades.add(t.trade); });
    });
    report.materialGroups.forEach((g) => {
      g.items.forEach((it) => {
        it.jobNumbers.forEach((jn) => {
          map.get(jn)?.materials.push({ name: it.name, qty: it.qty, unit: it.unit, urgency: it.urgency });
        });
      });
    });
    return map;
  }, [report]);

  const propertyRows = useMemo(() =>
    Array.from(propertyMap.values()).sort((a, b) => URGENCY_STYLES[a.urgency].rank - URGENCY_STYLES[b.urgency].rank),
  [propertyMap]);

  const drilldown = drilldownJob ? propertyMap.get(drilldownJob) : null;

  // ---------- Search + urgency filtering ----------
  const q = query.trim().toLowerCase();
  const matchesUrg = (u: Urgency) => urgencyFilter === 'all' || urgencyFilter === u;

  const filteredTrades = useMemo(
    () => grandTrades.filter(t => matchesUrg(t.topUrgency) && (!q || t.trade.toLowerCase().includes(q) || t.jobNumbers.some(j => j.toLowerCase().includes(q)))),
    [grandTrades, q, urgencyFilter],
  );
  const filteredMaterials = useMemo(
    () => grandMaterials.filter(m => matchesUrg(m.urgency) && (!q || m.name.toLowerCase().includes(q) || m.unit.toLowerCase().includes(q))),
    [grandMaterials, q, urgencyFilter],
  );
  const filteredProperties = useMemo(
    () => propertyRows.filter(p => {
      if (!matchesUrg(p.urgency)) return false;
      if (!q) return true;
      if (p.jobNumber.toLowerCase().includes(q)) return true;
      if ((p.address || '').toLowerCase().includes(q)) return true;
      if (Array.from(p.trades).some(t => t.toLowerCase().includes(q))) return true;
      if (p.materials.some(m => m.name.toLowerCase().includes(q))) return true;
      return false;
    }),
    [propertyRows, q, urgencyFilter],
  );

  // ---------- Accuracy audit ----------
  const audit = useMemo(() => {
    if (!sourceJobs || sourceJobs.length === 0) return null;
    const sourceSet = new Map(sourceJobs.map(j => [j.jobNumber, j]));
    const reportSet = new Set(report.jobs.map(j => j.jobNumber));
    const missing = sourceJobs.filter(j => !reportSet.has(j.jobNumber));
    const extra = report.jobs.filter(j => !sourceSet.has(j.jobNumber));
    const completedInScope = sourceJobs.filter(j => j.isCompleted || j.status === 'complete');
    // Material refs / trade refs that point at job numbers not in the source set
    const allRefdJobs = new Set<string>();
    report.tradeGroups.forEach(t => t.jobNumbers.forEach(j => allRefdJobs.add(j)));
    report.materialGroups.forEach(g => g.items.forEach(it => it.jobNumbers.forEach(j => allRefdJobs.add(j))));
    const orphanRefs = Array.from(allRefdJobs).filter(j => !sourceSet.has(j));
    const countMatches = report.jobCount === sourceJobs.length;
    const issues =
      (countMatches ? 0 : 1) +
      (missing.length > 0 ? 1 : 0) +
      (extra.length > 0 ? 1 : 0) +
      (orphanRefs.length > 0 ? 1 : 0) +
      (completedInScope.length > 0 ? 1 : 0);
    return { sourceCount: sourceJobs.length, reportCount: report.jobCount, countMatches, missing, extra, orphanRefs, completedInScope, issues };
  }, [sourceJobs, report]);

  const handleCopy = async () => {
    const text = buildPlainText(report, title, grandTrades, grandMaterials);
    await navigator.clipboard.writeText(text);
    setCopied(true);
    toast({ title: 'Copied to clipboard' });
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePDF = () => {
    try {
      const doc = buildPDF(report, title, grandTrades, grandMaterials, propertyRows);
      downloadPDF(doc, `materials-report-${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (e) {
      toast({ title: 'PDF failed', description: e instanceof Error ? e.message : 'Unknown error', variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title || 'Materials & Trades Report'}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {report.jobCount} jobs · {new Date(report.generatedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleCopy}>
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Copied' : 'Copy'}
          </Button>
          <Button size="sm" onClick={handlePDF}>
            <Download className="w-4 h-4" />
            Download PDF
          </Button>
        </div>
      </div>

      {/* Executive summary */}
      {report.summary && (
        <Card className="p-4 bg-muted/30 border-l-4 border-l-primary">
          <p className="text-sm leading-relaxed">{report.summary}</p>
        </Card>
      )}

      {/* Accuracy verification audit */}
      {audit && (
        <Card className={cn('p-4 border-l-4', audit.issues === 0 ? 'border-l-success bg-success/5' : 'border-l-warning bg-warning/5')}>
          <button onClick={() => setAuditOpen(o => !o)} className="w-full flex items-center gap-2 text-left">
            {audit.issues === 0 ? (
              <ShieldCheck className="w-4 h-4 text-success" />
            ) : (
              <ShieldAlert className="w-4 h-4 text-warning" />
            )}
            <h2 className="text-sm font-semibold">
              Accuracy Verification —{' '}
              {audit.issues === 0
                ? 'All checks passed'
                : `${audit.issues} ${audit.issues === 1 ? 'issue' : 'issues'} flagged`}
            </h2>
            <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">
              Source {audit.sourceCount} · Report {audit.reportCount}
            </span>
            <ChevronDown className={cn('w-4 h-4 text-muted-foreground transition-transform', auditOpen && 'rotate-180')} />
          </button>
          {auditOpen && (
            <div className="mt-3 grid sm:grid-cols-2 gap-2 text-xs">
              <AuditRow ok={audit.countMatches} label="Job count matches" detail={`${audit.reportCount} / ${audit.sourceCount}`} />
              <AuditRow ok={audit.missing.length === 0} label="No missing jobs" detail={audit.missing.length === 0 ? 'All source jobs covered' : `${audit.missing.length} missing: ${audit.missing.slice(0, 5).map(j => j.jobNumber).join(', ')}${audit.missing.length > 5 ? '…' : ''}`} />
              <AuditRow ok={audit.extra.length === 0} label="No phantom jobs" detail={audit.extra.length === 0 ? 'No unexpected jobs' : `${audit.extra.length} extra: ${audit.extra.slice(0, 5).map(j => j.jobNumber).join(', ')}${audit.extra.length > 5 ? '…' : ''}`} />
              <AuditRow ok={audit.orphanRefs.length === 0} label="Trade/material refs valid" detail={audit.orphanRefs.length === 0 ? 'All references resolve' : `${audit.orphanRefs.length} orphan refs`} />
              <AuditRow ok={audit.completedInScope.length === 0} label="No completed jobs in scope" detail={audit.completedInScope.length === 0 ? 'Scope is incomplete jobs only' : `${audit.completedInScope.length} completed jobs included`} />
            </div>
          )}
        </Card>
      )}

      {/* Search + urgency filter */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search property, job no, trade, or material..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        <Select value={urgencyFilter} onValueChange={(v) => setUrgencyFilter(v as any)}>
          <SelectTrigger className="w-40 h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All urgencies</SelectItem>
            <SelectItem value="critical">Critical only</SelectItem>
            <SelectItem value="high">High only</SelectItem>
            <SelectItem value="medium">Medium only</SelectItem>
            <SelectItem value="low">Low only</SelectItem>
          </SelectContent>
        </Select>
        {(query || urgencyFilter !== 'all') && (
          <Button variant="ghost" size="sm" onClick={() => { setQuery(''); setUrgencyFilter('all'); }}>
            Clear
          </Button>
        )}
      </div>

      {/* GRAND TOTALS — at-a-glance procurement view */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <Wrench className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold">Grand Totals — Trades</h2>
            <Badge variant="secondary" className="ml-auto text-[10px]">{filteredTrades.length}/{grandTrades.length}</Badge>
          </div>
          {filteredTrades.length === 0 ? (
            <p className="text-sm text-muted-foreground">{grandTrades.length === 0 ? 'None identified.' : 'No matches.'}</p>
          ) : (
            <div className="space-y-1 max-h-[420px] overflow-y-auto pr-1">
              {filteredTrades.map((t) => (
                <div key={t.trade} className="flex items-center justify-between gap-2 py-1.5 px-2 rounded hover:bg-muted/40 text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', URGENCY_STYLES[t.topUrgency].dot)} />
                    <span className="truncate">{t.trade}</span>
                  </div>
                  <span className="font-mono text-xs tabular-nums text-muted-foreground shrink-0">
                    {t.jobCount} {t.jobCount === 1 ? 'job' : 'jobs'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <Package className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold">Grand Totals — Materials</h2>
            <Badge variant="secondary" className="ml-auto text-[10px]">{filteredMaterials.length}/{grandMaterials.length}</Badge>
          </div>
          {filteredMaterials.length === 0 ? (
            <p className="text-sm text-muted-foreground">{grandMaterials.length === 0 ? 'No materials identified.' : 'No matches.'}</p>
          ) : (
            <div className="space-y-0.5 max-h-[420px] overflow-y-auto pr-1">
              {filteredMaterials.map((m, i) => (
                <div key={i} className="flex items-center justify-between gap-2 py-1.5 px-2 rounded hover:bg-muted/40 text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', URGENCY_STYLES[m.urgency].dot)} />
                    <span className="truncate">{m.name}</span>
                  </div>
                  <span className="font-mono text-xs tabular-nums shrink-0">
                    {m.qty} <span className="text-muted-foreground">{m.unit}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Action list — concise */}
      {report.actionList.length > 0 && (
        <Card className="p-5">
          <h2 className="text-sm font-semibold mb-3">Priority Actions</h2>
          <ol className="space-y-2">
            {report.actionList.slice(0, 8).map((a, i) => (
              <li key={i} className="flex items-start gap-3 text-sm">
                <span className="font-mono text-xs text-muted-foreground tabular-nums mt-0.5 w-5">{i + 1}.</span>
                <UrgencyBadge urgency={a.priority} />
                <span className="flex-1">{a.action}</span>
              </li>
            ))}
          </ol>
        </Card>
      )}

      {/* Properties — clickable for drilldown */}
      {propertyRows.length > 0 && (
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold">Properties ({filteredProperties.length}/{propertyRows.length})</h2>
            <span className="text-[11px] text-muted-foreground">Click any row for full breakdown</span>
          </div>
          {filteredProperties.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No properties match your filters.</p>
          ) : (
            <div className="divide-y max-h-[500px] overflow-y-auto">
              {filteredProperties.map((p) => (
                <button
                  key={p.jobNumber}
                  onClick={() => setDrilldownJob(p.jobNumber)}
                  className="w-full flex items-center gap-3 py-2.5 px-2 -mx-2 rounded hover:bg-muted/50 text-left transition-colors"
                >
                  <span className="font-mono text-xs text-muted-foreground w-16 shrink-0">{p.jobNumber}</span>
                  <span className="flex-1 truncate text-sm">{p.address || '—'}</span>
                  <span className="text-[11px] text-muted-foreground tabular-nums hidden sm:inline">
                    {p.trades.size}T · {p.materials.length}M
                  </span>
                  <UrgencyBadge urgency={p.urgency} />
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                </button>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Important notes */}
      {report.tbcNotes.length > 0 && (
        <Card className="p-5 bg-warning/5 border-warning/30">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-warning" />
            <h2 className="text-sm font-semibold text-warning">Important Notes</h2>
          </div>
          <ul className="space-y-1.5 text-sm">
            {report.tbcNotes.map((n, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-warning shrink-0">•</span>
                <span>{n}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Per-job drilldown dialog */}
      <Dialog open={!!drilldown} onOpenChange={(o) => !o && setDrilldownJob(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3 flex-wrap">
              <span className="font-mono text-sm text-muted-foreground">{drilldown?.jobNumber}</span>
              <span className="flex-1 truncate">{drilldown?.address || '—'}</span>
              {drilldown && <UrgencyBadge urgency={drilldown.urgency} />}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-5 pr-1">
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Trades Required ({drilldown?.trades.size ?? 0})
              </h3>
              {drilldown && drilldown.trades.size > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {Array.from(drilldown.trades).map((t) => (
                    <Badge key={t} variant="secondary">{t}</Badge>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">None identified.</p>
              )}
            </section>
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Materials ({drilldown?.materials.length ?? 0})
              </h3>
              {drilldown && drilldown.materials.length > 0 ? (
                <div className="divide-y border rounded-md">
                  {drilldown.materials.map((m, i) => (
                    <div key={i} className="flex items-center justify-between gap-3 py-2 px-3 text-sm">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', URGENCY_STYLES[m.urgency].dot)} />
                        <span className="truncate">{m.name}</span>
                      </div>
                      <span className="font-mono text-xs tabular-nums shrink-0">
                        {m.qty} <span className="text-muted-foreground">{m.unit}</span>
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No materials listed.</p>
              )}
            </section>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function buildPlainText(
  r: MaterialsReportData,
  title: string | undefined,
  grandTrades: Array<{ trade: string; jobCount: number; topUrgency: Urgency }>,
  grandMaterials: Array<{ name: string; qty: number; unit: string; urgency: Urgency }>,
): string {
  const lines: string[] = [];
  lines.push(title || 'Materials & Trades Report');
  lines.push(`${r.jobCount} jobs · ${new Date(r.generatedAt).toLocaleString('en-GB')}`);
  if (r.summary) { lines.push('', r.summary); }
  lines.push('', 'GRAND TOTALS — TRADES');
  grandTrades.forEach(t => lines.push(`  ${t.trade}: ${t.jobCount} jobs [${t.topUrgency}]`));
  lines.push('', 'GRAND TOTALS — MATERIALS');
  grandMaterials.forEach(m => lines.push(`  ${m.name} — ${m.qty} ${m.unit} [${m.urgency}]`));
  if (r.actionList.length) {
    lines.push('', 'PRIORITY ACTIONS');
    r.actionList.forEach((a, i) => lines.push(`  ${i + 1}. [${a.priority.toUpperCase()}] ${a.action}`));
  }
  if (r.tbcNotes.length) {
    lines.push('', 'IMPORTANT NOTES');
    r.tbcNotes.forEach(n => lines.push(`  • ${n}`));
  }
  return lines.join('\n');
}

function buildPDF(
  r: MaterialsReportData,
  title: string | undefined,
  grandTrades: Array<{ trade: string; jobCount: number; jobNumbers: string[]; topUrgency: Urgency }>,
  grandMaterials: Array<{ name: string; qty: number; unit: string; urgency: Urgency; jobs: Set<string> }>,
  propertyRows: Array<{ jobNumber: string; address: string | null; urgency: Urgency; trades: Set<string>; materials: Array<{ name: string; qty: number; unit: string }> }>,
): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 14;

  doc.setFontSize(16); doc.setFont('helvetica', 'bold');
  doc.text(title || 'Materials & Trades Report', 14, y); y += 6;
  doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(100);
  doc.text(`${r.jobCount} jobs · Generated ${new Date(r.generatedAt).toLocaleString('en-GB')}`, 14, y);
  doc.setTextColor(0); y += 6;

  if (r.summary) {
    doc.setFontSize(10);
    const wrapped = doc.splitTextToSize(r.summary, pageWidth - 28);
    doc.text(wrapped, 14, y); y += wrapped.length * 4.5 + 3;
  }

  // GRAND TOTALS — TRADES
  if (grandTrades.length) {
    autoTable(doc, {
      startY: y,
      head: [['Grand Totals — Trades', 'Jobs', 'Urgency']],
      body: grandTrades.map(t => [t.trade, String(t.jobCount), t.topUrgency.toUpperCase()]),
      headStyles: { fillColor: [30, 41, 59], halign: 'left' },
      styles: { fontSize: 9, cellPadding: 1.8 },
      columnStyles: { 1: { cellWidth: 18, halign: 'right' }, 2: { cellWidth: 24 } },
      margin: { left: 14, right: 14 },
    });
    // @ts-expect-error
    y = doc.lastAutoTable.finalY + 4;
  }

  // GRAND TOTALS — MATERIALS
  if (grandMaterials.length) {
    autoTable(doc, {
      startY: y,
      head: [['Grand Totals — Materials', 'Qty', 'Unit', 'Urgency', 'Jobs']],
      body: grandMaterials.map(m => [m.name, String(m.qty), m.unit, m.urgency.toUpperCase(), String(m.jobs.size)]),
      headStyles: { fillColor: [30, 41, 59], halign: 'left' },
      styles: { fontSize: 8.5, cellPadding: 1.5 },
      columnStyles: { 1: { cellWidth: 14, halign: 'right' }, 2: { cellWidth: 16 }, 3: { cellWidth: 22 }, 4: { cellWidth: 14, halign: 'right' } },
      margin: { left: 14, right: 14 },
    });
    // @ts-expect-error
    y = doc.lastAutoTable.finalY + 4;
  }

  // PRIORITY ACTIONS
  if (r.actionList.length) {
    autoTable(doc, {
      startY: y,
      head: [['#', 'Priority', 'Action']],
      body: r.actionList.map((a, i) => [String(i + 1), a.priority.toUpperCase(), a.action]),
      headStyles: { fillColor: [51, 65, 85] },
      styles: { fontSize: 8.5, cellPadding: 1.5 },
      columnStyles: { 0: { cellWidth: 8 }, 1: { cellWidth: 22 } },
      margin: { left: 14, right: 14 },
    });
    // @ts-expect-error
    y = doc.lastAutoTable.finalY + 4;
  }

  // PROPERTIES (one row per property with trades + materials inline)
  if (propertyRows.length) {
    autoTable(doc, {
      startY: y,
      head: [['Job', 'Property', 'Urgency', 'Trades', 'Materials']],
      body: propertyRows.map(p => [
        p.jobNumber,
        p.address || '—',
        p.urgency.toUpperCase(),
        Array.from(p.trades).join(', ') || '—',
        p.materials.map(m => `${m.name} (${m.qty} ${m.unit})`).join('; ') || '—',
      ]),
      headStyles: { fillColor: [51, 65, 85] },
      styles: { fontSize: 7.5, cellPadding: 1.3, valign: 'top' },
      columnStyles: {
        0: { cellWidth: 18 },
        1: { cellWidth: 42 },
        2: { cellWidth: 18 },
        3: { cellWidth: 38 },
      },
      margin: { left: 14, right: 14 },
    });
    // @ts-expect-error
    y = doc.lastAutoTable.finalY + 4;
  }

  // IMPORTANT NOTES
  if (r.tbcNotes.length) {
    autoTable(doc, {
      startY: y,
      head: [['Important Notes & Site Confirmation']],
      body: r.tbcNotes.map(n => [n]),
      headStyles: { fillColor: [180, 83, 9] },
      styles: { fontSize: 8.5, cellPadding: 1.5 },
      margin: { left: 14, right: 14 },
    });
  }

  return doc;
}
