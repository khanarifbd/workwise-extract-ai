import { useMemo, useState, useCallback } from 'react';
import { Job } from '@/types/job';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import {
  AlertTriangle, Clock, MapPin, Phone, Users, X, ExternalLink,
  Camera, FileText, Wrench, ShieldAlert, DoorOpen, PenLine,
  CalendarDays, ChevronDown, Tag, Save, RotateCcw, Zap, BarChart3, Loader2
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { getGMTNow, getHoursDifferenceGMT } from '@/lib/dateUtils';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

// Blocker types with metadata
const BLOCKER_TYPES = [
  { value: 'awaiting_photos', label: 'Awaiting Photos', icon: Camera, color: 'bg-blue-500' },
  { value: 'awaiting_description', label: 'Awaiting Description', icon: PenLine, color: 'bg-indigo-500' },
  { value: 'awaiting_trade', label: 'Awaiting Trade', icon: Wrench, color: 'bg-amber-500' },
  { value: 'awaiting_nph', label: 'Awaiting NPH', icon: ShieldAlert, color: 'bg-purple-500' },
  { value: 'rework_required', label: 'Rework Required', icon: RotateCcw, color: 'bg-red-500' },
  { value: 'no_access', label: 'No Access', icon: DoorOpen, color: 'bg-gray-500' },
] as const;

type BlockerType = typeof BLOCKER_TYPES[number]['value'];

interface DanniDashboardProps {
  jobs: Job[];
  signOffStatuses: Record<string, { allSignedOff: boolean }>;
  onClose: () => void;
  onJobClick: (job: Job) => void;
  onJobUpdated?: () => void;
  onShowMetrics?: () => void;
}

interface ReadinessJob extends Job {
  hoursOverdue: number;
  hasPhotos: boolean;
  hasDescription: boolean;
  hasSignOff: boolean;
  hasTradePending: boolean;
  autoBlocker: string | null;
}

export const DanniDashboard = ({
  jobs,
  signOffStatuses,
  onClose,
  onJobClick,
  onJobUpdated,
}: DanniDashboardProps) => {
  const [selectedTeam, setSelectedTeam] = useState<string>('all');
  const [filterBlocker, setFilterBlocker] = useState<string>('all');
  const [editingBlocker, setEditingBlocker] = useState<string | null>(null);
  const [blockerForm, setBlockerForm] = useState<{
    type: BlockerType | '';
    notes: string;
    chaseDate: Date | undefined;
  }>({ type: '', notes: '', chaseDate: undefined });
  const [savingBlocker, setSavingBlocker] = useState(false);
  const { toast } = useToast();

  // Compute readiness data for all jobs 24h+ past booked date
  const readinessJobs = useMemo(() => {
    const now = getGMTNow();
    const result: ReadinessJob[] = [];

    for (const job of jobs) {
      if (job.isCompleted || job.progress === 100 || job.status === 'complete') continue;
      if (job.referBack) continue;

      if (!job.bookedDate) continue;

      const bookedDate = job.bookedDate instanceof Date ? job.bookedDate : new Date(job.bookedDate);
      if (isNaN(bookedDate.getTime())) continue;

      const hoursPast = getHoursDifferenceGMT(now, bookedDate);
      if (bookedDate.getTime() >= now.getTime() || hoursPast <= 24) continue;

      const signOff = signOffStatuses[job.id];
      if (signOff?.allSignedOff) continue;

      // Auto-diagnose blockers
      const attachments = job.attachments || [];
      const hasPhotos = attachments.some(a => a.type === 'image');
      const hasDescription = !!(job.description && job.description.trim().length > 10);
      const hasSignOff = !!signOff?.allSignedOff;
      const hasTradePending = job.status === 'awaiting_trade' || job.isOngoing;

      // Auto-detect most likely blocker
      let autoBlocker: string | null = null;
      if (!hasPhotos && !hasDescription) autoBlocker = 'awaiting_photos';
      else if (!hasPhotos) autoBlocker = 'awaiting_photos';
      else if (!hasDescription) autoBlocker = 'awaiting_description';
      else if (hasTradePending) autoBlocker = 'awaiting_trade';

      result.push({
        ...job,
        hoursOverdue: Math.round(hoursPast - 24),
        hasPhotos,
        hasDescription,
        hasSignOff,
        hasTradePending,
        autoBlocker,
      });
    }

    return result.sort((a, b) => b.hoursOverdue - a.hoursOverdue);
  }, [jobs, signOffStatuses]);

  // Team filter
  const availableTeams = useMemo(() => {
    const teams = new Set<string>();
    readinessJobs.forEach(j => {
      if (j.team) teams.add(j.team);
      if (j.team2) teams.add(j.team2);
    });
    return Array.from(teams).sort();
  }, [readinessJobs]);

  const filteredJobs = useMemo(() => {
    let result = readinessJobs;
    if (selectedTeam !== 'all') {
      result = result.filter(j => j.team === selectedTeam || j.team2 === selectedTeam);
    }
    if (filterBlocker !== 'all') {
      if (filterBlocker === 'untagged') {
        result = result.filter(j => !(j as any).blocker_type && !(j as any).blockerType);
      } else {
        result = result.filter(j => 
          (j as any).blocker_type === filterBlocker || (j as any).blockerType === filterBlocker
        );
      }
    }
    return result;
  }, [readinessJobs, selectedTeam, filterBlocker]);

  // Summary counts
  const missingPhotos = readinessJobs.filter(j => !j.hasPhotos).length;
  const missingDescription = readinessJobs.filter(j => !j.hasDescription).length;
  const awaitingTrade = readinessJobs.filter(j => j.hasTradePending).length;

  const handleSaveBlocker = useCallback(async (jobId: string) => {
    if (!blockerForm.type) return;
    setSavingBlocker(true);
    try {
      const { error } = await supabase
        .from('jobs')
        .update({
          blocker_type: blockerForm.type,
          blocker_notes: blockerForm.notes,
          blocker_set_at: new Date().toISOString(),
          blocker_chase_date: blockerForm.chaseDate?.toISOString() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', jobId);

      if (error) throw error;

      toast({ title: 'Blocker tagged', description: `Job tagged as "${BLOCKER_TYPES.find(b => b.value === blockerForm.type)?.label}"` });
      setEditingBlocker(null);
      setBlockerForm({ type: '', notes: '', chaseDate: undefined });
      onJobUpdated?.();
    } catch (err) {
      console.error('Failed to save blocker:', err);
      toast({ title: 'Error', description: 'Failed to save blocker tag', variant: 'destructive' });
    } finally {
      setSavingBlocker(false);
    }
  }, [blockerForm, toast, onJobUpdated]);

  const handleClearBlocker = useCallback(async (jobId: string) => {
    try {
      const { error } = await supabase
        .from('jobs')
        .update({
          blocker_type: null,
          blocker_notes: '',
          blocker_set_at: null,
          blocker_chase_date: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', jobId);
      if (error) throw error;
      toast({ title: 'Blocker cleared' });
      onJobUpdated?.();
    } catch (err) {
      toast({ title: 'Error', description: 'Failed to clear blocker', variant: 'destructive' });
    }
  }, [toast, onJobUpdated]);

  const getBlockerInfo = (job: ReadinessJob) => {
    const type = (job as any).blocker_type || (job as any).blockerType;
    return BLOCKER_TYPES.find(b => b.value === type) || null;
  };

  return (
    <Card className="w-full max-w-5xl mx-auto max-h-[90vh] flex flex-col">
      <CardHeader className="pb-3 flex-shrink-0">
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-red-100 dark:bg-red-900/30">
                <Clock className="w-6 h-6 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <CardTitle className="text-xl">Danni's Sign-Off Readiness</CardTitle>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {readinessJobs.length} job{readinessJobs.length !== 1 ? 's' : ''} overdue 24h+ without sign-off
                </p>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-2.5 text-center">
              <p className="text-2xl font-bold text-red-600 dark:text-red-400">{readinessJobs.length}</p>
              <p className="text-[11px] text-muted-foreground">Total Overdue</p>
            </div>
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-2.5 text-center">
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{missingPhotos}</p>
              <p className="text-[11px] text-muted-foreground">Missing Photos</p>
            </div>
            <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-2.5 text-center">
              <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{missingDescription}</p>
              <p className="text-[11px] text-muted-foreground">Missing Description</p>
            </div>
            <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-2.5 text-center">
              <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{awaitingTrade}</p>
              <p className="text-[11px] text-muted-foreground">Awaiting Trade</p>
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <Select value={selectedTeam} onValueChange={setSelectedTeam}>
                <SelectTrigger className="w-[160px] h-8 text-xs">
                  <SelectValue placeholder="Team" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Teams</SelectItem>
                  {availableTeams.map(t => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Tag className="h-4 w-4 text-muted-foreground" />
              <Select value={filterBlocker} onValueChange={setFilterBlocker}>
                <SelectTrigger className="w-[180px] h-8 text-xs">
                  <SelectValue placeholder="Blocker" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Blockers</SelectItem>
                  <SelectItem value="untagged">Untagged</SelectItem>
                  {BLOCKER_TYPES.map(b => (
                    <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Badge variant="secondary" className="text-xs">
              Showing {filteredJobs.length} of {readinessJobs.length}
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 overflow-hidden pt-0">
        {filteredJobs.length === 0 ? (
          <div className="text-center py-12">
            <Clock className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-40" />
            <p className="text-muted-foreground">No matching overdue jobs</p>
          </div>
        ) : (
          <ScrollArea className="h-[calc(90vh-340px)]">
            <div className="space-y-2 pr-3">
              {filteredJobs.map((job) => {
                const blockerInfo = getBlockerInfo(job);
                const isEditing = editingBlocker === job.id;

                return (
                  <div
                    key={job.id}
                    className={cn(
                      "border rounded-lg p-3 transition-all hover:shadow-md",
                      "border-l-4",
                      job.hoursOverdue > 72 ? "border-l-red-600 bg-red-50/50 dark:bg-red-950/20" :
                      job.hoursOverdue > 48 ? "border-l-orange-500 bg-orange-50/30 dark:bg-orange-950/10" :
                      "border-l-amber-400 bg-amber-50/20 dark:bg-amber-950/10"
                    )}
                  >
                    {/* Top row: job info + readiness indicators */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-sm font-bold text-primary">
                            #{job.jobNumber}
                          </span>
                          <Badge className="bg-red-600 text-white text-[10px] px-1.5 py-0 font-bold">
                            {job.hoursOverdue > 48
                              ? `${Math.floor(job.hoursOverdue / 24)}d overdue`
                              : `${job.hoursOverdue}h overdue`}
                          </Badge>
                          {/* Readiness traffic lights */}
                          <div className="flex items-center gap-1 ml-1">
                            <span title={job.hasPhotos ? 'Photos uploaded' : 'Missing photos'}
                              className={cn("w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px]",
                                job.hasPhotos ? "bg-emerald-500" : "bg-red-500 animate-pulse"
                              )}>
                              <Camera className="w-3 h-3" />
                            </span>
                            <span title={job.hasDescription ? 'Description filled' : 'Missing description'}
                              className={cn("w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px]",
                                job.hasDescription ? "bg-emerald-500" : "bg-red-500 animate-pulse"
                              )}>
                              <PenLine className="w-3 h-3" />
                            </span>
                            <span title={job.hasTradePending ? 'Trade pending' : 'No trade issue'}
                              className={cn("w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px]",
                                !job.hasTradePending ? "bg-emerald-500" : "bg-amber-500"
                              )}>
                              <Wrench className="w-3 h-3" />
                            </span>
                          </div>
                        </div>

                        <h3 className="font-semibold text-foreground mt-1 truncate text-sm">
                          {job.name}
                        </h3>

                        <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1 text-xs text-muted-foreground">
                          {job.address && (
                            <span className="flex items-center gap-1 truncate max-w-[200px]">
                              <MapPin className="w-3 h-3" />{job.address}
                            </span>
                          )}
                          {job.team && (
                            <span className="flex items-center gap-1">
                              <Users className="w-3 h-3" />{job.team}{job.team2 ? ` + ${job.team2}` : ''}
                            </span>
                          )}
                          {job.bookedDate && (
                            <span className="flex items-center gap-1">
                              <CalendarDays className="w-3 h-3" />
                              {format(job.bookedDate instanceof Date ? job.bookedDate : new Date(job.bookedDate as any), 'dd MMM')}
                            </span>
                          )}
                        </div>

                        {/* Blocker tag display */}
                        {blockerInfo && !isEditing && (
                          <div className="mt-2 flex items-center gap-2">
                            <Badge className={cn("text-white text-[10px] px-2 py-0.5", blockerInfo.color)}>
                              <blockerInfo.icon className="w-3 h-3 mr-1" />
                              {blockerInfo.label}
                            </Badge>
                            {(job as any).blocker_chase_date && (
                              <span className="text-[10px] text-muted-foreground">
                                Chase: {format(new Date((job as any).blocker_chase_date), 'dd MMM')}
                              </span>
                            )}
                            {(job as any).blocker_notes && (
                              <span className="text-[10px] text-muted-foreground truncate max-w-[200px]">
                                {(job as any).blocker_notes}
                              </span>
                            )}
                          </div>
                        )}

                        {/* Auto-suggested action */}
                        {!blockerInfo && !isEditing && job.autoBlocker && (
                          <div className="mt-1.5">
                            <span className="text-[10px] text-orange-600 dark:text-orange-400 font-medium">
                              ⚡ Suggested: {BLOCKER_TYPES.find(b => b.value === job.autoBlocker)?.label}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Action buttons */}
                      <div className="flex flex-col gap-1 flex-shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={(e) => { e.stopPropagation(); onJobClick(job); }}
                          title="View job"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant={isEditing ? "secondary" : "ghost"}
                          size="icon"
                          className="h-7 w-7"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (isEditing) {
                              setEditingBlocker(null);
                            } else {
                              setEditingBlocker(job.id);
                              const existing = getBlockerInfo(job);
                              setBlockerForm({
                                type: ((job as any).blocker_type || '') as BlockerType | '',
                                notes: (job as any).blocker_notes || '',
                                chaseDate: (job as any).blocker_chase_date ? new Date((job as any).blocker_chase_date) : undefined,
                              });
                            }
                          }}
                          title="Tag blocker"
                        >
                          <Tag className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>

                    {/* Blocker editing panel */}
                    {isEditing && (
                      <div className="mt-3 pt-3 border-t space-y-2" onClick={(e) => e.stopPropagation()}>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5">
                          {BLOCKER_TYPES.map(b => (
                            <button
                              key={b.value}
                              onClick={() => setBlockerForm(f => ({ ...f, type: b.value }))}
                              className={cn(
                                "flex items-center gap-1.5 px-2 py-1.5 rounded text-xs font-medium transition-all border",
                                blockerForm.type === b.value
                                  ? `${b.color} text-white border-transparent`
                                  : "bg-muted/50 text-foreground border-border hover:bg-muted"
                              )}
                            >
                              <b.icon className="w-3 h-3" />
                              {b.label}
                            </button>
                          ))}
                        </div>
                        <Textarea
                          placeholder="Blocker notes (optional)..."
                          value={blockerForm.notes}
                          onChange={(e) => setBlockerForm(f => ({ ...f, notes: e.target.value }))}
                          className="h-16 text-xs"
                        />
                        <div className="flex items-center gap-2 flex-wrap">
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                                <CalendarDays className="w-3 h-3" />
                                {blockerForm.chaseDate ? format(blockerForm.chaseDate, 'dd MMM') : 'Chase date'}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <Calendar
                                mode="single"
                                selected={blockerForm.chaseDate}
                                onSelect={(d) => setBlockerForm(f => ({ ...f, chaseDate: d || undefined }))}
                              />
                            </PopoverContent>
                          </Popover>
                          <div className="flex-1" />
                          {blockerInfo && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs text-destructive"
                              onClick={() => handleClearBlocker(job.id)}
                            >
                              Clear
                            </Button>
                          )}
                          <Button
                            size="sm"
                            className="h-7 text-xs gap-1"
                            disabled={!blockerForm.type || savingBlocker}
                            onClick={() => handleSaveBlocker(job.id)}
                          >
                            <Save className="w-3 h-3" />
                            {savingBlocker ? 'Saving...' : 'Save Tag'}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
};
