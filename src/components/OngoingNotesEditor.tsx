import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  StickyNote, 
  Save, 
  Plus, 
  CalendarDays, 
  Trash2, 
  Edit2,
  Users,
  Clock
} from 'lucide-react';
import { ScheduledTrade } from '@/types/job';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface OngoingNotesEditorProps {
  notes: string;
  progressNotes: string; // Team progress notes from portal
  ongoingReason: string;
  scheduledTrades: ScheduledTrade[];
  isOngoing: boolean;
  onUpdate: (updates: { 
    privateNotes?: string; 
    scheduledTrades?: ScheduledTrade[];
  }) => void;
}

export const OngoingNotesEditor = ({ 
  notes, 
  progressNotes,
  ongoingReason,
  scheduledTrades = [],
  isOngoing,
  onUpdate 
}: OngoingNotesEditorProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [editedNotes, setEditedNotes] = useState(notes);
  const [showTradeForm, setShowTradeForm] = useState(false);
  const [editingTradeId, setEditingTradeId] = useState<string | null>(null);
  const [tradeForm, setTradeForm] = useState({ trade: '', tradesman: '', date: '' });
  const [showCalendar, setShowCalendar] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setEditedNotes(notes);
    }
  }, [isOpen, notes]);

  const handleSaveNotes = () => {
    onUpdate({ privateNotes: editedNotes });
  };

  const handleAddTrade = () => {
    if (!tradeForm.trade.trim()) return;
    
    const newTrade: ScheduledTrade = {
      id: editingTradeId || crypto.randomUUID(),
      trade: tradeForm.trade.trim(),
      tradesman: tradeForm.tradesman.trim(),
      date: tradeForm.date,
    };
    
    let updatedTrades: ScheduledTrade[];
    if (editingTradeId) {
      updatedTrades = scheduledTrades.map(t => t.id === editingTradeId ? newTrade : t);
    } else {
      updatedTrades = [...scheduledTrades, newTrade];
    }
    
    onUpdate({ scheduledTrades: updatedTrades });
    setTradeForm({ trade: '', tradesman: '', date: '' });
    setShowTradeForm(false);
    setEditingTradeId(null);
  };

  const handleEditTrade = (trade: ScheduledTrade) => {
    setTradeForm({ trade: trade.trade, tradesman: trade.tradesman, date: trade.date });
    setEditingTradeId(trade.id);
    setShowTradeForm(true);
  };

  const handleDeleteTrade = (tradeId: string) => {
    const updatedTrades = scheduledTrades.filter(t => t.id !== tradeId);
    onUpdate({ scheduledTrades: updatedTrades });
  };

  const hasContent = notes || progressNotes || ongoingReason || scheduledTrades.length > 0;

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "h-7 px-2 text-xs transition-all",
            isOngoing 
              ? "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700 animate-pulse shadow-md" 
              : hasContent 
                ? "text-amber-600 dark:text-amber-400" 
                : "text-muted-foreground"
          )}
        >
          <StickyNote className="w-3.5 h-3.5 mr-1" />
          {hasContent ? (
            <span className="max-w-[80px] truncate">
              {scheduledTrades.length > 0 
                ? `${scheduledTrades.length} trade${scheduledTrades.length > 1 ? 's' : ''}`
                : 'Notes'
              }
            </span>
          ) : (
            'Add Note'
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0" align="start">
        <div className="p-3 border-b bg-muted/30">
          <h4 className="font-semibold text-sm flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Ongoing Notes
          </h4>
          <p className="text-xs text-muted-foreground mt-0.5">
            Track ongoing job progress and scheduled trades
          </p>
        </div>
        
        <ScrollArea className="max-h-[400px]">
          <div className="p-3 space-y-4">
            {/* Why Job is Ongoing - Display from team/admin */}
            {ongoingReason && (
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-2.5">
                <label className="text-xs font-semibold text-amber-700 dark:text-amber-300 block mb-1">
                  WHY JOB IS ONGOING
                </label>
                <p className="text-xs text-amber-800 dark:text-amber-200">{ongoingReason}</p>
              </div>
            )}

            {/* Team Progress Notes - Read-only display */}
            {progressNotes && (
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-2.5">
                <label className="text-xs font-semibold text-blue-700 dark:text-blue-300 block mb-1">
                  Team Notes
                </label>
                <p className="text-xs text-blue-800 dark:text-blue-200 whitespace-pre-wrap">{progressNotes}</p>
              </div>
            )}

            {/* Scheduled Trades Section */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-foreground flex items-center gap-1">
                  <Users className="w-3.5 h-3.5" />
                  Scheduled Trades
                </label>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 text-xs px-2"
                  onClick={() => {
                    setShowTradeForm(true);
                    setEditingTradeId(null);
                    setTradeForm({ trade: '', tradesman: '', date: '' });
                  }}
                >
                  <Plus className="w-3 h-3 mr-1" />
                  Booked
                </Button>
              </div>

              {showTradeForm && (
                <div className="bg-muted/50 rounded-lg p-2.5 mb-2 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-muted-foreground">Trade</label>
                      <Input
                        value={tradeForm.trade}
                        onChange={(e) => setTradeForm({ ...tradeForm, trade: e.target.value })}
                        placeholder="e.g., Electrician"
                        className="h-7 text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Tradesman</label>
                      <Input
                        value={tradeForm.tradesman}
                        onChange={(e) => setTradeForm({ ...tradeForm, tradesman: e.target.value })}
                        placeholder="e.g., John Smith"
                        className="h-7 text-xs"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Date</label>
                    <Popover open={showCalendar} onOpenChange={setShowCalendar}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className="w-full h-7 text-xs justify-start font-normal"
                        >
                          <CalendarDays className="w-3 h-3 mr-2" />
                          {tradeForm.date ? format(new Date(tradeForm.date), 'dd MMM yyyy') : 'Select date'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={tradeForm.date ? new Date(tradeForm.date) : undefined}
                          onSelect={(date) => {
                            setTradeForm({ ...tradeForm, date: date ? date.toISOString().split('T')[0] : '' });
                            setShowCalendar(false);
                          }}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 h-7 text-xs"
                      onClick={() => {
                        setShowTradeForm(false);
                        setEditingTradeId(null);
                        setTradeForm({ trade: '', tradesman: '', date: '' });
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      className="flex-1 h-7 text-xs"
                      onClick={handleAddTrade}
                      disabled={!tradeForm.trade.trim()}
                    >
                      {editingTradeId ? 'Update' : 'Add'}
                    </Button>
                  </div>
                </div>
              )}

              {scheduledTrades.length > 0 ? (
                <div className="space-y-1.5">
                  {scheduledTrades.map((trade) => (
                    <div
                      key={trade.id}
                      className="flex items-center justify-between bg-background border rounded-lg p-2 group"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-xs">
                            {trade.trade}
                          </Badge>
                          {trade.tradesman && (
                            <span className="text-xs text-muted-foreground truncate">
                              {trade.tradesman}
                            </span>
                          )}
                        </div>
                        {trade.date && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            <CalendarDays className="w-3 h-3 inline mr-1" />
                            {format(new Date(trade.date), 'EEE, dd MMM yyyy')}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => handleEditTrade(trade)}
                        >
                          <Edit2 className="w-3 h-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-destructive hover:text-destructive"
                          onClick={() => handleDeleteTrade(trade.id)}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : !showTradeForm && (
                <p className="text-xs text-muted-foreground text-center py-2">
                  No trades scheduled yet
                </p>
              )}
            </div>

            {/* Admin Notes - Editable */}
            <div>
              <label className="text-xs font-semibold text-foreground mb-1 block">
                Admin Notes
              </label>
              <Textarea
                value={editedNotes}
                onChange={(e) => setEditedNotes(e.target.value)}
                placeholder="Add private admin notes..."
                className="min-h-[60px] text-xs"
              />
              <div className="flex justify-end mt-2">
                <Button size="sm" className="h-7 text-xs" onClick={handleSaveNotes}>
                  <Save className="w-3 h-3 mr-1" />
                  Save Notes
                </Button>
              </div>
            </div>
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
};
