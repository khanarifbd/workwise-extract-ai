import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Sparkles, Loader2, CheckCircle2, MapPin, Briefcase, Wrench, Calendar, RefreshCw } from "lucide-react";
import TeamSkillsManager from "@/components/TeamSkillsManager";
import { cn } from "@/lib/utils";

interface TeamRow { teamId: string; teamName: string; }
interface JobRow {
  id: string; job_number: string; name: string; address: string;
  description: string | null; summary_of_works: string | null;
  booked_date: string | null; team: string | null; category_id: string | null;
}
interface Assignment {
  jobId: string; teamName: string; confidence: number; reasoning: string;
}

type Stream = "dm" | "aa";

const DM_CATEGORY_ID = "e1563697-457a-4a67-aa9e-b0785dbc711d";
const AA_CATEGORY_ID = "a4a08b3b-70b6-4fa9-b54b-c173dcf07a33";

const STREAM_LABEL: Record<Stream, string> = { dm: "DM Jobs", aa: "A & A" };
const STREAM_CATEGORY: Record<Stream, string> = { dm: DM_CATEGORY_ID, aa: AA_CATEGORY_ID };

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
  const [windowJobs, setWindowJobs] = useState<JobRow[]>([]); // all unassigned jobs across the 7-day window for this stream
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

  // Auto-select all teams for current stream when stream changes
  useEffect(() => {
    setSelectedTeams(new Set(streamTeams.map(t => t.teamId)));
    setAssignments([]);
  }, [stream, allTeams.length]);

  // Load unavailable teams and unassigned jobs for selected date + stream
  useEffect(() => {
    (async () => {
      setLoading(true);
      const [{ data: unavail }, { data: jobRows }] = await Promise.all([
        supabase.from("team_availability").select("team_id").eq("unavailable_date", targetDate),
        supabase
          .from("jobs")
          .select("id, job_number, name, address, description, summary_of_works, booked_date, team, category_id")
          .is("team", null)
          .eq("is_completed", false)
          .eq("category_id", STREAM_CATEGORY[stream])
          .or(`booked_date.gte.${targetDate}T00:00:00Z,booked_date.is.null`)
          .order("booked_date", { ascending: true, nullsFirst: false })
          .limit(300),
      ]);
      setUnavailableTeams(new Set((unavail || []).map((u: any) => u.team_id)));
      const filtered = (jobRows || []).filter((j: any) => {
        if (!j.booked_date) return true;
        return j.booked_date.slice(0, 10) === targetDate;
      });
      setJobs(filtered as JobRow[]);
      setAssignments([]);
      setLoading(false);
    })();
  }, [targetDate, stream]);

  const toggleTeam = (id: string) => {
    setSelectedTeams(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
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
    if (!jobs.length) {
      toast({ title: "No jobs to assign", description: "No unassigned jobs for that date.", variant: "destructive" });
      return;
    }
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("auto-assign-jobs", {
        body: {
          teamIds: eligibleTeams.map(t => t.teamId),
          jobIds: jobs.map(j => j.id),
          targetDate,
          stream,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setAssignments((data as any).assignments || []);
      toast({ title: "AI assignments ready", description: "Review and adjust before confirming." });
    } catch (e: any) {
      toast({ title: "Auto-assign failed", description: e.message || "Try again", variant: "destructive" });
    } finally {
      setRunning(false);
    }
  };

  const updateAssignment = (jobId: string, teamName: string) => {
    setAssignments(prev => prev.map(a => a.jobId === jobId ? { ...a, teamName } : a));
  };

  const confirmAll = async () => {
    if (!assignments.length) return;
    setConfirming(true);
    try {
      const results = await Promise.all(assignments.map(a =>
        supabase.from("jobs").update({ team: a.teamName, updated_at: new Date().toISOString() }).eq("id", a.jobId)
      ));
      const failed = results.filter(r => r.error).length;
      if (failed) throw new Error(`${failed} updates failed`);
      toast({ title: "Assignments saved", description: `${assignments.length} jobs assigned.` });
      setAssignments([]);
      setJobs(prev => prev.filter(j => !assignments.find(a => a.jobId === j.id)));
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally {
      setConfirming(false);
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

        {/* Day tabs */}
        <div className="container mx-auto px-4 pb-3 flex items-center gap-2 overflow-x-auto">
          <Calendar className="w-4 h-4 text-muted-foreground shrink-0" />
          {days.map(d => {
            const active = d.iso === targetDate;
            return (
              <button
                key={d.iso}
                onClick={() => setTargetDate(d.iso)}
                className={cn(
                  "shrink-0 px-3 py-1.5 rounded-md border text-xs font-medium transition-all flex flex-col items-center min-w-[68px]",
                  active
                    ? "bg-primary text-primary-foreground border-primary shadow"
                    : "bg-card border-border text-foreground hover:bg-muted"
                )}
              >
                <span className="leading-tight">{d.label}</span>
                <span className={cn("text-[10px] leading-tight", active ? "opacity-90" : "text-muted-foreground")}>{d.sub}</span>
              </button>
            );
          })}
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
            disabled={running || loading || !jobs.length}
            className="w-full"
            size="lg"
          >
            {running ? <><Loader2 className="w-4 h-4 animate-spin" /> Analysing…</> : <><Sparkles className="w-4 h-4" /> Run Auto-Assign</>}
          </Button>

          <div className="text-[11px] text-muted-foreground p-3 rounded-lg bg-muted/50 leading-relaxed">
            <strong>How it works:</strong> Pick a <em>stream</em> (DM or A&amp;A) and a <em>day</em>, then run. AI combines each team's manual skill profile with past completed jobs, balances workload and groups nearby addresses. Adjust any pick before confirming.
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
                ? `${assignments.length} AI suggestions`
                : `${jobs.length} unassigned ${STREAM_LABEL[stream]} jobs`}
            </h2>
            {assignments.length > 0 && (
              <Button onClick={confirmAll} disabled={confirming} variant="default">
                {confirming ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                Confirm All
              </Button>
            )}
          </div>

          {loading ? (
            <div className="p-12 text-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
          ) : !jobs.length ? (
            <div className="p-12 text-center text-muted-foreground text-sm">
              No unassigned {STREAM_LABEL[stream]} jobs for {targetDate}.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">Job #</TableHead>
                  <TableHead>Address / Description</TableHead>
                  <TableHead className="w-44">Assigned Team</TableHead>
                  <TableHead className="w-24">Confidence</TableHead>
                  <TableHead>Reasoning</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map(job => {
                  const a = assignments.find(x => x.jobId === job.id);
                  return (
                    <TableRow key={job.id}>
                      <TableCell className="font-mono text-xs">{job.job_number}</TableCell>
                      <TableCell>
                        <div className="text-xs font-medium flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-muted-foreground" />
                          {job.address || job.name}
                        </div>
                        <div className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">
                          {(job.summary_of_works || job.description || "").slice(0, 160)}
                        </div>
                      </TableCell>
                      <TableCell>
                        {a ? (
                          <Select value={a.teamName} onValueChange={(v) => updateAssignment(job.id, v)}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {eligibleTeams.map(t => (
                                <SelectItem key={t.teamId} value={t.teamName}>{t.teamName}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {a && (
                          <Badge variant="secondary" className={confidenceColor(a.confidence)}>
                            {a.confidence}%
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-[11px] text-muted-foreground">
                        {a?.reasoning}
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
