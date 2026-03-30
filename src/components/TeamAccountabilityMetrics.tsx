import { useMemo, useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { BarChart3, Clock, CheckCircle2, TrendingUp, X, Award, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface TeamAccountabilityMetricsProps {
  onClose: () => void;
}

interface TeamMetric {
  teamName: string;
  totalJobs: number;
  signedOffJobs: number;
  avgDaysToSignOff: number;
  within24h: number;
  within24hPct: number;
  overdueSignOffs: number;
  chasesNeeded: number;
}

export const TeamAccountabilityMetrics = ({ onClose }: TeamAccountabilityMetricsProps) => {
  const [signOffs, setSignOffs] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // Get DM category ID first
        const { data: catData } = await supabase
          .from('categories')
          .select('id')
          .eq('slug', 'dm-jobs')
          .single();

        const dmCategoryId = catData?.id;

        // Get DM team names to filter report
        const { data: teamData } = await supabase
          .from('team_notification_settings')
          .select('team_name')
          .eq('team_type', 'dm');

        const dmTeamNames = new Set((teamData || []).map(t => t.team_name));

        // Fetch sign-offs and DM jobs in parallel
        const [signOffRes, jobsRes] = await Promise.all([
          supabase
            .from('team_sign_offs')
            .select('job_id, team_name, signed_off_at')
            .order('signed_off_at', { ascending: false }),
          supabase
            .from('jobs')
            .select('id, booked_date, team, team2, is_completed, status, refer_back')
            .not('booked_date', 'is', null)
            .eq('refer_back', false)
            .eq('category_id', dmCategoryId || ''),
        ]);

        // Filter sign-offs to DM teams only
        const dmSignOffs = (signOffRes.data || []).filter(s => dmTeamNames.has(s.team_name));
        setSignOffs(dmSignOffs);
        if (jobsRes.data) setJobs(jobsRes.data);
      } catch (err) {
        console.error('Failed to fetch metrics data:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const metrics = useMemo(() => {
    if (jobs.length === 0) return [];

    // Build job lookup
    const jobMap = new Map<string, any>();
    jobs.forEach(j => jobMap.set(j.id, j));

    // Group sign-offs by team
    const teamData = new Map<string, {
      totalAssigned: number;
      signedOff: number;
      daysToSignOff: number[];
      within24h: number;
    }>();

    // Count assigned jobs per team
    for (const job of jobs) {
      const teams = [job.team, job.team2].filter(Boolean) as string[];
      for (const team of teams) {
        if (!teamData.has(team)) {
          teamData.set(team, { totalAssigned: 0, signedOff: 0, daysToSignOff: [], within24h: 0 });
        }
        teamData.get(team)!.totalAssigned++;
      }
    }

    // Process sign-offs
    for (const so of signOffs) {
      const job = jobMap.get(so.job_id);
      if (!job || !job.booked_date) continue;

      const team = so.team_name;
      if (!teamData.has(team)) {
        teamData.set(team, { totalAssigned: 0, signedOff: 0, daysToSignOff: [], within24h: 0 });
      }

      const data = teamData.get(team)!;
      data.signedOff++;

      const bookedDate = new Date(job.booked_date);
      const signedDate = new Date(so.signed_off_at);
      const diffMs = signedDate.getTime() - bookedDate.getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);

      if (diffDays >= 0) {
        data.daysToSignOff.push(diffDays);
        if (diffDays <= 1) data.within24h++;
      }
    }

    // Build metrics array
    const result: TeamMetric[] = [];
    for (const [teamName, data] of teamData) {
      if (data.totalAssigned === 0) continue;

      const avgDays = data.daysToSignOff.length > 0
        ? data.daysToSignOff.reduce((a, b) => a + b, 0) / data.daysToSignOff.length
        : 0;

      result.push({
        teamName,
        totalJobs: data.totalAssigned,
        signedOffJobs: data.signedOff,
        avgDaysToSignOff: Math.round(avgDays * 10) / 10,
        within24h: data.within24h,
        within24hPct: data.signedOff > 0 ? Math.round((data.within24h / data.signedOff) * 100) : 0,
        overdueSignOffs: data.totalAssigned - data.signedOff,
        chasesNeeded: Math.max(0, data.totalAssigned - data.signedOff),
      });
    }

    return result.sort((a, b) => a.avgDaysToSignOff - b.avgDaysToSignOff);
  }, [signOffs, jobs]);

  // Overall stats
  const overallStats = useMemo(() => {
    if (metrics.length === 0) return { avgDays: 0, pctWithin24h: 0, totalSignedOff: 0, totalAssigned: 0 };
    const totalSignedOff = metrics.reduce((s, m) => s + m.signedOffJobs, 0);
    const totalWithin24h = metrics.reduce((s, m) => s + m.within24h, 0);
    const totalAssigned = metrics.reduce((s, m) => s + m.totalJobs, 0);
    const weightedAvg = metrics.reduce((s, m) => s + m.avgDaysToSignOff * m.signedOffJobs, 0) / (totalSignedOff || 1);
    return {
      avgDays: Math.round(weightedAvg * 10) / 10,
      pctWithin24h: totalSignedOff > 0 ? Math.round((totalWithin24h / totalSignedOff) * 100) : 0,
      totalSignedOff,
      totalAssigned,
    };
  }, [metrics]);

  const getPerformanceColor = (avgDays: number) => {
    if (avgDays <= 1) return 'text-emerald-600 dark:text-emerald-400';
    if (avgDays <= 3) return 'text-amber-600 dark:text-amber-400';
    return 'text-red-600 dark:text-red-400';
  };

  const getPerformanceBg = (avgDays: number) => {
    if (avgDays <= 1) return 'bg-emerald-50 dark:bg-emerald-900/20';
    if (avgDays <= 3) return 'bg-amber-50 dark:bg-amber-900/20';
    return 'bg-red-50 dark:bg-red-900/20';
  };

  const getPctColor = (pct: number) => {
    if (pct >= 80) return 'text-emerald-600 dark:text-emerald-400';
    if (pct >= 50) return 'text-amber-600 dark:text-amber-400';
    return 'text-red-600 dark:text-red-400';
  };

  return (
    <Card className="w-full max-w-4xl mx-auto max-h-[90vh] flex flex-col">
      <CardHeader className="pb-3 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-indigo-100 dark:bg-indigo-900/30">
              <BarChart3 className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <CardTitle className="text-xl">Team Accountability Report</CardTitle>
              <p className="text-sm text-muted-foreground mt-0.5">
                Sign-off performance metrics per team
              </p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Overall summary */}
        {!loading && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-4">
            <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-2.5 text-center">
              <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
                {overallStats.avgDays}d
              </p>
              <p className="text-[11px] text-muted-foreground">Avg Days to Sign-Off</p>
            </div>
            <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg p-2.5 text-center">
              <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                {overallStats.pctWithin24h}%
              </p>
              <p className="text-[11px] text-muted-foreground">Within 24h</p>
            </div>
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-2.5 text-center">
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {overallStats.totalSignedOff}
              </p>
              <p className="text-[11px] text-muted-foreground">Total Sign-Offs</p>
            </div>
            <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-2.5 text-center">
              <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                {overallStats.totalAssigned - overallStats.totalSignedOff}
              </p>
              <p className="text-[11px] text-muted-foreground">Pending Sign-Offs</p>
            </div>
          </div>
        )}
      </CardHeader>

      <CardContent className="flex-1 overflow-hidden pt-0">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Clock className="w-6 h-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">Loading metrics...</span>
          </div>
        ) : metrics.length === 0 ? (
          <div className="text-center py-12">
            <BarChart3 className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-40" />
            <p className="text-muted-foreground">No sign-off data available yet</p>
          </div>
        ) : (
          <ScrollArea className="h-[calc(90vh-320px)]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">#</TableHead>
                  <TableHead>Team</TableHead>
                  <TableHead className="text-center">Assigned</TableHead>
                  <TableHead className="text-center">Signed Off</TableHead>
                  <TableHead className="text-center">Avg Days</TableHead>
                  <TableHead className="text-center">Within 24h</TableHead>
                  <TableHead className="text-center">Pending</TableHead>
                  <TableHead className="text-center">Grade</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {metrics.map((m, i) => {
                  const grade = m.avgDaysToSignOff <= 1 ? 'A'
                    : m.avgDaysToSignOff <= 2 ? 'B'
                    : m.avgDaysToSignOff <= 4 ? 'C'
                    : m.avgDaysToSignOff <= 7 ? 'D'
                    : 'F';
                  const gradeColor = grade === 'A' ? 'bg-emerald-500'
                    : grade === 'B' ? 'bg-blue-500'
                    : grade === 'C' ? 'bg-amber-500'
                    : grade === 'D' ? 'bg-orange-500'
                    : 'bg-red-500';

                  return (
                    <TableRow key={m.teamName} className={cn(getPerformanceBg(m.avgDaysToSignOff))}>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {i === 0 && <Award className="w-4 h-4 text-amber-500 inline" />}
                        {i > 0 && (i + 1)}
                      </TableCell>
                      <TableCell className="font-semibold">{m.teamName}</TableCell>
                      <TableCell className="text-center">{m.totalJobs}</TableCell>
                      <TableCell className="text-center">
                        <span className="flex items-center justify-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                          {m.signedOffJobs}
                        </span>
                      </TableCell>
                      <TableCell className={cn("text-center font-bold", getPerformanceColor(m.avgDaysToSignOff))}>
                        {m.avgDaysToSignOff}d
                      </TableCell>
                      <TableCell className="text-center">
                        <span className={cn("font-medium", getPctColor(m.within24hPct))}>
                          {m.within24hPct}%
                        </span>
                        <span className="text-[10px] text-muted-foreground ml-1">
                          ({m.within24h})
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        {m.overdueSignOffs > 0 ? (
                          <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                            {m.overdueSignOffs}
                          </Badge>
                        ) : (
                          <span className="text-emerald-500 text-xs">✓</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge className={cn("text-white font-bold text-xs px-2", gradeColor)}>
                          {grade}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            {/* Legend */}
            <div className="mt-4 p-3 bg-muted/30 rounded-lg">
              <p className="text-xs font-medium text-muted-foreground mb-2">Grading Scale</p>
              <div className="flex flex-wrap gap-3 text-[11px]">
                <span><Badge className="bg-emerald-500 text-white text-[10px] mr-1">A</Badge> ≤1 day</span>
                <span><Badge className="bg-blue-500 text-white text-[10px] mr-1">B</Badge> ≤2 days</span>
                <span><Badge className="bg-amber-500 text-white text-[10px] mr-1">C</Badge> ≤4 days</span>
                <span><Badge className="bg-orange-500 text-white text-[10px] mr-1">D</Badge> ≤7 days</span>
                <span><Badge className="bg-red-500 text-white text-[10px] mr-1">F</Badge> &gt;7 days</span>
              </div>
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
};
