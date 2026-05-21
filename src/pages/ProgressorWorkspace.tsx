import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useProgressorAuth } from '@/hooks/useProgressorAuth';
import {
  useProgressorIncompleteJobs,
  groupJobsByBookedDate,
  filterJobsBySearch,
  IncompleteJob,
  ProgStream,
} from '@/hooks/useProgressorIncompleteJobs';
import { useSubTasks } from '@/hooks/useSubTasks';
import { useSignOffStatus } from '@/hooks/useSignOffStatus';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useToast } from '@/hooks/use-toast';
import { ProgressorMediaUpload } from '@/components/progressor/ProgressorMediaUpload';
import { ProgressorTodoList } from '@/components/progressor/ProgressorTodoList';
import { AddSubTaskModal } from '@/components/progressor/AddSubTaskModal';
import { TradeCompaniesModal } from '@/components/progressor/TradeCompaniesModal';
import { ProgressorDiaryPanel } from '@/components/progressor/ProgressorDiaryPanel';
import { ProgressorPdfExportModal } from '@/components/progressor/ProgressorPdfExportModal';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown } from 'lucide-react';
import { SUB_TASK_STATUS_OPTIONS } from '@/types/subTask';
import { cn } from '@/lib/utils';
import {
  RenderWithProgressor, wrapProgressorText, detectJobPriority, JobPriority,
} from '@/lib/progressorMarkup';
import {
  Search, Calendar as CalendarIcon, X, BookOpenCheck, Wrench,
  LogOut, Loader2, Save, Edit3, FileText, MessageSquare, Image as ImageIcon,
  CheckCircle2, Plus, Building2, Siren, Zap, Star, Phone, FileDown,
} from 'lucide-react';
import { useContactHistory } from '@/hooks/useContactHistory';
import { CONTACT_OUTCOMES } from '@/types/contactHistory';
import { useLinkedTradeJobs, LinkedTradeJobInfo } from '@/hooks/useLinkedTradeJobs';
import { Fan, Triangle, LayoutGrid, DoorClosed } from 'lucide-react';
import { format, differenceInCalendarDays, startOfWeek, endOfWeek, getISOWeek } from 'date-fns';

/* ───────────────────── Priority Pill ───────────────────── */
const PriorityPill = ({ priority }: { priority: JobPriority }) => {
  if (!priority) return null;
  if (priority === 'emergency') {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-red-600 text-white">
        <Siren className="h-3 w-3 animate-pulse" /> EMERGENCY
      </span>
    );
  }
  if (priority === 'urgent') {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-orange-500 text-white">
        <Zap className="h-3 w-3" /> URGENT
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500 text-white">
      <Star className="h-3 w-3" /> SPECIAL
    </span>
  );
};

/* ───────────────────── Linked Trade Pill (Fan / Roof / Floor / Fire Door) ───────────────────── */
const TRADE_META: Record<LinkedTradeJobInfo['kind'], { label: string; Icon: React.ComponentType<{ className?: string }>; tone: string }> = {
  fan:       { label: 'Fan',       Icon: Fan,         tone: 'text-cyan-600 border-cyan-300 bg-cyan-50 dark:bg-cyan-950/30 dark:text-cyan-300 dark:border-cyan-800' },
  roofing:   { label: 'Roof',      Icon: Triangle,    tone: 'text-orange-600 border-orange-300 bg-orange-50 dark:bg-orange-950/30 dark:text-orange-300 dark:border-orange-800' },
  flooring:  { label: 'Floor',     Icon: LayoutGrid,  tone: 'text-teal-600 border-teal-300 bg-teal-50 dark:bg-teal-950/30 dark:text-teal-300 dark:border-teal-800' },
  fire_door: { label: 'Fire Door', Icon: DoorClosed,  tone: 'text-emerald-600 border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800' },
};

const LinkedTradePill = ({ info }: { info: LinkedTradeJobInfo }) => {
  const meta = TRADE_META[info.kind];
  const Icon = meta.Icon;
  const completed = info.isCompleted || info.status === 'complete';
  const dateLabel = info.bookedDate
    ? format(new Date(info.bookedDate), 'EEE dd MMM')
    : 'unbooked';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border',
        meta.tone,
        completed && 'opacity-70 line-through',
      )}
      title={`${meta.label} #${info.jobNumber}${info.team ? ` — ${info.team}` : ''}`}
    >
      <Icon className="h-3 w-3" />
      <span>{meta.label}:</span>
      <span className="font-bold">{dateLabel}</span>
      {completed && <CheckCircle2 className="h-3 w-3" />}
    </span>
  );
};


const ProgressorWorkspace = () => {
  const navigate = useNavigate();
  const { user, isLoading, hasAccess, signOut } = useProgressorAuth();
  const { dmJobs, aaJobs, isLoading: jobsLoading, refresh, verifyAccuracy } = useProgressorIncompleteJobs();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [activeStream, setActiveStream] = useState<ProgStream>('dm');

  const [diaryOpen, setDiaryOpen] = useState(false);
  const [tradesOpen, setTradesOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  useEffect(() => {
    if (!isLoading && !hasAccess) navigate('/progressor-login', { replace: true });
  }, [isLoading, hasAccess, navigate]);

  const dmFiltered = useMemo(() => filterJobsBySearch(dmJobs, search), [dmJobs, search]);
  const aaFiltered = useMemo(() => filterJobsBySearch(aaJobs, search), [aaJobs, search]);
  const allFilteredIds = useMemo(() => [...dmFiltered, ...aaFiltered].map(j => j.id), [dmFiltered, aaFiltered]);
  const { getSignOffStatus } = useSignOffStatus(allFilteredIds);

  const selected = useMemo(
    () => [...dmJobs, ...aaJobs].find(j => j.id === selectedId) || null,
    [dmJobs, aaJobs, selectedId],
  );

  // Auto-switch to the stream of the selected job (e.g. when jumping from diary).
  useEffect(() => {
    if (selected && selected.stream !== activeStream) setActiveStream(selected.stream);
  }, [selected]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading || !hasAccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-progressor" />
      </div>
    );
  }

  const progressorName = user?.email?.split('@')[0] ?? 'Progressor';

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* Header */}
      <header className="h-14 border-b border-border bg-card flex items-center px-4 gap-3 shrink-0">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-progressor text-progressor-foreground flex items-center justify-center font-bold">P</div>
          <div>
            <h1 className="text-sm font-bold leading-tight">Progressor Workspace</h1>
            <p className="text-[10px] text-muted-foreground leading-tight">{progressorName} · Overdue DM &amp; A&amp;A jobs</p>
          </div>
        </div>
        <div className="flex-1" />
        <div className="relative w-72 hidden md:block">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search job#, name, address…"
            className="pl-8 h-9"
          />
        </div>
        <Button variant="outline" size="sm" onClick={() => setDiaryOpen(true)}>
          <BookOpenCheck className="h-4 w-4 mr-1.5" /> Diary
        </Button>
        <Button variant="outline" size="sm" onClick={() => setTradesOpen(true)}>
          <Building2 className="h-4 w-4 mr-1.5" /> Trades
        </Button>
        <Button variant="outline" size="sm" onClick={() => setExportOpen(true)}>
          <FileDown className="h-4 w-4 mr-1.5" /> Export PDF
        </Button>
        <Button variant="ghost" size="sm" onClick={signOut} title="Sign out">
          <LogOut className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost" size="icon"
          onClick={() => navigate('/')}
          title="Close workspace"
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="h-5 w-5" />
        </Button>
      </header>

      {/* Body */}
      <div className="flex-1 flex min-h-0 p-3 gap-3">
        {/* Left: Single stream (tab-switched) */}
        <aside className="w-[420px] flex flex-col min-h-0 rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
          <Tabs value={activeStream} onValueChange={(v) => setActiveStream(v as ProgStream)} className="flex flex-col flex-1 min-h-0">
            <div className="p-2 border-b border-border bg-muted/30">
              <TabsList className="grid grid-cols-2 w-full h-9 rounded-xl">
                <TabsTrigger value="dm" className="rounded-lg data-[state=active]:bg-progressor data-[state=active]:text-progressor-foreground font-bold text-xs">
                  DM <span className="ml-1.5 opacity-80">{dmFiltered.length}</span>
                </TabsTrigger>
                <TabsTrigger value="aa" className="rounded-lg data-[state=active]:bg-emerald-600 data-[state=active]:text-white font-bold text-xs">
                  A &amp; A <span className="ml-1.5 opacity-80">{aaFiltered.length}</span>
                </TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="dm" className="flex-1 min-h-0 mt-0 data-[state=inactive]:hidden">
              <StreamColumn
                title="DM" tone="bg-progressor" jobs={dmFiltered} isLoading={jobsLoading}
                selectedId={selectedId} onSelect={setSelectedId} getSignOffStatus={getSignOffStatus}
              />
            </TabsContent>
            <TabsContent value="aa" className="flex-1 min-h-0 mt-0 data-[state=inactive]:hidden">
              <StreamColumn
                title="A & A" tone="bg-emerald-600" jobs={aaFiltered} isLoading={jobsLoading}
                selectedId={selectedId} onSelect={setSelectedId} getSignOffStatus={getSignOffStatus}
              />
            </TabsContent>
          </Tabs>
        </aside>

        {/* Right: Detail */}
        <main className="flex-1 min-w-0 rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
          {selected ? (
            <JobDetailPanel
              key={selected.id}
              job={selected}
              progressorName={progressorName}
              onChanged={refresh}
            />
          ) : (
            <div className="h-full flex items-center justify-center text-center p-8">
              <div className="max-w-sm">
                <div className="mx-auto w-16 h-16 rounded-2xl bg-progressor/10 text-progressor flex items-center justify-center mb-4">
                  <FileText className="h-8 w-8" />
                </div>
                <h2 className="text-lg font-semibold mb-1">Select a job to begin</h2>
                <p className="text-sm text-muted-foreground">
                  Pick a job from either stream on the left to edit description, add notes, upload media, or book trades — all without leaving this workspace.
                </p>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Slide-overs */}
      <Sheet open={diaryOpen} onOpenChange={setDiaryOpen}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2"><BookOpenCheck className="h-5 w-5 text-progressor" /> Diary &amp; Reminders</SheetTitle>
          </SheetHeader>
          <ProgressorDiaryPanel
            jobs={[...dmJobs, ...aaJobs]}
            progressorName={progressorName}
            onJumpToJob={(id) => { setSelectedId(id); setDiaryOpen(false); }}
          />
        </SheetContent>
      </Sheet>

      <TradeCompaniesModal open={tradesOpen} onOpenChange={setTradesOpen} />

      <ProgressorPdfExportModal
        open={exportOpen}
        onOpenChange={setExportOpen}
        jobs={[...dmJobs, ...aaJobs]}
        verifyAccuracy={verifyAccuracy}
      />
    </div>
  );
};

export default ProgressorWorkspace;

/* ───────────────────── Stream Column (DM or A&A) ───────────────────── */
const StreamColumn = ({
  title, tone, jobs, isLoading, selectedId, onSelect, getSignOffStatus,
}: {
  title: string;
  tone: string;
  jobs: IncompleteJob[];
  isLoading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  getSignOffStatus: (id: string, t1: string | null, t2: string | null) => any;
}) => {
  // Group [date,jobs][] by Month → Week → Day
  type WeekBucket = { weekKey: string; weekLabel: string; days: [string, IncompleteJob[]][] };
  type MonthBucket = { monthLabel: string; weeks: Map<string, WeekBucket> };
  const months = useMemo(() => {
    const grouped = groupJobsByBookedDate(jobs); // [yyyy-mm-dd, jobs[]]
    const map = new Map<string, MonthBucket>();
    grouped.forEach(([dayKey, list]) => {
      const d = new Date(dayKey);
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!map.has(monthKey)) {
        map.set(monthKey, { monthLabel: format(d, 'MMMM yyyy'), weeks: new Map() });
      }
      const ws = startOfWeek(d, { weekStartsOn: 1 });
      const we = endOfWeek(d, { weekStartsOn: 1 });
      const weekKey = `${ws.getFullYear()}-W${String(getISOWeek(ws)).padStart(2, '0')}`;
      const sameMonth = ws.getMonth() === we.getMonth();
      const weekLabel = sameMonth
        ? `${format(ws, 'd')}–${format(we, 'd MMM')}`
        : `${format(ws, 'd MMM')}–${format(we, 'd MMM')}`;
      const monthBucket = map.get(monthKey)!;
      if (!monthBucket.weeks.has(weekKey)) {
        monthBucket.weeks.set(weekKey, { weekKey, weekLabel, days: [] });
      }
      monthBucket.weeks.get(weekKey)!.days.push([dayKey, list]);
    });
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([mk, mb]) => ({
        monthKey: mk,
        monthLabel: mb.monthLabel,
        weeks: Array.from(mb.weeks.values()).sort((a, b) => a.weekKey.localeCompare(b.weekKey)),
      }));
  }, [jobs]);

  // Default: everything collapsed for a clean, minimalist view.
  // The progressor expands months/weeks they want to focus on.
  const [openMonths, setOpenMonths] = useState<Set<string>>(() => new Set());
  const [openWeeks, setOpenWeeks] = useState<Set<string>>(() => new Set());

  const toggleMonth = (k: string) => setOpenMonths(prev => {
    const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n;
  });
  const toggleWeek = (k: string) => setOpenWeeks(prev => {
    const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n;
  });

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        <div className="p-2 space-y-2 pb-12">
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          )}
          {!isLoading && months.length === 0 && (
            <p className="text-center text-xs text-muted-foreground py-8">All caught up.</p>
          )}
          {months.map(({ monthKey, monthLabel, weeks }) => {
            const monthCount = weeks.reduce((acc, w) => acc + w.days.reduce((a, [, l]) => a + l.length, 0), 0);
            const open = openMonths.has(monthKey);
            return (
              <Collapsible key={monthKey} open={open} onOpenChange={() => toggleMonth(monthKey)}>
                <CollapsibleTrigger asChild>
                  <button
                    className={cn(
                      "w-full flex items-center gap-2 px-2 py-2 rounded-md transition-colors",
                      "bg-muted/40 hover:bg-muted/70",
                    )}
                  >
                    <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform text-muted-foreground", !open && "-rotate-90")} />
                    <span className="text-sm font-extrabold tracking-tight text-foreground uppercase">{monthLabel}</span>
                    <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full bg-background text-muted-foreground">{monthCount}</span>
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="pl-1 pt-1 space-y-1.5">
                    {weeks.map(({ weekKey, weekLabel, days }) => {
                      const weekCount = days.reduce((a, [, l]) => a + l.length, 0);
                      const wOpen = openWeeks.has(weekKey);
                      return (
                        <Collapsible key={weekKey} open={wOpen} onOpenChange={() => toggleWeek(weekKey)}>
                          <CollapsibleTrigger asChild>
                            <button className="w-full flex items-center gap-2 px-2 py-1.5 rounded bg-sky-300/30 hover:bg-sky-300/40 border border-sky-400/40 transition-colors">
                              <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 transition-transform text-sky-700 dark:text-sky-300", !wOpen && "-rotate-90")} />
                              <span className="text-[11px] font-bold uppercase tracking-wider text-sky-800 dark:text-sky-200">Week · {weekLabel}</span>
                              <span className="ml-auto text-[10px] font-semibold text-sky-700/80 dark:text-sky-300/80">{weekCount}</span>
                            </button>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <div className="pl-2 pt-1 space-y-2">
                              {days.map(([date, list]) => {
                                const d = new Date(date);
                                const daysAgo = differenceInCalendarDays(new Date(), d);
                                const dayKey = `${weekKey}-${date}`;
                                return (
                                  <DayGroup
                                    key={dayKey}
                                    dateLabel={format(d, 'EEE dd MMM')}
                                    overdueLabel={daysAgo === 1 ? '1 day overdue' : `${daysAgo} days overdue`}
                                    list={list}
                                    selectedId={selectedId}
                                    onSelect={onSelect}
                                    getSignOffStatus={getSignOffStatus}
                                  />
                                );
                              })}
                            </div>
                          </CollapsibleContent>
                        </Collapsible>
                      );
                    })}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            );
          })}
        </div>
      </div>
    </div>
  );
};

/* ───────────────────── Day Group (collapsible) ───────────────────── */
const DayGroup = ({
  dateLabel, overdueLabel, list, selectedId, onSelect, getSignOffStatus,
}: {
  dateLabel: string;
  overdueLabel: string;
  list: IncompleteJob[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  getSignOffStatus: (id: string, t1: string | null, t2: string | null) => any;
}) => {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button className="w-full flex items-baseline justify-between px-1.5 py-1 rounded bg-pink-300/30 hover:bg-pink-300/40 border border-pink-400/40 group">
          <div className="flex items-center gap-1.5">
            <ChevronDown className={cn("h-3 w-3 text-pink-700 dark:text-pink-300 transition-transform", !open && "-rotate-90")} />
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-pink-800 dark:text-pink-200">{dateLabel}</h4>
            <span className="text-[10px] font-semibold text-pink-700/80 dark:text-pink-300/80">· {list.length}</span>
          </div>
          <span className="text-[9px] text-destructive font-semibold">{overdueLabel}</span>

        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down overflow-hidden">
        <div className="space-y-1.5 pl-3 pt-1">
          {list.map(j => {
            const so = getSignOffStatus(j.id, j.team, j.team2);
            const priority = detectJobPriority(j.description, j.privateNotes);
            return (
              <button
                key={j.id}
                onClick={() => onSelect(j.id)}
                className={cn(
                  "w-full text-left p-2 rounded-lg border transition-all",
                  selectedId === j.id
                    ? "bg-progressor-muted border-progressor shadow-sm"
                    : "bg-card border-border hover:border-progressor/50",
                )}
              >
                <div className="flex items-start justify-between gap-2 mb-0.5">
                  <span className="text-xs font-bold font-mono">#{j.jobNumber}</span>
                  {priority && <PriorityPill priority={priority} />}
                </div>
                <p className="text-sm font-medium truncate leading-tight">{j.name}</p>
                <p className="text-[11px] text-muted-foreground truncate">{j.address}</p>
                {j.phoneNumber && (
                  <a
                    href={`tel:${j.phoneNumber}`}
                    onClick={(e) => e.stopPropagation()}
                    className="block text-[11px] font-bold text-progressor truncate hover:underline"
                  >
                    📞 {j.phoneNumber}
                  </a>
                )}
                <div className="flex items-center gap-1 mt-1 flex-wrap">
                  {j.team && <Badge variant="secondary" className="text-[9px] px-1.5 py-0">{j.team}</Badge>}
                  {j.team2 && <Badge variant="secondary" className="text-[9px] px-1.5 py-0">{j.team2}</Badge>}
                  {so?.totalAssigned > 0 && (
                    <span className={cn(
                      "text-[9px] ml-auto px-1.5 py-0.5 rounded-full font-medium",
                      so.allSignedOff ? "bg-success/15 text-success" : "bg-muted text-muted-foreground",
                    )}>
                      ✓ {so.totalSignedOff}/{so.totalAssigned}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};

/* ───────────────────── Job Detail Panel ───────────────────── */
const JobDetailPanel = ({
  job, progressorName, onChanged,
}: { job: IncompleteJob; progressorName: string; onChanged: () => void }) => {
  const [tab, setTab] = useState('description');
  const [showAddTrade, setShowAddTrade] = useState(false);
  const { subTasks, updateSubTask } = useSubTasks(job.id);
  const { linked: linkedTrades } = useLinkedTradeJobs(job.id);
  const priority = detectJobPriority(job.description, job.privateNotes);

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="px-5 py-3 border-b border-border bg-card">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-0.5 flex-wrap">
              <span className="text-xs font-mono font-bold text-progressor">#{job.jobNumber}</span>
              <span className={cn(
                "text-[10px] px-2 py-0.5 rounded-full font-medium",
                job.stream === 'dm' ? "bg-progressor/10 text-progressor" : "bg-emerald-500/10 text-emerald-600",
              )}>
                {job.stream === 'dm' ? 'DM' : 'A & A'}
              </span>
              {job.bookedDate && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-destructive/10 text-destructive font-medium">
                  Booked {format(new Date(job.bookedDate), 'EEE dd MMM yyyy')}
                </span>
              )}
              {priority && <PriorityPill priority={priority} />}
            </div>
            <h2 className="text-lg font-semibold truncate">{job.name}</h2>
            <p className="text-sm text-muted-foreground truncate">{job.address}</p>
            {job.phoneNumber && (
              <a
                href={`tel:${job.phoneNumber}`}
                className="inline-flex items-center gap-1.5 mt-1 text-sm font-bold text-progressor hover:underline"
              >
                📞 {job.phoneNumber}
              </a>
            )}
            {linkedTrades.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                {linkedTrades.map((lt) => <LinkedTradePill key={lt.id} info={lt} />)}
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1 shrink-0">
            {job.team && <Badge>{job.team}</Badge>}
            {job.team2 && <Badge variant="secondary">{job.team2}</Badge>}
          </div>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="flex-1 flex flex-col min-h-0">
        <TabsList className="mx-5 mt-3 self-start">
          <TabsTrigger value="description"><FileText className="h-3.5 w-3.5 mr-1" /> Description</TabsTrigger>
          <TabsTrigger value="notes"><MessageSquare className="h-3.5 w-3.5 mr-1" /> Notes</TabsTrigger>
          <TabsTrigger value="calls"><Phone className="h-3.5 w-3.5 mr-1" /> Call Log</TabsTrigger>
          <TabsTrigger value="media"><ImageIcon className="h-3.5 w-3.5 mr-1" /> Media</TabsTrigger>
          <TabsTrigger value="trades"><Wrench className="h-3.5 w-3.5 mr-1" /> Trades ({subTasks.length})</TabsTrigger>
          <TabsTrigger value="tasks"><CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Tasks</TabsTrigger>
        </TabsList>

        <ScrollArea className="flex-1 mt-2">
          <div className="px-5 py-4 max-w-3xl">
            <TabsContent value="description" className="m-0">
              <DescriptionTab job={job} progressorName={progressorName} onSaved={onChanged} />
            </TabsContent>
            <TabsContent value="notes" className="m-0">
              <NotesTab job={job} progressorName={progressorName} onSaved={onChanged} />
            </TabsContent>
            <TabsContent value="calls" className="m-0">
              <CallLogTab jobId={job.id} />
            </TabsContent>
            <TabsContent value="media" className="m-0">
              <MediaTab job={job} onChanged={onChanged} />
            </TabsContent>
            <TabsContent value="trades" className="m-0 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Trade & DM Bookings</h3>
                <Button size="sm" className="bg-progressor hover:bg-progressor/90 text-progressor-foreground" onClick={() => setShowAddTrade(true)}>
                  <Plus className="h-4 w-4 mr-1" /> Book trade
                </Button>
              </div>
              {subTasks.length === 0 ? (
                <p className="text-xs text-muted-foreground">No trades booked yet.</p>
              ) : (
                <div className="space-y-2">
                  {subTasks.map(s => {
                    const opt = SUB_TASK_STATUS_OPTIONS.find(o => o.value === s.status);
                    return (
                      <div key={s.id} className="border rounded-lg p-3 bg-card">
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <Wrench className="h-3.5 w-3.5 text-progressor" />
                            <span className="text-sm font-semibold">{s.trade}</span>
                            {s.assignedTeam && <Badge variant="outline" className="text-[10px]">{s.assignedTeam}</Badge>}
                          </div>
                          <select
                            value={s.status}
                            onChange={(e) => updateSubTask(s.id, { status: e.target.value }).then(onChanged)}
                            className="text-[11px] rounded-md border border-input bg-background px-2 py-1"
                            style={{ color: opt?.color }}
                          >
                            {SUB_TASK_STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                        </div>
                        <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
                          {s.bookedDate && <span><CalendarIcon className="h-3 w-3 inline mr-0.5" /> Booked {format(s.bookedDate, 'dd MMM yyyy')}</span>}
                          {s.deadlineDate && <span>Deadline {format(s.deadlineDate, 'dd MMM yyyy')}</span>}
                        </div>
                        {s.notes && <p className="text-xs mt-1.5 text-progressor font-medium whitespace-pre-wrap">{s.notes}</p>}
                      </div>
                    );
                  })}
                </div>
              )}
              <AddSubTaskModal
                open={showAddTrade}
                onOpenChange={setShowAddTrade}
                job={{ id: job.id, jobNumber: job.jobNumber, name: job.name, address: job.address || '' }}
                onCreated={() => { onChanged(); setShowAddTrade(false); }}
              />
            </TabsContent>
            <TabsContent value="tasks" className="m-0">
              <ProgressorTodoList jobId={job.id} />
            </TabsContent>
          </div>
        </ScrollArea>
      </Tabs>
    </div>
  );
};

/* ───────────────────── Description Tab ───────────────────── */
const DescriptionTab = ({ job, progressorName, onSaved }: { job: IncompleteJob; progressorName: string; onSaved: () => void }) => {
  const { toast } = useToast();
  const [appendText, setAppendText] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { setAppendText(''); }, [job.id]);

  const append = async () => {
    if (!appendText.trim()) return;
    setSaving(true);
    try {
      const stamp = `\n\n[Progressor • ${progressorName} • ${format(new Date(), 'dd MMM yy HH:mm')}]\n`;
      const wrapped = wrapProgressorText(`${stamp}${appendText.trim()}`);
      const next = `${(job.description || '').trimEnd()}${wrapped}`;
      const { error } = await supabase.from('jobs').update({ description: next }).eq('id', job.id);
      if (error) throw error;
      setAppendText('');
      onSaved();
      toast({ title: 'Description updated', description: 'Your addition is saved in blue.' });
    } catch (e: any) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">Job Description</h3>
      <div className="rounded-lg border bg-card p-4 min-h-[160px] whitespace-pre-wrap text-sm leading-relaxed">
        {job.description ? (
          <RenderWithProgressor text={job.description} />
        ) : (
          <span className="text-muted-foreground italic">No description yet.</span>
        )}
      </div>
      <div className="border-t pt-3 space-y-2">
        <label className="text-xs font-medium text-progressor flex items-center gap-1">
          <Edit3 className="h-3.5 w-3.5" /> Add to description (saved in blue, visible to teams &amp; admin)
        </label>
        <Textarea
          value={appendText}
          onChange={(e) => setAppendText(e.target.value)}
          rows={5}
          placeholder="Type your addition… it will be appended and rendered in blue everywhere this job is shown."
          className="text-sm text-progressor font-medium border-progressor/40 focus-visible:ring-progressor"
        />
        <Button
          size="sm"
          className="bg-progressor hover:bg-progressor/90 text-progressor-foreground"
          onClick={append}
          disabled={saving || !appendText.trim()}
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />} Append &amp; save
        </Button>
      </div>
    </div>
  );
};

/* ───────────────────── Notes Tab ───────────────────── */
const NotesTab = ({ job, progressorName, onSaved }: { job: IncompleteJob; progressorName: string; onSaved: () => void }) => {
  const { toast } = useToast();
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { setText(''); }, [job.id]);

  const append = async () => {
    if (!text.trim()) return;
    setSaving(true);
    try {
      const stamp = `[Progressor • ${progressorName} • ${format(new Date(), 'dd MMM yy HH:mm')}]`;
      const next = `${(job.privateNotes || '').trim()}${job.privateNotes ? '\n\n' : ''}${stamp}\n${text.trim()}`;
      const { error } = await supabase.from('jobs').update({ private_notes: next }).eq('id', job.id);
      if (error) throw error;
      setText('');
      onSaved();
      toast({ title: 'Note added' });
    } catch (e: any) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const renderedEntries = useMemo(() => {
    const raw = job.privateNotes || '';
    if (!raw) return [];
    const parts = raw.split(/(?=\[Progressor\b)/g);
    return parts.map(p => p.trim()).filter(Boolean);
  }, [job.privateNotes]);

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">Progressor Notes <span className="text-xs font-normal text-muted-foreground">(visible to teams &amp; admin under the description)</span></h3>
      <div className="space-y-2">
        {renderedEntries.length === 0 && (
          <p className="text-xs text-muted-foreground italic">No notes yet.</p>
        )}
        {renderedEntries.map((entry, i) => {
          const isProgressor = entry.startsWith('[Progressor');
          return (
            <div key={i} className={cn(
              "rounded-lg border p-3 text-sm whitespace-pre-wrap",
              isProgressor ? "border-progressor/40 bg-progressor-muted/40 text-progressor font-medium" : "bg-card",
            )}>
              {entry}
            </div>
          );
        })}
      </div>
      <div className="border-t pt-3 space-y-2">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          placeholder="Add a progressor note… stamped automatically and shown in blue."
          className="text-sm text-progressor font-medium border-progressor/40 focus-visible:ring-progressor"
        />
        <Button size="sm" className="bg-progressor hover:bg-progressor/90 text-progressor-foreground" onClick={append} disabled={saving || !text.trim()}>
          {saving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Plus className="h-3.5 w-3.5 mr-1" />} Add note
        </Button>
      </div>
    </div>
  );
};

/* ───────────────────── Media Tab ───────────────────── */
const MediaTab = ({ job, onChanged }: { job: IncompleteJob; onChanged: () => void }) => {
  const images = (job.attachments || []).filter((a: any) => a?.type === 'image' || (a?.url && /\.(jpe?g|png|gif|webp)$/i.test(a.url)));
  const videos = (job.attachments || []).filter((a: any) => a?.type === 'video' || (a?.url && /\.(mp4|mov|webm)$/i.test(a.url)));
  const others = (job.attachments || []).filter((a: any) => !images.includes(a) && !videos.includes(a));

  return (
    <div className="space-y-4">
      <ProgressorMediaUpload jobId={job.id} jobNumber={job.jobNumber} onUploaded={onChanged} />
      {images.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold mb-2">Photos ({images.length})</h4>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {images.map((a: any, i: number) => (
              <a key={i} href={a.url} target="_blank" rel="noreferrer" className="block">
                <img src={a.url} alt="" className="w-full h-24 object-cover rounded-md border" />
              </a>
            ))}
          </div>
        </div>
      )}
      {videos.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold mb-2">Videos ({videos.length})</h4>
          <div className="grid grid-cols-2 gap-2">
            {videos.map((a: any, i: number) => (
              <video key={i} src={a.url} controls className="w-full rounded-md border" />
            ))}
          </div>
        </div>
      )}
      {others.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold mb-2">Files ({others.length})</h4>
          <ul className="text-xs space-y-1">
            {others.map((a: any, i: number) => (
              <li key={i}><a className="text-progressor underline" href={a.url} target="_blank" rel="noreferrer">{a.name || a.url}</a></li>
            ))}
          </ul>
        </div>
      )}
      {(job.attachments || []).length === 0 && (
        <p className="text-xs text-muted-foreground italic">No media yet — upload photos or videos above.</p>
      )}
    </div>
  );
};

/* ───────────────────── Call Log Tab (read-only contact history) ───────────────────── */
const CallLogTab = ({ jobId }: { jobId: string }) => {
  const { history, isLoading } = useContactHistory(jobId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="text-center py-8">
        <Phone className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
        <p className="text-xs text-muted-foreground italic">No call attempts logged yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-1.5">
          <Phone className="h-4 w-4 text-progressor" /> Call Log
        </h3>
        <span className="text-[11px] text-muted-foreground">
          {history.length} attempt{history.length === 1 ? '' : 's'}
        </span>
      </div>

      <div className="space-y-2">
        {history.map((h) => {
          const meta = CONTACT_OUTCOMES.find(o => o.value === h.outcome);
          return (
            <div
              key={h.id}
              className="rounded-lg border bg-card p-3 flex gap-3"
              style={{ borderLeftWidth: 4, borderLeftColor: meta?.color || '#94a3b8' }}
            >
              <div className="text-lg leading-none pt-0.5">{meta?.icon || '📞'}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-0.5">
                  <span className="text-xs font-bold uppercase tracking-wide" style={{ color: meta?.color }}>
                    {meta?.label || h.outcome}
                  </span>
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {format(h.contactDate, 'dd MMM yy · HH:mm')}
                  </span>
                </div>
                {h.notes && (
                  <p className="text-xs text-foreground whitespace-pre-wrap mb-1">{h.notes}</p>
                )}
                <div className="flex flex-wrap gap-2 text-[10px] text-muted-foreground">
                  {h.createdBy && <span>by {h.createdBy}</span>}
                  {h.nextAction && <span>· next: {h.nextAction}</span>}
                  {h.nextActionDate && <span>· {format(h.nextActionDate, 'dd MMM HH:mm')}</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
