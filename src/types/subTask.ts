export type SubTaskStatus =
  | 'not_scheduled'
  | 'scheduled'
  | 'awaiting_materials'
  | 'access_issue'
  | 'in_progress'
  | 'completed_awaiting_portal'
  | 'completed_signed_off';

export const SUB_TASK_STATUS_OPTIONS: { value: SubTaskStatus; label: string; color: string }[] = [
  { value: 'not_scheduled', label: 'Not Scheduled', color: '#6B7280' },
  { value: 'scheduled', label: 'Scheduled', color: '#3B82F6' },
  { value: 'awaiting_materials', label: 'Awaiting Materials', color: '#F59E0B' },
  { value: 'access_issue', label: 'Access Issue', color: '#EF4444' },
  { value: 'in_progress', label: 'In Progress', color: '#8B5CF6' },
  { value: 'completed_awaiting_portal', label: 'Completed – Awaiting Portal Update', color: '#06B6D4' },
  { value: 'completed_signed_off', label: 'Completed – Signed Off', color: '#10B981' },
];

export interface SubTask {
  id: string;
  parentJobId: string;
  trade: string;
  assignedTeam: string | null;
  tenantName: string | null;
  propertyAddress: string | null;
  description: string | null;
  photos: string[];
  bookedDate: Date | null;
  deadlineDate: Date | null;
  completionDate: Date | null;
  status: SubTaskStatus;
  portalUpdated: boolean;
  signedOff: boolean;
  notes: string;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export const DEFAULT_TRADES = [
  'Roofing',
  'UPVC Doors',
  'UPVC Windows',
  'Polysafe Flooring',
  'Plastering',
  'Electrical',
  'Plumbing',
  'Decoration',
  'Other',
];

export function mapDbSubTask(row: any): SubTask {
  return {
    id: row.id,
    parentJobId: row.parent_job_id,
    trade: row.trade,
    assignedTeam: row.assigned_team,
    tenantName: row.tenant_name,
    propertyAddress: row.property_address,
    description: row.description,
    photos: row.photos || [],
    bookedDate: row.booked_date ? new Date(row.booked_date) : null,
    deadlineDate: row.deadline_date ? new Date(row.deadline_date) : null,
    completionDate: row.completion_date ? new Date(row.completion_date) : null,
    status: row.status as SubTaskStatus,
    portalUpdated: row.portal_updated || false,
    signedOff: row.signed_off || false,
    notes: row.notes || '',
    createdBy: row.created_by,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}
