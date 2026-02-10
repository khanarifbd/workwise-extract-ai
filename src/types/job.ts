export interface WorkItem {
  id: string;
  description: string;
  sorCode: string;
  qty: number;
  cost: number;
  isConfirmed?: boolean; // Defaults to true - item included in works list
  hasModification?: boolean; // When true, shows variation field
  variation?: string; // Modification/variation notes
}

export type JobStatus = 
  | 'pending'
  | 'pause'
  | 'complete'
  | 'no_show'
  | 'no_answer'
  | 'voice_message'
  | 'call_back'
  | 'left_property'
  | 'return_nph'
  | 'started'
  | 'jan2026';

export const JOB_STATUS_OPTIONS: { value: JobStatus; label: string; color: string }[] = [
  { value: 'complete', label: 'Complete', color: '#10B981' },
  { value: 'pending', label: 'Pending', color: '#6B7280' },
  { value: 'started', label: 'Started', color: '#3B82F6' },
  { value: 'pause', label: 'Pause', color: '#F59E0B' },
  { value: 'no_show', label: 'No Show', color: '#EF4444' },
  { value: 'no_answer', label: 'No Answer', color: '#F97316' },
  { value: 'voice_message', label: 'Voice Message', color: '#8B5CF6' },
  { value: 'call_back', label: 'Call Back', color: '#06B6D4' },
  { value: 'left_property', label: 'Left Property', color: '#84CC16' },
  { value: 'return_nph', label: 'Return NPH', color: '#EC4899' },
  { value: 'jan2026', label: 'Jan2026', color: '#0D9488' },
];

export interface FanInfo {
  type: string;
  quantity: number;
  location: string;
  manualOverride?: boolean; // When true, auto-scan should not overwrite this
}

export interface InsulationInfo {
  type: string;
  quantity: number;
  location: string;
  thickness?: string;
  material?: string;
  manualOverride?: boolean;
}

export interface JobCosts {
  materials: number;
  labour: number;
  other: number;
  notes: string;
}

// Scheduled trade for ongoing job tracking
export interface ScheduledTrade {
  id: string;
  trade: string;
  tradesman: string;
  date: string; // ISO date string
}

export interface Job {
  id: string;
  jobNumber: string;
  name: string;
  address: string;
  phoneNumber: string;
  summaryOfWorks: string;
  description: string;
  workItems: WorkItem[];
  additionalWorks: WorkItem[];
  team: string | null;
  team2: string | null; // Second team assignment (optional)
  progress: number;
  progressNotes: string;
  isCompleted: boolean;
  isOngoing: boolean; // Flag for unfinished/ongoing jobs that need tracking
  ongoingReason: string; // WHY JOB IS ONGOING - reason input
  scheduledTrades: ScheduledTrade[]; // Trades/tradesmen scheduled for ongoing job completion
  /**
   * Created timestamp from the database.
   * Used for Ops Manager ordering/grouping to match backend ordering.
   */
  createdAt: Date;
  dateIssued: Date;
  bookedDate: Date | null;
  isFlexibleBooking: boolean;
  bookingNotes: string;
  completionDate: Date | null;
  attachments: Attachment[];
  status: JobStatus;
  fanInfo: FanInfo[] | null;
  linkedFanJobId: string | null;
  insulationInfo: InsulationInfo[] | null;
  linkedInsulationJobId: string | null;
  costs: JobCosts | null;
  privateNotes: string; // Admin-only notes, not visible in team portal
  referBack: boolean; // Job referred back to NPH as uncompletable
  referBackReason: string; // Reason for refer back
  referBackDate: Date | null; // When it was referred back
}

export interface Attachment {
  id: string;
  name: string;
  type: 'image' | 'video' | 'document';
  url: string; // For backward compatibility - may be public URL or signed URL
  path?: string; // Storage path for generating signed URLs
  uploadedAt: Date;
  folderId?: string; // For photo folder organization
}

export interface Team {
  id: string;
  name: string;
  color: string;
  whatsappGroup?: string;
}

export interface NotificationHistory {
  id: string;
  jobId: string;
  jobNumber: string;
  teamName: string;
  whatsappNumber: string | null;
  message: string;
  sentVia: string;
  status: string;
  createdAt: Date;
}

export const ALLSAINTS_TEAMS: Team[] = [
  { id: '1', name: 'Indika', color: '#F97316', whatsappGroup: 'indika-team' },
  { id: '2', name: 'Bartek', color: '#3B82F6', whatsappGroup: 'bartek-team' },
  { id: '3', name: 'Shakthi', color: '#10B981', whatsappGroup: 'shakthi-team' },
  { id: '4', name: 'Abraham', color: '#8B5CF6', whatsappGroup: 'abraham-team' },
  { id: '5', name: 'Jess', color: '#EC4899', whatsappGroup: 'jess-team' },
  { id: '6', name: 'Alindo', color: '#F59E0B', whatsappGroup: 'alindo-team' },
  { id: '7', name: 'Ramesh', color: '#14B8A6', whatsappGroup: 'ramesh-team' },
  { id: '8', name: 'Kumar', color: '#6366F1', whatsappGroup: 'kumar-team' },
];

// Fan Installers Teams for Fan category jobs
export const FAN_TEAMS: Team[] = [
  { id: 'f1', name: 'Billy', color: '#0EA5E9', whatsappGroup: 'billy-fans' },
  { id: 'f2', name: 'Argen', color: '#8B5CF6', whatsappGroup: 'argen-fans' },
  { id: 'f3', name: 'Leci', color: '#10B981', whatsappGroup: 'leci-fans' },
  { id: 'f4', name: 'Sam', color: '#F97316', whatsappGroup: 'sam-fans' },
];
