import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { Job } from '@/types/job';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  FolderOpen,
  Calendar,
  Search,
  History,
  MapPin,
  Phone,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { format, isValid, isToday, isYesterday, startOfISOWeek, endOfISOWeek, getISOWeek } from 'date-fns';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

const parseDateKeyAsLocal = (dateStr: string): Date => {
  const parts = dateStr.split('-').map(Number);
  if (parts.length >= 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }
  return new Date(dateStr);
};

interface TeamHistoryProps {
  jobs: Job[];
  teamName: string;
  onSelectJob: (job: Job) => void;
  /** When true, hides the outer header so it can be embedded inline. */
  embedded?: boolean;
}

interface SignOffRecord {
  job_id: string;
  signed_off_at: string;
  progress_notes: string | null;
}

interface CompletedJobRecord {
  id: string;
  job_number: string | null;
  name: string | null;
  address: string | null;
  phone_number: string | null;
  description: string | null;
  summary_of_works: string | null;
  completion_date: string | null;
  updated_at: string | null;
}

interface HistoryEntry {
  job: Job | null;
  jobId: string;
  signedOffAt: Date;
  progressNotes: string | null;
  source: 'signoff' | 'completion';
  fallback?: {
    jobNumber?: string;
    name?: string;
    address?: string;
    phoneNumber?: string;
    description?: string;
    summaryOfWorks?: string;
  };
}

const formatDayHeader = (dateKey: string): string => {
  try {
    const date = parseDateKeyAsLocal(dateKey);
    if (isToday(date)) return `Today — ${format(date, 'EEEE d')}`;
    if (isYesterday(date)) return `Yesterday — ${format(date, 'EEEE d')}`;
    return format(date, 'EEEE, d');
  } catch {
    return dateKey;
  }
};

export const TeamHistory = ({ jobs, teamName, onSelectJob, embedded = false }: TeamHistoryProps) => {
  const [search, setSearch] = useState('');
  const [expandedYears, setExpandedYears] = useState<Set<string>>(new Set());
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());
  const [expandedWeeks, setExpandedWeeks] = useState<Set<string>>(new Set());
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
  const [signOffs, setSignOffs] = useState<SignOffRecord[]>([]);
  const [completedJobs, setCompletedJobs] = useState<CompletedJobRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [missingJobs, setMissingJobs] = useState<Map<string, { jobNumber?: string; name?: string; address?: string; phoneNumber?: string; description?: string; summaryOfWorks?: string }>>(new Map());

  // Track in-memory job IDs so realtime handler can fetch missing details on the fly
  const jobsByIdRef = useRef<Map<string, Job>>(new Map());
  jobsByIdRef.current = useMemo(() => new Map(jobs.map(j => [j.id, j])), [jobs]);
  const missingJobsRef = useRef<Map<string, { jobNumber?: string; name?: string; address?: string; phoneNumber?: string; description?: string; summaryOfWorks?: string }>>(new Map());
  missingJobsRef.current = missingJobs;
  const [refreshing, setRefreshing] = useState(false);

  // Fetch authoritative sign-off records for THIS team only — last 2 years
  // Also backfill completed jobs that may not have a matching sign-off row.
  const fetchSignOffs = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true); else setRefreshing(true);
    try {
      const twoYearsAgo = new Date();
      twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

      const safeTeamName = teamName.replace(/"/g, '\\"');
      const [signOffResult, completedJobsResult] = await Promise.all([
        supabase
          .from('team_sign_offs')
          .select('job_id, signed_off_at, progress_notes')
          .eq('team_name', teamName)
          .gte('signed_off_at', twoYearsAgo.toISOString())
          .order('signed_off_at', { ascending: false })
          .limit(5000),
        supabase
          .from('jobs')
          .select('id, job_number, name, address, phone_number, description, summary_of_works, completion_date, updated_at')
          .or(`and(team.eq."${safeTeamName}",status.eq.complete),and(team.eq."${safeTeamName}",is_completed.eq.true),and(team2.eq."${safeTeamName}",status.eq.complete),and(team2.eq."${safeTeamName}",is_completed.eq.true)`)
          .order('updated_at', { ascending: false })
          .limit(5000),
      ]);

      if (signOffResult.error) {
        console.error('Failed to fetch team sign-offs:', signOffResult.error);
      }
      if (completedJobsResult.error) {
        console.error('Failed to fetch completed jobs fallback:', completedJobsResult.error);
      }

      const nextSignOffs = signOffResult.data || [];
      const nextCompletedJobs = (completedJobsResult.data || []).filter((row) => {
        const relevantDate = row.completion_date || row.updated_at;
        if (!relevantDate) return false;
        return new Date(relevantDate) >= twoYearsAgo;
      });

      setSignOffs(nextSignOffs);
      setCompletedJobs(nextCompletedJobs);

      // Fetch minimal details for any sign-offs whose job isn't in the live jobs prop
      const jobIdsInMemory = jobsByIdRef.current;
      const uniqueMissing = Array.from(new Set(
        [...nextSignOffs.map(s => s.job_id), ...nextCompletedJobs.map(j => j.id)].filter(id => !jobIdsInMemory.has(id))
      ));

      if (uniqueMissing.length > 0) {
        const chunkSize = 100;
        const fetched = new Map<string, { jobNumber?: string; name?: string; address?: string; phoneNumber?: string; description?: string; summaryOfWorks?: string }>();
        for (let i = 0; i < uniqueMissing.length; i += chunkSize) {
          const chunk = uniqueMissing.slice(i, i + chunkSize);
          const { data: jobRows, error: jobErr } = await supabase
            .from('jobs')
            .select('id, job_number, name, address, phone_number, description, summary_of_works')
            .in('id', chunk);
          if (jobErr) {
            console.warn('Failed to fetch missing job details:', jobErr.message);
            continue;
          }
          for (const row of jobRows || []) {
            fetched.set(row.id, {
              jobNumber: row.job_number || undefined,
              name: row.name || undefined,
              address: row.address || undefined,
              phoneNumber: row.phone_number || undefined,
              description: row.description || undefined,
              summaryOfWorks: row.summary_of_works || undefined,
            });
          }
        }
        setMissingJobs(fetched);
      } else {
        setMissingJobs(new Map());
      }
    } catch (err) {
      console.error('[TeamHistory] fetchSignOffs failed:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [teamName]);

  // Initial fetch + refetch on team change
  useEffect(() => {
    fetchSignOffs();
  }, [fetchSignOffs]);

  // Refresh on tab focus / when coming back online (catches sign-offs from other devices)
  useEffect(() => {
    const onFocus = () => {
      if (document.visibilityState === 'visible') fetchSignOffs({ silent: true });
    };
    const onOnline = () => fetchSignOffs({ silent: true });
    document.addEventListener('visibilitychange', onFocus);
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onOnline);
    return () => {
      document.removeEventListener('visibilitychange', onFocus);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onOnline);
    };
  }, [fetchSignOffs]);

  // Real-time subscription for sign-offs and completed-job changes for this team
  useEffect(() => {
    const channel = supabase
      .channel(`team-history-${teamName}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'team_sign_offs', filter: `team_name=eq.${teamName}` },
        () => fetchSignOffs({ silent: true })
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'jobs' },
        (payload) => {
          const nextJob = payload.new as any;
          const prevJob = payload.old as any;
          const touchesTeam = [nextJob?.team, nextJob?.team2, prevJob?.team, prevJob?.team2].includes(teamName);
          const touchesCompletedState = [nextJob, prevJob].some((job) => job?.status === 'complete' || job?.is_completed === true);
          if (touchesTeam && touchesCompletedState) {
            fetchSignOffs({ silent: true });
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [teamName, fetchSignOffs]);

  // Build history entries: prefer the latest sign-off per job, then backfill from completed jobs.
  const historyEntries = useMemo<HistoryEntry[]>(() => {
    const jobsById = new Map(jobs.map(j => [j.id, j]));
    const latestByJob = new Map<string, HistoryEntry>();
    for (const so of signOffs) {
      const signedOffAt = new Date(so.signed_off_at);
      const existing = latestByJob.get(so.job_id);
      if (!existing || signedOffAt > existing.signedOffAt) {
        latestByJob.set(so.job_id, {
          job: jobsById.get(so.job_id) || null,
          jobId: so.job_id,
          signedOffAt,
          progressNotes: so.progress_notes,
          source: 'signoff',
          fallback: missingJobs.get(so.job_id),
        });
      }
    }

    for (const completedJob of completedJobs) {
      if (latestByJob.has(completedJob.id)) continue;
      const relevantDate = completedJob.completion_date || completedJob.updated_at;
      if (!relevantDate) continue;

      const signedOffAt = new Date(relevantDate);
      if (!isValid(signedOffAt)) continue;

      const job = jobsById.get(completedJob.id) || null;
      const existingFallback = missingJobs.get(completedJob.id);
      const fallback = {
        jobNumber: completedJob.job_number || existingFallback?.jobNumber,
        name: completedJob.name || existingFallback?.name,
        address: completedJob.address || existingFallback?.address,
        phoneNumber: completedJob.phone_number || existingFallback?.phoneNumber,
        description: completedJob.description || existingFallback?.description,
        summaryOfWorks: completedJob.summary_of_works || existingFallback?.summaryOfWorks,
      };

      if (!job && !fallback.jobNumber && !fallback.name && !fallback.address) continue;

      latestByJob.set(completedJob.id, {
        job,
        jobId: completedJob.id,
        signedOffAt,
        progressNotes: null,
        source: 'completion',
        fallback,
      });
    }

    return Array.from(latestByJob.values()).sort((a, b) => b.signedOffAt.getTime() - a.signedOffAt.getTime());
  }, [signOffs, completedJobs, jobs, missingJobs]);

  // Apply search
  const searchedEntries = useMemo(() => {
    if (!search.trim()) return historyEntries;
    const term = search.toLowerCase();
    return historyEntries.filter(e => {
      const num = (e.job?.jobNumber || e.fallback?.jobNumber || '').toLowerCase();
      const name = (e.job?.name || e.fallback?.name || '').toLowerCase();
      const address = (e.job?.address || e.fallback?.address || '').toLowerCase();
      const desc = (e.job?.description || e.fallback?.description || '').toLowerCase();
      const summary = (e.job?.summaryOfWorks || e.fallback?.summaryOfWorks || '').toLowerCase();
      const notes = (e.progressNotes || '').toLowerCase();
      return (
        num.includes(term) ||
        name.includes(term) ||
        address.includes(term) ||
        desc.includes(term) ||
        summary.includes(term) ||
        notes.includes(term)
      );
    });
  }, [historyEntries, search]);

  // Group by year → month → day (descending) using signed_off_at
  const grouped = useMemo(() => {
    const yearMap = new Map<string, Map<string, Map<string, HistoryEntry[]>>>();
    for (const entry of searchedEntries) {
      if (!isValid(entry.signedOffAt)) continue;
      const yearKey = format(entry.signedOffAt, 'yyyy');
      const monthKey = format(entry.signedOffAt, 'yyyy-MM');
      const dayKey = format(entry.signedOffAt, 'yyyy-MM-dd');
      if (!yearMap.has(yearKey)) yearMap.set(yearKey, new Map());
      const monthMap = yearMap.get(yearKey)!;
      if (!monthMap.has(monthKey)) monthMap.set(monthKey, new Map());
      const days = monthMap.get(monthKey)!;
      if (!days.has(dayKey)) days.set(dayKey, []);
      days.get(dayKey)!.push(entry);
    }

    const years = Array.from(yearMap.keys()).sort((a, b) => b.localeCompare(a)).map(yearKey => {
      const monthMap = yearMap.get(yearKey)!;
      const months = Array.from(monthMap.keys()).sort((a, b) => b.localeCompare(a)).map(monthKey => {
        const daysMap = monthMap.get(monthKey)!;
        const sortedDayKeys = Array.from(daysMap.keys()).sort((a, b) => b.localeCompare(a));
        const sortedDays = new Map<string, HistoryEntry[]>();
        let total = 0;
        for (const dk of sortedDayKeys) {
          const list = daysMap.get(dk)!.sort((a, b) => b.signedOffAt.getTime() - a.signedOffAt.getTime());
          sortedDays.set(dk, list);
          total += list.length;
        }
        const monthDate = parseDateKeyAsLocal(`${monthKey}-01`);
        return { monthKey, monthLabel: format(monthDate, 'MMMM'), days: sortedDays, total };
      });
      const yearTotal = months.reduce((s, m) => s + m.total, 0);
      return { yearKey, yearLabel: yearKey, months, total: yearTotal };
    });

    return { years };
  }, [searchedEntries]);

  const toggleYear = (key: string) =>
    setExpandedYears(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  const toggleMonth = (key: string) =>
    setExpandedMonths(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  const toggleDay = (key: string) =>
    setExpandedDays(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });

  // When searching, auto-expand all matched groups so results are visible
  useEffect(() => {
    if (!search.trim()) {
      // Reset to fully collapsed when search cleared
      setExpandedYears(new Set());
      setExpandedMonths(new Set());
      setExpandedDays(new Set());
      return;
    }
    const ys = new Set<string>();
    const ms = new Set<string>();
    const ds = new Set<string>();
    for (const y of grouped.years) {
      ys.add(y.yearKey);
      for (const m of y.months) {
        ms.add(m.monthKey);
        for (const dk of m.days.keys()) ds.add(dk);
      }
    }
    setExpandedYears(ys);
    setExpandedMonths(ms);
    setExpandedDays(ds);
  }, [search, grouped]);

  const totalSignedOff = historyEntries.length;
  const sourceLabel = historyEntries.some((entry) => entry.source === 'completion')
    ? 'completed / signed-off'
    : 'signed off';

  return (
    <div className={cn(embedded ? "space-y-3" : "p-3 space-y-3")}>
      {/* Header */}
      {!embedded && (
        <div className="flex items-center gap-2 px-1">
          <div className="h-8 w-8 rounded-full bg-[hsl(var(--success))]/15 flex items-center justify-center">
            <History className="h-4 w-4 text-[hsl(var(--success))]" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-bold text-foreground">Job History</h2>
            <p className="text-[10px] text-muted-foreground">
              {loading
                ? 'Loading sign-offs…'
                : `${totalSignedOff} job${totalSignedOff !== 1 ? 's' : ''} ${sourceLabel} by ${teamName}`}
            </p>
          </div>
        </div>
      )}

      {/* Search + Refresh */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by job #, address, name, notes…"
            className="pl-9 h-9 text-sm rounded-full"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 rounded-full px-3"
          onClick={() => fetchSignOffs({ silent: true })}
          disabled={refreshing || loading}
          aria-label="Refresh history"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", (refreshing || loading) && "animate-spin")} />
        </Button>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 gap-2">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <p className="text-xs text-muted-foreground">Fetching completed history…</p>
        </div>
      ) : totalSignedOff === 0 ? (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
            <CheckCircle2 className="h-8 w-8 text-muted-foreground/50" />
          </div>
          <p className="text-base font-medium text-muted-foreground">No completed jobs yet</p>
          <p className="text-xs text-muted-foreground/80 text-center px-4 mt-1">
            Once jobs are completed, they'll appear here grouped by date.
          </p>
        </div>
      ) : searchedEntries.length === 0 ? (
        <div className="text-center py-10 text-sm text-muted-foreground">
          No matches for "{search}"
        </div>
      ) : (
        <div className="space-y-2">
          {grouped.years.map((y) => (
            <Collapsible key={y.yearKey} open={expandedYears.has(y.yearKey)} onOpenChange={() => toggleYear(y.yearKey)}>
              <CollapsibleTrigger asChild>
                <div className="cursor-pointer rounded-xl bg-[hsl(var(--success))]/10 border border-[hsl(var(--success))]/30 px-3 py-2.5 flex items-center justify-between hover:bg-[hsl(var(--success))]/15 transition-colors">
                  <div className="flex items-center gap-2">
                    {expandedYears.has(y.yearKey)
                      ? <ChevronDown className="h-4 w-4 text-[hsl(var(--success))]" />
                      : <ChevronRight className="h-4 w-4 text-[hsl(var(--success))]" />}
                    <FolderOpen className="h-4 w-4 text-[hsl(var(--success))]" />
                    <span className="font-bold text-sm tracking-wide">{y.yearLabel}</span>
                  </div>
                  <Badge className="text-[10px] bg-[hsl(var(--success))]/20 text-[hsl(var(--success))] hover:bg-[hsl(var(--success))]/20 rounded-full">
                    {y.total} job{y.total !== 1 ? 's' : ''}
                  </Badge>
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-1.5 mt-1.5 ml-3 border-l-2 border-[hsl(var(--success))]/20 pl-3">
                {y.months.map((m) => (
                  <Collapsible key={m.monthKey} open={expandedMonths.has(m.monthKey)} onOpenChange={() => toggleMonth(m.monthKey)}>
                    <CollapsibleTrigger asChild>
                      <div className="cursor-pointer rounded-lg bg-[hsl(var(--success))]/5 border border-[hsl(var(--success))]/15 px-3 py-2 flex items-center justify-between hover:bg-[hsl(var(--success))]/10 transition-colors">
                        <div className="flex items-center gap-2">
                          {expandedMonths.has(m.monthKey)
                            ? <ChevronDown className="h-3.5 w-3.5 text-[hsl(var(--success))]" />
                            : <ChevronRight className="h-3.5 w-3.5 text-[hsl(var(--success))]" />}
                          <span className="font-semibold text-xs">{m.monthLabel}</span>
                        </div>
                        <Badge className="text-[10px] bg-[hsl(var(--success))]/15 text-[hsl(var(--success))] hover:bg-[hsl(var(--success))]/15 rounded-full">
                          {m.total}
                        </Badge>
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-1.5 mt-1.5 ml-3 border-l border-[hsl(var(--success))]/15 pl-3">
                      {Array.from(m.days.entries()).map(([dayKey, dayEntries]) => (
                        <Collapsible key={dayKey} open={expandedDays.has(dayKey)} onOpenChange={() => toggleDay(dayKey)}>
                          <CollapsibleTrigger asChild>
                            <div className="cursor-pointer rounded-lg px-3 py-2 flex items-center justify-between hover:bg-muted/50 transition-colors">
                              <div className="flex items-center gap-1.5">
                                {expandedDays.has(dayKey)
                                  ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                                  : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                                <Calendar className="h-3.5 w-3.5 text-[hsl(var(--success))]/80" />
                                <span className="font-medium text-xs">{formatDayHeader(dayKey)}</span>
                              </div>
                              <Badge variant="secondary" className="text-[10px] px-1.5 rounded-full">
                                {dayEntries.length}
                              </Badge>
                            </div>
                          </CollapsibleTrigger>
                          <CollapsibleContent className="space-y-1 mt-1.5 ml-2 pl-2">
                            {dayEntries.map((entry) => {
                              const jobNumber = entry.job?.jobNumber || entry.fallback?.jobNumber || '—';
                              const name = entry.job?.name || entry.fallback?.name || 'Unknown property';
                              const address = entry.job?.address || entry.fallback?.address;
                              const phone = entry.job?.phoneNumber || entry.fallback?.phoneNumber;
                              const clickable = !!entry.job;
                              return (
                                <button
                                  key={entry.jobId + entry.signedOffAt.toISOString()}
                                  onClick={() => entry.job && onSelectJob(entry.job)}
                                  disabled={!clickable}
                                  className={cn(
                                    "w-full text-left rounded-lg border border-border bg-card p-3 transition-colors",
                                    "border-l-4 border-l-[hsl(var(--success))]",
                                    clickable ? "hover:bg-muted/40 cursor-pointer" : "opacity-70 cursor-not-allowed"
                                  )}
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center gap-1.5 mb-0.5">
                                        <CheckCircle2 className="h-3.5 w-3.5 text-[hsl(var(--success))] flex-shrink-0" />
                                        <span className="font-mono text-[11px] text-muted-foreground">
                                          {jobNumber}
                                        </span>
                                        {entry.source === 'completion' && (
                                          <span className="text-[9px] uppercase tracking-wide text-muted-foreground/70">completed</span>
                                        )}
                                        {!entry.job && (
                                          <span className="text-[9px] uppercase tracking-wide text-muted-foreground/70">archived</span>
                                        )}
                                      </div>
                                      <p className="font-semibold text-sm text-foreground truncate">{name}</p>
                                      {address && (
                                        <p className="text-xs text-muted-foreground flex items-start gap-1 mt-0.5">
                                          <MapPin className="h-3 w-3 mt-0.5 flex-shrink-0" />
                                          <span className="line-clamp-1">{address}</span>
                                        </p>
                                      )}
                                      {phone && (
                                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                                          <Phone className="h-3 w-3 flex-shrink-0" />
                                          <span>{phone}</span>
                                        </p>
                                      )}
                                    </div>
                                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                                      {format(entry.signedOffAt, 'HH:mm')}
                                    </span>
                                  </div>
                                </button>
                              );
                            })}
                          </CollapsibleContent>
                        </Collapsible>
                      ))}
                    </CollapsibleContent>
                  </Collapsible>
                ))}
              </CollapsibleContent>
            </Collapsible>
          ))}
        </div>
      )}
    </div>
  );
};
