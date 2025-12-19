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
  { id: '1', name: 'Team Alpha', color: '#F97316', whatsappGroup: '+447123456001' },
  { id: '2', name: 'Team Bravo', color: '#3B82F6', whatsappGroup: '+447123456002' },
  { id: '3', name: 'Team Charlie', color: '#10B981', whatsappGroup: '+447123456003' },
  { id: '4', name: 'Team Delta', color: '#8B5CF6', whatsappGroup: '+447123456004' },
  { id: '5', name: 'Team Echo', color: '#EC4899', whatsappGroup: '+447123456005' },
  { id: '6', name: 'Team Foxtrot', color: '#F59E0B', whatsappGroup: '+447123456006' },
];
