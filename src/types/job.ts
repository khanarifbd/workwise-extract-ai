export interface WorkItem {
  id: string;
  description: string;
  sorCode: string;
  qty: number;
  cost: number;
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
  | 'started';

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
];

export interface FanInfo {
  type: string;
  quantity: number;
  location: string;
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
  progress: number;
  progressNotes: string;
  isCompleted: boolean;
  dateIssued: Date;
  bookedDate: Date | null;
  startDate: Date | null;
  completionDate: Date | null;
  attachments: Attachment[];
  status: JobStatus;
  fanInfo: FanInfo[] | null;
  linkedFanJobId: string | null;
}

export interface Attachment {
  id: string;
  name: string;
  type: 'image' | 'video' | 'document';
  url: string; // For backward compatibility - may be public URL or signed URL
  path?: string; // Storage path for generating signed URLs
  uploadedAt: Date;
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
  { id: '3', name: 'Shakhti', color: '#10B981', whatsappGroup: 'shakhti-team' },
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
