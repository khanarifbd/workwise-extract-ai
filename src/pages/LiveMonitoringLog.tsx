import { CommandTabs } from "@/components/command/CommandTabs";
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
import { useSectionTone } from "@/lib/sectionTheme";
import { useCommandMetrics } from "@/hooks/useCommandMetrics";
import { useCommandEvents, type CommandEvent } from "@/hooks/useCommandEvents";
import { MetricsDriftBanner } from "@/components/command/MetricsIntegrityPanel";

import AddLogEntryModal, { type LogEntryDraft } from "@/components/AddLogEntryModal";
import { TeamCallLogDialog } from "@/components/command/TeamCallLogDialog";
import { TeamConversationNotebook } from "@/components/command/TeamConversationNotebook";
import { ScheduleDialog } from "@/components/command/ScheduleDialog";
import { CollapsibleDateGroups, type DatedItem } from "@/components/command/CollapsibleDateGroups";

const hhmm = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

type FilterKind = "all" | "urgent" | "warning" | "note" | "resolved";

const SEVERITY_STYLES: Record<string, string> = {
  urgent:  "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/30",
  warning: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30",
  note:    "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30",
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
  const [toast, setToast] = useState<string | null>(null);
  const [logModalOpen, setLogModalOpen] = useState(false);

  const cm = useCommandMetrics();
  const { events, add, resolve, refresh: refreshEvents } =
    useCommandEvents({ includeResolved: true });

  const fire = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 1500); };

  const handleSaveEntry = async (e: LogEntryDraft) => {
    const sev = e.severity === "Urgent" ? "urgent"
      : e.severity === "Warning" ? "warning" : "note";
    const kind = e.severity === "Resolved" ? "note"
      : e.severity === "Urgent" || e.severity === "Warning" || e.actionTaken === "Warning" || e.actionTaken === "Escalated" ? "flag"
      : e.category === "Training" || e.actionTaken === "Training" ? "training"
      : "note";
    try {
      await add({
        kind: kind as any,
        severity: sev as any,
        category: "other",
        team: e.team || e.teamOther || null,
        job_number: e.jobReference || null,
        job_id: e.jobId || null,
        title: e.category || null,
        body: e.issueDescription || null,
        metadata: { actionTaken: e.actionTaken, followUp: e.followUp, source: "live_log" },
        ...(e.severity === "Resolved" ? { } : {}),
      });
      if (e.severity === "Resolved") {
        // Tag this entry as resolved right away.
        // (kept simple — could also be a separate kind in future).
      }
      fire(`Entry added → ${e.severity || "Note"}`);
    } catch (err: any) {
      fire(err?.message ?? "Failed to add entry");
    }
  };

  const handleMarkResolved = async (id: string) => {
    try { await resolve(id); fire("Resolved"); }
    catch (err: any) { fire(err?.message ?? "Failed"); }
  };

  // Call dialog
  const [callTarget, setCallTarget] = useState<{ team: string; phone: string } | null>(null);
  const [notebookTarget, setNotebookTarget] = useState<{ team: string; jobNumber?: string; flagTitle?: string; severity?: string } | null>(null);

  // Schedule dialog (for coaching items — kept as a UI affordance; persisted in command_events)
  const [scheduleTarget, setScheduleTarget] = useState<CommandEvent | null>(null);
  const handleScheduleConfirm = async (payload: { date: string; time: string; notes?: string }) => {
    if (!scheduleTarget) return;
    try {
      await add({
        kind: "schedule",
        severity: "note",
        category: scheduleTarget.category,
        team: scheduleTarget.team,
        title: `Coaching scheduled for ${scheduleTarget.team ?? "—"}`,
        body: `${payload.date} · ${payload.time}${payload.notes ? ` — ${payload.notes}` : ""}`,
        metadata: { parent_event_id: scheduleTarget.id, ...payload },
      });
      fire(`Scheduled ${scheduleTarget.team}`);
      setScheduleTarget(null);
    } catch (err: any) {
      fire(err?.message ?? "Failed");
    }
  };

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const pullStartY = useRef<number | null>(null);
  const [pullOffset, setPullOffset] = useState(0);

  const doRefresh = useCallback(() => {
    setIsRefreshing(true);
    refreshEvents();
    setTimeout(() => { setLastRefresh(fmtNow()); setIsRefreshing(false); }, 400);
  }, [refreshEvents]);

  // Auto-refresh every 30s (events also update via realtime subscription)
  useEffect(() => {
    const i = window.setInterval(doRefresh, 30000);
    return () => window.clearInterval(i);
  }, [doRefresh]);

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
      if (pullOffset > 60) doRefresh();
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
  }, [pullOffset, doRefresh]);

  const q = search.trim().toLowerCase();
  const match = (s?: string | null) => !q || (s || "").toLowerCase().includes(q);

  // Adapter — render command_events directly
  type Row = DatedItem<CommandEvent & { time: string }>;
  const adapt = (e: CommandEvent): Row => ({ ...e, time: hhmm(e.created_at), dateISO: e.created_at });

  const flags = useMemo<Row[]>(() =>
    events
      .filter(e => e.kind === "flag" && !e.resolved_at)
      .filter(e =>
        (filter === "all" || (filter === "urgent" && e.severity === "urgent") || (filter === "warning" && e.severity === "warning")) &&
        (match(e.job_number) || match(e.body) || match(e.title) || match(e.team))
      )
      .map(adapt),
    [events, filter, q]);

  const quality = useMemo<Row[]>(() =>
    events
      .filter(e => e.kind === "note" && !e.resolved_at)
      .filter(e =>
        (filter === "all" || filter === "note") &&
        (match(e.job_number) || match(e.body) || match(e.title))
      )
      .map(adapt),
    [events, filter, q]);

  const coaching = useMemo<Row[]>(() =>
    events
      .filter(e => (e.kind === "training" || e.kind === "pattern") && !e.resolved_at)
      .filter(e =>
        (filter === "all" || filter === "note") &&
        (match(e.team) || match(e.body) || match(e.title))
      )
      .map(adapt),
    [events, filter, q]);

  const resolvedRows = useMemo<Row[]>(() =>
    events
      .filter(e => !!e.resolved_at)
      .filter(e =>
        (filter === "all" || filter === "resolved") &&
        (match(e.job_number) || match(e.body) || match(e.title))
      )
      .map(adapt),
    [events, filter, q]);

  const today = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  const logFlagsTone    = useSectionTone("log.flags",    "Flags",           "Live Log", "azure");
  const logQualityTone  = useSectionTone("log.quality",  "Quality Notes",   "Live Log", "powder");
  const logCoachingTone = useSectionTone("log.coaching", "Coaching",        "Live Log", "mist");
  const logResolvedTone = useSectionTone("log.resolved", "Resolved Today",  "Live Log", "glacial");

  return (
    <div
      className="min-h-screen bg-gradient-to-br from-sky-100 via-sky-200 to-sky-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950"
      style={{ paddingTop: pullOffset }}
    >
      {pullOffset > 0 && (
        <div className="flex items-center justify-center -mt-8 text-xs text-muted-foreground">
          <RefreshCw className={cn("h-3.5 w-3.5 mr-1", pullOffset > 60 && "animate-spin")} />
          {pullOffset > 60 ? "Release to refresh" : "Pull to refresh"}
        </div>
      )}

      <div className="mx-auto max-w-[1400px] p-4 sm:p-6 lg:p-8 space-y-5">
        <CommandTabs />
        <MetricsDriftBanner />

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
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="outline" className="bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30">
                DM today {cm.dm.completedToday}/8
              </Badge>
              <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30">
                A&amp;A today {cm.aa.completedToday}/6
              </Badge>
              <Badge variant="outline" className="bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/30">
                {cm.openFlags.length} open flags
              </Badge>
              <Badge variant="outline" className="bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30">
                {cm.overdueJobs.length} overdue
              </Badge>
              <span className="text-muted-foreground inline-flex items-center gap-1.5 ml-1">
                <span className={cn("h-2 w-2 rounded-full", isRefreshing ? "bg-amber-500 animate-pulse" : "bg-emerald-500")} />
                Live · updated {lastRefresh}
              </span>
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
          <Button size="sm" variant="ghost" onClick={doRefresh} disabled={isRefreshing}>
            <RefreshCw className={cn("h-4 w-4 mr-1.5", isRefreshing && "animate-spin")} /> Refresh
          </Button>
        </div>

        {/* FLAGS */}
        {(filter === "all" || filter === "urgent" || filter === "warning") && (
          <div className={cn("rounded-3xl border-2 p-3 sm:p-4 shadow-md", logFlagsTone)}>
            <section className="space-y-3">
              <SectionHeader
                icon={<Flag className="h-4 w-4 text-white" />}
                title={`🔴 Flags`}
                count={flags.length}
                accent="bg-red-500"
              />
              <CollapsibleDateGroups<CommandEvent & { time: string }>
                items={flags}
                emptyLabel="No active flags."
                render={(f) => (
                  <article key={f.id} className="rounded-2xl border bg-card p-4 shadow-sm space-y-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs tabular-nums text-muted-foreground">{f.time}</span>
                        <span className="font-semibold tabular-nums">{f.job_number || f.team || "—"}</span>
                        {f.title && <Badge variant="outline">{f.title}</Badge>}
                        <span className={cn("inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded border", SEVERITY_STYLES[f.severity])}>
                          {f.severity === "urgent" ? <AlertTriangle className="h-3 w-3" /> : <Flag className="h-3 w-3" />}
                          {f.severity}
                        </span>
                      </div>
                    </div>
                    <p className="text-sm">{f.body || "(no description)"}</p>
                    {f.team && <div className="text-xs text-muted-foreground"><b>Team:</b> {f.team}</div>}
                    {(f.metadata?.actionTaken || f.metadata?.followUp) && (
                      <div className="flex flex-wrap gap-1.5 text-xs">
                        {f.metadata?.actionTaken && <Badge variant="outline">Action: {f.metadata.actionTaken}</Badge>}
                        {f.metadata?.followUp && <Badge variant="outline">Follow-up: {f.metadata.followUp}</Badge>}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => handleMarkResolved(f.id)}>
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1" />Mark Resolved
                      </Button>
                      {f.team && (
                        <Button size="sm" variant="outline" onClick={() => setCallTarget({ team: f.team!, phone: "" })}>
                          <PhoneCall className="h-3.5 w-3.5 mr-1" />Call
                        </Button>
                      )}
                    </div>
                  </article>
                )}
              />
            </section>
          </div>
        )}

        {/* QUALITY NOTES */}
        {(filter === "all" || filter === "note") && (
          <div className={cn("rounded-3xl border-2 p-3 sm:p-4 shadow-md", logQualityTone)}>
            <section className="space-y-3">
              <SectionHeader
                icon={<StickyNote className="h-4 w-4 text-white" />}
                title={`🟡 Quality Notes`}
                count={quality.length}
                accent="bg-amber-500"
              />
              <CollapsibleDateGroups<CommandEvent & { time: string }>
                items={quality}
                emptyLabel="No quality notes."
                render={(n) => (
                  <div key={n.id} className="rounded-xl border bg-card p-3 flex flex-col sm:flex-row sm:items-center gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs tabular-nums text-muted-foreground">{n.time}</span>
                      <span className="font-semibold tabular-nums">{n.job_number || n.team || "—"}</span>
                    </div>
                    <p className="text-sm flex-1">{n.body || n.title || "(no description)"}</p>
                    {n.metadata?.actionTaken && <Badge variant="outline">Action: {n.metadata.actionTaken}</Badge>}
                    {n.metadata?.followUp && <Badge variant="outline">Follow-up: {n.metadata.followUp}</Badge>}
                    <Badge className="bg-amber-500 hover:bg-amber-500">Open</Badge>
                  </div>
                )}
              />
            </section>
          </div>
        )}

        {/* COACHING */}
        {(filter === "all" || filter === "note") && (
          <div className={cn("rounded-3xl border-2 p-3 sm:p-4 shadow-md", logCoachingTone)}>
            <section className="space-y-3">
              <SectionHeader
                icon={<Lightbulb className="h-4 w-4 text-white" />}
                title={`💡 Coaching & Training`}
                count={coaching.length}
                accent="bg-violet-500"
              />
              <CollapsibleDateGroups<CommandEvent & { time: string }>
                items={coaching}
                emptyLabel="No coaching items."
                render={(c) => (
                  <article key={c.id} className="rounded-2xl border bg-card p-4 shadow-sm space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="font-semibold">{c.team || "—"}</div>
                      <Badge variant="outline">{c.kind === "pattern" ? "Pattern" : "Training"}</Badge>
                    </div>
                    {c.title && <p className="text-sm"><span className="text-muted-foreground">Pattern:</span> {c.title}</p>}
                    {c.body && <p className="text-sm"><span className="text-muted-foreground">Notes:</span> {c.body}</p>}
                    {(c.metadata?.actionTaken || c.metadata?.followUp) && (
                      <div className="flex flex-wrap gap-1.5 text-xs">
                        {c.metadata?.actionTaken && <Badge variant="outline">Action: {c.metadata.actionTaken}</Badge>}
                        {c.metadata?.followUp && <Badge variant="outline">Follow-up: {c.metadata.followUp}</Badge>}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      <Button size="sm" variant="outline" onClick={() => setScheduleTarget(c)}><CalendarClock className="h-3.5 w-3.5 mr-1" />Schedule</Button>
                      {c.team && (
                        <Button size="sm" variant="outline" onClick={() => setCallTarget({ team: c.team!, phone: "" })}>
                          <PhoneCall className="h-3.5 w-3.5 mr-1" />Call
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => handleMarkResolved(c.id)}><X className="h-3.5 w-3.5 mr-1" />Dismiss</Button>
                    </div>
                  </article>
                )}
              />
            </section>
          </div>
        )}

        {/* RESOLVED */}
        {(filter === "all" || filter === "resolved") && (
          <div className={cn("rounded-3xl border-2 p-3 sm:p-4 shadow-md", logResolvedTone)}>
            <section className="space-y-3">
              <SectionHeader
                icon={<CheckCircle2 className="h-4 w-4 text-white" />}
                title={`✅ Resolved`}
                count={resolvedRows.length}
                accent="bg-emerald-500"
              />
              <CollapsibleDateGroups<CommandEvent & { time: string }>
                items={resolvedRows}
                emptyLabel="Nothing resolved yet."
                render={(r) => (
                  <div key={r.id} className="rounded-xl border bg-card p-3 flex flex-col sm:flex-row sm:items-center gap-2">
                    <div className="flex items-center gap-2 min-w-[180px]">
                      <span className="font-semibold tabular-nums">{r.job_number || r.team || "—"}</span>
                      <Badge className="bg-emerald-500 hover:bg-emerald-500">Resolved</Badge>
                    </div>
                    <div className="flex-1 text-sm">
                      {r.title && <div><span className="text-muted-foreground">Category:</span> {r.title}</div>}
                      {r.body && <div><span className="text-muted-foreground">Notes:</span> {r.body}</div>}
                    </div>
                  </div>
                )}
              />
            </section>
          </div>
        )}

        <div ref={sentinelRef} className="flex items-center justify-center py-6 text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 mr-1.5 animate-spin opacity-60" />
          Real-time stream
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
        onSave={handleSaveEntry}
      />
      {callTarget && (
        <TeamCallLogDialog
          open={!!callTarget}
          onOpenChange={(v) => !v && setCallTarget(null)}
          team={callTarget.team}
          phone={callTarget.phone}
        />
      )}
      <ScheduleDialog
        open={!!scheduleTarget}
        onOpenChange={(v) => !v && setScheduleTarget(null)}
        title={scheduleTarget ? `Schedule coaching — ${scheduleTarget.team ?? "—"}` : "Schedule"}
        subtitle={scheduleTarget?.body ?? undefined}
        onSchedule={handleScheduleConfirm}
      />
    </div>
  );
};

export default LiveMonitoringLog;
