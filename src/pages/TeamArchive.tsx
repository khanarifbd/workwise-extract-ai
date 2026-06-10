import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { TeamLoginForm } from '@/components/team-portal/TeamLoginForm';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import {
  Loader2,
  LogOut,
  Search,
  CheckCircle2,
  Clock,
  ImageIcon,
  FileVideo,
  FileText,
  Calendar,
  MapPin,
  Phone,
  ChevronDown,
  ChevronUp,
  Archive,
} from 'lucide-react';
import allsaintsLogo from '@/assets/allsaints-logo.png';

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
  is_completed: boolean;
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
  videos_count: number;
  documents_count: number;
  work_items_modified: number;
  work_items_total: number;
}

const SESSION_KEY = 'team_archive_session';

const formatDate = (iso: string | null) => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
};

export default function TeamArchive() {
  const [session, setSession] = useState<ArchiveSession | null>(null);
  const [isInitialising, setIsInitialising] = useState(true);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<CompletedJob[]>([]);
  const [isLoadingJobs, setIsLoadingJobs] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'complete' | 'partial'>('all');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Restore session
  useEffect(() => {
    const stored = localStorage.getItem(SESSION_KEY);
    if (stored) {
      try {
        const parsed: ArchiveSession = JSON.parse(stored);
        if (new Date(parsed.expiresAt) > new Date()) {
          setSession(parsed);
        } else {
          localStorage.removeItem(SESSION_KEY);
        }
      } catch {
        localStorage.removeItem(SESSION_KEY);
      }
    }
    setIsInitialising(false);
  }, []);

  const handleLogin = useCallback(
    async (accessCode: string, rememberMe: boolean): Promise<boolean> => {
      setLoginError(null);
      try {
        const { data, error: fnError } = await supabase.functions.invoke(
          'validate-team-code',
          { body: { accessCode } },
        );
        if (fnError) {
          setLoginError('Failed to validate access code. Please try again.');
          return false;
        }
        if (!data?.success || !data?.session) {
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
      } catch (err) {
        console.error('Archive login error', err);
        setLoginError('Failed to authenticate. Please try again.');
        return false;
      }
    },
    [],
  );

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
      const { data, error: fnError } = await supabase.functions.invoke(
        'get-team-completed-jobs',
        { body: { teamId: session.teamId, limit: 1000 } },
      );
      if (fnError) throw new Error('Failed to load completed jobs');
      if (!data?.success) throw new Error(data?.error || 'Failed to load');
      setJobs(data.jobs || []);
    } catch (err: any) {
      console.error('Archive load error', err);
      setLoadError(err.message || 'Failed to load completed jobs');
    } finally {
      setIsLoadingJobs(false);
    }
  }, [session]);

  useEffect(() => {
    if (session) loadJobs();
  }, [session, loadJobs]);

  const filteredJobs = useMemo(() => {
    const term = search.trim().toLowerCase();
    return jobs.filter((j) => {
      if (filter === 'complete' && !j.fully_complete) return false;
      if (filter === 'partial' && j.fully_complete) return false;
      if (!term) return true;
      const hay = [
        j.job_number,
        j.name,
        j.address,
        j.summary_of_works,
        j.description,
        j.category_name,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(term);
    });
  }, [jobs, search, filter]);

  const stats = useMemo(() => {
    const complete = jobs.filter((j) => j.fully_complete).length;
    const partial = jobs.length - complete;
    const totalPhotos = jobs.reduce((s, j) => s + (j.photos_count || 0), 0);
    return { complete, partial, total: jobs.length, totalPhotos };
  }, [jobs]);

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

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
        <div className="fixed bottom-3 inset-x-0 text-center text-xs text-muted-foreground pointer-events-none">
          <Archive className="inline h-3 w-3 mr-1" />
          Completed Jobs Archive
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-gradient-to-br from-[hsl(220,25%,10%)] to-[hsl(220,25%,18%)] text-white shadow-lg">
        <div className="max-w-5xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center shrink-0 p-1.5">
                <img src={allsaintsLogo} alt="AllSaints" className="w-full h-auto" />
              </div>
              <div className="min-w-0">
                <h1 className="text-base font-bold leading-tight flex items-center gap-2">
                  <Archive className="h-4 w-4" />
                  Completed Jobs Archive
                </h1>
                <p className="text-xs text-white/70 truncate">{session.teamName}</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className="text-white hover:bg-white/10 shrink-0"
            >
              <LogOut className="h-4 w-4 mr-1" />
              Sign out
            </Button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-2 mt-4">
            <div className="bg-white/10 rounded-lg p-2.5 text-center">
              <div className="text-xl font-bold">{stats.total}</div>
              <div className="text-[10px] uppercase tracking-wider text-white/70">Sign-offs</div>
            </div>
            <div className="bg-emerald-500/20 rounded-lg p-2.5 text-center">
              <div className="text-xl font-bold text-emerald-300">{stats.complete}</div>
              <div className="text-[10px] uppercase tracking-wider text-emerald-200/80">Fully Complete</div>
            </div>
            <div className="bg-amber-500/20 rounded-lg p-2.5 text-center">
              <div className="text-xl font-bold text-amber-300">{stats.partial}</div>
              <div className="text-[10px] uppercase tracking-wider text-amber-200/80">Awaiting Others</div>
            </div>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="max-w-5xl mx-auto px-4 py-4 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search job no, address, name, works..."
            className="pl-9 h-11"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto -mx-1 px-1 pb-1">
          {(['all', 'complete', 'partial'] as const).map((f) => (
            <Button
              key={f}
              size="sm"
              variant={filter === f ? 'default' : 'outline'}
              onClick={() => setFilter(f)}
              className="shrink-0 capitalize"
            >
              {f === 'all' ? `All (${stats.total})` : f === 'complete' ? `Complete (${stats.complete})` : `Partial (${stats.partial})`}
            </Button>
          ))}
          <Button
            size="sm"
            variant="ghost"
            onClick={loadJobs}
            disabled={isLoadingJobs}
            className="shrink-0 ml-auto"
          >
            {isLoadingJobs ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              'Refresh'
            )}
          </Button>
        </div>

        {/* Errors / loading */}
        {loadError && (
          <div className="bg-destructive/10 border border-destructive/20 text-destructive text-sm p-3 rounded-lg">
            {loadError}
          </div>
        )}

        {isLoadingJobs && jobs.length === 0 && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}

        {!isLoadingJobs && filteredJobs.length === 0 && (
          <div className="text-center py-20 text-muted-foreground">
            <Archive className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No completed jobs yet</p>
            <p className="text-sm mt-1">Jobs you sign off will appear here.</p>
          </div>
        )}

        {/* Job list */}
        <div className="space-y-2">
          {filteredJobs.map((job) => {
            const isOpen = expanded.has(job.job_id);
            return (
              <Card
                key={`${job.job_id}-${job.signed_off_at}`}
                className={`overflow-hidden transition-all ${
                  job.fully_complete
                    ? 'border-l-4 border-l-emerald-500'
                    : 'border-l-4 border-l-amber-500'
                }`}
              >
                <button
                  type="button"
                  onClick={() => toggleExpanded(job.job_id)}
                  className="w-full text-left p-3 hover:bg-muted/40 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-bold text-sm">{job.job_number}</span>
                        {job.category_name && (
                          <Badge
                            variant="outline"
                            className="text-[10px] px-1.5 py-0"
                            style={
                              job.category_color
                                ? { borderColor: job.category_color, color: job.category_color }
                                : undefined
                            }
                          >
                            {job.category_name}
                          </Badge>
                        )}
                        {job.fully_complete ? (
                          <Badge className="text-[10px] px-1.5 py-0 bg-emerald-500 hover:bg-emerald-500">
                            <CheckCircle2 className="h-3 w-3 mr-0.5" />
                            Complete
                          </Badge>
                        ) : (
                          <Badge className="text-[10px] px-1.5 py-0 bg-amber-500 hover:bg-amber-500">
                            <Clock className="h-3 w-3 mr-0.5" />
                            Awaiting others
                          </Badge>
                        )}
                      </div>
                      <div className="mt-1 text-sm font-medium truncate">{job.name}</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <MapPin className="h-3 w-3 shrink-0" />
                        <span className="truncate">{job.address}</span>
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
                        <span className="flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          Signed off {formatDate(job.signed_off_at)}
                        </span>
                        {job.photos_count > 0 && (
                          <span className="flex items-center gap-0.5">
                            <ImageIcon className="h-3 w-3" />
                            {job.photos_count}
                          </span>
                        )}
                        {job.videos_count > 0 && (
                          <span className="flex items-center gap-0.5">
                            <FileVideo className="h-3 w-3" />
                            {job.videos_count}
                          </span>
                        )}
                        {job.documents_count > 0 && (
                          <span className="flex items-center gap-0.5">
                            <FileText className="h-3 w-3" />
                            {job.documents_count}
                          </span>
                        )}
                      </div>
                    </div>
                    {isOpen ? (
                      <ChevronUp className="h-5 w-5 text-muted-foreground shrink-0" />
                    ) : (
                      <ChevronDown className="h-5 w-5 text-muted-foreground shrink-0" />
                    )}
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t bg-muted/20 px-3 py-3 space-y-3 text-sm">
                    {job.phone_number && (
                      <div className="flex items-center gap-2 text-xs">
                        <Phone className="h-3 w-3 text-muted-foreground" />
                        <a href={`tel:${job.phone_number}`} className="text-primary hover:underline">
                          {job.phone_number}
                        </a>
                      </div>
                    )}
                    {job.booked_date && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        Booked {formatDate(job.booked_date)}
                      </div>
                    )}
                    {job.completion_date && job.fully_complete && (
                      <div className="flex items-center gap-2 text-xs text-emerald-600 font-medium">
                        <CheckCircle2 className="h-3 w-3" />
                        Job completed {formatDate(job.completion_date)}
                      </div>
                    )}
                    {job.summary_of_works && (
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
                          Summary of works
                        </div>
                        <p className="text-xs whitespace-pre-wrap">{job.summary_of_works}</p>
                      </div>
                    )}
                    {job.progress_notes && (
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
                          Your sign-off notes
                        </div>
                        <p className="text-xs whitespace-pre-wrap">{job.progress_notes}</p>
                      </div>
                    )}
                    {Array.isArray(job.work_items) && job.work_items.length > 0 && (
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
                          Work items ({job.work_items_modified}/{job.work_items_total} actioned)
                        </div>
                        <ul className="text-xs space-y-0.5 list-disc pl-4">
                          {job.work_items.slice(0, 8).map((wi: any, idx: number) => (
                            <li key={idx} className="text-muted-foreground">
                              {typeof wi === 'string' ? wi : wi.description || wi.code || JSON.stringify(wi)}
                            </li>
                          ))}
                          {job.work_items.length > 8 && (
                            <li className="text-muted-foreground italic">
                              +{job.work_items.length - 8} more…
                            </li>
                          )}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
