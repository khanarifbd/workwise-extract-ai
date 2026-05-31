import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/hooks/use-toast';
import { useSubTasks } from '@/hooks/useSubTasks';
import { SUB_TASK_STATUS_OPTIONS, DEFAULT_TRADES } from '@/types/subTask';
import {
  Loader2, Plus, Users, Calendar as CalendarIcon, Trash2, X, UserPlus,
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface Props {
  jobId: string;
  jobNumber: string;
  jobName: string;
  jobAddress: string;
}

type Stream = 'dm' | 'aa';

/**
 * Embedded inside CONTROL — assigns DM or A&A teams to a job with a booked date.
 * Replaces the standalone Trades feature.
 */
export function ControlTeamAssignment({ jobId, jobNumber, jobName, jobAddress }: Props) {
  const { subTasks, updateSubTask, fetchSubTasks } = useSubTasks(jobId);
  const [dmTeams, setDmTeams] = useState<string[]>([]);
  const [aaTeams, setAaTeams] = useState<string[]>([]);
  const [stream, setStream] = useState<Stream>('dm');
  const [picked, setPicked] = useState<string[]>([]);
  const [bookedDate, setBookedDate] = useState<Date | undefined>(undefined);
  const [calOpen, setCalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('team_notification_settings')
        .select('team_name, team_type')
        .order('team_name');
      const rows = (data as any[]) || [];
      setDmTeams(rows.filter(t => t.team_type === 'dm' || !t.team_type).map(t => t.team_name));
      setAaTeams(rows.filter(t => t.team_type === 'aa').map(t => t.team_name));
    })();
  }, []);

  const teams = stream === 'dm' ? dmTeams : aaTeams;
  const taskType = stream === 'dm' ? 'dm_team' : 'aa_team';

  const togglePick = (t: string) =>
    setPicked(p => (p.includes(t) ? p.filter(x => x !== t) : [...p, t]));

  const create = async () => {
    if (picked.length === 0) {
      toast({ title: 'Pick at least one team', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const rows = picked.map(name => ({
        parent_job_id: jobId,
        trade: name,
        tenant_name: jobName,
        property_address: jobAddress,
        booked_date: bookedDate ? bookedDate.toISOString() : null,
        deadline_date: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
        assigned_team: name,
        status: bookedDate ? 'scheduled' : 'not_scheduled',
        created_by: 'Progressor',
        task_type: taskType,
      }));
      const { error } = await supabase.from('job_sub_tasks').insert(rows as any);
      if (error) throw error;
      toast({ title: `Assigned ${picked.length} team${picked.length > 1 ? 's' : ''}`, description: `#${jobNumber}` });
      setPicked([]);
      setBookedDate(undefined);
      fetchSubTasks();
    } catch (err: any) {
      toast({ title: 'Assignment failed', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Remove this assignment?')) return;
    const { error } = await supabase.from('job_sub_tasks').delete().eq('id', id);
    if (error) {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
      return;
    }
    fetchSubTasks();
  };

  return (
    <div className="rounded-lg border bg-card p-3 space-y-3">
      <div className="flex items-center gap-2">
        <UserPlus className="h-4 w-4 text-progressor" />
        <span className="text-sm font-semibold">Assign Team</span>
        <Badge variant="outline" className="text-[10px] ml-auto">{subTasks.length} assigned</Badge>
      </div>

      {/* Stream tabs */}
      <Tabs value={stream} onValueChange={(v) => { setStream(v as Stream); setPicked([]); }}>
        <TabsList className="grid grid-cols-2 h-8 w-full">
          <TabsTrigger value="dm" className="text-xs">DM Teams ({dmTeams.length})</TabsTrigger>
          <TabsTrigger value="aa" className="text-xs">A &amp; A Teams ({aaTeams.length})</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Team picker */}
      {teams.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2 text-center">No {stream === 'dm' ? 'DM' : 'A&A'} teams configured.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-44 overflow-y-auto">
          {teams.map(t => {
            const on = picked.includes(t);
            return (
              <button
                type="button"
                key={t}
                onClick={() => togglePick(t)}
                className={cn(
                  'flex items-center gap-1.5 px-2 py-1.5 rounded-md border text-xs text-left transition-colors',
                  on
                    ? stream === 'dm'
                      ? 'bg-progressor/15 border-progressor text-progressor font-semibold'
                      : 'bg-emerald-500/15 border-emerald-500 text-emerald-700 dark:text-emerald-300 font-semibold'
                    : 'bg-background border-border hover:bg-muted/50',
                )}
              >
                <Users className="h-3 w-3 shrink-0" />
                <span className="truncate">{t}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Booking date + create */}
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">Booked date (optional)</Label>
          <Popover open={calOpen} onOpenChange={setCalOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn('h-8 text-xs justify-start', !bookedDate && 'text-muted-foreground')}
              >
                <CalendarIcon className="h-3 w-3 mr-1" />
                {bookedDate ? format(bookedDate, 'EEE dd MMM yyyy') : 'Pick date'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={bookedDate}
                onSelect={(d) => { setBookedDate(d ?? undefined); setCalOpen(false); }}
                initialFocus
                className="p-3 pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
        </div>
        {bookedDate && (
          <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => setBookedDate(undefined)}>
            <X className="h-3 w-3" />
          </Button>
        )}
        <div className="flex-1" />
        <Button size="sm" className="h-8" disabled={picked.length === 0 || saving} onClick={create}>
          {saving ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Plus className="h-3 w-3 mr-1" />}
          Assign {picked.length || ''}
        </Button>
      </div>

      {/* Existing assignments */}
      {subTasks.length > 0 && (
        <div className="space-y-1.5 pt-2 border-t">
          <Label className="text-[10px] uppercase text-muted-foreground">Current Assignments</Label>
          {subTasks.map(s => {
            const opt = SUB_TASK_STATUS_OPTIONS.find(o => o.value === s.status);
            return (
              <div key={s.id} className="flex items-center gap-2 p-2 rounded-md border bg-background">
                <Users className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-semibold truncate">{s.trade}</span>
                    {s.bookedDate && (
                      <span className="text-[10px] text-muted-foreground">
                        · {format(s.bookedDate, 'dd MMM')}
                      </span>
                    )}
                  </div>
                </div>
                <select
                  value={s.status}
                  onChange={(e) => updateSubTask(s.id, { status: e.target.value })}
                  className="text-[10px] rounded border border-input bg-background px-1.5 py-1"
                  style={{ color: opt?.color }}
                >
                  {SUB_TASK_STATUS_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <Button
                  variant="ghost" size="sm"
                  className="h-6 w-6 p-0 text-destructive"
                  onClick={() => remove(s.id)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
