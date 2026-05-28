import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Sparkles, Loader2, CheckCircle2, MapPin, Briefcase, Wrench, Calendar, RefreshCw, ChevronDown, ChevronUp, Pencil, Save, X, History, ArrowRightLeft, Users, Clock } from "lucide-react";
import TeamSkillsManager from "@/components/TeamSkillsManager";
import { cn } from "@/lib/utils";

interface TeamRow { teamId: string; teamName: string; }
interface JobRow {
  id: string; job_number: string; name: string; address: string;
  description: string | null; summary_of_works: string | null;
  booked_date: string | null; team: string | null; team2?: string | null; category_id: string | null;
  is_completed?: boolean | null; status?: string | null;
}
interface CurrentTeamAssessment {
  teamName: string; fitScore: number; reasoning: string;
}
interface Assignment {
  jobId: string;
  teamName: string;            // primary (back-compat)
  teamNames: string[];         // primary + extras
  requiresMultipleTeams?: boolean;
  jobSizeAssessment?: string;
  tradesRequired?: string[];
  confidence: number;
  reasoning: string;
  similarJobsLast60Days?: number;
  currentTeam?: string | null;
  currentTeam2?: string | null;
  currentTeamAssessment?: CurrentTeamAssessment;
}

type Stream = "dm" | "aa";

const DM_CATEGORY_ID = "e1563697-457a-4a67-aa9e-b0785dbc711d";
const AA_CATEGORY_ID = "a4a08b3b-70b6-4fa9-b54b-c173dcf07a33";

const STREAM_LABEL: Record<Stream, string> = { dm: "DM Jobs", aa: "A & A" };
const STREAM_CATEGORY: Record<Stream, string> = { dm: DM_CATEGORY_ID, aa: AA_CATEGORY_ID };
const TEAMS_LS_KEY = (s: Stream) => `autoAssign.selectedTeams.${s}`;

const pad = (n: number) => String(n).padStart(2, "0");
const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayISO = () => isoDate(new Date());
// Convert a timestamptz string from the DB to the LOCAL YYYY-MM-DD it falls on
// (matches the rest of the app's bookedDate convention).
const localDateOf = (ts: string | null): string | null => {
  if (!ts) return null;
  const d = new Date(ts);
  if (isNaN(d.getTime())) return null;
  return isoDate(d);
};

interface DayOption { iso: string; label: string; sub: string; }
const buildDays = (): DayOption[] => {
  const out: DayOption[] = [];
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  for (let i = 0; i < 7; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    const label = i === 0 ? "Today" : i === 1 ? "Tomorrow"
      : d.toLocaleDateString(undefined, { weekday: "short" });
    const sub = d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
    out.push({ iso: isoDate(d), label, sub });
  }
  return out;
};

export default function AutoAssignPanel() {
  const { toast } = useToast();
  const days = useMemo(buildDays, []);
  const [stream, setStream] = useState<Stream>("dm");
  const [targetDate, setTargetDate] = useState<string>(todayISO());

  const [allTeams, setAllTeams] = useState<Array<TeamRow & { stream: Stream }>>([]);
  const [selectedTeams, setSelectedTeams] = useState<Set<string>>(new Set());
  const [windowJobs, setWindowJobs] = useState<JobRow[]>([]); // all booked jobs across the 7-day window for this stream
  const [loading, setLoading] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [running, setRunning] = useState(false);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [workloadByTeam, setWorkloadByTeam] = useState<Record<string, number>>({});
  const [unavailableTeams, setUnavailableTeams] = useState<Set<string>>(new Set());
  const [skillsOpen, setSkillsOpen] = useState(false);
  const [skillsTeamId, setSkillsTeamId] = useState<string | undefined>();
  const [teamsWithSkills, setTeamsWithSkills] = useState<Set<string>>(new Set());
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<{ jobId: string; value: string } | null>(null);
  const [savingDesc, setSavingDesc] = useState(false);
  const [reassigning, setReassigning] = useState<string | null>(null);

  // Load teams & classify by stream (DM vs A+A inferred from past assignments to A&A category)
  useEffect(() => {
    (async () => {
      const [{ data: tac }, { data: aaJobs }, { data: skills }, { data: open }] = await Promise.all([
        supabase.from("team_access_codes")
          .select("team_id, team_name, is_ops_manager").eq("is_active", true).order("team_name"),
        supabase.from("jobs").select("team").eq("category_id", AA_CATEGORY_ID).not("team", "is", null).limit(5000),
        supabase.from("team_skills" as any).select("team_id"),
        supabase.from("jobs").select("team").eq("is_completed", false),
      ]);

      const aaTeamNames = new Set((aaJobs || []).map((j: any) => (j.team || "").trim()).filter(Boolean));
      const rows: Array<TeamRow & { stream: Stream }> = (tac || [])
        .filter((t: any) => !t.is_ops_manager)
        .map((t: any) => ({
          teamId: t.team_id,
          teamName: t.team_name,
          stream: aaTeamNames.has((t.team_name || "").trim()) ? "aa" : "dm",
        }));
      setAllTeams(rows);

      const counts: Record<string, number> = {};
      (open || []).forEach((j: any) => { if (j.team) counts[j.team] = (counts[j.team] || 0) + 1; });
      setWorkloadByTeam(counts);

      setTeamsWithSkills(new Set(((skills as any[]) || []).map((s: any) => s.team_id)));
    })();
  }, [skillsOpen]);

  // Teams visible for the active stream
  const streamTeams = useMemo(
    () => allTeams.filter(t => t.stream === stream),
    [allTeams, stream]
  );

  // Restore per-stream tick state from localStorage; default to all-selected if no saved state.
  // Unticked teams STAY unticked across page navigations until the user re-ticks them.
  useEffect(() => {
    if (!streamTeams.length) return;
    const ids = streamTeams.map(t => t.teamId);
    let next: Set<string>;
    try {
      const raw = localStorage.getItem(TEAMS_LS_KEY(stream));
      if (raw) {
        const saved: string[] = JSON.parse(raw);
        // Intersect with currently-existing team ids
        next = new Set(ids.filter(id => saved.includes(id)));
      } else {
        next = new Set(ids); // first visit: everyone ticked
      }
    } catch {
      next = new Set(ids);
    }
    setSelectedTeams(next);
    setAssignments([]);
  }, [stream, allTeams.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch ALL booked jobs in this stream that fall on ANY of the 7 visible
  // days (LOCAL date). One source of truth — drives both the day-tab counts and the table.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const first = days[0].iso;
      const last = days[days.length - 1].iso;
      // Widen the UTC window by ±1 day so we catch any local-date conversion edge cases,
      // then filter strictly by local date in JS.
      const startUTC = new Date(`${first}T00:00:00`);
      startUTC.setDate(startUTC.getDate() - 1);
      const endUTC = new Date(`${last}T23:59:59`);
      endUTC.setDate(endUTC.getDate() + 1);

      const [{ data: unavail }, { data: jobRows, error }] = await Promise.all([
        supabase.from("team_availability").select("team_id").eq("unavailable_date", targetDate),
        supabase
          .from("jobs")
          .select("id, job_number, name, address, description, summary_of_works, booked_date, team, team2, category_id, is_completed, status")
          .eq("category_id", STREAM_CATEGORY[stream])
          .not("booked_date", "is", null)
          .gte("booked_date", startUTC.toISOString())
          .lte("booked_date", endUTC.toISOString())
          .order("booked_date", { ascending: true })
          .limit(1000),
      ]);
      if (cancelled) return;
      if (error) {
        toast({ title: "Failed to load jobs", description: error.message, variant: "destructive" });
      }
      setUnavailableTeams(new Set((unavail || []).map((u: any) => u.team_id)));
      setWindowJobs((jobRows || []) as JobRow[]);
      setAssignments([]);
      setLastSyncedAt(new Date());
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [targetDate, stream, refreshTick, days, toast]);

  // Realtime: any change to jobs in this stream triggers a refresh so the panel
  // stays perfectly aligned with the database.
  useEffect(() => {
    const channel = supabase
      .channel(`auto-assign-jobs-${stream}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "jobs", filter: `category_id=eq.${STREAM_CATEGORY[stream]}` },
        () => setRefreshTick(t => t + 1)
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [stream]);

  // Refresh when the tab regains focus
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === "visible") setRefreshTick(t => t + 1); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onVis);
    };
  }, []);

  // Derive per-day counts and the jobs visible for the active day (strict LOCAL match)
  const dayCounts = useMemo(() => {
    const m: Record<string, number> = {};
    days.forEach(d => { m[d.iso] = 0; });
    windowJobs.forEach(j => {
      const k = localDateOf(j.booked_date);
      if (k && k in m) m[k] += 1;
    });
    return m;
  }, [windowJobs, days]);

  const jobs = useMemo(
    () => windowJobs.filter(j => localDateOf(j.booked_date) === targetDate),
    [windowJobs, targetDate]
  );

  // Jobs eligible for AI auto-assignment (unassigned + active).
  const assignableJobs = useMemo(
    () => jobs.filter(j => !j.team && !j.is_completed && j.status !== "complete"),
    [jobs]
  );
  // Jobs the AI analyses (everything visible for the day — assigned or not, but not completed).
  const analysableJobs = useMemo(
    () => jobs.filter(j => !j.is_completed && j.status !== "complete"),
    [jobs]
  );

  const toggleTeam = (id: string) => {
    setSelectedTeams(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      try { localStorage.setItem(TEAMS_LS_KEY(stream), JSON.stringify(Array.from(next))); } catch { /* ignore */ }
      return next;
    });
  };

  const toggleExpanded = (id: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const startEdit = (job: JobRow) => {
    setEditing({
      jobId: job.id,
      value: job.summary_of_works || job.description || "",
    });
    setExpandedRows(prev => new Set(prev).add(job.id));
  };

  const saveEdit = async () => {
    if (!editing) return;
    setSavingDesc(true);
    try {
      const { error } = await supabase
        .from("jobs")
        .update({ description: editing.value, updated_at: new Date().toISOString() })
        .eq("id", editing.jobId);
      if (error) throw error;
      setWindowJobs(prev => prev.map(j => j.id === editing.jobId ? { ...j, description: editing.value } : j));
      toast({ title: "Description updated" });
      setEditing(null);
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally {
      setSavingDesc(false);
    }
  };

  const eligibleTeams = useMemo(
    () => streamTeams.filter(t => selectedTeams.has(t.teamId) && !unavailableTeams.has(t.teamId)),
    [streamTeams, selectedTeams, unavailableTeams]
  );

  const runAutoAssign = async () => {
    if (!eligibleTeams.length) {
      toast({ title: "No teams selected", description: "Tick at least one available team.", variant: "destructive" });
      return;
    }
    if (!analysableJobs.length) {
      toast({ title: "No jobs to analyse", description: "No active jobs for that date.", variant: "destructive" });
      return;
    }
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("auto-assign-jobs", {
        body: {
          teamIds: eligibleTeams.map(t => t.teamId),
          jobIds: analysableJobs.map(j => j.id),
          targetDate,
          stream,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setAssignments((data as any).assignments || []);
      toast({ title: "AI analysis ready", description: "Reasoning + confidence shown per job." });
    } catch (e: any) {
      toast({ title: "Auto-assign failed", description: e.message || "Try again", variant: "destructive" });
    } finally {
      setRunning(false);
    }
  };

  const updateAssignment = (jobId: string, teamName: string) => {
    setAssignments(prev => prev.map(a => {
      if (a.jobId !== jobId) return a;
      const rest = (a.teamNames || []).slice(1);
      return { ...a, teamName, teamNames: [teamName, ...rest] };
    }));
  };

  // Confirm only assigns currently-unassigned jobs (writes primary -> team, secondary -> team2).
  // Already-assigned jobs are advisory unless the user clicks "Apply AI" per row.
  const confirmAll = async () => {
    const toApply = assignments.filter(a => {
      const job = jobs.find(j => j.id === a.jobId);
      return job && !job.team;
    });
    if (!toApply.length) {
      toast({ title: "Nothing to apply", description: "All visible jobs already have a team. Use the row Apply button to override." });
      return;
    }
    setConfirming(true);
    try {
      const results = await Promise.all(toApply.map(a => {
        const names = a.teamNames?.length ? a.teamNames : [a.teamName];
        return supabase.from("jobs").update({
          team: names[0],
          team2: names[1] || null,
          updated_at: new Date().toISOString(),
        }).eq("id", a.jobId);
      }));
      const failed = results.filter(r => r.error).length;
      if (failed) throw new Error(`${failed} updates failed`);
      toast({ title: "Assignments saved", description: `${toApply.length} jobs assigned.` });
      setRefreshTick(t => t + 1);
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally {
      setConfirming(false);
    }
  };

  const reassignOne = async (jobId: string, teamNames: string[]) => {
    setReassigning(jobId);
    try {
      const { error } = await supabase
        .from("jobs")
        .update({
          team: teamNames[0],
          team2: teamNames[1] || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", jobId);
      if (error) throw error;
      toast({
        title: "Job reassigned",
        description: teamNames.length > 1
          ? `Assigned to ${teamNames.join(" + ")}.`
          : `Now assigned to ${teamNames[0]}.`,
      });
      setRefreshTick(t => t + 1);
    } catch (e: any) {
      toast({ title: "Reassign failed", description: e.message, variant: "destructive" });
    } finally {
      setReassigning(null);
    }
  };



  const projectedWorkload = useMemo(() => {
    const base = { ...workloadByTeam };
    assignments.forEach(a => { base[a.teamName] = (base[a.teamName] || 0) + 1; });
    return base;
  }, [workloadByTeam, assignments]);

  const confidenceColor = (c: number) =>
    c >= 80 ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
    : c >= 60 ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
    : "bg-rose-500/15 text-rose-700 dark:text-rose-400";

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 bg-background/90 backdrop-blur-xl border-b border-border">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Link to="/" className="text-muted-foreground hover:text-foreground">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-base font-bold flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                Auto-Assign Panel
              </h1>
              <p className="text-[11px] text-muted-foreground">
                AI-powered team assignments based on skillset, workload & location
              </p>
            </div>
          </div>

          {/* Stream toggle */}
          <div className="inline-flex rounded-lg border border-border bg-muted p-0.5">
            {(["dm", "aa"] as Stream[]).map(s => (
              <button
                key={s}
                onClick={() => setStream(s)}
                className={cn(
                  "px-4 py-1.5 text-xs font-semibold rounded-md transition-all",
                  stream === s
                    ? "bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {STREAM_LABEL[s]}
              </button>
            ))}
          </div>
        </div>

        {/* Day tabs — each shows the LIVE count of all booked jobs for that local day */}
        <div className="container mx-auto px-4 pb-3 flex items-center gap-2 overflow-x-auto">
          <Calendar className="w-4 h-4 text-muted-foreground shrink-0" />
          {days.map(d => {
            const active = d.iso === targetDate;
            const count = dayCounts[d.iso] ?? 0;
            return (
              <button
                key={d.iso}
                onClick={() => setTargetDate(d.iso)}
                className={cn(
                  "shrink-0 px-3 py-1.5 rounded-md border text-xs font-medium transition-all flex flex-col items-center min-w-[72px] relative",
                  active
                    ? "bg-primary text-primary-foreground border-primary shadow"
                    : "bg-card border-border text-foreground hover:bg-muted"
                )}
              >
                <span className="leading-tight">{d.label}</span>
                <span className={cn("text-[10px] leading-tight", active ? "opacity-90" : "text-muted-foreground")}>{d.sub}</span>
                <span className={cn(
                  "absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1 rounded-full text-[10px] font-bold flex items-center justify-center",
                  count > 0
                    ? (active ? "bg-white text-primary" : "bg-violet-600 text-white")
                    : "bg-muted text-muted-foreground border border-border"
                )}>
                  {count}
                </span>
              </button>
            );
          })}
          <div className="ml-auto flex items-center gap-2 shrink-0">
            {lastSyncedAt && (
              <span className="text-[10px] text-muted-foreground">
                Synced {lastSyncedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </span>
            )}
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1 text-[11px]"
              onClick={() => setRefreshTick(t => t + 1)}
              disabled={loading}
              title="Re-pull from database"
            >
              <RefreshCw className={cn("w-3 h-3", loading && "animate-spin")} />
              Refresh
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        {/* Team selector */}
        <aside className="space-y-3">
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <Briefcase className="w-4 h-4" /> {STREAM_LABEL[stream]} Teams
                <Badge variant="secondary" className="ml-1 h-5">{streamTeams.length}</Badge>
              </h2>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-[11px] gap-1"
                onClick={() => { setSkillsTeamId(undefined); setSkillsOpen(true); }}
              >
                <Wrench className="w-3 h-3" /> Skills
              </Button>
            </div>
            <div className="space-y-2">
              {streamTeams.length === 0 && (
                <div className="text-[11px] text-muted-foreground py-3 text-center">
                  No teams found for {STREAM_LABEL[stream]}.
                </div>
              )}
              {streamTeams.map(t => {
                const unavail = unavailableTeams.has(t.teamId);
                const load = projectedWorkload[t.teamName] || 0;
                const hasSkills = teamsWithSkills.has(t.teamId);
                return (
                  <div
                    key={t.teamId}
                    className={`flex items-center gap-2 p-2 rounded-md hover:bg-muted transition ${unavail ? "opacity-50" : ""}`}
                  >
                    <Checkbox
                      checked={selectedTeams.has(t.teamId)}
                      onCheckedChange={() => toggleTeam(t.teamId)}
                      disabled={unavail}
                    />
                    <div className="flex-1 min-w-0 cursor-pointer" onClick={() => !unavail && toggleTeam(t.teamId)}>
                      <div className="text-sm font-medium truncate flex items-center gap-1.5">
                        {t.teamName}
                        {hasSkills && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" title="Skills profile set" />}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {unavail ? "Unavailable" : `${load} open jobs`}
                      </div>
                    </div>
                    <button
                      onClick={() => { setSkillsTeamId(t.teamId); setSkillsOpen(true); }}
                      className="p-1 rounded hover:bg-background text-muted-foreground hover:text-foreground"
                      title="Edit skills"
                    >
                      <Wrench className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <Button
            onClick={runAutoAssign}
            disabled={running || loading || !analysableJobs.length}
            className="w-full"
            size="lg"
          >
            {running ? <><Loader2 className="w-4 h-4 animate-spin" /> Analysing…</> : <><Sparkles className="w-4 h-4" /> Analyse & Auto-Assign</>}
          </Button>

          <div className="text-[11px] text-muted-foreground p-3 rounded-lg bg-muted/50 leading-relaxed">
            <strong>How it works:</strong> Pick a <em>stream</em> (DM or A&amp;A) and a <em>day</em>. AI analyses <strong>every</strong> visible job — assigned or not — and produces reasoning + a confidence score anchored to similar jobs each team has completed and signed off in the last 60 days. Confirm All only fills in the unassigned ones; use the row-level Reassign button to override an existing team.
          </div>

          <TeamSkillsManager
            open={skillsOpen}
            onOpenChange={setSkillsOpen}
            teams={streamTeams}
            initialTeamId={skillsTeamId}
          />
        </aside>

        {/* Jobs / assignments */}
        <section className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <h2 className="text-sm font-semibold">
              {assignments.length
                ? `${assignments.length} AI analyses · ${jobs.length} visible jobs`
                : `${jobs.length} booked ${STREAM_LABEL[stream]} jobs`}
            </h2>
            {assignments.length > 0 && (
              <Button onClick={confirmAll} disabled={confirming} variant="default">
                {confirming ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                Apply to unassigned
              </Button>
            )}
          </div>

          {loading ? (
            <div className="p-12 text-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
          ) : !jobs.length ? (
            <div className="p-12 text-center text-muted-foreground text-sm">
              No booked {STREAM_LABEL[stream]} jobs for {targetDate}.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">Job #</TableHead>
                  <TableHead>Address / Description</TableHead>
                  <TableHead className="w-48">Team</TableHead>
                  <TableHead className="w-24">Confidence</TableHead>
                  <TableHead>AI Reasoning</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map(job => {
                  const a = assignments.find(x => x.jobId === job.id);
                  const isExpanded = expandedRows.has(job.id);
                  const isEditing = editing?.jobId === job.id;
                  const fullDesc = job.summary_of_works || job.description || "";
                  const isCompleted = !!(job.is_completed || job.status === "complete");
                  const aiPicksDifferent = !!(a && job.team && a.teamName !== job.team);
                  const cta = a?.currentTeamAssessment;

                  return (
                    <TableRow key={job.id} className="align-top">
                      <TableCell className="font-mono text-xs pt-3">{job.job_number}</TableCell>
                      <TableCell className="pt-3">
                        <div className="text-xs font-medium flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-muted-foreground" />
                          {job.address || job.name}
                        </div>
                        {isEditing ? (
                          <div className="mt-1.5 space-y-1.5">
                            <Textarea
                              value={editing!.value}
                              onChange={(e) => setEditing({ jobId: job.id, value: e.target.value })}
                              className="min-h-[100px] text-[11px]"
                              autoFocus
                            />
                            <div className="flex items-center gap-1.5">
                              <Button size="sm" className="h-7 text-[11px] gap-1" onClick={saveEdit} disabled={savingDesc}>
                                {savingDesc ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                                Save
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 text-[11px] gap-1" onClick={() => setEditing(null)}>
                                <X className="w-3 h-3" /> Cancel
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div
                              className={cn(
                                "text-[11px] text-muted-foreground mt-0.5 whitespace-pre-wrap",
                                !isExpanded && "line-clamp-2"
                              )}
                            >
                              {fullDesc || <span className="italic">No description</span>}
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              {fullDesc.length > 160 && (
                                <button
                                  onClick={() => toggleExpanded(job.id)}
                                  className="text-[10px] text-primary hover:underline flex items-center gap-0.5"
                                >
                                  {isExpanded ? <><ChevronUp className="w-3 h-3" /> Less</> : <><ChevronDown className="w-3 h-3" /> Expand</>}
                                </button>
                              )}
                              <button
                                onClick={() => startEdit(job)}
                                className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5"
                              >
                                <Pencil className="w-3 h-3" /> Edit
                              </button>
                            </div>
                          </>
                        )}
                      </TableCell>
                      <TableCell className="pt-3">
                        {isCompleted ? (
                          <Badge variant="secondary">Completed</Badge>
                        ) : (
                          <div className="space-y-1.5">
                            {job.team ? (
                              <div className="flex flex-col gap-1">
                                <Badge variant="secondary" className="w-fit">{job.team}</Badge>
                                {aiPicksDifferent && (
                                  <div className="flex items-center gap-1 text-[10px] text-amber-700 dark:text-amber-400">
                                    <ArrowRightLeft className="w-3 h-3" />
                                    AI suggests <strong>{a!.teamName}</strong>
                                  </div>
                                )}
                              </div>
                            ) : a ? (
                              <Select value={a.teamName} onValueChange={(v) => updateAssignment(job.id, v)}>
                                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {eligibleTeams.map(t => (
                                    <SelectItem key={t.teamId} value={t.teamName}>{t.teamName}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <span className="text-[11px] text-muted-foreground">Unassigned · Run AI</span>
                            )}
                            {aiPicksDifferent && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 text-[10px] gap-1 w-full"
                                disabled={reassigning === job.id}
                                onClick={() => reassignOne(job.id, a!.teamName)}
                              >
                                {reassigning === job.id
                                  ? <Loader2 className="w-3 h-3 animate-spin" />
                                  : <><ArrowRightLeft className="w-3 h-3" /> Reassign</>}
                              </Button>
                            )}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="pt-3">
                        {a && (
                          <div className="space-y-1">
                            <Badge variant="secondary" className={confidenceColor(a.confidence)}>
                              {a.confidence}%
                            </Badge>
                            {typeof a.similarJobsLast60Days === "number" && (
                              <div className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                                <History className="w-3 h-3" />
                                {a.similarJobsLast60Days} similar / 60d
                              </div>
                            )}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-[11px] pt-3">
                        {a ? (
                          <div className="space-y-1.5">
                            <div className="text-foreground/90">{a.reasoning}</div>
                            {cta && (
                              <div className={cn(
                                "rounded-md border px-2 py-1.5 text-[10px] leading-snug",
                                cta.fitScore >= 70
                                  ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-800 dark:text-emerald-300"
                                  : cta.fitScore >= 50
                                  ? "border-amber-500/30 bg-amber-500/5 text-amber-800 dark:text-amber-300"
                                  : "border-rose-500/30 bg-rose-500/5 text-rose-800 dark:text-rose-300"
                              )}>
                                <div className="font-semibold mb-0.5">
                                  Current team fit: {cta.teamName} · {cta.fitScore}%
                                </div>
                                <div>{cta.reasoning}</div>
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground italic">Run Analyse to see reasoning</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </section>

      </main>
    </div>
  );
}
