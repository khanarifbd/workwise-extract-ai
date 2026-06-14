import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Plus, Trash2, AlertCircle, CheckCircle2, Sparkles } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface BookOption {
  id: string;
  file_name: string;
}

interface ParsedRow {
  id: string;
  code: string;
  description: string;
  cost: number;
  unit: string;
  category: string;
  dupInPaste?: boolean;
  dupInBook?: boolean;
  error?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
  defaultBookId?: string;
}

const SOR_CODE_REGEX = /^[A-Z0-9][A-Z0-9._/-]{1,29}$/i;

/** Parse one line of pasted input into a row. Supports tab/pipe/comma/multi-space separators. */
function parseLine(raw: string): Omit<ParsedRow, 'id' | 'dupInPaste' | 'dupInBook' | 'error'> | null {
  const line = raw.trim();
  if (!line) return null;

  // Try explicit separators first (tab > pipe > comma)
  let parts: string[] | null = null;
  if (line.includes('\t')) parts = line.split('\t');
  else if (line.includes(' | ') || line.includes('|')) parts = line.split('|');
  else if (line.includes(',') && line.split(',').length >= 2) parts = line.split(',');

  if (parts) {
    const [code = '', description = '', cost = '', unit = '', category = ''] = parts.map((p) => p.trim());
    return {
      code: code.toUpperCase(),
      description,
      cost: parseFloat(cost.replace(/[£$,]/g, '')) || 0,
      unit,
      category,
    };
  }

  // Fallback: "CODE  description ...  cost  unit"
  // Code is the first whitespace-delimited token; trailing numeric token (with optional currency) is cost; token after cost is unit.
  const tokens = line.split(/\s+/);
  const code = (tokens.shift() || '').toUpperCase();
  if (!code) return null;

  let cost = 0;
  let unit = '';
  // Look at last 1-2 tokens for cost (+ unit)
  if (tokens.length >= 2) {
    const maybeUnit = tokens[tokens.length - 1];
    const maybeCost = tokens[tokens.length - 2].replace(/[£$,]/g, '');
    if (/^\d+(\.\d+)?$/.test(maybeCost) && /^[a-zA-Z%²³]{1,6}\d?$/.test(maybeUnit)) {
      cost = parseFloat(maybeCost);
      unit = maybeUnit;
      tokens.splice(tokens.length - 2, 2);
    }
  }
  if (cost === 0 && tokens.length >= 1) {
    const last = tokens[tokens.length - 1].replace(/[£$,]/g, '');
    if (/^\d+(\.\d+)?$/.test(last)) {
      cost = parseFloat(last);
      tokens.pop();
    }
  }

  return {
    code,
    description: tokens.join(' ').trim(),
    cost,
    unit,
    category: '',
  };
}

function validateRow(r: Pick<ParsedRow, 'code' | 'description'>): string | undefined {
  if (!r.code) return 'Missing code';
  if (!SOR_CODE_REGEX.test(r.code)) return 'Invalid code format';
  if (!r.description) return 'Missing description';
  return undefined;
}

function newRow(partial: Partial<ParsedRow> = {}): ParsedRow {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    code: '',
    description: '',
    cost: 0,
    unit: '',
    category: '',
    ...partial,
  };
}

export const SORCodePasteDialog = ({ open, onOpenChange, onSaved, defaultBookId }: Props) => {
  const { toast } = useToast();
  const [books, setBooks] = useState<BookOption[]>([]);
  const [bookId, setBookId] = useState<string>('');
  const [existingCodes, setExistingCodes] = useState<Set<string>>(new Set());
  const [rawText, setRawText] = useState('');
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<'paste' | 'single'>('paste');

  // Load books + existing codes for selected book
  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data } = await supabase.from('sor_code_books').select('id, file_name').order('created_at');
      const list = (data ?? []) as BookOption[];
      setBooks(list);
      const initialId = defaultBookId || list[0]?.id || '';
      setBookId(initialId);
    })();
  }, [open, defaultBookId]);

  useEffect(() => {
    if (!bookId) {
      setExistingCodes(new Set());
      return;
    }
    (async () => {
      // Fetch in chunks via range to avoid 1000 row limit
      const all: string[] = [];
      const pageSize = 1000;
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await supabase
          .from('sor_code_entries')
          .select('code')
          .eq('book_id', bookId)
          .range(from, from + pageSize - 1);
        if (error || !data || data.length === 0) break;
        all.push(...data.map((d) => (d.code || '').toUpperCase().trim()));
        if (data.length < pageSize) break;
      }
      setExistingCodes(new Set(all));
    })();
  }, [bookId, open]);

  // Re-flag duplicates whenever rows or existingCodes change
  const flaggedRows = useMemo<ParsedRow[]>(() => {
    const seen = new Map<string, number>();
    return rows.map((r) => {
      const key = r.code.toUpperCase().trim();
      const count = (seen.get(key) || 0) + 1;
      if (key) seen.set(key, count);
      return {
        ...r,
        dupInPaste: !!key && count > 1,
        dupInBook: !!key && existingCodes.has(key),
        error: validateRow(r),
      };
    });
  }, [rows, existingCodes]);

  const stats = useMemo(() => {
    const valid = flaggedRows.filter((r) => !r.error && !r.dupInPaste);
    const newRows = valid.filter((r) => !r.dupInBook);
    const dupRows = valid.filter((r) => r.dupInBook);
    const errorRows = flaggedRows.filter((r) => r.error || r.dupInPaste);
    return { total: flaggedRows.length, newRows: newRows.length, dupRows: dupRows.length, errorRows: errorRows.length };
  }, [flaggedRows]);

  const handleParse = () => {
    const parsed = rawText
      .split(/\r?\n/)
      .map((l) => parseLine(l))
      .filter(Boolean)
      .map((p) => newRow(p as object));
    setRows((prev) => [...prev, ...parsed]);
    setRawText('');
    toast({ title: `Parsed ${parsed.length} row${parsed.length === 1 ? '' : 's'}` });
  };

  const updateRow = (id: string, patch: Partial<ParsedRow>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const removeRow = (id: string) => setRows((prev) => prev.filter((r) => r.id !== id));

  const handleSave = async () => {
    if (!bookId) {
      toast({ title: 'Pick a book first', variant: 'destructive' });
      return;
    }
    const toInsert = flaggedRows.filter((r) => {
      if (r.error || r.dupInPaste) return false;
      if (r.dupInBook && skipDuplicates) return false;
      return true;
    });
    if (toInsert.length === 0) {
      toast({ title: 'Nothing to add', description: 'No valid new codes to insert.', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const payload = toInsert.map((r) => ({
        book_id: bookId,
        code: r.code.toUpperCase().trim(),
        description: r.description.trim(),
        cost: Number.isFinite(r.cost) ? r.cost : 0,
        unit: r.unit || null,
        category: r.category || 'Manual Entry',
      }));

      // Insert in batches of 500
      const batchSize = 500;
      let inserted = 0;
      for (let i = 0; i < payload.length; i += batchSize) {
        const batch = payload.slice(i, i + batchSize);
        const { error } = await supabase.from('sor_code_entries').insert(batch);
        if (error) throw error;
        inserted += batch.length;
      }

      // Refresh book code_count
      const { count } = await supabase
        .from('sor_code_entries')
        .select('id', { count: 'exact', head: true })
        .eq('book_id', bookId);
      if (typeof count === 'number') {
        await supabase.from('sor_code_books').update({ code_count: count, status: 'ready' }).eq('id', bookId);
      }

      toast({ title: 'Saved', description: `Added ${inserted} SOR code${inserted === 1 ? '' : 's'}.` });
      setRows([]);
      setRawText('');
      onSaved?.();
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: 'Save failed', description: e?.message || String(e), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            Add SOR Codes Manually
          </DialogTitle>
          <DialogDescription>
            Paste from a spreadsheet, type rows in bulk, or add codes one at a time. Duplicates against the book are detected automatically.
          </DialogDescription>
        </DialogHeader>

        {/* Target book */}
        <div className="flex items-center gap-3">
          <Label className="text-sm shrink-0">Target book:</Label>
          <Select value={bookId} onValueChange={setBookId}>
            <SelectTrigger className="max-w-sm">
              <SelectValue placeholder="Select a book" />
            </SelectTrigger>
            <SelectContent>
              {books.map((b) => (
                <SelectItem key={b.id} value={b.id}>{b.file_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Badge variant="secondary">{existingCodes.size.toLocaleString()} existing</Badge>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as 'paste' | 'single')} className="flex-1 flex flex-col min-h-0">
          <TabsList>
            <TabsTrigger value="paste">Paste / Bulk</TabsTrigger>
            <TabsTrigger value="single">Single Entry</TabsTrigger>
          </TabsList>

          <TabsContent value="paste" className="space-y-3 mt-3">
            <div>
              <Label className="text-xs text-muted-foreground">
                One per line. Supports tab (Excel), pipe (<code>|</code>), or comma separators. Order: <code>CODE | Description | Cost | Unit | Category</code>.
                Plain &quot;CODE description cost unit&quot; lines also work.
              </Label>
              <Textarea
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder={`0101AA | Demolish brick wall | 45.50 | m2 | Demolition\n0102AB\tStrip plaster\t12.00\tm2\n3007AA Replace flat roof felt 95.00 m2`}
                className="font-mono text-xs h-40 mt-1"
              />
            </div>
            <Button onClick={handleParse} disabled={!rawText.trim()} variant="secondary" size="sm">
              <Plus className="w-4 h-4 mr-1" /> Parse &amp; Preview
            </Button>
          </TabsContent>

          <TabsContent value="single" className="space-y-3 mt-3">
            <SingleEntryForm onAdd={(r) => setRows((prev) => [...prev, newRow(r)])} />
          </TabsContent>
        </Tabs>

        {/* Preview table */}
        {flaggedRows.length > 0 && (
          <div className="flex-1 min-h-0 flex flex-col border rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 bg-muted/40 border-b text-xs">
              <div className="flex items-center gap-3">
                <Badge variant="secondary" className="gap-1">
                  <CheckCircle2 className="w-3 h-3 text-green-600" /> {stats.newRows} new
                </Badge>
                <Badge variant="secondary" className="gap-1">
                  <AlertCircle className="w-3 h-3 text-amber-500" /> {stats.dupRows} duplicate
                </Badge>
                {stats.errorRows > 0 && (
                  <Badge variant="destructive" className="gap-1">
                    <AlertCircle className="w-3 h-3" /> {stats.errorRows} invalid
                  </Badge>
                )}
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox checked={skipDuplicates} onCheckedChange={(v) => setSkipDuplicates(!!v)} />
                <span>Skip duplicates already in book</span>
              </label>
            </div>
            <div className="overflow-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/30 sticky top-0">
                  <tr className="text-left">
                    <th className="px-2 py-1.5 w-32">Code</th>
                    <th className="px-2 py-1.5">Description</th>
                    <th className="px-2 py-1.5 w-24">Cost</th>
                    <th className="px-2 py-1.5 w-20">Unit</th>
                    <th className="px-2 py-1.5 w-36">Category</th>
                    <th className="px-2 py-1.5 w-32">Status</th>
                    <th className="px-2 py-1.5 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {flaggedRows.map((r) => {
                    const status = r.error
                      ? { label: r.error, cls: 'text-destructive' }
                      : r.dupInPaste
                        ? { label: 'Dup in paste', cls: 'text-destructive' }
                        : r.dupInBook
                          ? { label: skipDuplicates ? 'Skip (dup)' : 'Overwrite dup', cls: 'text-amber-600' }
                          : { label: 'New', cls: 'text-green-600' };
                    return (
                      <tr key={r.id} className={cn('border-t', r.error && 'bg-destructive/5')}>
                        <td className="px-1 py-1">
                          <Input value={r.code} onChange={(e) => updateRow(r.id, { code: e.target.value.toUpperCase() })} className="h-7 text-xs font-mono" />
                        </td>
                        <td className="px-1 py-1">
                          <Input value={r.description} onChange={(e) => updateRow(r.id, { description: e.target.value })} className="h-7 text-xs" />
                        </td>
                        <td className="px-1 py-1">
                          <Input type="number" step="0.01" value={r.cost} onChange={(e) => updateRow(r.id, { cost: parseFloat(e.target.value) || 0 })} className="h-7 text-xs" />
                        </td>
                        <td className="px-1 py-1">
                          <Input value={r.unit} onChange={(e) => updateRow(r.id, { unit: e.target.value })} className="h-7 text-xs" />
                        </td>
                        <td className="px-1 py-1">
                          <Input value={r.category} onChange={(e) => updateRow(r.id, { category: e.target.value })} className="h-7 text-xs" />
                        </td>
                        <td className={cn('px-2 py-1 whitespace-nowrap', status.cls)}>{status.label}</td>
                        <td className="px-1 py-1">
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => removeRow(r.id)}>
                            <Trash2 className="w-3.5 h-3.5 text-destructive" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => { setRows([]); setRawText(''); }} disabled={saving || flaggedRows.length === 0}>
            Clear all
          </Button>
          <Button onClick={handleSave} disabled={saving || stats.newRows + (skipDuplicates ? 0 : stats.dupRows) === 0}>
            {saving ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Saving…</> : `Save ${stats.newRows}${!skipDuplicates && stats.dupRows ? ` + overwrite ${stats.dupRows}` : ''} code${stats.newRows === 1 ? '' : 's'}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

interface SingleEntryFormProps {
  onAdd: (row: Partial<ParsedRow>) => void;
}

const SingleEntryForm = ({ onAdd }: SingleEntryFormProps) => {
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [cost, setCost] = useState('');
  const [unit, setUnit] = useState('');
  const [category, setCategory] = useState('');

  const submit = () => {
    if (!code.trim() || !description.trim()) return;
    onAdd({
      code: code.toUpperCase().trim(),
      description: description.trim(),
      cost: parseFloat(cost) || 0,
      unit: unit.trim(),
      category: category.trim(),
    });
    setCode(''); setDescription(''); setCost(''); setUnit(''); setCategory('');
  };

  return (
    <div className="grid grid-cols-12 gap-2 items-end">
      <div className="col-span-2">
        <Label className="text-xs">Code *</Label>
        <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="0101AA" className="font-mono" />
      </div>
      <div className="col-span-4">
        <Label className="text-xs">Description *</Label>
        <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Demolish brick wall" />
      </div>
      <div className="col-span-2">
        <Label className="text-xs">Cost (£)</Label>
        <Input type="number" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0.00" />
      </div>
      <div className="col-span-1">
        <Label className="text-xs">Unit</Label>
        <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="m2" />
      </div>
      <div className="col-span-2">
        <Label className="text-xs">Category</Label>
        <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Optional" />
      </div>
      <div className="col-span-1">
        <Button onClick={submit} size="sm" className="w-full" disabled={!code.trim() || !description.trim()}>
          <Plus className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
};
