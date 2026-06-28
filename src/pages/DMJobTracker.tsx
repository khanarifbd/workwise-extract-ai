import { CommandTabs } from "@/components/command/CommandTabs";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowLeft, AlertTriangle, Clock, CheckCircle2, Flag, PhoneCall,
  StickyNote, Eye, ShieldCheck, Wrench, Package, Camera, FileText,
  PenSquare, Plus, Filter, Download, CalendarClock, UserPlus, Truck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useSectionTone } from "@/lib/sectionTheme";
import { SignOffDialog, type SignOffJob } from "@/components/command/SignOffDialog";
import { useCommandMetrics } from "@/hooks/useCommandMetrics";
import { useTrackerJobs, type TrackerRow } from "@/hooks/useTrackerJobs";
import { MetricsDriftBanner } from "@/components/command/MetricsIntegrityPanel";



// All tracker rows are now derived from canonical job data via
// `useTrackerJobs('dm')`. No hard-coded seed arrays.


// ---------- Helpers ----------
const Tick = ({ ok }: { ok: boolean }) => ok ? (
  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
) : (
  <AlertTriangle className="h-4 w-4 text-amber-500" />
);

const tierStyles: Record<number, string> = {
  1: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  2: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30",
  3: "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/30",
};

const SectionHeader = ({
  title, count, icon: Icon, accent,
}: { title: string; count: number; icon: typeof Flag; accent: string }) => (
  <header className="flex items-center justify-between px-5 py-3 border-b">
    <div className="flex items-center gap-2.5">
      <span className={cn("rounded-lg p-1.5", accent)}>
        <Icon className="h-4 w-4 text-white" />
      </span>
      <h2 className="text-base sm:text-lg font-semibold">{title}</h2>
    </div>
    <Badge variant="outline" className="tabular-nums">{count}</Badge>
  </header>
);

const DMJobTracker = () => {
  const navigate = useNavigate();
  const [log, setLog] = useState<string | null>(null);
  const fire = (msg: string) => { setLog(msg); setTimeout(() => setLog(null), 1500); };

  // Persisted state for action results
  const LS = {
    notes: "dm-tracker.notes",
    flags: "dm-tracker.flags",
    resolved: "dm-tracker.resolved",
    schedules: "dm-tracker.schedules",
    assignments: "dm-tracker.assignments",
    materials: "dm-tracker.materials",
    signOffs: "dm-tracker.signoffs",
  };
  const readLS = <T,>(k: string, fallback: T): T => {
    try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
  };
  const [notes, setNotes] = useState<Record<string, string[]>>(() => readLS(LS.notes, {}));
  const [flagged, setFlagged] = useState<Record<string, string>>(() => readLS(LS.flags, {}));
  const [resolved, setResolved] = useState<string[]>(() => readLS(LS.resolved, []));
  const [schedules, setSchedules] = useState<Record<string, string>>(() => readLS(LS.schedules, {}));
  const [assignments, setAssignments] = useState<Record<string, string>>(() => readLS(LS.assignments, {}));
  const [materials, setMaterials] = useState<Record<string, string>>(() => readLS(LS.materials, {}));
  const [signOffs, setSignOffs] = useState<string[]>(() => readLS(LS.signOffs, []));
  const [signOffJob, setSignOffJob] = useState<SignOffJob | null>(null);

  useEffect(() => { localStorage.setItem(LS.notes, JSON.stringify(notes)); }, [notes]);
  useEffect(() => { localStorage.setItem(LS.flags, JSON.stringify(flagged)); }, [flagged]);
  useEffect(() => { localStorage.setItem(LS.resolved, JSON.stringify(resolved)); }, [resolved]);
  useEffect(() => { localStorage.setItem(LS.schedules, JSON.stringify(schedules)); }, [schedules]);
  useEffect(() => { localStorage.setItem(LS.assignments, JSON.stringify(assignments)); }, [assignments]);
  useEffect(() => { localStorage.setItem(LS.materials, JSON.stringify(materials)); }, [materials]);
  useEffect(() => { localStorage.setItem(LS.signOffs, JSON.stringify(signOffs)); }, [signOffs]);

  const TEAM_PHONES: Record<string, string> = {
    Shakthi: "+447000000001", Suresh: "+447000000002", Indika: "+447000000003",
    Pradeep: "+447000000004", Gupi: "+447000000005",
  };

  const handleCall = (team: string) => {
    const phone = TEAM_PHONES[team];
    if (!phone) { toast.error(`No number stored for ${team}`); return; }
    window.location.href = `tel:${phone}`;
    toast.success(`Calling ${team}…`);
  };

  const handleAddNote = (jobNumber: string) => {
    const note = window.prompt(`Add a note for ${jobNumber}:`);
    if (!note?.trim()) return;
    setNotes((prev) => ({ ...prev, [jobNumber]: [...(prev[jobNumber] ?? []), note.trim()] }));
    toast.success(`Note added to ${jobNumber}`);
  };

  const handleResolve = (jobNumber: string) => {
    setResolved((prev) => prev.includes(jobNumber) ? prev : [...prev, jobNumber]);
    toast.success(`${jobNumber} marked resolved`);
  };

  const handleFlag = (jobNumber: string, team: string) => {
    const reason = window.prompt(`Reason to flag ${jobNumber} (${team}):`);
    if (!reason?.trim()) return;
    setFlagged((prev) => ({ ...prev, [jobNumber]: reason.trim() }));
    navigate(`/command/log?team=${encodeURIComponent(team)}&job=${encodeURIComponent(jobNumber)}`);
  };

  const handleDetails = (jobNumber: string) => {
    navigate(`/command/log?job=${encodeURIComponent(jobNumber)}`);
  };

  const handleViewSignOff = (job: CompletedJob) => {
    setSignOffs((prev) => prev.includes(job.jobNumber) ? prev : [...prev, job.jobNumber]);
    setSignOffJob({
      jobNumber: job.jobNumber,
      team: job.team,
      duration: job.duration,
      signOffTime: job.signOffTime,
      photosOK: job.photosOK,
      descriptionOK: job.descriptionOK,
      signed: job.signed,
    });
  };

  const handleSchedulePreVisit = (jobNumber: string) => {
    const when = window.prompt(`Schedule pre-visit for ${jobNumber} (e.g. Tomorrow 09:00):`);
    if (!when?.trim()) return;
    setSchedules((prev) => ({ ...prev, [jobNumber]: when.trim() }));
    toast.success(`Pre-visit scheduled: ${when.trim()}`);
  };

  const handleAssignTrades = (jobNumber: string) => {
    const trades = window.prompt(`Assign trades for ${jobNumber} (comma separated):`);
    if (!trades?.trim()) return;
    setAssignments((prev) => ({ ...prev, [jobNumber]: trades.trim() }));
    toast.success(`Trades assigned to ${jobNumber}`);
  };

  const handleConfirmMaterials = (jobNumber: string) => {
    const stamp = new Date().toLocaleString("en-GB");
    setMaterials((prev) => ({ ...prev, [jobNumber]: stamp }));
    toast.success(`Materials confirmed for ${jobNumber}`);
  };

  const cm = useCommandMetrics();
  const stats = useMemo(() => ({
    target: 8,
    completed: cm.dm.completedToday,
    inProgress: cm.dm.active,
    flagged: cm.openFlags.filter((j: any) => (j.categoryName || '').match(/DM/i) || (j as any).categoryId === cm.dm.categoryId).length,
  }), [cm.dm, cm.openFlags]);

  const today = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  const dmUrgentTone     = useSectionTone("dm.urgent",      "Urgent Flags",      "DM Tracker", "azure");
  const dmInProgressTone = useSectionTone("dm.in_progress", "In Progress",       "DM Tracker", "powder");
  const dmCompletedTone  = useSectionTone("dm.completed",   "Completed Today",   "DM Tracker", "glacial");
  const dmPipelineTone   = useSectionTone("dm.pipeline",    "Tomorrow Pipeline", "DM Tracker", "arctic");


  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-100 via-sky-200 to-sky-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 pb-24">
      <div className="mx-auto max-w-[1400px] p-4 sm:p-6 lg:p-8 space-y-5">
        <CommandTabs />


        {/* Header */}
        <div className="rounded-2xl border bg-card p-4 sm:p-5 shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            <div className="flex items-start sm:items-center gap-3">
              <Button variant="outline" size="icon" onClick={() => navigate(-1)} aria-label="Back">
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Genie</p>
                <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight">DM Job Tracker</h1>
                <p className="text-sm text-muted-foreground">{today}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 lg:gap-3">
              <SummaryPill label="Target/day" value={`${stats.target}`} tone="blue" />
              <SummaryPill label="Completed" value={`${stats.completed}`} tone="emerald" />
              <SummaryPill label="In Progress" value={`${stats.inProgress}`} tone="amber" />
              <SummaryPill label="Flagged" value={`${stats.flagged}`} tone="red" />
            </div>
          </div>
        </div>

        {/* Urgent flags */}
        <div className={cn("rounded-3xl border-2 p-2 sm:p-3 shadow-md", dmUrgentTone)}>
        <section className="rounded-2xl border bg-card shadow-sm overflow-hidden">
          <SectionHeader title="Urgent Flags" count={URGENT.length} icon={AlertTriangle} accent="bg-red-500" />
          {URGENT.length === 0 ? (
            <p className="px-5 py-6 text-sm text-muted-foreground">No urgent flags.</p>
          ) : (
            <ul className="divide-y">
              {URGENT.map((u) => (
                <li key={u.id} className="px-5 py-4 flex flex-col lg:flex-row lg:items-center gap-3 bg-red-500/5">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold tabular-nums">{u.jobNumber}</span>
                      <Badge variant="outline">{u.team}</Badge>
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 dark:text-red-400">
                        <Clock className="h-3 w-3" /> {u.overrun}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{u.description}</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Button size="sm" variant="outline" onClick={() => handleCall(u.team)}><PhoneCall className="h-3.5 w-3.5 mr-1" />Call Team</Button>
                    <Button size="sm" variant="outline" onClick={() => handleAddNote(u.jobNumber)}><StickyNote className="h-3.5 w-3.5 mr-1" />Add Note</Button>
                    <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => handleResolve(u.jobNumber)}><CheckCircle2 className="h-3.5 w-3.5 mr-1" />Resolve</Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
        </div>

        {/* In progress */}
        <div className={cn("rounded-3xl border-2 p-2 sm:p-3 shadow-md", dmInProgressTone)}>
        <section className="rounded-2xl border bg-card shadow-sm overflow-hidden">
          <SectionHeader title="In Progress" count={IN_PROGRESS.length} icon={Clock} accent="bg-amber-500" />

          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="text-left px-5 py-2.5 font-medium">Job</th>
                  <th className="text-left px-5 py-2.5 font-medium">Team / Address</th>
                  <th className="text-left px-5 py-2.5 font-medium">Elapsed</th>
                  <th className="text-center px-5 py-2.5 font-medium">Tenant</th>
                  <th className="text-center px-5 py-2.5 font-medium">Tier</th>
                  <th className="text-center px-5 py-2.5 font-medium">Materials</th>
                  <th className="text-center px-5 py-2.5 font-medium">Trades</th>
                  <th className="text-right px-5 py-2.5 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {IN_PROGRESS.map((j) => (
                  <tr key={j.id} className="border-t hover:bg-muted/30">
                    <td className="px-5 py-3 font-semibold tabular-nums">{j.jobNumber}</td>
                    <td className="px-5 py-3">
                      <div className="font-medium">{j.team}</div>
                      <div className="text-xs text-muted-foreground">{j.address}</div>
                    </td>
                    <td className="px-5 py-3 tabular-nums">{j.elapsed}</td>
                    <td className="px-5 py-3 text-center"><Tick ok={j.tenantOK} /></td>
                    <td className="px-5 py-3 text-center">
                      <span className={cn("inline-flex h-6 min-w-6 items-center justify-center rounded-md border text-xs font-semibold px-2", tierStyles[j.tier])}>T{j.tier}</span>
                    </td>
                    <td className="px-5 py-3 text-center"><Tick ok={j.materialsOK} /></td>
                    <td className="px-5 py-3 text-center"><Tick ok={j.tradesOK} /></td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-1.5">
                        <Button size="sm" variant="outline" onClick={() => handleDetails(j.jobNumber)}><Eye className="h-3.5 w-3.5 mr-1" />Details</Button>
                        <Button size="sm" variant="outline" onClick={() => handleAddNote(j.jobNumber)}><StickyNote className="h-3.5 w-3.5 mr-1" />Note</Button>
                        <Button size="sm" variant="outline" onClick={() => handleFlag(j.jobNumber, j.team)}><Flag className="h-3.5 w-3.5 mr-1" />Flag</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <ul className="md:hidden divide-y">
            {IN_PROGRESS.map((j) => (
              <li key={j.id} className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold tabular-nums">{j.jobNumber}</div>
                    <div className="text-xs text-muted-foreground">{j.team} · {j.address}</div>
                  </div>
                  <span className={cn("inline-flex h-6 items-center rounded-md border text-xs font-semibold px-2", tierStyles[j.tier])}>Tier {j.tier}</span>
                </div>
                <div className="grid grid-cols-4 gap-1 text-xs">
                  <Stat label="Elapsed" value={j.elapsed} />
                  <Stat label="Tenant" value={<Tick ok={j.tenantOK} />} />
                  <Stat label="Materials" value={<Tick ok={j.materialsOK} />} />
                  <Stat label="Trades" value={<Tick ok={j.tradesOK} />} />
                </div>
                <div className="flex gap-1.5">
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => handleDetails(j.jobNumber)}><Eye className="h-3.5 w-3.5 mr-1" />Details</Button>
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => handleAddNote(j.jobNumber)}><StickyNote className="h-3.5 w-3.5 mr-1" />Note</Button>
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => handleFlag(j.jobNumber, j.team)}><Flag className="h-3.5 w-3.5 mr-1" />Flag</Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
        </div>

        {/* Completed today */}
        <div className={cn("rounded-3xl border-2 p-2 sm:p-3 shadow-md", dmCompletedTone)}>
        <section className="rounded-2xl border bg-card shadow-sm overflow-hidden">
          <SectionHeader title="Completed Today" count={COMPLETED.length} icon={CheckCircle2} accent="bg-emerald-500" />
          <ul className="divide-y">
            {COMPLETED.map((c) => (
              <li key={c.id} className="px-5 py-3 flex flex-col md:flex-row md:items-center gap-3">
                <div className="flex-1 min-w-0 flex flex-wrap items-center gap-2">
                  <span className="font-semibold tabular-nums">{c.jobNumber}</span>
                  <Badge variant="outline">{c.team}</Badge>
                  <span className="text-xs text-muted-foreground">Duration {c.duration}</span>
                  <span className="text-xs text-muted-foreground">· Signed off {c.signOffTime}</span>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className="inline-flex items-center gap-1"><Camera className="h-3.5 w-3.5 text-muted-foreground" /><Tick ok={c.photosOK} /> Photos</span>
                  <span className="inline-flex items-center gap-1"><FileText className="h-3.5 w-3.5 text-muted-foreground" /><Tick ok={c.descriptionOK} /> Desc</span>
                  <span className="inline-flex items-center gap-1"><PenSquare className="h-3.5 w-3.5 text-muted-foreground" /><Tick ok={c.signed} /> Signed</span>
                </div>
                <Button size="sm" variant="outline" onClick={() => handleViewSignOff(c)}>
                  <ShieldCheck className="h-3.5 w-3.5 mr-1" />View Sign-off
                </Button>
              </li>
            ))}
          </ul>
        </section>
        </div>

        {/* Tomorrow's pipeline */}
        <div className={cn("rounded-3xl border-2 p-2 sm:p-3 shadow-md", dmPipelineTone)}>
        <section className="rounded-2xl border bg-card shadow-sm overflow-hidden">
          <SectionHeader title="Tomorrow's Pipeline" count={PIPELINE.length} icon={CalendarClock} accent="bg-blue-500" />
          <ul className="divide-y">
            {PIPELINE.map((p) => (
              <li key={p.id} className="px-5 py-3 flex flex-col lg:flex-row lg:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold tabular-nums">{p.jobNumber}</span>
                    <Badge variant="outline">{p.team}</Badge>
                    {p.preVisitNeeded && (
                      <Badge className="bg-amber-500 hover:bg-amber-500 text-white">Pre-visit needed</Badge>
                    )}
                    {p.risk && (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400">
                        <AlertTriangle className="h-3 w-3" /> {p.risk}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{p.address}</p>
                  {(schedules[p.jobNumber] || assignments[p.jobNumber] || materials[p.jobNumber]) && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px]">
                      {schedules[p.jobNumber] && <Badge variant="outline" className="border-blue-500/40 text-blue-700 dark:text-blue-300">Pre-visit: {schedules[p.jobNumber]}</Badge>}
                      {assignments[p.jobNumber] && <Badge variant="outline" className="border-violet-500/40 text-violet-700 dark:text-violet-300">Trades: {assignments[p.jobNumber]}</Badge>}
                      {materials[p.jobNumber] && <Badge variant="outline" className="border-emerald-500/40 text-emerald-700 dark:text-emerald-300">Materials ✓ {materials[p.jobNumber]}</Badge>}
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Button size="sm" variant="outline" onClick={() => handleSchedulePreVisit(p.jobNumber)}><CalendarClock className="h-3.5 w-3.5 mr-1" />Schedule Pre-visit</Button>
                  <Button size="sm" variant="outline" onClick={() => handleAssignTrades(p.jobNumber)}><UserPlus className="h-3.5 w-3.5 mr-1" />Assign Trades</Button>
                  <Button size="sm" variant="outline" onClick={() => handleConfirmMaterials(p.jobNumber)}><Package className="h-3.5 w-3.5 mr-1" />Confirm Materials</Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
        </div>

        {log && (
          <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 rounded-full bg-foreground text-background text-xs font-medium px-4 py-2 shadow-lg">
            {log}
          </div>
        )}
      </div>

      {/* Bottom bar */}
      <div className="fixed bottom-0 inset-x-0 border-t bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/75 z-40">
        <div className="mx-auto max-w-[1400px] px-4 py-3 flex items-center justify-between gap-2">
          <Link to="/command" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
            <ArrowLeft className="h-3.5 w-3.5" /> Command
          </Link>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => fire("Filter")}><Filter className="h-4 w-4 mr-1.5" />Filter</Button>
            <Button variant="outline" size="sm" onClick={() => fire("Export")}><Download className="h-4 w-4 mr-1.5" />Export</Button>
            <Button size="sm" className="bg-blue-600 hover:bg-blue-700" onClick={() => fire("Add Job")}>
              <Plus className="h-4 w-4 mr-1.5" />Add Job
            </Button>
          </div>
        </div>
      </div>

      <SignOffDialog
        open={!!signOffJob}
        onOpenChange={(o) => !o && setSignOffJob(null)}
        job={signOffJob}
      />
    </div>
  );
};

// ---------- Small subcomponents ----------
const toneMap = {
  blue:    "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30",
  emerald: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  amber:   "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30",
  red:     "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/30",
} as const;

const SummaryPill = ({ label, value, tone }: { label: string; value: string; tone: keyof typeof toneMap }) => (
  <div className={cn("rounded-xl border px-3 py-2 text-center", toneMap[tone])}>
    <div className="text-[10px] uppercase tracking-wide font-medium opacity-80">{label}</div>
    <div className="text-xl font-bold tabular-nums leading-tight">{value}</div>
  </div>
);

const Stat = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="rounded-md border bg-muted/30 px-2 py-1.5 text-center">
    <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
    <div className="font-semibold flex items-center justify-center mt-0.5">{value}</div>
  </div>
);

export default DMJobTracker;
