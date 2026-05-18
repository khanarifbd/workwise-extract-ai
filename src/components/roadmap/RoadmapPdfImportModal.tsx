import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Upload, FileText, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { extractTextFromPDF } from '@/lib/pdfUtils';
import { supabase } from '@/integrations/supabase/client';
import { ROADMAP_COLORS, parseLocalDate, toISODate } from '@/lib/roadmapUtils';
import { RoadmapItem, Roadmap } from '@/hooks/useRoadmaps';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

interface ExtractedItem {
  label: string;
  start_date: string;
  end_date: string;
  duration_days?: number;
  trade?: string;
  notes?: string;
}
interface Extracted {
  customer_name?: string;
  address?: string;
  project_start?: string;
  project_end?: string;
  items: ExtractedItem[];
}

type DupAction = 'add' | 'skip' | 'replace';
interface Row {
  item: ExtractedItem;
  include: boolean;
  duplicateOf?: RoadmapItem;
  action: DupAction;
  color: string;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  roadmap: Roadmap;
  existingItems: RoadmapItem[];
  onImport: (params: {
    toInsert: Partial<RoadmapItem>[];
    toUpdate: { id: string; patch: Partial<RoadmapItem> }[];
    roadmapPatch?: Partial<Roadmap>;
  }) => Promise<void>;
}

const palette = ROADMAP_COLORS.map(c => c.value);
const colorForTrade = (trade?: string) => {
  if (!trade) return palette[0];
  const map: Record<string, string> = {
    plumbing: '#0d9488', electrical: '#d97706', carpentry: '#92400e',
    roofing: '#ea580c', flooring: '#7c3aed', painting: '#db2777',
    plastering: '#475569', kitchen: '#16a34a', bathroom: '#2563eb',
  };
  return map[trade.toLowerCase()] || palette[0];
};

const normalise = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

export const RoadmapPdfImportModal = ({ open, onOpenChange, roadmap, existingItems, onImport }: Props) => {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [extracted, setExtracted] = useState<Extracted | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [customer, setCustomer] = useState('');
  const [address, setAddress] = useState('');

  const reset = () => { setFile(null); setExtracted(null); setRows([]); setCustomer(''); setAddress(''); };

  const handleExtract = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const text = await extractTextFromPDF(file);
      const { data, error } = await supabase.functions.invoke('extract-roadmap-items', {
        body: { pdfText: text, roadmapStart: roadmap.start_date, roadmapEnd: roadmap.end_date },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Extraction failed');
      const ex: Extracted = data.data;

      // Sequence items missing both dates and duration: default 7-day blocks for week view, 2 days for day view
      const defaultDur = roadmap.time_unit === 'week' ? 7 : 2;
      let cursor = parseLocalDate(roadmap.start_date);
      const built: Row[] = (ex.items || []).map((it) => {
        let s = it.start_date;
        let e = it.end_date;
        const dur = it.duration_days && it.duration_days > 0 ? it.duration_days : defaultDur;

        if (!s && !e) {
          // Both missing → place at cursor with duration
          const sd = new Date(cursor);
          const ed = new Date(cursor); ed.setDate(ed.getDate() + Math.max(0, dur - 1));
          s = toISODate(sd); e = toISODate(ed);
          cursor = new Date(ed); cursor.setDate(cursor.getDate() + 1);
        } else if (s && !e) {
          const sd = parseLocalDate(s);
          const ed = new Date(sd); ed.setDate(ed.getDate() + Math.max(0, dur - 1));
          e = toISODate(ed);
        } else if (!s && e) {
          s = e;
        }
        if (parseLocalDate(e!) < parseLocalDate(s!)) e = s;

        const dup = existingItems.find(x => normalise(x.label) === normalise(it.label));
        return {
          item: { ...it, start_date: s!, end_date: e! },
          include: true,
          duplicateOf: dup,
          // Default to ADD (not skip) so one click imports everything
          action: dup ? 'add' : 'add',
          color: colorForTrade(it.trade),
        };
      });
      setExtracted(ex);
      setRows(built);
      setCustomer(ex.customer_name || '');
      setAddress(ex.address || '');
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : 'Failed to extract PDF');
    } finally {
      setBusy(false);
    }
  };

  const handleImport = async () => {
    const toInsert: Partial<RoadmapItem>[] = [];
    const toUpdate: { id: string; patch: Partial<RoadmapItem> }[] = [];
    rows.forEach(r => {
      if (!r.include) return;
      const base: Partial<RoadmapItem> = {
        label: r.item.label.slice(0, 60),
        start_date: r.item.start_date,
        end_date: r.item.end_date,
        color: r.color,
        notes: r.item.notes || '',
      };
      if (r.duplicateOf) {
        if (r.action === 'replace') toUpdate.push({ id: r.duplicateOf.id, patch: base });
        else if (r.action === 'add') toInsert.push(base);
        // skip => nothing
      } else {
        toInsert.push(base);
      }
    });

    // Auto-extend roadmap window so all extracted bars fit
    const includedRows = rows.filter(r => r.include && r.action !== 'skip');
    let minDate = parseLocalDate(roadmap.start_date);
    let maxDate = parseLocalDate(roadmap.end_date);
    includedRows.forEach(r => {
      const s = parseLocalDate(r.item.start_date);
      const e = parseLocalDate(r.item.end_date);
      if (s < minDate) minDate = s;
      if (e > maxDate) maxDate = e;
    });
    const roadmapPatch: Partial<Roadmap> = {};
    const newStart = toISODate(minDate);
    const newEnd = toISODate(maxDate);
    if (newStart !== roadmap.start_date) roadmapPatch.start_date = newStart;
    if (newEnd !== roadmap.end_date) roadmapPatch.end_date = newEnd;

    // Merge customer/address into roadmap notes (non-destructive)
    const header: string[] = [];
    if (customer && !roadmap.notes.includes(customer)) header.push(`Customer: ${customer}`);
    if (address && !roadmap.notes.includes(address)) header.push(`Address: ${address}`);
    if (header.length) {
      roadmapPatch.notes = [header.join('\n'), roadmap.notes].filter(Boolean).join('\n\n');
    }

    setBusy(true);
    try {
      await onImport({ toInsert, toUpdate, roadmapPatch: Object.keys(roadmapPatch).length ? roadmapPatch : undefined });
      toast.success(`Imported ${toInsert.length} new${toUpdate.length ? `, updated ${toUpdate.length}` : ''}`);
      reset();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setBusy(false);
    }
  };

  const duplicates = rows.filter(r => r.duplicateOf).length;
  const selectedCount = rows.filter(r => r.include && r.action !== 'skip').length;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FileText className="w-5 h-5" /> Import roadmap from PDF</DialogTitle>
        </DialogHeader>

        {!extracted ? (
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Upload a schedule, brief, or job sheet. The AI will extract tasks, trades, durations, customer name and address into roadmap items.
            </p>
            <div>
              <Label>PDF document</Label>
              <Input type="file" accept="application/pdf" onChange={e => setFile(e.target.files?.[0] || null)} />
              {file && <p className="text-xs text-muted-foreground mt-1">{file.name} · {(file.size / 1024).toFixed(0)} KB</p>}
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={handleExtract} disabled={!file || busy}>
                {busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Upload className="w-4 h-4 mr-1" />}
                Extract
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="grid sm:grid-cols-2 gap-3 p-3 rounded-md bg-muted/40 border">
              <div>
                <Label className="text-xs">Customer</Label>
                <Input value={customer} onChange={e => setCustomer(e.target.value)} placeholder="Customer name" />
              </div>
              <div>
                <Label className="text-xs">Address</Label>
                <Input value={address} onChange={e => setAddress(e.target.value)} placeholder="Property address" />
              </div>
            </div>

            {duplicates > 0 && (
              <div className="flex items-start gap-2 p-3 rounded-md border border-amber-500/40 bg-amber-500/10 text-sm">
                <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                <div>
                  <strong>{duplicates} possible duplicate{duplicates > 1 ? 's' : ''}</strong> matched against existing tasks.
                  Choose <em>Skip</em>, <em>Replace</em> existing, or <em>Add anyway</em> for each row.
                </div>
              </div>
            )}

            <div className="border rounded-md divide-y max-h-[45vh] overflow-y-auto">
              {rows.length === 0 && <div className="p-6 text-center text-muted-foreground text-sm">No items found in the document.</div>}
              {rows.map((r, idx) => (
                <div key={idx} className={cn('p-3 grid grid-cols-12 gap-2 items-center', !r.include && 'opacity-50')}>
                  <input type="checkbox" className="col-span-1" checked={r.include} onChange={e => setRows(p => p.map((x,i) => i===idx ? { ...x, include: e.target.checked } : x))} />
                  <div className="col-span-4">
                    <Input value={r.item.label} onChange={e => setRows(p => p.map((x,i) => i===idx ? { ...x, item: { ...x.item, label: e.target.value } } : x))} className="h-8 text-sm" />
                    {r.duplicateOf && <p className="text-[10px] text-amber-700 mt-0.5">↳ matches existing "{r.duplicateOf.label}"</p>}
                  </div>
                  <Input type="date" className="col-span-2 h-8 text-xs" value={r.item.start_date} onChange={e => setRows(p => p.map((x,i) => i===idx ? { ...x, item: { ...x.item, start_date: e.target.value } } : x))} />
                  <Input type="date" className="col-span-2 h-8 text-xs" value={r.item.end_date} onChange={e => setRows(p => p.map((x,i) => i===idx ? { ...x, item: { ...x.item, end_date: e.target.value } } : x))} />
                  <input type="color" className="col-span-1 h-8 w-full rounded border" value={r.color} onChange={e => setRows(p => p.map((x,i) => i===idx ? { ...x, color: e.target.value } : x))} />
                  <div className="col-span-2">
                    {r.duplicateOf ? (
                      <Select value={r.action} onValueChange={(v: DupAction) => setRows(p => p.map((x,i) => i===idx ? { ...x, action: v } : x))}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="skip">Skip</SelectItem>
                          <SelectItem value="replace">Replace</SelectItem>
                          <SelectItem value="add">Add anyway</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-green-600" /> New</span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <DialogFooter className="flex sm:justify-between gap-2">
              <Button variant="ghost" onClick={reset} disabled={busy}>← Choose different file</Button>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
                <Button onClick={handleImport} disabled={busy || selectedCount === 0}>
                  {busy && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                  Import {selectedCount} item{selectedCount === 1 ? '' : 's'}
                </Button>
              </div>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
