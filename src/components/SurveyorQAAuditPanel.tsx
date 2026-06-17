// Surveyor QA Audit Panel — visualises the independent senior-surveyor audit of a
// Convert AI tier. Renders score gauges, decision badge, and every diagnostic bucket
// (missing / hallucinated / merged / location errors / better-code recommendations…).
import { SurveyorQAAudit } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ShieldCheck, ShieldAlert, AlertTriangle, CheckCircle2, XCircle, ListChecks } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  audit: SurveyorQAAudit;
}

const Section = ({ title, items, tone = 'neutral', renderItem }: {
  title: string;
  items: any[] | undefined;
  tone?: 'good' | 'bad' | 'warn' | 'neutral';
  renderItem?: (it: any, i: number) => React.ReactNode;
}) => {
  if (!items || items.length === 0) return null;
  const toneClass = tone === 'good' ? 'border-emerald-500/40 bg-emerald-500/5'
    : tone === 'bad' ? 'border-destructive/40 bg-destructive/5'
    : tone === 'warn' ? 'border-amber-500/40 bg-amber-500/5'
    : 'border-border bg-card';
  return (
    <div className={cn('rounded-md border p-3', toneClass)}>
      <div className="text-xs font-semibold mb-2 flex items-center gap-1.5">
        <ListChecks className="w-3.5 h-3.5" /> {title}
        <Badge variant="outline" className="text-[10px] ml-1">{items.length}</Badge>
      </div>
      <ul className="space-y-1 text-xs">
        {items.map((it, i) => (
          <li key={i} className="leading-snug">
            {renderItem ? renderItem(it, i) : <span>• {String(it)}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
};

const ScoreBar = ({ label, value }: { label: string; value: number }) => {
  const v = Math.max(0, Math.min(100, Math.round(value || 0)));
  const color = v >= 85 ? 'bg-emerald-500' : v >= 70 ? 'bg-blue-500' : v >= 50 ? 'bg-amber-500' : 'bg-destructive';
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[11px]"><span className="text-muted-foreground">{label}</span><span className="font-semibold">{v}%</span></div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={cn('h-full transition-all', color)} style={{ width: `${v}%` }} />
      </div>
    </div>
  );
};

export const SurveyorQAAuditPanel = ({ audit }: Props) => {
  const s = audit.scores || {};
  const decision = audit.decision || 'REJECTED';
  const approved = decision === 'APPROVED';
  return (
    <ScrollArea className="h-[60vh] min-h-0 pr-3">
      <div className="space-y-3">
        {/* Header: decision + summary */}
        <div className={cn('rounded-lg border p-3 flex items-start gap-3',
          approved ? 'border-emerald-500/50 bg-emerald-500/10' : 'border-destructive/50 bg-destructive/10')}>
          {approved
            ? <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
            : <XCircle className="w-6 h-6 text-destructive shrink-0 mt-0.5" />}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className={cn('font-bold', approved ? 'bg-emerald-600 text-white' : 'bg-destructive text-white')}>
                {decision}
              </Badge>
              {typeof s.overall === 'number' && (
                <Badge variant="outline" className="font-semibold">Overall {Math.round(s.overall)}%</Badge>
              )}
            </div>
            {audit.summary && <p className="text-xs mt-2 leading-snug">{audit.summary}</p>}
          </div>
        </div>

        {/* Scores */}
        <div className="rounded-md border border-border p-3 grid grid-cols-2 sm:grid-cols-3 gap-3">
          <ScoreBar label="Scope" value={s.scope ?? 0} />
          <ScoreBar label="Task" value={s.task ?? 0} />
          <ScoreBar label="SOR" value={s.sor ?? 0} />
          <ScoreBar label="Quantity" value={s.quantity ?? 0} />
          <ScoreBar label="Commercial" value={s.commercial ?? 0} />
          <ScoreBar label="Overall" value={s.overall ?? 0} />
        </div>

        {/* Independent surveyor view */}
        {audit.independentUnderstanding && (
          <div className="rounded-md border border-border p-3 space-y-1.5">
            <div className="text-xs font-semibold flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-primary" /> Independent Surveyor Understanding
            </div>
            {audit.independentUnderstanding.rootCause && (
              <p className="text-xs"><span className="font-medium">Root cause:</span> {audit.independentUnderstanding.rootCause}</p>
            )}
            {audit.independentUnderstanding.consequentialDamage && (
              <p className="text-xs"><span className="font-medium">Consequential damage:</span> {audit.independentUnderstanding.consequentialDamage}</p>
            )}
            {audit.independentUnderstanding.ownScope && audit.independentUnderstanding.ownScope.length > 0 && (
              <div className="text-xs">
                <span className="font-medium">QA's own scope ({audit.independentUnderstanding.ownScope.length} tasks):</span>
                <ul className="list-disc list-inside mt-1 space-y-0.5">
                  {audit.independentUnderstanding.ownScope.map((t, i) => <li key={i}>{t}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Required corrections — most actionable, near the top */}
        {audit.requiredCorrections && audit.requiredCorrections.length > 0 && (
          <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3">
            <div className="text-xs font-semibold flex items-center gap-1.5 text-amber-700 mb-2">
              <AlertTriangle className="w-3.5 h-3.5" /> Required Corrections Before Approval
              <Badge variant="outline" className="text-[10px] ml-1">{audit.requiredCorrections.length}</Badge>
            </div>
            <ol className="list-decimal list-inside text-xs space-y-1">
              {audit.requiredCorrections.map((c, i) => <li key={i} className="leading-snug">{c}</li>)}
            </ol>
          </div>
        )}

        <Section title="Correct Tasks" items={audit.correctTasks} tone="good" />
        <Section title="Missing Tasks" items={audit.missingTasks} tone="bad" />
        <Section title="Hallucinated Tasks (not in source)" items={audit.hallucinatedTasks} tone="bad" />
        <Section title="Duplicated Tasks" items={audit.duplicatedTasks} tone="warn" />
        <Section title="Merged Tasks" items={audit.mergedTasks} tone="warn" />
        <Section title="Preparation Works Missed" items={audit.preparationWorksMissed} tone="warn" />
        <Section title="Consequential Repairs Missed" items={audit.consequentialRepairsMissed} tone="warn" />
        <Section title="Location Errors" items={audit.locationErrors} tone="bad" />
        <Section title="Quantity Errors" items={audit.quantityErrors} tone="bad" />

        <Section
          title="Code Challenges"
          items={audit.codeChallenges}
          tone="warn"
          renderItem={(it) => (
            <div>
              <Badge variant="secondary" className="font-mono text-[10px] mr-1">{it.code}</Badge>
              <span className="text-muted-foreground">{it.line}</span>
              <div className="text-[11px] italic mt-0.5">{it.issue}</div>
            </div>
          )}
        />

        <Section
          title="Better Code Recommendations"
          items={audit.betterCodeRecommendations}
          tone="good"
          renderItem={(it) => (
            <div>
              <span className="text-[11px]">
                <Badge variant="outline" className="font-mono text-[10px] line-through mr-1">{it.currentCode}</Badge>
                →
                <Badge variant="secondary" className="font-mono text-[10px] ml-1">{it.recommendedCode}</Badge>
              </span>
              {it.line && <div className="text-muted-foreground text-[11px] mt-0.5">{it.line}</div>}
              <div className="text-[11px] italic mt-0.5">{it.reason}</div>
            </div>
          )}
        />

        <Section
          title="Commercial Risks"
          items={audit.commercialRisks}
          tone="warn"
          renderItem={(it) => (
            <div>
              <Badge variant="outline" className={cn('text-[10px] mr-1',
                it.impact === 'CRITICAL' ? 'bg-destructive text-white border-destructive' :
                it.impact === 'HIGH' ? 'bg-amber-500 text-white border-amber-500' :
                it.impact === 'MEDIUM' ? 'bg-blue-500 text-white border-blue-500' :
                'bg-muted text-muted-foreground')}>{it.impact}</Badge>
              <span>{it.issue}</span>
            </div>
          )}
        />

        <Section
          title="Revenue Leakage"
          items={audit.revenueLeakage}
          tone="warn"
          renderItem={(it) => (
            <div>
              <Badge variant="outline" className={cn('text-[10px] mr-1',
                it.estimatedImpact === 'CRITICAL' ? 'bg-destructive text-white border-destructive' :
                it.estimatedImpact === 'HIGH' ? 'bg-amber-500 text-white border-amber-500' :
                it.estimatedImpact === 'MEDIUM' ? 'bg-blue-500 text-white border-blue-500' :
                'bg-muted text-muted-foreground')}>{it.estimatedImpact}</Badge>
              <span>{it.missedActivity}</span>
            </div>
          )}
        />
      </div>
    </ScrollArea>
  );
};
