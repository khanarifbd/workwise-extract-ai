import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { TeamLoginForm } from '@/components/team-portal/TeamLoginForm';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import {
  Loader2,
  LogOut,
  Search,
  CheckCircle2,
  Clock,
  ImageIcon,
  Calendar,
  MapPin,
  Archive,
  Camera,
  Send,
  History,
  X,
  FileText,
  Plus,
  ChevronRight,
  Folder,
  FolderOpen,
  ListChecks,
  Phone,
} from 'lucide-react';

interface ArchiveSession {
  teamId: string;
  teamName: string;
  expiresAt: string;
}

interface CompletedJob {
  job_id: string;
  job_number: string;
  name: string;
  address: string;
  phone_number: string | null;
  summary_of_works: string | null;
  description: string | null;
  work_items: any;
  attachments: any;
  status: string | null;
  is_completed: boolean | null;
  fully_complete: boolean;
  completion_date: string | null;
  date_issued: string | null;
  booked_date: string | null;
  progress_notes: string | null;
  team: string | null;
  team2: string | null;
  category_id: string | null;
  category_name: string | null;
  category_color: string | null;
  signed_off_at: string;
  photos_count: number;
  videos_count?: number;
  documents_count?: number;
  work_items_modified?: number;
  work_items_total?: number;
}

interface HistoryEntry {
  id: string;
  created_at: string;
  updated_by: string | null;
  notes: string | null;
  photos: string[] | null;
  status: string | null;
}

const SESSION_KEY = 'team_archive_session';

const formatDate = (iso: string | null) => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return iso; }
};
const formatDateTime = (iso: string | null) => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch { return iso; }
};

const fileToDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(r.error);
    r.onload = () => resolve(r.result as string);
    r.readAsDataURL(file);
  });

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];
const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

function isoWeek(d: Date): { isoYear: number; isoWeek: number } {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((t.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return { isoYear: t.getUTCFullYear(), isoWeek: week };
}

function weekRange(isoYearVal: number, isoWeekVal: number) {
  const simple = new Date(Date.UTC(isoYearVal, 0, 1 + (isoWeekVal - 1) * 7));
  const dow = simple.getUTCDay() || 7;
  const monday = new Date(simple);
  monday.setUTCDate(simple.getUTCDate() - dow + 1);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  return `${fmt(monday)} – ${fmt(sunday)}`;
}

type DayBucket = { key: string; date: Date; label: string; jobs: CompletedJob[] };
type WeekBucket = { key: string; isoWeek: number; label: string; range: string; days: DayBucket[]; count: number };
type MonthBucket = { key: string; month: number; label: string; weeks: WeekBucket[]; count: number };
type YearBucket = { key: string; year: number; months: MonthBucket[]; count: number };

function buildTree(jobs: CompletedJob[]): YearBucket[] {
  const years = new Map<number, Map<number, Map<string, Map<string, DayBucket>>>>();
  const weekMeta = new Map<string, { isoYear: number; isoWeek: number }>();

  for (const j of jobs) {
    const iso = j.signed_off_at;
    if (!iso) continue;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) continue;
    const year = d.getFullYear();
    const month = d.getMonth();
    const { isoYear, isoWeek: wk } = isoWeek(d);
    const weekKey = `${isoYear}-W${String(wk).padStart(2, '0')}`;
    weekMeta.set(weekKey, { isoYear, isoWeek: wk });
    const dayKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    if (!years.has(year)) years.set(year, new Map());
    const months = years.get(year)!;
    if (!months.has(month)) months.set(month, new Map());
    const weeks = months.get(month)!;
    if (!weeks.has(weekKey)) weeks.set(weekKey, new Map());
    const days = weeks.get(weekKey)!;
    if (!days.has(dayKey)) {
      days.set(dayKey, {
        key: dayKey,
        date: new Date(year, month, d.getDate()),
        label: `${DAY_NAMES[d.getDay()]}, ${d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}`,
        jobs: [],
      });
    }
    days.get(dayKey)!.jobs.push(j);
  }

  const out: YearBucket[] = [];
  for (const [year, months] of years) {
    const mArr: MonthBucket[] = [];
    for (const [month, weeks] of months) {
      const wArr: WeekBucket[] = [];
      for (const [weekKey, days] of weeks) {
        const meta = weekMeta.get(weekKey)!;
        const dArr = Array.from(days.values()).sort((a, b) => b.date.getTime() - a.date.getTime());
        const count = dArr.reduce((s, d) => s + d.jobs.length, 0);
        wArr.push({
          key: weekKey,
          isoWeek: meta.isoWeek,
          label: `Week ${meta.isoWeek}`,
          range: weekRange(meta.isoYear, meta.isoWeek),
          days: dArr,
          count,
        });
      }
      wArr.sort((a, b) => b.isoWeek - a.isoWeek);
      const count = wArr.reduce((s, w) => s + w.count, 0);
      mArr.push({
        key: `${year}-${String(month + 1).padStart(2, '0')}`,
        month,
        label: MONTH_NAMES[month],
        weeks: wArr,
        count,
      });
    }
    mArr.sort((a, b) => b.month - a.month);
    out.push({
      key: String(year),
      year,
      months: mArr,
      count: mArr.reduce((s, m) => s + m.count, 0),
    });
  }
  out.sort((a, b) => b.year - a.year);
  return out;
}

export default function TeamArchive() {
  const [session, setSession] = useState<ArchiveSession | null>(null);
  const [isInitialising, setIsInitialising] = useState(true);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<CompletedJob[]>([]);
  const [isLoadingJobs, setIsLoadingJobs] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [activeJob, setActiveJob] = useState<CompletedJob | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [expandInitialised, setExpandInitialised] = useState(false);
  const toggleNode = useCallback((key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem(SESSION_KEY);
    if (stored) {
      try {
        const parsed: ArchiveSession = JSON.parse(stored);
        if (new Date(parsed.expiresAt) > new Date()) setSession(parsed);
        else localStorage.removeItem(SESSION_KEY);
      } catch { localStorage.removeItem(SESSION_KEY); }
    }
    setIsInitialising(false);
  }, []);

  const handleLogin = useCallback(async (accessCode: string, rememberMe: boolean): Promise<boolean> => {
    setLoginError(null);
    try {
      const { data, error } = await supabase.functions.invoke('validate-team-code', { body: { accessCode } });
      if (error || !data?.success || !data?.session) {
        setLoginError(data?.error || 'Invalid access code.');
        return false;
      }
      const next: ArchiveSession = {
        teamId: data.session.teamId,
        teamName: data.session.teamName,
        expiresAt: rememberMe
          ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
          : data.session.expiresAt,
      };
      localStorage.setItem(SESSION_KEY, JSON.stringify(next));
      setSession(next);
      return true;
    } catch {
      setLoginError('Failed to authenticate. Please try again.');
      return false;
    }
  }, []);

  const handleLogout = useCallback(() => {
    localStorage.removeItem(SESSION_KEY);
    setSession(null);
    setJobs([]);
  }, []);

  const loadJobs = useCallback(async () => {
    if (!session) return;
    setIsLoadingJobs(true);
    setLoadError(null);
    try {
      const { data, error } = await supabase.functions.invoke('get-team-completed-jobs', {
        body: { teamId: session.teamId, limit: 1000 },
      });
      if (error) throw new Error('Failed to load jobs');
      if (!data?.success) throw new Error(data?.error || 'Failed to load');
      setJobs(data.jobs || []);
    } catch (err: any) {
      setLoadError(err.message || 'Failed to load completed jobs');
    } finally {
      setIsLoadingJobs(false);
    }
  }, [session]);

  useEffect(() => { if (session) loadJobs(); }, [session, loadJobs]);

  const filtered = useMemo(() => {
    const t = search.trim().toLowerCase();
    if (!t) return jobs;
    return jobs.filter((j) =>
      [j.job_number, j.name, j.address, j.summary_of_works, j.category_name]
        .filter(Boolean).join(' ').toLowerCase().includes(t),
    );
  }, [jobs, search]);

  const tree = useMemo(() => buildTree(filtered), [filtered]);

  // Auto-expand current year + current month + most-recent week on first load
  useEffect(() => {
    if (expandInitialised || tree.length === 0) return;
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const yk = String(y);
    const mk = `${y}-${String(m + 1).padStart(2, '0')}`;
    const next = new Set<string>();
    const yearNode = tree.find((yn) => yn.year === y) ?? tree[0];
    if (yearNode) {
      next.add(String(yearNode.year));
      const monthNode = yearNode.months.find((mn) => mn.month === m) ?? yearNode.months[0];
      if (monthNode) {
        next.add(monthNode.key);
        if (monthNode.weeks[0]) next.add(monthNode.weeks[0].key);
      }
    }
    // Preserve hints just in case current period exists
    next.add(yk); next.add(mk);
    setExpanded(next);
    setExpandInitialised(true);
  }, [tree, expandInitialised]);

  // When user searches, auto-expand everything so matches are visible
  const searchActive = search.trim().length > 0;
  const renderTree = useMemo(() => {
    if (!searchActive) return tree;
    return tree;
  }, [tree, searchActive]);

  if (isInitialising) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!session) {
    return (
      <div>
        <TeamLoginForm onLogin={handleLogin} error={loginError} />
        <div className="fixed bottom-4 inset-x-0 text-center text-xs text-muted-foreground pointer-events-none">
          <Archive className="inline h-3 w-3 mr-1" /> Completed Jobs Archive
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-background border-b">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
              <Archive className="h-3.5 w-3.5" /> My Archive
            </div>
            <h1 className="text-base font-semibold truncate">{session.teamName}</h1>
          </div>
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            <LogOut className="h-4 w-4 mr-1" /> Sign out
          </Button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-4 space-y-3">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search job number, address, or works…"
            className="pl-9 h-11 bg-background"
          />
        </div>

        {/* Count */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{filtered.length} of {jobs.length} completed</span>
          <Button variant="ghost" size="sm" onClick={loadJobs} disabled={isLoadingJobs} className="h-7 text-xs">
            {isLoadingJobs ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Refresh'}
          </Button>
        </div>

        {loadError && (
          <div className="bg-destructive/10 border border-destructive/20 text-destructive text-sm p-3 rounded-lg">
            {loadError}
          </div>
        )}

        {isLoadingJobs && jobs.length === 0 && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}

        {!isLoadingJobs && filtered.length === 0 && (
          <div className="text-center py-20 text-muted-foreground bg-background rounded-xl border border-dashed">
            <Archive className="h-10 w-10 mx-auto mb-2 opacity-40" />
            <p className="font-medium text-sm">No completed jobs yet</p>
            <p className="text-xs mt-1">Jobs you sign off will appear here.</p>
          </div>
        )}

        <ul className="space-y-2">
          {filtered.map((job) => (
            <li key={`${job.job_id}-${job.signed_off_at}`}>
              <button
                type="button"
                onClick={() => setActiveJob(job)}
                className="w-full text-left bg-background hover:bg-accent/40 transition-colors rounded-xl border p-3.5 flex items-start gap-3 min-h-[72px]"
              >
                <div className={`mt-1 shrink-0 w-2.5 h-2.5 rounded-full ${job.fully_complete ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-bold text-sm">{job.job_number}</span>
                    {job.category_name && (
                      <Badge
                        variant="outline"
                        className="text-[10px] px-1.5 py-0 h-4"
                        style={job.category_color ? { borderColor: job.category_color, color: job.category_color } : undefined}
                      >
                        {job.category_name}
                      </Badge>
                    )}
                  </div>
                  <div className="text-sm font-medium truncate mt-0.5">{job.name}</div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <MapPin className="h-3 w-3 shrink-0" />
                    <span className="truncate">{job.address}</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-1.5 flex items-center gap-3 flex-wrap">
                    <span className="flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      {formatDate(job.signed_off_at)}
                    </span>
                    {job.photos_count > 0 && (
                      <span className="flex items-center gap-1">
                        <ImageIcon className="h-3 w-3" />
                        {job.photos_count}
                      </span>
                    )}
                    {!job.fully_complete && (
                      <span className="flex items-center gap-1 text-amber-600">
                        <Clock className="h-3 w-3" /> Awaiting others
                      </span>
                    )}
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </main>

      <JobEditSheet
        job={activeJob}
        session={session}
        onClose={() => setActiveJob(null)}
        onSaved={() => loadJobs()}
      />
    </div>
  );
}

/* -------------------------------- Edit sheet -------------------------------- */

interface JobEditSheetProps {
  job: CompletedJob | null;
  session: ArchiveSession;
  onClose: () => void;
  onSaved: () => void;
}

function JobEditSheet({ job, session, onClose, onSaved }: JobEditSheetProps) {
  const [tab, setTab] = useState('details');
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [pendingPhotos, setPendingPhotos] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTab('details');
    setNoteText('');
    setPendingPhotos([]);
    setPreviews([]);
    setHistory([]);
    if (!job) return;
    setLoadingHistory(true);
    supabase.functions
      .invoke('get-team-job-history', { body: { teamId: session.teamId, jobId: job.job_id } })
      .then(({ data }) => {
        if (data?.success) setHistory(data.updates || []);
      })
      .finally(() => setLoadingHistory(false));
  }, [job, session.teamId]);

  const existingPhotos: { url: string; uploadedAt?: string; uploadedBy?: string }[] = useMemo(() => {
    if (!job?.attachments) return [];
    return (job.attachments as any[])
      .filter((a) => a && (a.type === 'image' || /\.(png|jpe?g|webp|gif)$/i.test(a.url || '')))
      .map((a) => ({ url: a.url, uploadedAt: a.uploadedAt, uploadedBy: a.uploadedBy }));
  }, [job]);

  const handlePickFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const arr = Array.from(files).slice(0, 20 - pendingPhotos.length);
    setPendingPhotos((prev) => [...prev, ...arr]);
    const urls = await Promise.all(arr.map((f) => fileToDataUrl(f)));
    setPreviews((prev) => [...prev, ...urls]);
  };

  const removePending = (i: number) => {
    setPendingPhotos((prev) => prev.filter((_, idx) => idx !== i));
    setPreviews((prev) => prev.filter((_, idx) => idx !== i));
  };

  const handleSave = async () => {
    if (!job) return;
    if (!noteText.trim() && pendingPhotos.length === 0) {
      toast.error('Add a note or at least one photo first');
      return;
    }
    setSaving(true);
    try {
      const photosPayload = await Promise.all(pendingPhotos.map((f) => fileToDataUrl(f)));
      const { data, error } = await supabase.functions.invoke('archive-edit-job', {
        body: {
          teamId: session.teamId,
          jobId: job.job_id,
          noteText: noteText.trim() || undefined,
          photos: photosPayload.length ? photosPayload : undefined,
        },
      });
      if (error) throw new Error(error.message || 'Failed to save');
      if (!data?.success) throw new Error(data?.error || 'Failed to save');
      toast.success('Saved — admin team has been notified');
      setNoteText('');
      setPendingPhotos([]);
      setPreviews([]);
      // refresh history
      const { data: hist } = await supabase.functions.invoke('get-team-job-history', {
        body: { teamId: session.teamId, jobId: job.job_id },
      });
      if (hist?.success) setHistory(hist.updates || []);
      onSaved();
      setTab('history');
    } catch (err: any) {
      toast.error(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={!!job} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-xl p-0 flex flex-col">
        {job && (
          <>
            <SheetHeader className="p-4 border-b">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
                    {job.fully_complete ? 'Fully complete' : 'Signed off (awaiting others)'}
                  </div>
                  <SheetTitle className="text-base flex items-center gap-2 text-left">
                    <span className="font-mono">{job.job_number}</span>
                    <span className="text-muted-foreground font-normal truncate">{job.name}</span>
                  </SheetTitle>
                </div>
              </div>
            </SheetHeader>

            <Tabs value={tab} onValueChange={setTab} className="flex-1 flex flex-col overflow-hidden">
              <div className="px-4 pt-3">
                <TabsList className="grid grid-cols-3 w-full">
                  <TabsTrigger value="details" className="text-xs"><FileText className="h-3.5 w-3.5 mr-1" /> Details</TabsTrigger>
                  <TabsTrigger value="edit" className="text-xs"><Plus className="h-3.5 w-3.5 mr-1" /> Add Update</TabsTrigger>
                  <TabsTrigger value="history" className="text-xs"><History className="h-3.5 w-3.5 mr-1" /> History</TabsTrigger>
                </TabsList>
              </div>

              {/* Details */}
              <TabsContent value="details" className="flex-1 overflow-hidden mt-3">
                <ScrollArea className="h-full px-4 pb-6">
                  <div className="space-y-4 text-sm">
                    <Row icon={<MapPin className="h-3.5 w-3.5" />} label="Address" value={job.address} />
                    <Row icon={<Calendar className="h-3.5 w-3.5" />} label="Signed off" value={formatDateTime(job.signed_off_at)} />
                    {job.booked_date && (
                      <Row icon={<Calendar className="h-3.5 w-3.5" />} label="Booked" value={formatDate(job.booked_date)} />
                    )}
                    {job.summary_of_works && (
                      <div>
                        <Label>Summary of works</Label>
                        <p className="text-sm whitespace-pre-wrap mt-1">{job.summary_of_works}</p>
                      </div>
                    )}
                    {job.progress_notes && (
                      <div>
                        <Label>Sign-off notes</Label>
                        <p className="text-xs whitespace-pre-wrap mt-1 bg-muted/60 rounded-lg p-3 font-mono">{job.progress_notes}</p>
                      </div>
                    )}
                    {existingPhotos.length > 0 && (
                      <div>
                        <Label>Photos ({existingPhotos.length})</Label>
                        <div className="grid grid-cols-3 gap-2 mt-1.5">
                          {existingPhotos.map((p, i) => (
                            <a key={i} href={p.url} target="_blank" rel="noreferrer" className="aspect-square rounded-lg overflow-hidden bg-muted block">
                              <img src={p.url} alt={`Photo ${i + 1}`} loading="lazy" className="w-full h-full object-cover" />
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>

              {/* Add update */}
              <TabsContent value="edit" className="flex-1 overflow-hidden mt-3 flex flex-col">
                <ScrollArea className="flex-1 px-4">
                  <div className="space-y-4 pb-4">
                    <div>
                      <Label>Follow-up note</Label>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Append-only — your previous sign-off notes are preserved. Admins will see this update.
                      </p>
                      <Textarea
                        value={noteText}
                        onChange={(e) => setNoteText(e.target.value)}
                        placeholder="e.g. Returned to top up sealant around new vent…"
                        rows={5}
                        maxLength={5000}
                        className="mt-2"
                      />
                      <div className="text-[10px] text-right text-muted-foreground mt-1">{noteText.length}/5000</div>
                    </div>

                    <div>
                      <Label>Add photos</Label>
                      <div className="mt-2 grid grid-cols-3 gap-2">
                        {previews.map((src, i) => (
                          <div key={i} className="relative aspect-square rounded-lg overflow-hidden bg-muted group">
                            <img src={src} alt="" className="w-full h-full object-cover" />
                            <button
                              type="button"
                              onClick={() => removePending(i)}
                              className="absolute top-1 right-1 bg-black/70 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                              aria-label="Remove"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                        {pendingPhotos.length < 20 && (
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="aspect-square rounded-lg border-2 border-dashed border-muted-foreground/30 hover:border-primary/50 hover:bg-muted/40 flex flex-col items-center justify-center gap-1 text-xs text-muted-foreground transition-colors"
                          >
                            <Camera className="h-5 w-5" />
                            Add
                          </button>
                        )}
                      </div>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        capture="environment"
                        className="hidden"
                        onChange={(e) => handlePickFiles(e.target.files)}
                      />
                      <p className="text-[10px] text-muted-foreground mt-1">{pendingPhotos.length}/20 photos</p>
                    </div>
                  </div>
                </ScrollArea>
                <div className="p-4 border-t bg-background">
                  <Button onClick={handleSave} disabled={saving || (!noteText.trim() && pendingPhotos.length === 0)} className="w-full h-11">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : (<><Send className="h-4 w-4 mr-2" /> Submit update</>)}
                  </Button>
                </div>
              </TabsContent>

              {/* History */}
              <TabsContent value="history" className="flex-1 overflow-hidden mt-3">
                <ScrollArea className="h-full px-4 pb-6">
                  {loadingHistory ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    </div>
                  ) : history.length === 0 ? (
                    <div className="text-center text-sm text-muted-foreground py-12">
                      <History className="h-8 w-8 mx-auto mb-2 opacity-40" />
                      No edits yet.
                    </div>
                  ) : (
                    <ol className="relative border-l-2 border-muted ml-2 space-y-4 pb-4">
                      {history.map((h) => (
                        <li key={h.id} className="ml-4">
                          <div className="absolute -left-[7px] mt-1.5 w-3 h-3 rounded-full bg-primary border-2 border-background" />
                          <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium flex items-center gap-2 flex-wrap">
                            <span>{formatDateTime(h.created_at)}</span>
                            {h.status === 'archive_edit' ? (
                              <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4">Archive edit</Badge>
                            ) : (
                              <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 border-emerald-500/40 text-emerald-600">Sign-off</Badge>
                            )}
                            {h.updated_by && <span className="text-muted-foreground/80">by {h.updated_by}</span>}
                          </div>
                          {h.notes && (
                            <p className="text-xs whitespace-pre-wrap mt-1.5 bg-muted/60 rounded-lg p-2.5">{h.notes}</p>
                          )}
                          {Array.isArray(h.photos) && h.photos.length > 0 && (
                            <div className="grid grid-cols-4 gap-1.5 mt-2">
                              {h.photos.map((u, i) => (
                                <a key={i} href={u} target="_blank" rel="noreferrer" className="aspect-square rounded overflow-hidden bg-muted">
                                  <img src={u} alt="" loading="lazy" className="w-full h-full object-cover" />
                                </a>
                              ))}
                            </div>
                          )}
                        </li>
                      ))}
                    </ol>
                  )}
                </ScrollArea>
              </TabsContent>
            </Tabs>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{children}</div>;
}
function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <div className="mt-0.5 text-muted-foreground">{icon}</div>
      <div className="min-w-0">
        <Label>{label}</Label>
        <div className="text-sm break-words">{value}</div>
      </div>
    </div>
  );
}
