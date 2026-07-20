import { RoadmapItem } from '@/hooks/useRoadmaps';
import { parseLocalDate, toISODate } from '@/lib/roadmapUtils';

type ContractorTask = {
  label: string;
  startPct: number;
  endPct: number;
  color: string;
  symbol?: string;
  assigned_team?: string;
  notes: string;
  is_milestone?: boolean;
};

const CONTRACTOR_TASKS: ContractorTask[] = [
  { label: 'Site setup, survey & procurement', startPct: 0, endPct: 0.05, color: '#2563eb', symbol: '📅', assigned_team: 'Project lead', notes: 'Confirm scope, protect areas and order long-lead materials before strip-out accelerates.' },
  { label: 'Strip-out and protection works', startPct: 0, endPct: 0.12, color: '#475569', symbol: '🚧', assigned_team: 'General builder', notes: 'First operation; clears access for structural, roofing and first-fix trades.' },
  { label: 'Roofing / external watertight works', startPct: 0, endPct: 0.17, color: '#ea580c', symbol: '🏠', assigned_team: 'Roofing', notes: 'Front-loaded because weather-sensitive work must be secure before internal finishes.' },
  { label: 'Structural openings and repairs', startPct: 0.08, endPct: 0.22, color: '#92400e', symbol: '🧱', assigned_team: 'Builder', notes: 'Runs after initial strip-out; must finish before boarding, plaster and finishes.' },
  { label: 'Watertight milestone', startPct: 0.18, endPct: 0.18, color: '#16a34a', symbol: '✅', assigned_team: 'Project lead', notes: 'Roof and external envelope ready for internal trades.', is_milestone: true },
  { label: 'Damp proofing / tanking', startPct: 0.16, endPct: 0.25, color: '#0d9488', symbol: '💧', assigned_team: 'Damp specialist', notes: 'Scheduled early to allow curing before plaster and decoration.' },
  { label: '1st fix plumbing', startPct: 0.22, endPct: 0.34, color: '#0d9488', symbol: '🚿', assigned_team: 'Plumbing', notes: 'Runs in parallel with 1st fix electrics and carpentry after strip-out.' },
  { label: '1st fix electrics', startPct: 0.22, endPct: 0.34, color: '#d97706', symbol: '⚡', assigned_team: 'Electrical', notes: 'Parallel first-fix service route before close-up and plastering.' },
  { label: '1st fix carpentry / studwork', startPct: 0.25, endPct: 0.38, color: '#92400e', symbol: '🪚', assigned_team: 'Carpentry', notes: 'Frames, grounds and studwork must be ready before boarding.' },
  { label: 'Insulation and boarding', startPct: 0.36, endPct: 0.45, color: '#65a30d', symbol: '🛠️', assigned_team: 'General builder', notes: 'Closes up first-fix areas once services are inspected.' },
  { label: 'Plastering / making good', startPct: 0.43, endPct: 0.55, color: '#475569', symbol: '🧱', assigned_team: 'Plastering', notes: 'Follows first-fix and boarding; creates the finished substrate.' },
  { label: 'Plaster drying hold point', startPct: 0.56, endPct: 0.62, color: '#d97706', symbol: '⚠️', assigned_team: 'Project lead', notes: 'Protected drying window before decoration and second-fix finishes.' },
  { label: '2nd fix plumbing', startPct: 0.62, endPct: 0.72, color: '#0d9488', symbol: '🚿', assigned_team: 'Plumbing', notes: 'Runs in parallel with electrical and carpentry second-fix.' },
  { label: '2nd fix electrics', startPct: 0.62, endPct: 0.72, color: '#d97706', symbol: '🔌', assigned_team: 'Electrical', notes: 'Second-fix accessories, test preparation and final connections.' },
  { label: '2nd fix carpentry / doors', startPct: 0.62, endPct: 0.75, color: '#92400e', symbol: '🚪', assigned_team: 'Carpentry', notes: 'Doors, architraves, skirtings and ironmongery after plastering.' },
  { label: 'Kitchen installation', startPct: 0.66, endPct: 0.80, color: '#16a34a', symbol: '🛠️', assigned_team: 'Kitchen fitter', notes: 'Can overlap bathroom works where rooms are separate.' },
  { label: 'Bathroom installation', startPct: 0.66, endPct: 0.82, color: '#2563eb', symbol: '🚿', assigned_team: 'Bathroom fitter', notes: 'Follows first-fix and plaster; overlaps kitchen to protect deadline.' },
  { label: 'Tiling, grout and silicone', startPct: 0.75, endPct: 0.86, color: '#7c3aed', symbol: '🧱', assigned_team: 'Tiling', notes: 'After bathroom/kitchen fit-out surfaces are ready.' },
  { label: 'Decoration preparation / mist coat', startPct: 0.80, endPct: 0.88, color: '#db2777', symbol: '🎨', assigned_team: 'Decorating', notes: 'After plaster dry; prepares surfaces before final coats.' },
  { label: 'Final painting and decoration', startPct: 0.86, endPct: 0.96, color: '#db2777', symbol: '🎨', assigned_team: 'Decorating', notes: 'Late-stage finish before flooring where possible.' },
  { label: 'Flooring preparation and install', startPct: 0.92, endPct: 0.99, color: '#7c3aed', symbol: '🪜', assigned_team: 'Flooring', notes: 'Kept late to avoid damage from decorating and second-fix activity.' },
  { label: 'Snagging, clean and handover', startPct: 0.96, endPct: 1, color: '#16a34a', symbol: '✅', assigned_team: 'Project lead', notes: 'Final quality checks, cleaning and handover before the deadline.' },
];

const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

export const generateContractorRoadmapItems = (roadmapStart: string, roadmapEnd: string): Partial<RoadmapItem>[] => {
  const start = parseLocalDate(roadmapStart);
  const end = parseLocalDate(roadmapEnd);
  const totalDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);
  const maxOffset = Math.max(0, totalDays - 1);

  return CONTRACTOR_TASKS.map((task, index) => {
    const startOffset = Math.min(maxOffset, Math.max(0, Math.round(maxOffset * task.startPct)));
    const endOffset = Math.min(maxOffset, Math.max(startOffset, Math.round(maxOffset * task.endPct)));

    return {
      label: task.label.slice(0, 60),
      start_date: toISODate(addDays(start, startOffset)),
      end_date: toISODate(addDays(start, task.is_milestone ? startOffset : endOffset)),
      color: task.color,
      symbol: task.symbol || '',
      sort_order: (index + 1) * 10,
      notes: task.notes,
      progress: 0,
      assigned_team: task.assigned_team || null,
      is_milestone: !!task.is_milestone,
      notify_on_start: false,
      notify_on_end: false,
      notify_lead_minutes: 0,
      collapsed: false,
    };
  });
};