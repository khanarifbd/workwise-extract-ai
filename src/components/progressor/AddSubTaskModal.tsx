import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Loader2, Wrench, Plus, CalendarIcon, Search, Users, X, ChevronRight } from 'lucide-react';
import { DEFAULT_TRADES } from '@/types/subTask';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface TradeSchedule {
  name: string;
  type: 'trade' | 'dm_team';
  bookedDate?: Date;
  deadlineDate?: Date;
  assignedTeam: string;
}

interface AddSubTaskModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: {
    id: string;
    jobNumber: string;
    name: string;
    address: string;
  };
  onCreated: () => void;
}

export const AddSubTaskModal = ({
  open,
  onOpenChange,
  job,
  onCreated,
}: AddSubTaskModalProps) => {
  const [schedules, setSchedules] = useState<TradeSchedule[]>([]);
  const [description, setDescription] = useState('');
  const [customTrade, setCustomTrade] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [tradeSearch, setTradeSearch] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dmTeams, setDmTeams] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<string>('select');
  const [editingDateFor, setEditingDateFor] = useState<{ name: string; field: 'booked' | 'deadline' } | null>(null);

  useEffect(() => {
    if (!open) return;
    const fetchDmTeams = async () => {
      const { data } = await supabase
        .from('team_notification_settings')
        .select('team_name, team_type')
        .order('team_name');
      if (data) {
        const dmNames = (data as any[])
          .filter(t => (t.team_type === 'dm' || !t.team_type))
          .map(t => t.team_name);
        setDmTeams(dmNames);
      }
    };
    fetchDmTeams();
  }, [open]);

  const filteredTrades = DEFAULT_TRADES.filter(t =>
    t !== 'Other' && t.toLowerCase().includes(tradeSearch.toLowerCase())
  );

  const filteredDmTeams = dmTeams.filter(t =>
    t.toLowerCase().includes(tradeSearch.toLowerCase())
  );

  const isSelected = (name: string) => schedules.some(s => s.name === name);

  const toggleSelection = (name: string, type: 'trade' | 'dm_team') => {
    if (isSelected(name)) {
      setSchedules(prev => prev.filter(s => s.name !== name));
    } else {
      setSchedules(prev => [...prev, { name, type, assignedTeam: '' }]);
    }
  };

  const addCustomTrade = () => {
    const trimmed = customTrade.trim();
    if (trimmed && !isSelected(trimmed)) {
      setSchedules(prev => [...prev, { name: trimmed, type: 'trade', assignedTeam: '' }]);
      setCustomTrade('');
      setShowCustomInput(false);
    }
  };

  const updateSchedule = (name: string, field: keyof TradeSchedule, value: any) => {
    setSchedules(prev => prev.map(s => s.name === name ? { ...s, [field]: value } : s));
  };

  const removeSchedule = (name: string) => {
    setSchedules(prev => prev.filter(s => s.name !== name));
  };

  const handleSubmit = async () => {
    if (schedules.length === 0) return;
    setIsSubmitting(true);
    try {
      const subTasks = schedules.map(s => ({
        parent_job_id: job.id,
        trade: s.name,
        tenant_name: job.name,
        property_address: job.address,
        description: description || null,
        deadline_date: s.deadlineDate
          ? s.deadlineDate.toISOString()
          : new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
        booked_date: s.bookedDate ? s.bookedDate.toISOString() : null,
        assigned_team: s.assignedTeam || null,
        status: s.bookedDate ? 'scheduled' : 'not_scheduled',
        created_by: 'Progressor',
        task_type: s.type,
      }));

      const { error } = await supabase
        .from('job_sub_tasks')
        .insert(subTasks as any);

      if (error) throw error;

      toast({
        title: `${schedules.length} Sub-Task${schedules.length !== 1 ? 's' : ''} Created`,
        description: `${schedules.map(s => s.name).join(', ')} added to #${job.jobNumber}`,
      });

      await supabase
        .from('jobs')
        .update({
          status: 'awaiting_trade',
          is_ongoing: true,
          ongoing_reason: `Awaiting: ${schedules.map(s => s.name).join(', ')}`,
        })
        .eq('id', job.id);

      onCreated();
      onOpenChange(false);
      resetForm();
    } catch (err) {
      console.error('Error creating sub-tasks:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setSchedules([]);
    setDescription('');
    setCustomTrade('');
    setTradeSearch('');
    setActiveTab('select');
    setEditingDateFor(null);
  };

  const tradeSchedules = schedules.filter(s => s.type === 'trade');
  const dmSchedules = schedules.filter(s => s.type === 'dm_team');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5 text-primary" />
            Add Sub-Tasks
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            #{job.jobNumber} • {job.name} • {job.address}
          </p>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full h-9">
            <TabsTrigger value="select" className="text-xs gap-1 flex-1">
              1. Select Trades / Teams
            </TabsTrigger>
            <TabsTrigger value="schedule" className="text-xs gap-1 flex-1" disabled={schedules.length === 0}>
              2. Schedule Dates ({schedules.length})
            </TabsTrigger>
          </TabsList>

          {/* ═══ STEP 1: SELECT ═══ */}
          <TabsContent value="select" className="mt-3 space-y-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={tradeSearch}
                onChange={(e) => setTradeSearch(e.target.value)}
                placeholder="Search trades or DM teams..."
                className="pl-8 h-8 text-sm"
              />
            </div>

            {/* Trades */}
            <div>
              <Label className="text-xs font-semibold mb-1.5 flex items-center gap-1.5">
                <Wrench className="h-3 w-3" /> Trades
              </Label>
              <ScrollArea className="h-[140px] border rounded-lg p-2">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {filteredTrades.map(trade => (
                    <label
                      key={trade}
                      className={cn(
                        "flex items-center gap-2 p-2 rounded-md border cursor-pointer transition-all text-xs",
                        isSelected(trade)
                          ? 'bg-primary/10 border-primary text-primary font-medium'
                          : 'bg-background border-border hover:bg-muted/50'
                      )}
                    >
                      <Checkbox
                        checked={isSelected(trade)}
                        onCheckedChange={() => toggleSelection(trade, 'trade')}
                        className="h-3.5 w-3.5"
                      />
                      {trade}
                    </label>
                  ))}
                </div>
              </ScrollArea>
            </div>

            {/* DM Teams */}
            <div>
              <Label className="text-xs font-semibold mb-1.5 flex items-center gap-1.5">
                <Users className="h-3 w-3 text-blue-500" /> DM Teams
              </Label>
              <ScrollArea className="h-[140px] border rounded-lg p-2">
                {filteredDmTeams.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                    {filteredDmTeams.map(team => (
                      <label
                        key={`dm-${team}`}
                        className={cn(
                          "flex items-center gap-2 p-2 rounded-md border cursor-pointer transition-all text-xs",
                          isSelected(team)
                            ? 'bg-blue-100 dark:bg-blue-950/30 border-blue-500 text-blue-700 dark:text-blue-300 font-medium'
                            : 'bg-background border-border hover:bg-muted/50'
                        )}
                      >
                        <Checkbox
                          checked={isSelected(team)}
                          onCheckedChange={() => toggleSelection(team, 'dm_team')}
                          className="h-3.5 w-3.5"
                        />
                        <Users className="h-3 w-3 text-blue-500 shrink-0" />
                        {team}
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground text-center py-4">No DM teams found</p>
                )}
              </ScrollArea>
            </div>

            {/* Custom trade */}
            {showCustomInput ? (
              <div className="flex gap-2">
                <Input
                  value={customTrade}
                  onChange={(e) => setCustomTrade(e.target.value)}
                  placeholder="Enter trade name..."
                  className="text-sm h-8"
                  onKeyDown={(e) => e.key === 'Enter' && addCustomTrade()}
                />
                <Button size="sm" onClick={addCustomTrade} className="h-8 text-xs">Add</Button>
              </div>
            ) : (
              <Button variant="outline" size="sm" className="w-full text-xs" onClick={() => setShowCustomInput(true)}>
                <Plus className="h-3 w-3 mr-1" /> Custom Trade / Team
              </Button>
            )}

            {/* Selected summary */}
            {schedules.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {schedules.map(s => (
                  <Badge key={s.name} variant="secondary" className="text-[10px]">
                    {s.type === 'dm_team' && <Users className="h-2.5 w-2.5 mr-0.5" />}
                    {s.name}
                    <button onClick={() => removeSchedule(s.name)} className="ml-1 hover:text-foreground">×</button>
                  </Badge>
                ))}
              </div>
            )}

            {schedules.length > 0 && (
              <Button className="w-full" size="sm" onClick={() => setActiveTab('schedule')}>
                Next: Schedule Dates <ChevronRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            )}
          </TabsContent>

          {/* ═══ STEP 2: SCHEDULE ═══ */}
          <TabsContent value="schedule" className="mt-3 space-y-4">
            {/* Trade Schedules */}
            {tradeSchedules.length > 0 && (
              <div>
                <Label className="text-xs font-semibold mb-2 flex items-center gap-1.5">
                  <Wrench className="h-3 w-3" /> Trade Schedules
                </Label>
                <div className="space-y-2">
                  {tradeSchedules.map(s => (
                    <ScheduleRow
                      key={s.name}
                      schedule={s}
                      onUpdate={(field, value) => updateSchedule(s.name, field, value)}
                      onRemove={() => removeSchedule(s.name)}
                      editingDateFor={editingDateFor}
                      setEditingDateFor={setEditingDateFor}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* DM Team Schedules */}
            {dmSchedules.length > 0 && (
              <div>
                <Label className="text-xs font-semibold mb-2 flex items-center gap-1.5">
                  <Users className="h-3 w-3 text-blue-500" /> DM Team Schedules
                </Label>
                <div className="space-y-2">
                  {dmSchedules.map(s => (
                    <ScheduleRow
                      key={s.name}
                      schedule={s}
                      onUpdate={(field, value) => updateSchedule(s.name, field, value)}
                      onRemove={() => removeSchedule(s.name)}
                      editingDateFor={editingDateFor}
                      setEditingDateFor={setEditingDateFor}
                      isDm
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Shared notes */}
            <div>
              <Label className="text-xs font-semibold mb-1 block">
                Notes <span className="text-muted-foreground font-normal">(Optional – shared across all)</span>
              </Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Work details, access info, materials needed..."
                rows={2}
                className="text-sm"
              />
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting} size="sm">
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={schedules.length === 0 || isSubmitting}
            size="sm"
          >
            {isSubmitting ? (
              <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />Creating...</>
            ) : (
              `Create ${schedules.length} Sub-Task${schedules.length !== 1 ? 's' : ''}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/* ────────── Per-trade/team schedule row ────────── */
function ScheduleRow({
  schedule,
  onUpdate,
  onRemove,
  editingDateFor,
  setEditingDateFor,
  isDm,
}: {
  schedule: TradeSchedule;
  onUpdate: (field: keyof TradeSchedule, value: any) => void;
  onRemove: () => void;
  editingDateFor: { name: string; field: 'booked' | 'deadline' } | null;
  setEditingDateFor: (v: { name: string; field: 'booked' | 'deadline' } | null) => void;
  isDm?: boolean;
}) {
  const borderColor = isDm ? 'border-l-blue-500' : 'border-l-primary';
  const bgColor = isDm ? 'bg-blue-50/50 dark:bg-blue-950/10' : 'bg-muted/30';

  return (
    <div className={cn("border rounded-lg p-3 border-l-4", borderColor, bgColor)}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {isDm ? <Users className="h-3.5 w-3.5 text-blue-500" /> : <Wrench className="h-3.5 w-3.5 text-primary" />}
          <span className="text-sm font-semibold">{schedule.name}</span>
          <Badge variant="outline" className="text-[9px]">{isDm ? 'DM Team' : 'Trade'}</Badge>
        </div>
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={onRemove}>
          <X className="h-3 w-3" />
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {/* Booked Date */}
        <div>
          <Label className="text-[10px] text-muted-foreground mb-0.5 block">Booked Date</Label>
          <Popover
            open={editingDateFor?.name === schedule.name && editingDateFor?.field === 'booked'}
            onOpenChange={(open) => setEditingDateFor(open ? { name: schedule.name, field: 'booked' } : null)}
          >
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("w-full justify-start text-left text-[11px] h-7 px-2", !schedule.bookedDate && "text-muted-foreground")}>
                <CalendarIcon className="h-3 w-3 mr-1 shrink-0" />
                {schedule.bookedDate ? format(schedule.bookedDate, 'dd MMM yy') : 'Select...'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={schedule.bookedDate}
                onSelect={(d) => { onUpdate('bookedDate', d); setEditingDateFor(null); }}
                initialFocus
                className="p-3 pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
        </div>

        {/* Deadline Date */}
        <div>
          <Label className="text-[10px] text-muted-foreground mb-0.5 block">Expected Completion</Label>
          <Popover
            open={editingDateFor?.name === schedule.name && editingDateFor?.field === 'deadline'}
            onOpenChange={(open) => setEditingDateFor(open ? { name: schedule.name, field: 'deadline' } : null)}
          >
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("w-full justify-start text-left text-[11px] h-7 px-2", !schedule.deadlineDate && "text-muted-foreground")}>
                <CalendarIcon className="h-3 w-3 mr-1 shrink-0" />
                {schedule.deadlineDate ? format(schedule.deadlineDate, 'dd MMM yy') : 'Default 5d'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={schedule.deadlineDate}
                onSelect={(d) => { onUpdate('deadlineDate', d); setEditingDateFor(null); }}
                initialFocus
                className="p-3 pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
        </div>

        {/* Assigned Team */}
        <div>
          <Label className="text-[10px] text-muted-foreground mb-0.5 block">Assign Team</Label>
          <Input
            value={schedule.assignedTeam}
            onChange={(e) => onUpdate('assignedTeam', e.target.value)}
            placeholder="e.g. Billy"
            className="text-[11px] h-7 px-2"
          />
        </div>
      </div>
    </div>
  );
}
