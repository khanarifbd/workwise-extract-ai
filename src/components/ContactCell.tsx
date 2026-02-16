import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Phone, History, Plus } from 'lucide-react';
import { ContactHistory, determineNextAction, CONTACT_OUTCOMES, NextAction, NEXT_ACTION_BADGES } from '@/types/contactHistory';
import { ContactTimelineModal } from './ContactTimelineModal';

interface ContactCellProps {
  jobId: string;
  jobNumber: string;
  tenantName: string;
  phoneNumber: string;
  description?: string;
  bookedDate: Date | null;
  status: string;
  contactHistory: ContactHistory[];
  onBookJob?: (bookedDate: Date, isFlexible: boolean) => void;
  onDescriptionChange?: (description: string) => void;
  onReferBack?: (reason: string) => void;
}

export function ContactCell({
  jobId,
  jobNumber,
  tenantName,
  phoneNumber,
  description,
  bookedDate,
  status,
  contactHistory,
  onBookJob,
  onDescriptionChange,
  onReferBack,
}: ContactCellProps) {
  const [showTimeline, setShowTimeline] = useState(false);

  const nextAction = determineNextAction(contactHistory, { bookedDate, status });
  const attemptCount = contactHistory.length;

  // Get last contact info (do NOT mutate the prop array)
  const lastContact = contactHistory.length > 0
    ? [...contactHistory].sort(
        (a, b) => new Date(b.contactDate).getTime() - new Date(a.contactDate).getTime()
      )[0]
    : null;

  const lastOutcome = lastContact
    ? CONTACT_OUTCOMES.find((o) => o.value === lastContact.outcome)
    : null;

  // Get action badge info
  const actionBadge = NEXT_ACTION_BADGES.find((a) => a.value === (nextAction as NextAction));

  return (
    <>
      <div className="flex flex-col gap-1.5">
        {/* Show Last Contact Outcome if exists, otherwise show Action Badge */}
        {lastOutcome ? (
          <div
            className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1.5 rounded w-fit"
            style={{
              backgroundColor: lastOutcome.color,
              color: '#FFFFFF',
            }}
          >
            <span>{lastOutcome.icon}</span>
            <span>{lastOutcome.label}</span>
          </div>
        ) : actionBadge && actionBadge.value !== 'none' ? (
          <div
            className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1.5 rounded w-fit"
            style={{
              backgroundColor: actionBadge.bgColor,
              color: actionBadge.color,
            }}
          >
            <span>{actionBadge.label}</span>
          </div>
        ) : null}

        {/* Contact Summary - Phone icon + History/Log button */}
        <div className="flex items-center gap-2">
          {phoneNumber && (
            <div className="h-7 w-7 flex items-center justify-center text-muted-foreground">
              <Phone className="w-3.5 h-3.5" />
            </div>
          )}

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
        description={description}
        bookedDate={bookedDate}
        onBookJob={onBookJob}
        onDescriptionChange={onDescriptionChange}
        onReferBack={onReferBack}
      />
    </>
  );
}

