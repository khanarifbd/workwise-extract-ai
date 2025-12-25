import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Phone, History, Plus } from 'lucide-react';
import { ContactHistory, determineNextAction, CONTACT_OUTCOMES } from '@/types/contactHistory';
import { ActionBadge } from './ActionBadge';
import { ContactTimelineModal } from './ContactTimelineModal';
import { format } from 'date-fns';

interface ContactCellProps {
  jobId: string;
  jobNumber: string;
  tenantName: string;
  phoneNumber: string;
  bookedDate: Date | null;
  status: string;
  contactHistory: ContactHistory[];
  onBookJob?: (bookedDate: Date) => void;
  showOutcomeOnly?: boolean;
}

export function ContactCell({
  jobId,
  jobNumber,
  tenantName,
  phoneNumber,
  bookedDate,
  status,
  contactHistory,
  onBookJob,
}: ContactCellProps) {
  const [showTimeline, setShowTimeline] = useState(false);

  const nextAction = determineNextAction(contactHistory, { bookedDate, status });
  const attemptCount = contactHistory.length;
  
  // Get last contact info
  const lastContact = contactHistory.length > 0 
    ? contactHistory.sort((a, b) => 
        new Date(b.contactDate).getTime() - new Date(a.contactDate).getTime()
      )[0] 
    : null;

  const lastOutcome = lastContact 
    ? CONTACT_OUTCOMES.find(o => o.value === lastContact.outcome)
    : null;

  return (
    <>
      <div className="flex flex-col gap-1.5">
        {/* Show Last Contact Outcome if exists, otherwise show Action Badge */}
        {lastOutcome ? (
          <div 
            className="flex items-center gap-1.5 text-xs font-bold px-2 py-1 rounded"
            style={{ 
              backgroundColor: lastOutcome.color,
              color: '#FFFFFF' 
            }}
          >
            <span>{lastOutcome.icon}</span>
            <span className="truncate max-w-[100px]">{lastOutcome.label}</span>
          </div>
        ) : (
          <ActionBadge action={nextAction} size="sm" />
        )}
        
        {/* Contact Summary */}
        <div className="flex items-center gap-2">
          {/* Phone Icon - non-clickable, just decorative */}
          {phoneNumber && (
            <div className="h-7 w-7 flex items-center justify-center text-muted-foreground">
              <Phone className="w-3.5 h-3.5" />
            </div>
          )}
          
          {/* History Button */}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => setShowTimeline(true)}
          >
            {attemptCount > 0 ? (
              <>
                <History className="w-3 h-3 mr-1" />
                {attemptCount}
              </>
            ) : (
              <>
                <Plus className="w-3 h-3 mr-1" />
                Log Call
              </>
            )}
          </Button>
        </div>
      </div>

      <ContactTimelineModal
        isOpen={showTimeline}
        onClose={() => setShowTimeline(false)}
        jobId={jobId}
        jobNumber={jobNumber}
        tenantName={tenantName}
        phoneNumber={phoneNumber}
        bookedDate={bookedDate}
        onBookJob={onBookJob}
      />
    </>
  );
}
