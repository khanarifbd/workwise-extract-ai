import { useEffect, useState, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, RefreshCw, Calendar, FileText, CheckCircle2, AlertTriangle, Briefcase } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';

interface JobLine {
  jobId: string;
  jobNumber: string;
  address?: string;
  reason?: string;
}

interface EODReport {
  id: string;
  team_id: string;
  team_name: string;
  report_date: string;
  jobs_visited: JobLine[];
  jobs_completed: JobLine[];
  jobs_open: JobLine[];
  open_reasons: string;
  general_notes: string;
  submitted_by: string | null;
  submitted_at: string;
}

const todayStrGMT = () => new Date().toISOString().slice(0, 10);

export const EODReportsPanel = () => {
  const [reports, setReports] = useState<EODReport[]>([]);
  const [missingTeams, setMissingTeams] = useState<{ team_id: string; team_name: string }[]>([]);
  const [date, setDate] = useState(todayStrGMT());
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [reportsRes, dmTeamsRes] = await Promise.all([
        supabase
          .from('eod_reports')
          .select('*')
          .eq('report_date', date)
          .order('submitted_at', { ascending: false }),
        supabase
          .from('team_notification_settings')
          .select('team_id, team_name')
          .eq('team_type', 'dm')
          .eq('is_paused', false),
      ]);
      const all = (reportsRes.data || []) as unknown as EODReport[];
      setReports(all);
      const submittedIds = new Set(all.map((r) => r.team_id));
      const dm = (dmTeamsRes.data || []) as { team_id: string; team_name: string }[];
      setMissingTeams(dm.filter((t) => !submittedIds.has(t.team_id)));
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => { load(); }, [load]);

  // Realtime subscription for new submissions
  useEffect(() => {
    const channel = supabase
      .channel('eod-reports-admin')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'eod_reports' },
        () => load(),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-red-600" />
          <h2 className="text-lg font-bold">End-of-Day Reports</h2>
          <Badge variant="outline" className="text-xs">DM Teams</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-8 w-40 text-sm"
          />
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <Card className="p-3 bg-emerald-50 dark:bg-emerald-900/20 border-emerald-300">
          <p className="text-xs text-muted-foreground">Submitted</p>
          <p className="text-2xl font-bold text-emerald-700">{reports.length}</p>
        </Card>
        <Card className="p-3 bg-red-50 dark:bg-red-900/20 border-red-300">
          <p className="text-xs text-muted-foreground">Outstanding</p>
          <p className="text-2xl font-bold text-red-700">{missingTeams.length}</p>
        </Card>
        <Card className="p-3 bg-blue-50 dark:bg-blue-900/20 border-blue-300">
          <p className="text-xs text-muted-foreground">DM Teams Total</p>
          <p className="text-2xl font-bold text-blue-700">{reports.length + missingTeams.length}</p>
        </Card>
      </div>

      {missingTeams.length > 0 && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-300">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            <span className="text-sm font-bold text-red-700">Outstanding teams</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {missingTeams.map((t) => (
              <Badge key={t.team_id} variant="destructive" className="text-[11px]">
                {t.team_name}
              </Badge>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-3">
        {reports.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No EOD reports for {format(new Date(date), 'd MMM yyyy')}.
          </p>
        ) : (
          reports.map((r) => (
            <Card key={r.id} className="p-3">
              <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-sm">{r.team_name}</h3>
                  <Badge className="bg-emerald-600 text-white text-[10px]">
                    <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" /> Submitted
                  </Badge>
                </div>
                <span className="text-[11px] text-muted-foreground">
                  {format(new Date(r.submitted_at), 'HH:mm')} • {r.submitted_by}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 text-xs mb-2">
                <div className="bg-blue-50 dark:bg-blue-900/30 p-2 rounded">
                  <p className="font-semibold text-blue-700 flex items-center gap-1">
                    <Briefcase className="h-3 w-3" /> Visited
                  </p>
                  <p className="text-lg font-bold">{r.jobs_visited?.length || 0}</p>
                </div>
                <div className="bg-emerald-50 dark:bg-emerald-900/30 p-2 rounded">
                  <p className="font-semibold text-emerald-700">Completed</p>
                  <p className="text-lg font-bold">{r.jobs_completed?.length || 0}</p>
                </div>
                <div className="bg-amber-50 dark:bg-amber-900/30 p-2 rounded">
                  <p className="font-semibold text-amber-700">Still Open</p>
                  <p className="text-lg font-bold">{r.jobs_open?.length || 0}</p>
                </div>
              </div>

              {r.jobs_open && r.jobs_open.length > 0 && (
                <details className="mt-2 text-xs">
                  <summary className="cursor-pointer font-semibold text-amber-700">
                    Reasons jobs are still open ({r.jobs_open.length})
                  </summary>
                  <ul className="mt-1.5 space-y-1 ml-3">
                    {r.jobs_open.map((j) => (
                      <li key={j.jobId} className="border-l-2 border-amber-400 pl-2">
                        <span className="font-semibold">#{j.jobNumber}</span> — {j.address}
                        {j.reason && <p className="text-muted-foreground italic">{j.reason}</p>}
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              {r.open_reasons && (
                <p className="text-[11px] mt-2 italic text-muted-foreground">
                  <span className="font-semibold">Summary:</span> {r.open_reasons}
                </p>
              )}
              {r.general_notes && (
                <p className="text-[11px] mt-1 text-muted-foreground">
                  <span className="font-semibold">Notes:</span> {r.general_notes}
                </p>
              )}
            </Card>
          ))
        )}
      </div>
    </Card>
  );
};
