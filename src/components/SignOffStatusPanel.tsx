import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Clock, Users, Briefcase, Shield } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import type { SignOffRow } from '@/hooks/useSignOffStatus';
import type { BulkExternalAssignee } from '@/hooks/useJobsExternalAssigneesBulk';

interface Props {
  team1?: string | null;
  team2?: string | null;
  externals: BulkExternalAssignee[];
  signOffRows: SignOffRow[];
  onClick?: () => void;
  className?: string;
}

/**
 * Renders the sign-off state for a job's Status column:
 *  - No parties assigned         -> renders nothing
 *  - 0 signed                    -> compact "Awaiting sign-off · 0/N"
 *  - Some signed (partial)       -> "Partial X/N" pill + per-party chips (✓ / ⏳)
 *  - All signed                  -> single "ALL SIGNED OFF · date" green pill
 *
 * A party = each assigned team (team1, team2) + each external assignee.
 * A team is "signed" when team_sign_offs has a row with on_behalf_of='team' (or NULL legacy) matching team_name.
 * An external is "signed" when team_sign_offs has a row with on_behalf_of='external' and matching external_assignee_id.
 */
export const SignOffStatusPanel = ({
  team1, team2, externals, signOffRows, onClick, className,
}: Props) => {
  const teams = [team1, team2].filter(Boolean) as string[];
  const totalParties = teams.length + externals.length;
  if (totalParties === 0) return null;

  // Build a per-party signed map
  const teamSignedAt = new Map<string, { date: string; admin: boolean }>();
  const extSignedAt = new Map<string, { date: string; admin: boolean }>();
  for (const r of signOffRows) {
    const isExternal = r.on_behalf_of === 'external';
    if (isExternal && r.external_assignee_id) {
      const existing = extSignedAt.get(r.external_assignee_id);
      if (!existing || r.signed_off_at > existing.date) {
        extSignedAt.set(r.external_assignee_id, { date: r.signed_off_at, admin: !!r.signed_off_by_admin });
      }
    } else if (r.team_name) {
      // Treat NULL on_behalf_of as legacy team sign-off
      const existing = teamSignedAt.get(r.team_name);
      if (!existing || r.signed_off_at > existing.date) {
        teamSignedAt.set(r.team_name, { date: r.signed_off_at, admin: !!r.signed_off_by_admin });
      }
    }
  }

  const teamsSigned = teams.filter(t => teamSignedAt.has(t)).length;
  const extsSigned = externals.filter(e => extSignedAt.has(e.id)).length;
  const totalSigned = teamsSigned + extsSigned;
  const allSigned = totalSigned === totalParties;
  const noneSigned = totalSigned === 0;

  // ===== All signed: single celebratory pill =====
  if (allSigned) {
    // Latest sign-off date across all parties
    let latest = '';
    for (const v of teamSignedAt.values()) if (v.date > latest) latest = v.date;
    for (const v of extSignedAt.values()) if (v.date > latest) latest = v.date;
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'mt-1 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
          'bg-emerald-500 text-white shadow-sm hover:bg-emerald-600 transition-colors',
          className
        )}
        title={`All ${totalParties} ${totalParties === 1 ? 'party' : 'parties'} signed off`}
      >
        <CheckCircle2 className="h-3 w-3" />
        <span>All Signed Off</span>
        {latest && (
          <span className="font-mono font-normal opacity-90">· {format(new Date(latest), 'dd/MM/yy')}</span>
        )}
      </button>
    );
  }

  // ===== Header pill =====
  const header = (
    <div
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
        noneSigned
          ? 'bg-muted text-muted-foreground'
          : 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30'
      )}
      title={noneSigned ? 'Awaiting sign-off' : `Partial sign-off: ${totalSigned} of ${totalParties}`}
    >
      {noneSigned ? <Clock className="h-2.5 w-2.5" /> : <CheckCircle2 className="h-2.5 w-2.5" />}
      <span>{noneSigned ? 'Awaiting' : 'Partial'} {totalSigned}/{totalParties}</span>
    </div>
  );

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'mt-1 flex flex-col items-start gap-0.5 max-w-full text-left',
        onClick && 'cursor-pointer hover:opacity-90',
        className
      )}
      title="View sign-off history"
    >
      {header}
      <div className="flex flex-wrap items-center gap-0.5">
        {teams.map(t => {
          const signed = teamSignedAt.get(t);
          return (
            <span
              key={`t-${t}`}
              className={cn(
                'inline-flex items-center gap-0.5 rounded px-1 py-px text-[9px] font-medium border',
                signed
                  ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30'
                  : 'bg-muted text-muted-foreground border-border'
              )}
              title={signed ? `${t} signed off ${format(new Date(signed.date), 'dd/MM/yy HH:mm')}${signed.admin ? ' (admin override)' : ''}` : `${t} pending`}
            >
              {signed?.admin ? <Shield className="h-2 w-2" /> : <Users className="h-2 w-2" />}
              <span className="truncate max-w-[70px]">{t}</span>
              {signed ? <CheckCircle2 className="h-2 w-2" /> : <Clock className="h-2 w-2" />}
            </span>
          );
        })}
        {externals.map(e => {
          const signed = extSignedAt.get(e.id);
          return (
            <span
              key={`e-${e.id}`}
              className={cn(
                'inline-flex items-center gap-0.5 rounded px-1 py-px text-[9px] font-medium border',
                signed
                  ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30'
                  : 'bg-slate-200/60 dark:bg-slate-700/40 text-slate-700 dark:text-slate-300 border-slate-400/40'
              )}
              title={signed
                ? `${e.name} signed off ${format(new Date(signed.date), 'dd/MM/yy HH:mm')} (admin)`
                : `${e.name}${e.company ? ` · ${e.company}` : ''} (external) — pending`}
            >
              <Briefcase className="h-2 w-2" />
              <span className="truncate max-w-[70px]">{e.name}</span>
              {signed ? <CheckCircle2 className="h-2 w-2" /> : <Clock className="h-2 w-2" />}
            </span>
          );
        })}
      </div>
    </button>
  );
};
