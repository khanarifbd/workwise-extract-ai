import { useMemo, useState } from 'react';
import { format, isToday, isTomorrow, isPast, startOfDay, addMinutes } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem,
} from '@/components/ui/command';
import { Badge } from '@/components/ui/badge';
import {
  Plus, Bell, BellOff, Trash2, Check, CalendarClock, Briefcase, Loader2, AlertCircle, ChevronsUpDown, Search,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useProgressorDiary, DiaryEntry } from '@/hooks/useProgressorDiary';
import { IncompleteJob } from '@/hooks/useProgressorIncompleteJobs';

interface Props {
  jobs: IncompleteJob[];
  progressorName: string;
  onJumpToJob: (jobId: string) => void;
}

const toLocalInput = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const dateLabel = (iso: string) => {
  const d = new Date(iso);
  if (isToday(d)) return `Today · ${format(d, 'HH:mm')}`;
  if (isTomorrow(d)) return `Tomorrow · ${format(d, 'HH:mm')}`;
  return format(d, 'EEE dd MMM · HH:mm');
};

export const ProgressorDiaryPanel = ({ jobs, progressorName, onJumpToJob }: Props) => {
  const { entries, isLoading, create, update, remove, toggleDone } = useProgressorDiary();
  const { toast } = useToast();

  const defaultDate = useMemo(() => {
    const d = new Date();
    d.setHours(d.getHours() + 1, 0, 0, 0);
    return toLocalInput(d);
  }, []);

  const [jobId, setJobId] = useState<string>('none');
  const [jobPickerOpen, setJobPickerOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [scheduledAt, setScheduledAt] = useState(defaultDate);
  const [notifyEnabled, setNotifyEnabled] = useState(true);
  const [notifyOffset, setNotifyOffset] = useState<string>('0'); // minutes before
  const [saving, setSaving] = useState(false);

  const jobOptions = useMemo(
    () => jobs
      .slice()
      .sort((a, b) => `${a.jobNumber}`.localeCompare(`${b.jobNumber}`))
      .map(j => ({
        value: j.id,
        jobNumber: j.jobNumber,
        name: j.name,
        address: j.address,
        // Combined searchable string for cmdk fuzzy match
        keywords: `${j.jobNumber} ${j.name} ${j.address}`,
      })),
    [jobs],
  );

  const selectedJob = jobId === 'none' ? null : jobOptions.find(o => o.value === jobId) || null;

  const handleCreate = async () => {
    if (!title.trim()) {
      toast({ title: 'Title required', variant: 'destructive' });
      return;
    }
    if (!scheduledAt) {
      toast({ title: 'Pick a date & time', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const sched = new Date(scheduledAt);
      const notifyAt = notifyEnabled
        ? addMinutes(sched, -Number(notifyOffset || 0)).toISOString()
        : null;

      // Ask for browser notification permission upfront
      if (notifyEnabled && typeof Notification !== 'undefined' && Notification.permission === 'default') {
        try { await Notification.requestPermission(); } catch {}
      }

      await create({
        jobId: jobId === 'none' ? null : jobId,
        title: title.trim(),
        notes: notes.trim(),
        scheduledAt: sched.toISOString(),
        notifyAt,
        notifyEnabled,
        createdBy: progressorName,
      });
      toast({ title: 'Reminder scheduled', description: dateLabel(sched.toISOString()) });
      setTitle(''); setNotes(''); setJobId('none');
    } catch (e: any) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const grouped = useMemo(() => {
    const map = new Map<string, DiaryEntry[]>();
    entries.forEach(e => {
      const key = format(new Date(e.scheduledAt), 'yyyy-MM-dd');
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    });
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [entries]);

  const jobLookup = useMemo(() => {
    const m = new Map<string, IncompleteJob>();
    jobs.forEach(j => m.set(j.id, j));
    return m;
  }, [jobs]);

  return (
    <div className="mt-4 space-y-5 pb-8">
      {/* Create form */}
      <div className="rounded-xl border-2 border-progressor/30 bg-progressor-muted/30 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-progressor" />
          <h3 className="text-sm font-bold text-progressor">Schedule a task or reminder</h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <Label className="text-[11px]">Linked job (optional)</Label>
            <Popover open={jobPickerOpen} onOpenChange={setJobPickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  className="w-full h-9 justify-between font-normal"
                >
                  <span className="truncate text-left">
                    {selectedJob
                      ? <>#{selectedJob.jobNumber} — <span className="text-muted-foreground">{selectedJob.name}</span></>
                      : <span className="text-muted-foreground">— No job —</span>}
                  </span>
                  <ChevronsUpDown className="h-3.5 w-3.5 opacity-50 shrink-0 ml-1" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="p-0 w-[--radix-popover-trigger-width] min-w-[320px]" align="start">
                <Command>
                  <CommandInput placeholder="Search job #, name or address…" />
                  <CommandList className="max-h-72">
                    <CommandEmpty>No matching job.</CommandEmpty>
                    <CommandGroup>
                      <CommandItem
                        value="no-job"
                        onSelect={() => { setJobId('none'); setJobPickerOpen(false); }}
                      >
                        <span className="text-muted-foreground italic">— No job —</span>
                      </CommandItem>
                      {jobOptions.map(o => (
                        <CommandItem
                          key={o.value}
                          value={o.keywords}
                          onSelect={() => { setJobId(o.value); setJobPickerOpen(false); }}
                          className="flex flex-col items-start gap-0.5"
                        >
                          <div className="flex items-center gap-2 w-full">
                            <span className="text-xs font-bold font-mono">#{o.jobNumber}</span>
                            <span className="text-sm font-medium truncate">{o.name}</span>
                            {jobId === o.value && <Check className="h-3.5 w-3.5 text-progressor ml-auto" />}
                          </div>
                          <span className="text-[11px] text-muted-foreground truncate w-full">{o.address}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
          <div>
            <Label className="text-[11px]">When</Label>
            <Input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="h-9"
            />
          </div>
        </div>

        <div>
          <Label className="text-[11px]">Title</Label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Call tenant to confirm access"
            className="h-9"
          />
        </div>

        <div>
          <Label className="text-[11px]">Notes (optional)</Label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Extra context…"
            className="text-sm"
          />
        </div>

        <div className="flex items-center gap-3 flex-wrap pt-1">
          <div className="flex items-center gap-2">
            <Switch checked={notifyEnabled} onCheckedChange={setNotifyEnabled} />
            <Label className="text-xs cursor-pointer">Notify me</Label>
          </div>
          {notifyEnabled && (
            <Select value={notifyOffset} onValueChange={setNotifyOffset}>
              <SelectTrigger className="h-8 w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">At scheduled time</SelectItem>
                <SelectItem value="5">5 min before</SelectItem>
                <SelectItem value="15">15 min before</SelectItem>
                <SelectItem value="30">30 min before</SelectItem>
                <SelectItem value="60">1 hour before</SelectItem>
                <SelectItem value="1440">1 day before</SelectItem>
              </SelectContent>
            </Select>
          )}
          <Button
            onClick={handleCreate}
            disabled={saving}
            className="ml-auto bg-progressor hover:bg-progressor/90 text-progressor-foreground"
            size="sm"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
            Schedule
          </Button>
        </div>

        {notifyEnabled && typeof Notification !== 'undefined' && Notification.permission === 'denied' && (
          <p className="text-[11px] text-destructive flex items-center gap-1">
            <AlertCircle className="h-3 w-3" /> Browser notifications are blocked — enable them in your browser settings to hear alarms.
          </p>
        )}
      </div>

      {/* Entries list */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Scheduled</h3>

        {isLoading && (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}

        {!isLoading && grouped.length === 0 && (
          <p className="text-xs text-muted-foreground italic">Nothing scheduled yet. Add your first reminder above.</p>
        )}

        {grouped.map(([dayKey, list]) => {
          const day = new Date(dayKey);
          const isPastDay = isPast(startOfDay(day)) && !isToday(day);
          return (
            <div key={dayKey}>
              <h4 className={cn(
                "text-[11px] font-bold uppercase tracking-wide mb-1.5",
                isToday(day) ? "text-progressor" : isPastDay ? "text-destructive" : "text-foreground/80",
              )}>
                {isToday(day) ? 'Today' : isTomorrow(day) ? 'Tomorrow' : format(day, 'EEEE dd MMM yyyy')}
              </h4>
              <div className="space-y-1.5">
                {list.map(e => {
                  const job = e.jobId ? jobLookup.get(e.jobId) : null;
                  const overdue = !e.isDone && isPast(new Date(e.scheduledAt));
                  return (
                    <div
                      key={e.id}
                      className={cn(
                        "rounded-lg border p-2.5 bg-card flex items-start gap-2",
                        e.isDone && "opacity-60",
                        overdue && !e.isDone && "border-destructive/50 bg-destructive/5",
                      )}
                    >
                      <button
                        onClick={() => toggleDone(e.id, !e.isDone)}
                        className={cn(
                          "mt-0.5 h-5 w-5 rounded-md border-2 shrink-0 flex items-center justify-center transition-colors",
                          e.isDone ? "bg-progressor border-progressor text-white" : "border-muted-foreground/40 hover:border-progressor",
                        )}
                        title={e.isDone ? 'Mark not done' : 'Mark done'}
                      >
                        {e.isDone && <Check className="h-3 w-3" />}
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-bold text-progressor">{format(new Date(e.scheduledAt), 'HH:mm')}</span>
                          {overdue && !e.isDone && <Badge variant="destructive" className="text-[9px] px-1.5 py-0">Overdue</Badge>}
                          {e.notifyEnabled
                            ? <Bell className="h-3 w-3 text-progressor" />
                            : <BellOff className="h-3 w-3 text-muted-foreground" />}
                        </div>
                        <p className={cn("text-sm font-medium leading-tight", e.isDone && "line-through")}>{e.title}</p>
                        {e.notes && <p className="text-[11px] text-muted-foreground whitespace-pre-wrap mt-0.5">{e.notes}</p>}
                        {job && (
                          <button
                            onClick={() => onJumpToJob(job.id)}
                            className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-progressor hover:underline"
                          >
                            <Briefcase className="h-3 w-3" />
                            #{job.jobNumber} — {job.name}
                          </button>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                        onClick={() => remove(e.id)}
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
