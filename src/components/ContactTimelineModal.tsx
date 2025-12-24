import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format, formatDistanceToNow } from 'date-fns';
import { 
  Phone, 
  Plus, 
  CalendarDays, 
  Trash2, 
  MessageSquare,
  Clock,
  User
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useContactHistory } from '@/hooks/useContactHistory';
import { 
  ContactOutcome, 
  CONTACT_OUTCOMES, 
  ContactHistory 
} from '@/types/contactHistory';

interface ContactTimelineModalProps {
  isOpen: boolean;
  onClose: () => void;
  jobId: string;
  jobNumber: string;
  tenantName: string;
  phoneNumber: string;
  onBookJob?: (bookedDate: Date) => void;
}

export function ContactTimelineModal({
  isOpen,
  onClose,
  jobId,
  jobNumber,
  tenantName,
  phoneNumber,
  onBookJob,
}: ContactTimelineModalProps) {
  const { history, isLoading, addContactAttempt, deleteContactAttempt } = useContactHistory(jobId);
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedOutcome, setSelectedOutcome] = useState<ContactOutcome | null>(null);
  const [notes, setNotes] = useState('');
  const [callbackDate, setCallbackDate] = useState<Date | undefined>(undefined);
  const [bookedDate, setBookedDate] = useState<Date | undefined>(undefined);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!selectedOutcome) return;

    // For 'booked' outcome, require a booked date
    if (selectedOutcome === 'booked' && !bookedDate) {
      return;
    }

    setIsSubmitting(true);
    try {
      await addContactAttempt(
        selectedOutcome,
        notes || undefined,
        callbackDate ? 'callback' : undefined,
        callbackDate
      );
      
      // If booked outcome with date, trigger the booking callback
      if (selectedOutcome === 'booked' && bookedDate && onBookJob) {
        onBookJob(bookedDate);
      }
      
      // Reset form
      setSelectedOutcome(null);
      setNotes('');
      setCallbackDate(undefined);
      setBookedDate(undefined);
      setShowAddForm(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getOutcomeDisplay = (outcome: ContactOutcome) => {
    return CONTACT_OUTCOMES.find(o => o.value === outcome) || CONTACT_OUTCOMES[0];
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader className="space-y-3">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <Phone className="w-5 h-5" />
              Contact History
            </DialogTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground"
            >
              ← Back to Database
            </Button>
          </div>
          
          {/* Job & Tenant Info Card */}
          <div className="p-4 bg-muted/50 rounded-lg border border-border space-y-3">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs font-mono">
                {jobNumber}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <User className="w-5 h-5 text-muted-foreground" />
              <span className="text-xl font-semibold text-foreground">{tenantName}</span>
            </div>
            {phoneNumber && (
              <div className="p-3 bg-primary/10 rounded-lg border border-primary/20">
                <p className="text-xs text-muted-foreground mb-1">Phone Number</p>
                <p className="text-3xl font-bold text-primary tracking-wider font-mono">
                  {phoneNumber}
                </p>
              </div>
            )}
          </div>
        </DialogHeader>

        <div className="flex-1 min-h-0 space-y-4">
          {/* Add Contact Button */}
          {!showAddForm && (
            <Button
              onClick={() => setShowAddForm(true)}
              className="w-full"
              variant="outline"
            >
              <Plus className="w-4 h-4 mr-2" />
              Log Contact Attempt
            </Button>
          )}

          {/* Add Contact Form */}
          {showAddForm && (
            <div className="p-4 bg-muted/30 rounded-lg border-2 border-primary/20 space-y-5">
              {/* Section: Outcome Selection */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-primary" />
                  <span className="text-sm font-semibold text-foreground">Select Outcome</span>
                </div>
                <div className="grid grid-cols-2 gap-2 pl-4">
                  {CONTACT_OUTCOMES.map((outcome) => (
                    <button
                      key={outcome.value}
                      onClick={() => setSelectedOutcome(outcome.value)}
                      className={cn(
                        "p-2 rounded-lg border text-left text-sm transition-all",
                        selectedOutcome === outcome.value
                          ? "border-primary bg-primary/10"
                          : "border-border hover:bg-muted/50"
                      )}
                    >
                      <span className="mr-2">{outcome.icon}</span>
                      {outcome.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Section: Notes */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-primary" />
                  <span className="text-sm font-semibold text-foreground">Add Notes</span>
                </div>
                <div className="pl-4">
                  <Textarea
                    placeholder="Add notes about the call..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="min-h-[80px] bg-background"
                  />
                </div>
              </div>

              {/* Section: Callback Date */}
              {(selectedOutcome === 'callback_scheduled' || selectedOutcome === 'spoke_not_booked') && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-amber-500" />
                    <span className="text-sm font-semibold text-foreground">Schedule Callback</span>
                  </div>
                  <div className="pl-4">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className="w-full justify-start">
                          <CalendarDays className="w-4 h-4 mr-2" />
                          {callbackDate ? format(callbackDate, 'dd/MM/yyyy') : 'Select callback date'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={callbackDate}
                          onSelect={setCallbackDate}
                          disabled={(date) => date < new Date()}
                          initialFocus
                          className="pointer-events-auto"
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              )}

              {/* Section: Booked Date */}
              {selectedOutcome === 'booked' && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span className="text-sm font-semibold text-foreground">Select Start Date</span>
                  </div>
                  <div className="pl-4 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg space-y-2">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className="w-full justify-start">
                          <CalendarDays className="w-4 h-4 mr-2" />
                          {bookedDate ? format(bookedDate, 'dd/MM/yyyy') : 'Select start date'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={bookedDate}
                          onSelect={setBookedDate}
                          initialFocus
                          className="pointer-events-auto"
                        />
                      </PopoverContent>
                    </Popover>
                    {bookedDate && (
                      <p className="text-xs text-emerald-600 dark:text-emerald-400">
                        Job will be marked as booked for {format(bookedDate, 'dd/MM/yyyy')}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Action Buttons - Separated clearly */}
              <div className="pt-3 border-t border-border flex gap-3">
                <Button
                  variant="ghost"
                  className="flex-shrink-0"
                  onClick={() => {
                    setShowAddForm(false);
                    setSelectedOutcome(null);
                    setNotes('');
                    setCallbackDate(undefined);
                    setBookedDate(undefined);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={!selectedOutcome || isSubmitting || (selectedOutcome === 'booked' && !bookedDate)}
                  className="flex-1"
                >
                  {isSubmitting ? 'Saving...' : selectedOutcome === 'booked' ? 'Confirm Booking' : 'Save Contact'}
                </Button>
              </div>
            </div>
          )}

          {/* Timeline Section */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Clock className="w-4 h-4" />
              Contact History Timeline
            </div>
            <ScrollArea className="h-[280px] pr-4">
              {isLoading ? (
                <div className="text-center py-8 text-muted-foreground">
                  Loading history...
                </div>
              ) : history.length === 0 ? (
                <div className="text-center py-8">
                  <MessageSquare className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
                  <p className="text-muted-foreground">No contact attempts yet</p>
                  <p className="text-sm text-muted-foreground/70">
                    Click "Log Contact Attempt" to record your first call
                  </p>
                </div>
              ) : (
                <div className="relative">
                  {/* Timeline line */}
                  <div className="absolute left-4 top-2 bottom-2 w-0.5 bg-border" />
                  
                  {/* Timeline items */}
                  <div className="space-y-4">
                    {history.map((entry, index) => {
                      const outcomeDisplay = getOutcomeDisplay(entry.outcome);
                      return (
                        <div key={entry.id} className="relative pl-10">
                          {/* Timeline dot */}
                          <div 
                            className="absolute left-2.5 w-3 h-3 rounded-full border-2 border-background"
                            style={{ backgroundColor: outcomeDisplay.color }}
                          />
                          
                          <div className="bg-card border border-border rounded-lg p-3">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1">
                                <Badge 
                                  className="text-xs"
                                  style={{ 
                                    backgroundColor: outcomeDisplay.color,
                                    color: '#fff'
                                  }}
                                >
                                  {outcomeDisplay.icon} {outcomeDisplay.label}
                                </Badge>
                                
                                {entry.notes && (
                                  <p className="mt-2 text-sm text-foreground">
                                    {entry.notes}
                                  </p>
                                )}
                                
                                {entry.nextActionDate && (
                                  <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                                    <CalendarDays className="w-3 h-3" />
                                    Callback: {format(entry.nextActionDate, 'dd/MM/yyyy HH:mm')}
                                  </div>
                                )}
                              </div>
                              
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-muted-foreground hover:text-destructive"
                                onClick={() => deleteContactAttempt(entry.id)}
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </div>
                            
                            <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {formatDistanceToNow(entry.contactDate, { addSuffix: true })}
                              </span>
                              <span>
                                {format(entry.contactDate, 'dd/MM/yyyy HH:mm')}
                              </span>
                              {entry.createdBy && (
                                <span className="flex items-center gap-1">
                                  <User className="w-3 h-3" />
                                  {entry.createdBy}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </ScrollArea>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
