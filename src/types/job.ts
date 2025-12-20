export interface WorkItem {
  id: string;
  description: string;
  sorCode: string;
  qty: number;
  cost: number;
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
  startDate: Date | null;
  completionDate: Date | null;
  attachments: Attachment[];
}

export interface Attachment {
  id: string;
  name: string;
  type: 'image' | 'video' | 'document';
  url: string;
  uploadedAt: Date;
}

export interface Team {
  id: string;
  name: string;
  color: string;
  whatsappGroup?: string;
}

export const ALLSAINTS_TEAMS: Team[] = [
  { id: '1', name: 'Indika', color: '#F97316' },
  { id: '2', name: 'Bartek', color: '#3B82F6' },
  { id: '3', name: 'Shakhti', color: '#10B981' },
  { id: '4', name: 'Abraham', color: '#8B5CF6' },
  { id: '5', name: 'Jess', color: '#EC4899' },
  { id: '6', name: 'Alindo', color: '#F59E0B' },
];
