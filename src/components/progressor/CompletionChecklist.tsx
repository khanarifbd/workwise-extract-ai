import { Check, X, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ClosureCheck {
  key: string;
  label: string;
  ok: boolean;
}

interface Props {
  checks: ClosureCheck[];
  className?: string;
}

/**
 * Visual checklist shown ABOVE the Sign Off / Close Job button.
 * When any item fails, the parent disables the Close button and shows the red banner.
 */
export function CompletionChecklist({ checks, className }: Props) {
  const allOk = checks.every((c) => c.ok);
  return (
    <div
      className={cn(
        'rounded-lg border p-3 space-y-2 text-xs',
        allOk
          ? 'border-emerald-300 bg-emerald-50/40 dark:bg-emerald-950/20'
          : 'border-red-400 bg-red-50/60 dark:bg-red-950/30',
        className,
      )}
    >
      <div
        className={cn(
          'flex items-center gap-2 font-bold uppercase tracking-wide',
          allOk ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300',
        )}
      >
        <ShieldAlert className="h-4 w-4" />
        {allOk ? 'Ready to Close — All Checks Passed' : '🔴 Job Cannot Be Closed — Incomplete Data'}
      </div>
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        {checks.map((c) => (
          <li
            key={c.key}
            className={cn(
              'flex items-center gap-2 rounded-md px-2 py-1',
              c.ok ? 'bg-emerald-100/60 dark:bg-emerald-900/30' : 'bg-red-100/60 dark:bg-red-900/30',
            )}
          >
            {c.ok ? (
              <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
            ) : (
              <X className="h-3.5 w-3.5 text-red-600 shrink-0" />
            )}
            <span
              className={cn(
                'font-medium',
                c.ok ? 'text-emerald-800 dark:text-emerald-200' : 'text-red-800 dark:text-red-200',
              )}
            >
              {c.label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
