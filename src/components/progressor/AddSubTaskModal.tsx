import { useState } from 'react';
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
import { Loader2, Wrench, Plus, CalendarIcon, Search } from 'lucide-react';
import { DEFAULT_TRADES } from '@/types/subTask';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

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
  const [selectedTrades, setSelectedTrades] = useState<string[]>([]);
  const [description, setDescription] = useState('');
  const [customTrade, setCustomTrade] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [tradeSearch, setTradeSearch] = useState('');
  const [bookedDate, setBookedDate] = useState<Date | undefined>();
  const [deadlineDate, setDeadlineDate] = useState<Date | undefined>();
  const [assignedTeam, setAssignedTeam] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const filteredTrades = DEFAULT_TRADES.filter(t =>
    t !== 'Other' && t.toLowerCase().includes(tradeSearch.toLowerCase())
  );

  const toggleTrade = (trade: string) => {
    setSelectedTrades(prev =>
      prev.includes(trade) ? prev.filter(t => t !== trade) : [...prev, trade]
    );
  };

  const addCustomTrade = () => {
    if (customTrade.trim() && !selectedTrades.includes(customTrade.trim())) {
      setSelectedTrades(prev => [...prev, customTrade.trim()]);
      setCustomTrade('');
      setShowCustomInput(false);
    }
  };

  const handleSubmit = async () => {
    if (selectedTrades.length === 0) return;
    setIsSubmitting(true);
    try {
      const deadlineFinal = deadlineDate || new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);

      const subTasks = selectedTrades.map(trade => ({
        parent_job_id: job.id,
        trade,
        tenant_name: job.name,
        property_address: job.address,
        description: description || null,
        deadline_date: deadlineFinal.toISOString(),
        booked_date: bookedDate ? bookedDate.toISOString() : null,
        assigned_team: assignedTeam || null,
        status: bookedDate ? 'scheduled' : 'not_scheduled',
        created_by: 'Progressor',
      }));

      const { error } = await supabase
        .from('job_sub_tasks')
        .insert(subTasks);

      if (error) throw error;

      // Update parent job
      await supabase
        .from('jobs')
        .update({
          status: 'awaiting_trade',
          is_ongoing: true,
          ongoing_reason: `Awaiting: ${selectedTrades.join(', ')}`,
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
    setSelectedTrades([]);
    setDescription('');
    setCustomTrade('');
    setBookedDate(undefined);
    setDeadlineDate(undefined);
    setAssignedTeam('');
    setTradeSearch('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5 text-primary" />
            Add Sub-Tasks
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            #{job.jobNumber} • {job.name} • {job.address}
          </p>
        </DialogHeader>

        <div className="space-y-4">
          {/* Trade Search & Selection */}
          <div>
            <Label className="text-sm font-semibold mb-2 block">Select Trades / Services</Label>
            <div className="relative mb-2">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={tradeSearch}
                onChange={(e) => setTradeSearch(e.target.value)}
                placeholder="Search trades..."
                className="pl-8 h-8 text-sm"
              />
            </div>
            <ScrollArea className="h-[200px] border rounded-lg p-2">
              <div className="grid grid-cols-2 gap-1.5">
                {filteredTrades.map(trade => (
                  <label
                    key={trade}
                    className={cn(
                      "flex items-center gap-2 p-2 rounded-md border cursor-pointer transition-all text-xs",
                      selectedTrades.includes(trade)
                        ? 'bg-primary/10 border-primary text-primary font-medium'
                        : 'bg-background border-border hover:bg-muted/50'
                    )}
                  >
                    <Checkbox
                      checked={selectedTrades.includes(trade)}
                      onCheckedChange={() => toggleTrade(trade)}
                      className="h-3.5 w-3.5"
                    />
                    {trade}
                  </label>
                ))}
              </div>
            </ScrollArea>

            {/* Custom trade */}
            {showCustomInput ? (
              <div className="flex gap-2 mt-2">
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
              <Button
                variant="outline"
                size="sm"
                className="mt-2 w-full text-xs"
                onClick={() => setShowCustomInput(true)}
              >
                <Plus className="h-3 w-3 mr-1" />
                Custom Trade
              </Button>
            )}

            {/* Selected summary */}
            {selectedTrades.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {selectedTrades.map(trade => (
                  <Badge key={trade} variant="secondary" className="text-[10px]">
                    {trade}
                    <button onClick={() => toggleTrade(trade)} className="ml-1 hover:text-foreground">×</button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Scheduling Row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-semibold mb-1 block">Booked Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left text-xs h-8", !bookedDate && "text-muted-foreground")}>
                    <CalendarIcon className="h-3.5 w-3.5 mr-1.5" />
                    {bookedDate ? format(bookedDate, 'dd MMM yyyy') : 'Select...'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={bookedDate}
                    onSelect={setBookedDate}
                    initialFocus
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <Label className="text-xs font-semibold mb-1 block">Expected Completion</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left text-xs h-8", !deadlineDate && "text-muted-foreground")}>
                    <CalendarIcon className="h-3.5 w-3.5 mr-1.5" />
                    {deadlineDate ? format(deadlineDate, 'dd MMM yyyy') : 'Default: 5 days'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={deadlineDate}
                    onSelect={setDeadlineDate}
                    initialFocus
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Assigned Team */}
          <div>
            <Label className="text-xs font-semibold mb-1 block">Assign Team (Optional)</Label>
            <Input
              value={assignedTeam}
              onChange={(e) => setAssignedTeam(e.target.value)}
              placeholder="e.g. Billy, Argen..."
              className="text-sm h-8"
            />
          </div>

          {/* Description */}
          <div>
            <Label className="text-xs font-semibold mb-1 block">
              Notes <span className="text-muted-foreground font-normal">(Optional)</span>
            </Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Work details, access info, materials needed..."
              rows={2}
              className="text-sm"
            />
          </div>
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting} size="sm">
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={selectedTrades.length === 0 || isSubmitting}
            size="sm"
          >
            {isSubmitting ? (
              <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />Creating...</>
            ) : (
              `Create ${selectedTrades.length} Sub-Task${selectedTrades.length !== 1 ? 's' : ''}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
