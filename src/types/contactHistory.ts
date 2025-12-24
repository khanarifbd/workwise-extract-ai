export type ContactOutcome = 
  | 'answered_booked'
  | 'no_answer'
  | 'voicemail_left'
  | 'callback_scheduled'
  | 'wrong_number'
  | 'tenant_refused'
  | 'spoke_not_booked'
  | 'referred_nph';

export const CONTACT_OUTCOMES: { value: ContactOutcome; label: string; color: string; icon: string }[] = [
  { value: 'answered_booked', label: 'Answered & Booked', color: '#10B981', icon: '✅' },
  { value: 'spoke_not_booked', label: 'Spoke - Not Booked', color: '#3B82F6', icon: '💬' },
  { value: 'callback_scheduled', label: 'Callback Scheduled', color: '#06B6D4', icon: '📅' },
  { value: 'voicemail_left', label: 'Voicemail Left', color: '#8B5CF6', icon: '📧' },
  { value: 'no_answer', label: 'No Answer', color: '#F97316', icon: '📵' },
  { value: 'wrong_number', label: 'Wrong Number', color: '#EF4444', icon: '❌' },
  { value: 'tenant_refused', label: 'Tenant Refused', color: '#DC2626', icon: '🚫' },
  { value: 'referred_nph', label: 'Referred to NPH', color: '#EC4899', icon: '🏢' },
];

export interface ContactHistory {
  id: string;
  jobId: string;
  contactDate: Date;
  outcome: ContactOutcome;
  notes: string | null;
  nextAction: string | null;
  nextActionDate: Date | null;
  createdBy: string | null;
  createdAt: Date;
}

export type NextAction = 
  | 'call_now'
  | 'call_back'
  | 'await_callback'
  | 'follow_up'
  | 'escalate_nph'
  | 'booked'
  | 'none';

export const NEXT_ACTION_BADGES: { value: NextAction; label: string; color: string; bgColor: string }[] = [
  { value: 'call_now', label: 'CALL NOW', color: '#FFFFFF', bgColor: '#EF4444' },
  { value: 'call_back', label: 'CALL BACK', color: '#FFFFFF', bgColor: '#F97316' },
  { value: 'await_callback', label: 'AWAITING CALLBACK', color: '#1F2937', bgColor: '#FCD34D' },
  { value: 'follow_up', label: 'FOLLOW UP', color: '#FFFFFF', bgColor: '#8B5CF6' },
  { value: 'escalate_nph', label: 'REFER NPH', color: '#FFFFFF', bgColor: '#EC4899' },
  { value: 'booked', label: 'BOOKED ✓', color: '#FFFFFF', bgColor: '#10B981' },
  { value: 'none', label: '', color: '', bgColor: '' },
];

// Determine the next action based on contact history
export function determineNextAction(
  contactHistory: ContactHistory[],
  job: { bookedDate: Date | null; status: string }
): NextAction {
  // If job is already booked
  if (job.bookedDate) {
    return 'booked';
  }

  // If no contact attempts yet
  if (!contactHistory || contactHistory.length === 0) {
    return 'call_now';
  }

  // Sort by date, most recent first
  const sorted = [...contactHistory].sort(
    (a, b) => new Date(b.contactDate).getTime() - new Date(a.contactDate).getTime()
  );
  const lastContact = sorted[0];

  // Check if there's a scheduled callback
  if (lastContact.nextActionDate && new Date(lastContact.nextActionDate) > new Date()) {
    return 'await_callback';
  }

  // Based on last contact outcome
  switch (lastContact.outcome) {
    case 'answered_booked':
      return 'booked';
    case 'callback_scheduled':
      if (lastContact.nextActionDate && new Date(lastContact.nextActionDate) <= new Date()) {
        return 'call_back';
      }
      return 'await_callback';
    case 'voicemail_left':
      return 'follow_up';
    case 'no_answer':
      // If 3+ no answers, escalate
      const noAnswerCount = sorted.filter(c => c.outcome === 'no_answer').length;
      if (noAnswerCount >= 3) {
        return 'escalate_nph';
      }
      return 'call_back';
    case 'spoke_not_booked':
      return 'follow_up';
    case 'referred_nph':
      return 'escalate_nph';
    case 'tenant_refused':
    case 'wrong_number':
      return 'escalate_nph';
    default:
      return 'call_now';
  }
}
