import { cn } from '@/lib/utils';

/**
 * Maps a CONTROL problem_type (free-form / from PROBLEM_TYPES) to a single emoji icon.
 * Kept resilient to wording variations.
 */
export function problemTypeIcon(problemType: string | null | undefined): string | null {
  if (!problemType) return null;
  const p = problemType.toLowerCase();
  if (p.includes('tenant')) return '📞';
  if (p.includes('trade')) return '🔧';
  if (p.includes('upload')) return '📸';
  if (p.includes('complaint')) return '⚠️';
  if (p.includes('delay') || p.includes('access')) return '⏱';
  if (p.includes('variation')) return '🧾';
  if (p.includes('performance')) return '🚩';
  return '•';
}

export const STATUS_DOT: Record<string, string> = {
  Open: 'bg-red-500',
  'In Progress': 'bg-amber-500',
  Waiting: 'bg-slate-400',
  Completed: 'bg-emerald-500',
};

export function ProblemTypeBadge({
  problemType,
  status,
  className,
}: {
  problemType: string | null | undefined;
  status?: string | null;
  className?: string;
}) {
  const icon = problemTypeIcon(problemType);
  if (!icon) return null;
  return (
    <span
      title={`Problem: ${problemType}${status ? ` · ${status}` : ''}`}
      className={cn(
        'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold border',
        status === 'Completed'
          ? 'bg-emerald-50 border-emerald-300 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300'
          : 'bg-red-50 border-red-300 text-red-700 dark:bg-red-950/30 dark:text-red-300',
        className,
      )}
    >
      <span className="text-[12px] leading-none">{icon}</span>
      {status && (
        <span
          className={cn('h-1.5 w-1.5 rounded-full', STATUS_DOT[status] || 'bg-muted-foreground')}
        />
      )}
    </span>
  );
}
