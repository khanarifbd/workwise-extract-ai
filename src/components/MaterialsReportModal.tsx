import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Sparkles, ArrowLeft, Trash2, Eye } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useCategories } from '@/hooks/useCategories';
import { toast } from '@/hooks/use-toast';
import { MaterialsReport, type MaterialsReportData } from './MaterialsReport';
import { format } from 'date-fns';

interface JobLite {
  id: string;
  job_number: string;
  name: string | null;
  address: string | null;
  category_id: string | null;
  date_issued: string | null;
  booked_date: string | null;
  status: string | null;
  is_completed: boolean | null;
  team: string | null;
}

interface SavedReport {
  id: string;
  title: string;
  job_count: number;
  created_at: string;
  report_data: MaterialsReportData;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function MaterialsReportModal({ open, onOpenChange }: Props) {
  const { categories } = useCategories();
  const [view, setView] = useState<'select' | 'report' | 'history'>('select');
  const [jobs, setJobs] = useState<JobLite[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<'incomplete' | 'all'>('incomplete');
  const [filterAssigned, setFilterAssigned] = useState<'any' | 'assigned' | 'unassigned'>('any');
  const [filterScope, setFilterScope] = useState<'database' | 'booked'>('database');
  const [generating, setGenerating] = useState(false);
  const [report, setReport] = useState<MaterialsReportData | null>(null);
  const [reportTitle, setReportTitle] = useState('');
  const [savedReports, setSavedReports] = useState<SavedReport[]>([]);

  useEffect(() => {
    if (!open) return;
    setView('select');
    setReport(null);
    loadJobs();
    loadSavedReports();
  }, [open]);

  const loadJobs = async () => {
    setLoading(true);
    try {
      // Chunked fetch to bypass PostgREST 1000-row default limit and load every job
      const PAGE = 1000;
      let from = 0;
      const all: JobLite[] = [];
      // Hard ceiling to avoid runaway loops; raise if dataset grows beyond this
      while (from < 50000) {
        const { data, error } = await supabase
          .from('jobs')
          .select('id,job_number,name,address,category_id,date_issued,booked_date,status,is_completed,team')
          .is('deleted_at', null)
          .order('date_issued', { ascending: false })
          .range(from, from + PAGE - 1);
        if (error) {
          toast({ title: 'Failed to load jobs', description: error.message, variant: 'destructive' });
          break;
        }
        const rows = (data ?? []) as JobLite[];
        all.push(...rows);
        if (rows.length < PAGE) break;
        from += PAGE;
      }
      setJobs(all);
    } finally {
      setLoading(false);
    }
  };

  const loadSavedReports = async () => {
    const { data } = await supabase
      .from('materials_reports')
      .select('id,title,job_count,created_at,report_data')
      .order('created_at', { ascending: false })
      .limit(50);
    setSavedReports((data ?? []) as unknown as SavedReport[]);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return jobs.filter((j) => {
      if (filterStatus === 'incomplete' && (j.is_completed || j.status === 'complete')) return false;
      if (filterCategory !== 'all' && j.category_id !== filterCategory) return false;
      if (filterAssigned === 'assigned' && !j.team) return false;
      if (filterAssigned === 'unassigned' && j.team) return false;
      if (q) {
        const hay = `${j.job_number} ${j.name ?? ''} ${j.address ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [jobs, search, filterStatus, filterCategory, filterAssigned]);

  const toggleAll = () => {
    if (filtered.every((j) => selected.has(j.id))) {
      const next = new Set(selected);
      filtered.forEach((j) => next.delete(j.id));
      setSelected(next);
    } else {
      const next = new Set(selected);
      filtered.forEach((j) => next.add(j.id));
      setSelected(next);
    }
  };

  const toggleOne = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const generate = async () => {
    if (selected.size === 0) {
      toast({ title: 'Select at least one job', variant: 'destructive' });
      return;
    }
    setGenerating(true);
    try {
      const catName = filterCategory !== 'all'
        ? categories.find((c) => c.id === filterCategory)?.name ?? ''
        : 'Mixed';
      const title = reportTitle.trim() || `${catName} · ${selected.size} jobs · ${format(new Date(), 'd MMM yyyy')}`;
      const { data, error } = await supabase.functions.invoke('generate-materials-report', {
        body: {
          jobIds: Array.from(selected),
          title,
          filters: { categoryId: filterCategory, status: filterStatus, assigned: filterAssigned },
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setReport(data.report as MaterialsReportData);
      setReportTitle(title);
      setView('report');
      loadSavedReports();
    } catch (e) {
      toast({
        title: 'Report failed',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setGenerating(false);
    }
  };

  const deleteReport = async (id: string) => {
    const { error } = await supabase.from('materials_reports').delete().eq('id', id);
    if (error) {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
      return;
    }
    loadSavedReports();
  };

  const allFilteredSelected = filtered.length > 0 && filtered.every((j) => selected.has(j.id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[92vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b shrink-0">
          <div className="flex items-center justify-between gap-4">
            <DialogTitle className="text-base font-semibold flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              {view === 'select' && 'Materials & Trades Report'}
              {view === 'report' && 'Generated Report'}
              {view === 'history' && 'Report History'}
            </DialogTitle>
            <div className="flex gap-2">
              {view !== 'select' && (
                <Button variant="ghost" size="sm" onClick={() => setView('select')}>
                  <ArrowLeft className="w-4 h-4" /> New
                </Button>
              )}
              {view === 'select' && (
                <Button variant="outline" size="sm" onClick={() => setView('history')}>
                  History ({savedReports.length})
                </Button>
              )}
            </div>
          </div>
        </DialogHeader>

        {view === 'select' && (
          <>
            <div className="px-6 py-3 border-b space-y-3 shrink-0">
              <div className="flex flex-wrap gap-2">
                <Input
                  placeholder="Search job no, name, address..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="flex-1 min-w-[180px] h-9"
                />
                <Select value={filterCategory} onValueChange={setFilterCategory}>
                  <SelectTrigger className="w-44 h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All categories</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as any)}>
                  <SelectTrigger className="w-40 h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="incomplete">Incomplete only</SelectItem>
                    <SelectItem value="all">All statuses</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={filterAssigned} onValueChange={(v) => setFilterAssigned(v as any)}>
                  <SelectTrigger className="w-36 h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any team</SelectItem>
                    <SelectItem value="assigned">Assigned</SelectItem>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <button onClick={toggleAll} className="hover:text-foreground transition-colors">
                  {allFilteredSelected ? 'Clear visible' : `Select all visible (${filtered.length})`}
                </button>
                <span>{selected.size} selected · {filtered.length} shown · {jobs.length} total</span>
              </div>
            </div>

            <ScrollArea className="flex-1 min-h-0">
              {loading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="divide-y">
                  {filtered.map((j) => {
                    const cat = categories.find((c) => c.id === j.category_id);
                    const days = j.date_issued ? Math.floor((Date.now() - new Date(j.date_issued).getTime()) / 86400000) : null;
                    return (
                      <label
                        key={j.id}
                        className="flex items-center gap-3 px-6 py-2.5 hover:bg-muted/40 cursor-pointer text-sm"
                      >
                        <Checkbox
                          checked={selected.has(j.id)}
                          onCheckedChange={() => toggleOne(j.id)}
                        />
                        <span className="font-mono text-xs w-16 shrink-0">{j.job_number}</span>
                        <span className="flex-1 truncate">{j.name || '—'} · <span className="text-muted-foreground">{j.address || ''}</span></span>
                        {cat && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0">{cat.name}</span>
                        )}
                        {j.booked_date ? (
                          <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                            {format(new Date(j.booked_date), 'd MMM')}
                          </span>
                        ) : days !== null ? (
                          <span className="text-xs text-muted-foreground tabular-nums shrink-0">{days}d ago</span>
                        ) : null}
                      </label>
                    );
                  })}
                  {filtered.length === 0 && (
                    <div className="text-center py-12 text-sm text-muted-foreground">No jobs match the filters.</div>
                  )}
                </div>
              )}
            </ScrollArea>

            <div className="border-t px-6 py-3 flex items-center gap-3 shrink-0">
              <Input
                placeholder="Optional report title..."
                value={reportTitle}
                onChange={(e) => setReportTitle(e.target.value)}
                className="flex-1 h-9"
              />
              <Button onClick={generate} disabled={generating || selected.size === 0} size="lg">
                {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {generating ? 'Generating...' : `Generate Report (${selected.size})`}
              </Button>
            </div>
          </>
        )}

        {view === 'report' && report && (
          <ScrollArea className="flex-1 min-h-0">
            <div className="p-6">
              <MaterialsReport report={report} title={reportTitle} />
            </div>
          </ScrollArea>
        )}

        {view === 'history' && (
          <ScrollArea className="flex-1 min-h-0">
            <div className="divide-y">
              {savedReports.length === 0 && (
                <div className="text-center py-16 text-sm text-muted-foreground">No saved reports yet.</div>
              )}
              {savedReports.map((r) => (
                <div key={r.id} className="flex items-center gap-3 px-6 py-3 hover:bg-muted/40">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{r.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {r.job_count} jobs · {format(new Date(r.created_at), 'd MMM yyyy, HH:mm')}
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => { setReport(r.report_data); setReportTitle(r.title); setView('report'); }}>
                    <Eye className="w-4 h-4" /> View
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => deleteReport(r.id)} className="text-destructive">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
