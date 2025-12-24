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
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Phone className="w-5 h-5" />
            Contact History
          </DialogTitle>
          <div className="text-sm text-muted-foreground">
            <span className="font-medium">{jobNumber}</span> • {tenantName}
          </div>
          {/* Large phone number display */}
          {phoneNumber && (
            <div className="mt-3 p-4 bg-primary/10 rounded-lg border border-primary/20">
              <p className="text-xs text-muted-foreground mb-1">Tenant Phone Number</p>
              <p className="text-3xl font-bold text-primary tracking-wider font-mono">
                {phoneNumber}
              </p>
            </div>
          )}
        </DialogHeader>

        <div className="flex-1 min-h-0">
          {/* Add Contact Button */}
          {!showAddForm && (
            <Button
              onClick={() => setShowAddForm(true)}
              className="w-full mb-4"
              variant="outline"
            >
              <Plus className="w-4 h-4 mr-2" />
              Log Contact Attempt
            </Button>
          )}

          {/* Add Contact Form */}
          {showAddForm && (
            <div className="mb-4 p-4 bg-muted/30 rounded-lg border border-border space-y-4">
              <div className="text-sm font-medium">Log Contact Attempt</div>
              
              {/* Outcome Selection */}
              <div className="grid grid-cols-2 gap-2">
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

              {/* Notes */}
              <Textarea
                placeholder="Add notes about the call..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="min-h-[80px]"
              />

              {/* Callback Date (for callback outcomes) */}
              {(selectedOutcome === 'callback_scheduled' || selectedOutcome === 'spoke_not_booked') && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Callback date:</span>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm">
                        <CalendarDays className="w-4 h-4 mr-2" />
                        {callbackDate ? format(callbackDate, 'dd/MM/yyyy') : 'Select date'}
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
              )}

              {/* Booked Date (for booked outcome) */}
              {selectedOutcome === 'booked' && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg space-y-2">
                  <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Select Booked Date:</span>
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
              )}

              {/* Actions */}
              <div className="flex gap-2">
                <Button
                  onClick={handleSubmit}
                  disabled={!selectedOutcome || isSubmitting || (selectedOutcome === 'booked' && !bookedDate)}
                  className="flex-1"
                >
                  {isSubmitting ? 'Saving...' : selectedOutcome === 'booked' ? 'Confirm Booking' : 'Save Contact'}
                </Button>
                <Button
                  variant="ghost"
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
              </div>
            </div>
          )}

          {/* Timeline */}
          <ScrollArea className="h-[400px] pr-4">
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
        
        {/* Back to Database Button */}
        <div className="pt-3 border-t border-border">
          <Button
            variant="outline"
            className="w-full"
            onClick={onClose}
          >
            ← Back to Database
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
