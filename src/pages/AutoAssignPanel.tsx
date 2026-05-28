import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Sparkles, Loader2, CheckCircle2, MapPin, Briefcase } from "lucide-react";

interface TeamRow { teamId: string; teamName: string; }
interface JobRow {
  id: string; job_number: string; name: string; address: string;
  description: string | null; summary_of_works: string | null;
  booked_date: string | null; team: string | null;
}
interface Assignment {
  jobId: string; teamName: string; confidence: number; reasoning: string;
}

const todayISO = () => new Date().toISOString().slice(0, 10);

export default function AutoAssignPanel() {
  const { toast } = useToast();
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [selectedTeams, setSelectedTeams] = useState<Set<string>>(new Set());
  const [targetDate, setTargetDate] = useState<string>(todayISO());
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [workloadByTeam, setWorkloadByTeam] = useState<Record<string, number>>({});
  const [unavailableTeams, setUnavailableTeams] = useState<Set<string>>(new Set());

  // Load teams (exclude ops managers) and workload counts
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("team_access_codes")
        .select("team_id, team_name, is_ops_manager")
        .eq("is_active", true)
        .order("team_name");
      const filtered: TeamRow[] = (data || [])
        .filter(t => !t.is_ops_manager)
        .map(t => ({ teamId: t.team_id, teamName: t.team_name }));
      setTeams(filtered);
      setSelectedTeams(new Set(filtered.map(t => t.teamId)));

      // workload: open jobs per team
      const { data: open } = await supabase
        .from("jobs").select("team")
        .eq("is_completed", false);
      const counts: Record<string, number> = {};
      (open || []).forEach(j => { if (j.team) counts[j.team] = (counts[j.team] || 0) + 1; });
      setWorkloadByTeam(counts);
    })();
  }, []);

  // Load unavailable teams and unassigned jobs for selected date
  useEffect(() => {
    (async () => {
      setLoading(true);
      const [{ data: unavail }, { data: jobRows }] = await Promise.all([
        supabase.from("team_availability").select("team_id").eq("unavailable_date", targetDate),
        supabase
          .from("jobs")
          .select("id, job_number, name, address, description, summary_of_works, booked_date, team")
          .is("team", null)
          .eq("is_completed", false)
          .or(`booked_date.gte.${targetDate}T00:00:00Z,booked_date.is.null`)
          .order("booked_date", { ascending: true, nullsFirst: false })
          .limit(200),
      ]);
      setUnavailableTeams(new Set((unavail || []).map(u => u.team_id)));
      // Filter to only jobs for the selected day OR unbooked
      const filtered = (jobRows || []).filter(j => {
        if (!j.booked_date) return true;
        return j.booked_date.slice(0, 10) === targetDate;
      });
      setJobs(filtered);
      setAssignments([]);
      setLoading(false);
    })();
  }, [targetDate]);

  const toggleTeam = (id: string) => {
    setSelectedTeams(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const eligibleTeams = useMemo(
    () => teams.filter(t => selectedTeams.has(t.teamId) && !unavailableTeams.has(t.teamId)),
    [teams, selectedTeams, unavailableTeams]
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
      // refresh jobs list
      setAssignments([]);
      setJobs(prev => prev.filter(j => !assignments.find(a => a.jobId === j.id)));
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally {
      setConfirming(false);
    }
  };

  const jobById = useMemo(() => new Map(jobs.map(j => [j.id, j])), [jobs]);

  // Projected workload if confirmed
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
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
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
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground">Date</label>
            <Input
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              className="h-9 w-40"
            />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        {/* Team selector */}
        <aside className="space-y-3">
          <div className="rounded-lg border border-border bg-card p-4">
            <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Briefcase className="w-4 h-4" /> Available Teams
            </h2>
            <div className="space-y-2">
              {teams.map(t => {
                const unavail = unavailableTeams.has(t.teamId);
                const load = projectedWorkload[t.teamName] || 0;
                return (
                  <label
                    key={t.teamId}
                    className={`flex items-center gap-2 p-2 rounded-md cursor-pointer hover:bg-muted transition ${unavail ? "opacity-50" : ""}`}
                  >
                    <Checkbox
                      checked={selectedTeams.has(t.teamId)}
                      onCheckedChange={() => toggleTeam(t.teamId)}
                      disabled={unavail}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{t.teamName}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {unavail ? "Unavailable" : `${load} open jobs`}
                      </div>
                    </div>
                  </label>
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
            <strong>How it works:</strong> AI reads each team's past completed jobs to infer skillsets, then balances workload and groups nearby addresses. You can change any pick before confirming.
          </div>
        </aside>

        {/* Jobs / assignments */}
        <section className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <h2 className="text-sm font-semibold">
              {assignments.length ? `${assignments.length} AI suggestions` : `${jobs.length} unassigned jobs`}
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
              No unassigned jobs for {targetDate}.
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
