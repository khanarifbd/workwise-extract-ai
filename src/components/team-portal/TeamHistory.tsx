import { useState, useMemo, useEffect } from 'react';
import { Job } from '@/types/job';
import { Badge } from '@/components/ui/badge';
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
} from 'lucide-react';
import { format, isValid, isToday, isYesterday } from 'date-fns';
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
}

interface SignOffRecord {
  job_id: string;
  signed_off_at: string;
  progress_notes: string | null;
}

interface HistoryEntry {
  job: Job | null;
  jobId: string;
  signedOffAt: Date;
  progressNotes: string | null;
  fallback?: {
    jobNumber?: string;
    name?: string;
    address?: string;
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

export const TeamHistory = ({ jobs, teamName, onSelectJob }: TeamHistoryProps) => {
  const [search, setSearch] = useState('');
  const [expandedYears, setExpandedYears] = useState<Set<string>>(new Set());
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
  const [signOffs, setSignOffs] = useState<SignOffRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [missingJobs, setMissingJobs] = useState<Map<string, { jobNumber?: string; name?: string; address?: string }>>(new Map());

  // Fetch authoritative sign-off records for THIS team only
  useEffect(() => {
    let cancelled = false;
    const fetchSignOffs = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('team_sign_offs')
          .select('job_id, signed_off_at, progress_notes')
          .eq('team_name', teamName)
          .order('signed_off_at', { ascending: false })
          .limit(2000);

        if (error) {
          console.error('Failed to fetch team sign-offs:', error);
          return;
        }
        if (cancelled) return;
        setSignOffs(data || []);

        // For sign-offs whose job is not in the current jobs prop (older completed jobs
        // outside the team's current loaded set), fetch minimal job details so we can
        // still show them in history.
        const jobIdsInMemory = new Set(jobs.map(j => j.id));
        const missingIds = (data || [])
          .map(s => s.job_id)
          .filter(id => !jobIdsInMemory.has(id));
        const uniqueMissing = Array.from(new Set(missingIds));

        if (uniqueMissing.length > 0) {
          // Chunk to respect query size
          const chunkSize = 100;
          const fetched = new Map<string, { jobNumber?: string; name?: string; address?: string }>();
          for (let i = 0; i < uniqueMissing.length; i += chunkSize) {
            const chunk = uniqueMissing.slice(i, i + chunkSize);
            const { data: jobRows, error: jobErr } = await supabase
              .from('jobs')
              .select('id, job_number, name, address')
              .in('id', chunk);
            if (jobErr) {
              console.warn('Failed to fetch missing job details:', jobErr.message);
              continue;
            }
            for (const row of jobRows || []) {
              fetched.set(row.id, {
                jobNumber: row.job_number,
                name: row.name,
                address: row.address || undefined,
              });
            }
          }
          if (!cancelled) setMissingJobs(fetched);
        } else if (!cancelled) {
          setMissingJobs(new Map());
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchSignOffs();
    // Re-fetch when teamName changes; jobs change should not trigger a refetch loop,
    // but we use jobs only inside fetch (not as dep) — refetch only on teamName.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamName]);

  // Real-time subscription for new sign-offs by this team
  useEffect(() => {
    const channel = supabase
      .channel(`team-history-${teamName}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'team_sign_offs', filter: `team_name=eq.${teamName}` },
        (payload) => {
          const rec = payload.new as any;
          setSignOffs(prev => {
            if (prev.some(s => s.job_id === rec.job_id && s.signed_off_at === rec.signed_off_at)) return prev;
            return [
              { job_id: rec.job_id, signed_off_at: rec.signed_off_at, progress_notes: rec.progress_notes },
              ...prev,
            ];
          });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [teamName]);

  // Build history entries: one per sign-off, deduped to latest per job
  const historyEntries = useMemo<HistoryEntry[]>(() => {
    const jobsById = new Map(jobs.map(j => [j.id, j]));
    const latestByJob = new Map<string, SignOffRecord>();
    for (const so of signOffs) {
      const existing = latestByJob.get(so.job_id);
      if (!existing || new Date(so.signed_off_at) > new Date(existing.signed_off_at)) {
        latestByJob.set(so.job_id, so);
      }
    }
    const entries: HistoryEntry[] = [];
    for (const [jobId, so] of latestByJob) {
      const job = jobsById.get(jobId) || null;
      const fallback = !job ? missingJobs.get(jobId) : undefined;
      // Skip entries we have absolutely no data for
      if (!job && !fallback) continue;
      entries.push({
        job,
        jobId,
        signedOffAt: new Date(so.signed_off_at),
        progressNotes: so.progress_notes,
        fallback,
      });
    }
    return entries;
  }, [signOffs, jobs, missingJobs]);

  // Apply search
  const searchedEntries = useMemo(() => {
    if (!search.trim()) return historyEntries;
    const term = search.toLowerCase();
    return historyEntries.filter(e => {
      const num = (e.job?.jobNumber || e.fallback?.jobNumber || '').toLowerCase();
      const name = (e.job?.name || e.fallback?.name || '').toLowerCase();
      const address = (e.job?.address || e.fallback?.address || '').toLowerCase();
      const desc = (e.job?.description || '').toLowerCase();
      const summary = (e.job?.summaryOfWorks || '').toLowerCase();
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

  return (
    <div className="p-3 space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2 px-1">
        <div className="h-8 w-8 rounded-full bg-[hsl(var(--success))]/15 flex items-center justify-center">
          <History className="h-4 w-4 text-[hsl(var(--success))]" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-bold text-foreground">Job History</h2>
          <p className="text-[10px] text-muted-foreground">
            {loading
              ? 'Loading sign-offs…'
              : `${totalSignedOff} job${totalSignedOff !== 1 ? 's' : ''} signed off by ${teamName}`}
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by job #, address, name, notes…"
          className="pl-9 h-9 text-sm rounded-full"
        />
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 gap-2">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <p className="text-xs text-muted-foreground">Fetching sign-off history…</p>
        </div>
      ) : totalSignedOff === 0 ? (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
            <CheckCircle2 className="h-8 w-8 text-muted-foreground/50" />
          </div>
          <p className="text-base font-medium text-muted-foreground">No signed-off jobs yet</p>
          <p className="text-xs text-muted-foreground/80 text-center px-4 mt-1">
            Once you sign off jobs, they'll appear here grouped by date.
          </p>
        </div>
      ) : searchedEntries.length === 0 ? (
        <div className="text-center py-10 text-sm text-muted-foreground">
          No matches for "{search}"
        </div>
      ) : (
        <div className="space-y-2">
          {grouped.months.map((m) => (
            <Collapsible key={m.monthKey} open={expandedMonths.has(m.monthKey)} onOpenChange={() => toggleMonth(m.monthKey)}>
              <CollapsibleTrigger asChild>
                <div className="cursor-pointer rounded-xl bg-[hsl(var(--success))]/5 border border-[hsl(var(--success))]/20 px-3 py-2 flex items-center justify-between hover:bg-[hsl(var(--success))]/10 transition-colors">
                  <div className="flex items-center gap-2">
                    {expandedMonths.has(m.monthKey)
                      ? <ChevronDown className="h-4 w-4 text-[hsl(var(--success))]" />
                      : <ChevronRight className="h-4 w-4 text-[hsl(var(--success))]" />}
                    <FolderOpen className="h-4 w-4 text-[hsl(var(--success))]" />
                    <span className="font-semibold text-sm">{m.monthLabel}</span>
                  </div>
                  <Badge className="text-[10px] bg-[hsl(var(--success))]/15 text-[hsl(var(--success))] hover:bg-[hsl(var(--success))]/15 rounded-full">
                    {m.total}
                  </Badge>
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-1.5 mt-1.5 ml-3 border-l-2 border-[hsl(var(--success))]/20 pl-3">
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
                        const phone = entry.job?.phoneNumber;
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
        </div>
      )}
    </div>
  );
};
