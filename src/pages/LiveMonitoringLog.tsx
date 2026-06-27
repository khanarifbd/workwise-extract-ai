import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, Plus, Filter, Search, Download, RefreshCw, Flag, AlertTriangle,
  StickyNote, Lightbulb, CheckCircle2, PhoneCall, CalendarClock, UserPlus, X, Loader2, ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import AddLogEntryModal, { type LogEntryDraft } from "@/components/AddLogEntryModal";

const STORAGE_KEY = "command.logEntries.v1";
type StoredEntry = LogEntryDraft & { id: string };
const loadStored = (): StoredEntry[] => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch { return []; }
};
const saveStored = (list: StoredEntry[]) => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch {}
};
const sevMap = (s: string): Severity =>
  s === "Urgent" ? "urgent" : s === "Warning" ? "warning" : "info";
const hhmm = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

// ---- Types ----
type Severity = "urgent" | "warning" | "info";
type FilterKind = "all" | "urgent" | "warning" | "note" | "resolved";

interface FlagEntry {
  id: string; time: string; jobNumber: string; category: string;
  severity: Severity; description: string; status: string; actionTaken: string;
}
interface QualityNote {
  id: string; time: string; jobNumber: string; issue: string; resolved: boolean;
}
interface CoachingItem {
  id: string; team: string; pattern: string; recommendation: string;
}
interface ResolvedItem {
  id: string; jobNumber: string; issue: string; resolution: string; confirmed: boolean;
}

// ---- Sample seed ----
const SEED_FLAGS: FlagEntry[] = [
  { id: "f1", time: "09:14", jobNumber: "N2640150", category: "Access", severity: "urgent", description: "Tenant locked out — keys not on site.", status: "Open", actionTaken: "Locksmith dispatched." },
  { id: "f2", time: "10:42", jobNumber: "N2640199", category: "H&S",    severity: "urgent", description: "Asbestos suspected in kitchen ceiling.", status: "Paused", actionTaken: "Awaiting survey." },
  { id: "f3", time: "11:05", jobNumber: "N2640210", category: "Materials", severity: "warning", description: "Plasterboard short by 4 sheets.", status: "Open", actionTaken: "Driver re-routing." },
];
const SEED_QUALITY: QualityNote[] = [
  { id: "q1", time: "08:55", jobNumber: "N2640188", issue: "Sign-off photos blurry — re-uploaded.", resolved: true },
  { id: "q2", time: "10:20", jobNumber: "N2640218", issue: "Description missing post-work readings.", resolved: false },
];
const SEED_COACHING: CoachingItem[] = [
  { id: "c1", team: "Pradeep", pattern: "3rd late start this week", recommendation: "1-to-1 timekeeping coaching." },
  { id: "c2", team: "Suresh",  pattern: "Repeat description quality flags", recommendation: "Refresher on sign-off SOP." },
];
const SEED_RESOLVED: ResolvedItem[] = [
  { id: "r1", jobNumber: "N2640142", issue: "Wrong skirting profile",  resolution: "Correct profile delivered & fitted.", confirmed: true },
  { id: "r2", jobNumber: "N2640177", issue: "Tenant unreachable AM",   resolution: "Visit re-booked PM, tenant confirmed.", confirmed: true },
];

const SEVERITY_STYLES: Record<Severity, string> = {
  urgent:  "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/30",
  warning: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30",
  info:    "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30",
};

const SectionHeader = ({
  icon, title, count, accent,
}: { icon: React.ReactNode; title: string; count: number; accent: string }) => (
  <div className="flex items-center justify-between px-1">
    <div className="flex items-center gap-2.5">
      <span className={cn("h-7 w-7 rounded-lg grid place-items-center", accent)}>{icon}</span>
      <h2 className="text-base sm:text-lg font-semibold tracking-tight">{title}</h2>
    </div>
    <Badge variant="outline" className="tabular-nums">{count}</Badge>
  </div>
);

const fmtNow = () => new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

const LiveMonitoringLog = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKind>("all");
  const [lastRefresh, setLastRefresh] = useState(fmtNow());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [visibleCount, setVisibleCount] = useState(10);
  const [toast, setToast] = useState<string | null>(null);
  const [logModalOpen, setLogModalOpen] = useState(false);
  const [entries, setEntries] = useState<StoredEntry[]>(() => loadStored());
  useEffect(() => { saveStored(entries); }, [entries]);

  const handleSaveEntry = (e: LogEntryDraft) => {
    const id = `e_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    setEntries((prev) => [{ ...e, id }, ...prev]);
    fire(`Entry added → ${e.severity || "Note"}`);
  };

  const pullStartY = useRef<number | null>(null);
  const [pullOffset, setPullOffset] = useState(0);

  const fire = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 1500); };

  const refresh = useCallback(() => {
    setIsRefreshing(true);
    setTimeout(() => { setLastRefresh(fmtNow()); setIsRefreshing(false); }, 500);
  }, []);

  // Auto-refresh every 30s
  useEffect(() => {
    const i = window.setInterval(refresh, 30000);
    return () => window.clearInterval(i);
  }, [refresh]);

  // Pull-to-refresh
  useEffect(() => {
    const onStart = (e: TouchEvent) => {
      if (window.scrollY === 0) pullStartY.current = e.touches[0].clientY;
    };
    const onMove = (e: TouchEvent) => {
      if (pullStartY.current === null) return;
      const dy = e.touches[0].clientY - pullStartY.current;
      if (dy > 0) setPullOffset(Math.min(dy, 90));
    };
    const onEnd = () => {
      if (pullOffset > 60) refresh();
      pullStartY.current = null;
      setPullOffset(0);
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd);
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
    };
  }, [pullOffset, refresh]);

  // Infinite scroll
  useEffect(() => {
    if (!sentinelRef.current) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) setVisibleCount((n) => n + 6);
    });
    io.observe(sentinelRef.current);
    return () => io.disconnect();
  }, []);

  const q = search.trim().toLowerCase();
  const match = (s: string) => !q || s.toLowerCase().includes(q);

  const flags = useMemo(() => SEED_FLAGS.filter(f =>
    (filter === "all" || filter === "urgent" && f.severity === "urgent" || filter === "warning" && f.severity === "warning") &&
    (match(f.jobNumber) || match(f.description) || match(f.category))
  ), [filter, q]);

  const quality = useMemo(() => SEED_QUALITY.filter(n =>
    (filter === "all" || filter === "note") &&
    (match(n.jobNumber) || match(n.issue))
  ), [filter, q]);

  const coaching = useMemo(() => SEED_COACHING.filter(c =>
    (filter === "all" || filter === "note") &&
    (match(c.team) || match(c.pattern) || match(c.recommendation))
  ), [filter, q]);

  const resolved = useMemo(() => SEED_RESOLVED.filter(r =>
    (filter === "all" || filter === "resolved") &&
    (match(r.jobNumber) || match(r.issue) || match(r.resolution))
  ), [filter, q]);

  const urgentCount = SEED_FLAGS.filter(f => f.severity === "urgent").length;
  const today = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <div
      className="min-h-screen bg-gradient-to-br from-slate-50 via-background to-slate-100 dark:from-slate-950 dark:via-background dark:to-slate-900"
      style={{ paddingTop: pullOffset }}
    >
      {pullOffset > 0 && (
        <div className="flex items-center justify-center -mt-8 text-xs text-muted-foreground">
          <RefreshCw className={cn("h-3.5 w-3.5 mr-1", pullOffset > 60 && "animate-spin")} />
          {pullOffset > 60 ? "Release to refresh" : "Pull to refresh"}
        </div>
      )}

      <div className="mx-auto max-w-[1400px] p-4 sm:p-6 lg:p-8 space-y-5">

        {/* Header */}
        <div className="rounded-2xl border bg-card p-4 sm:p-5 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <Button variant="outline" size="icon" onClick={() => navigate(-1)} aria-label="Back">
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Genie</p>
                <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight">Live Monitoring Log</h1>
                <p className="text-sm text-muted-foreground">{today}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className={cn("h-2 w-2 rounded-full", isRefreshing ? "bg-amber-500 animate-pulse" : "bg-emerald-500")} />
              Live · updated {lastRefresh}
            </div>
          </div>
        </div>

        {/* Top bar */}
        <div className="rounded-2xl border bg-card p-3 shadow-sm flex flex-wrap items-center gap-2">
          <Button size="sm" className="bg-blue-600 hover:bg-blue-700" onClick={() => setLogModalOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" /> Add Entry
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline">
                <Filter className="h-4 w-4 mr-1.5" />
                {filter === "all" ? "All" : filter[0].toUpperCase() + filter.slice(1)}
                <ChevronDown className="h-3.5 w-3.5 ml-1.5 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {(["all", "urgent", "warning", "note", "resolved"] as FilterKind[]).map(k => (
                <DropdownMenuItem key={k} onClick={() => setFilter(k)}>
                  {k[0].toUpperCase() + k.slice(1)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="relative flex-1 min-w-[180px]">
            <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search job, team, issue…"
              className="pl-8 h-9"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <Button size="sm" variant="outline" onClick={() => fire("Export CSV")}>
            <Download className="h-4 w-4 mr-1.5" /> Export
          </Button>
          <Button size="sm" variant="ghost" onClick={refresh} disabled={isRefreshing}>
            <RefreshCw className={cn("h-4 w-4 mr-1.5", isRefreshing && "animate-spin")} /> Refresh
          </Button>
        </div>

        {/* FLAGS */}
        {(filter === "all" || filter === "urgent" || filter === "warning") && (
          <section className="space-y-3">
            <SectionHeader
              icon={<Flag className="h-4 w-4 text-white" />}
              title={`🔴 Flags`}
              count={flags.length}
              accent="bg-red-500"
            />
            {flags.length === 0 ? (
              <EmptyHint label="No active flags." />
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {flags.slice(0, visibleCount).map((f) => (
                  <article key={f.id} className="rounded-2xl border bg-card p-4 shadow-sm space-y-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs tabular-nums text-muted-foreground">{f.time}</span>
                        <span className="font-semibold tabular-nums">{f.jobNumber}</span>
                        <Badge variant="outline">{f.category}</Badge>
                        <span className={cn("inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded border", SEVERITY_STYLES[f.severity])}>
                          {f.severity === "urgent" ? <AlertTriangle className="h-3 w-3" /> : <Flag className="h-3 w-3" />}
                          {f.severity}
                        </span>
                      </div>
                    </div>
                    <p className="text-sm">{f.description}</p>
                    <div className="text-xs text-muted-foreground"><b>Status:</b> {f.status} · <b>Action:</b> {f.actionTaken}</div>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      <Button size="sm" variant="outline" onClick={() => fire(`Note ${f.jobNumber}`)}><StickyNote className="h-3.5 w-3.5 mr-1" />Add Note</Button>
                      <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => fire(`Resolved ${f.jobNumber}`)}><CheckCircle2 className="h-3.5 w-3.5 mr-1" />Mark Resolved</Button>
                      <Button size="sm" variant="outline" onClick={() => fire(`Call ${f.jobNumber}`)}><PhoneCall className="h-3.5 w-3.5 mr-1" />Call</Button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        {/* QUALITY NOTES */}
        {(filter === "all" || filter === "note") && (
          <section className="space-y-3">
            <SectionHeader
              icon={<StickyNote className="h-4 w-4 text-white" />}
              title={`🟡 Quality Notes`}
              count={quality.length}
              accent="bg-amber-500"
            />
            {quality.length === 0 ? (
              <EmptyHint label="No quality notes." />
            ) : (
              <ul className="rounded-2xl border bg-card shadow-sm divide-y">
                {quality.slice(0, visibleCount).map((n) => (
                  <li key={n.id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs tabular-nums text-muted-foreground">{n.time}</span>
                      <span className="font-semibold tabular-nums">{n.jobNumber}</span>
                    </div>
                    <p className="text-sm flex-1">{n.issue}</p>
                    <Badge className={n.resolved ? "bg-emerald-500 hover:bg-emerald-500" : "bg-amber-500 hover:bg-amber-500"}>
                      {n.resolved ? "Resolved" : "Open"}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {/* COACHING */}
        {(filter === "all" || filter === "note") && (
          <section className="space-y-3">
            <SectionHeader
              icon={<Lightbulb className="h-4 w-4 text-white" />}
              title={`💡 Coaching & Training`}
              count={coaching.length}
              accent="bg-violet-500"
            />
            {coaching.length === 0 ? (
              <EmptyHint label="No coaching items." />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {coaching.slice(0, visibleCount).map((c) => (
                  <article key={c.id} className="rounded-2xl border bg-card p-4 shadow-sm space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="font-semibold">{c.team}</div>
                      <Badge variant="outline">Pattern</Badge>
                    </div>
                    <p className="text-sm"><span className="text-muted-foreground">Pattern:</span> {c.pattern}</p>
                    <p className="text-sm"><span className="text-muted-foreground">Recommendation:</span> {c.recommendation}</p>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      <Button size="sm" variant="outline" onClick={() => fire(`Schedule ${c.team}`)}><CalendarClock className="h-3.5 w-3.5 mr-1" />Schedule</Button>
                      <Button size="sm" variant="outline" onClick={() => fire(`Assign ${c.team}`)}><UserPlus className="h-3.5 w-3.5 mr-1" />Assign</Button>
                      <Button size="sm" variant="ghost" onClick={() => fire(`Dismiss ${c.team}`)}><X className="h-3.5 w-3.5 mr-1" />Dismiss</Button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        {/* RESOLVED */}
        {(filter === "all" || filter === "resolved") && (
          <section className="space-y-3">
            <SectionHeader
              icon={<CheckCircle2 className="h-4 w-4 text-white" />}
              title={`✅ Resolved Today`}
              count={resolved.length}
              accent="bg-emerald-500"
            />
            {resolved.length === 0 ? (
              <EmptyHint label="Nothing resolved yet." />
            ) : (
              <ul className="rounded-2xl border bg-card shadow-sm divide-y">
                {resolved.slice(0, visibleCount).map((r) => (
                  <li key={r.id} className="p-4 flex flex-col md:flex-row md:items-center gap-2">
                    <div className="flex items-center gap-2 min-w-[180px]">
                      <span className="font-semibold tabular-nums">{r.jobNumber}</span>
                      <Badge className="bg-emerald-500 hover:bg-emerald-500">Resolved</Badge>
                    </div>
                    <div className="flex-1 text-sm">
                      <div><span className="text-muted-foreground">Issue:</span> {r.issue}</div>
                      <div><span className="text-muted-foreground">Resolution:</span> {r.resolution}</div>
                    </div>
                    <span className="text-xs inline-flex items-center gap-1">
                      <CheckCircle2 className={cn("h-3.5 w-3.5", r.confirmed ? "text-emerald-500" : "text-muted-foreground")} />
                      {r.confirmed ? "Confirmed" : "Pending"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {/* Infinite scroll sentinel */}
        <div ref={sentinelRef} className="flex items-center justify-center py-6 text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 mr-1.5 animate-spin opacity-60" />
          Loading more…
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-full bg-foreground text-background text-xs font-medium px-4 py-2 shadow-lg">
          {toast}
        </div>
      )}
      <AddLogEntryModal
        open={logModalOpen}
        onOpenChange={setLogModalOpen}
        onSave={(e) => fire(`Logged ${e.category} (${e.severity})`)}
      />
    </div>
  );
};

const EmptyHint = ({ label }: { label: string }) => (
  <div className="rounded-2xl border bg-card p-6 text-center text-sm text-muted-foreground">{label}</div>
);

export default LiveMonitoringLog;
