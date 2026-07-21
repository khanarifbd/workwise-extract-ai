import { useState } from 'react';
import { WorkItem } from '@/types/job';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Wand2, Loader2, X, Check, BookOpen, ShieldCheck, AlertTriangle, Sparkles, Download, ThumbsUp, ThumbsDown, Minus, GraduationCap, Gavel, FileWarning } from 'lucide-react';
import { convertDescriptionToTieredQuotes, ConvertResponse, ConvertTier, submitSORMatchFeedback, SORMatchRating, runSurveyorQAAudit, SurveyorQAAudit } from '@/lib/api';
import { exportConversionValidationPDF } from '@/lib/conversionValidationReport';
import { useToast } from '@/hooks/use-toast';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { cn } from '@/lib/utils';
import { SORCodeBookManager } from './SORCodeBookManager';
import { SORTrainingLoop } from './SORTrainingLoop';
import { SurveyorQAAuditPanel } from './SurveyorQAAuditPanel';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

interface AIWorkConverterProps {
  onConvert: (workItems: WorkItem[], replaceExisting?: boolean, descriptionUsed?: string) => void;
  onClose: () => void;
  existingWorks?: WorkItem[];
  initialDescription?: string;
  initialMinimumCost?: string;
  ongoingNotes?: string;
  progressNotes?: string;
}

type TierKey = 'baseline' | 'enhanced' | 'premium';
const TIER_META: Record<TierKey, { label: string; color: string; ring: string; description: string }> = {
  baseline: { label: 'Baseline', color: 'bg-blue-500/10 text-blue-600 border-blue-500/30', ring: 'ring-blue-500', description: 'Minimum compliant scope' },
  enhanced: { label: 'Enhanced', color: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30', ring: 'ring-emerald-500', description: 'Standard NPH scope (~+20%)' },
  premium:  { label: 'Premium',  color: 'bg-amber-500/10 text-amber-600 border-amber-500/30',     ring: 'ring-amber-500',  description: 'Full scope with allied works (~+45%)' },
};

export const AIWorkConverter = ({ onConvert, onClose, existingWorks, initialDescription, initialMinimumCost, ongoingNotes, progressNotes }: AIWorkConverterProps) => {
  const [description, setDescription] = useState(initialDescription ?? '');
  const [minimumCost, setMinimumCost] = useState<string>(initialMinimumCost ?? '');
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<ConvertResponse | null>(null);
  const [selectedTier, setSelectedTier] = useState<TierKey>('baseline');
  const [showBooks, setShowBooks] = useState(false);
  const [showTraining, setShowTraining] = useState(false);
  const hasExisting = !!(existingWorks && existingWorks.length > 0);
  const [incorporateExisting, setIncorporateExisting] = useState<boolean>(hasExisting);
  const hasOngoing = !!(ongoingNotes && ongoingNotes.trim().length > 0);
  const hasProgress = !!(progressNotes && progressNotes.trim().length > 0);
  const [includeOngoing, setIncludeOngoing] = useState<boolean>(hasOngoing);
  const [includeProgress, setIncludeProgress] = useState<boolean>(hasProgress);
  // Per-line feedback: keyed by `${tier}::${index}` so each tier is rated independently.
  const [feedback, setFeedback] = useState<Record<string, SORMatchRating>>({});
  const [feedbackSubmitting, setFeedbackSubmitting] = useState<Record<string, boolean>>({});
  const [feedbackNotes, setFeedbackNotes] = useState<Record<string, string>>({});
  const [noteSaved, setNoteSaved] = useState<Record<string, boolean>>({});
  // Surveyor QA Audit — independent auditor that challenges Convert AI output per tier.
  const [qaAudit, setQaAudit] = useState<SurveyorQAAudit | null>(null);
  const [qaTierAudited, setQaTierAudited] = useState<TierKey | null>(null);
  const [qaRunning, setQaRunning] = useState(false);
  const [qaOpen, setQaOpen] = useState(false);
  const { toast } = useToast();
  const { isAdmin } = useAdminAuth();

  const rateMatch = async (tier: TierKey, index: number, rating: SORMatchRating) => {
    if (!result) return;
    const key = `${tier}::${index}`;
    const item = result.tiers[tier].items[index];
    if (!item) return;
    setFeedbackSubmitting((s) => ({ ...s, [key]: true }));
    try {
      await submitSORMatchFeedback({
        sourceDescription: description,
        lineDescription: item.description,
        sorCode: item.code,
        rating,
        tier,
        confidence: (item as any).confidence,
        rationale: (item as any).rationale,
        note: feedbackNotes[key]?.trim() || undefined,
      });
      setFeedback((f) => ({ ...f, [key]: rating }));
      setNoteSaved((s) => ({ ...s, [key]: !!feedbackNotes[key]?.trim() }));
      toast({ title: `Rated ${rating}`, description: 'Add a refinement note below to teach the AI exactly why.' });
    } catch (e: any) {
      toast({ title: 'Could not save rating', description: e?.message || 'Try again.', variant: 'destructive' });
    } finally {
      setFeedbackSubmitting((s) => ({ ...s, [key]: false }));
    }
  };

  const saveNote = async (tier: TierKey, index: number) => {
    if (!result) return;
    const key = `${tier}::${index}`;
    const note = (feedbackNotes[key] || '').trim();
    const rating = feedback[key];
    if (!note || !rating) return;
    const item = result.tiers[tier].items[index];
    if (!item) return;
    setFeedbackSubmitting((s) => ({ ...s, [key]: true }));
    try {
      await submitSORMatchFeedback({
        sourceDescription: description,
        lineDescription: item.description,
        sorCode: item.code,
        rating,
        tier,
        confidence: (item as any).confidence,
        rationale: (item as any).rationale,
        note,
      });
      setNoteSaved((s) => ({ ...s, [key]: true }));
      toast({ title: 'Refinement saved', description: 'Your note will guide future SOR matches.' });
    } catch (e: any) {
      toast({ title: 'Could not save note', description: e?.message || 'Try again.', variant: 'destructive' });
    } finally {
      setFeedbackSubmitting((s) => ({ ...s, [key]: false }));
    }
  };

  // Run the independent Surveyor QA Agent against the currently-selected tier.
  const runQAAudit = async () => {
    if (!result) return;
    const tier = result.tiers[selectedTier];
    if (!tier || tier.items.length === 0) {
      toast({ title: 'Nothing to audit', description: 'Generate a tier first.', variant: 'destructive' });
      return;
    }
    setQaRunning(true);
    setQaOpen(true);
    setQaAudit(null);
    setQaTierAudited(selectedTier);
    try {
      const audit = await runSurveyorQAAudit({
        description,
        tier: TIER_META[selectedTier].label,
        items: tier.items.map((it) => ({
          description: it.description,
          code: it.code,
          qty: it.qty,
          cost: it.cost,
          confidence: (it as any).confidence,
          rationale: (it as any).rationale,
        })),
      });
      setQaAudit(audit);
      toast({
        title: `QA ${audit.decision || 'Complete'}`,
        description: audit.summary?.slice(0, 140) || 'Independent surveyor review finished.',
        variant: audit.decision === 'APPROVED' ? 'default' : 'destructive',
      });
    } catch (e: any) {
      toast({ title: 'QA audit failed', description: e?.message || 'Try again.', variant: 'destructive' });
      setQaOpen(false);
    } finally {
      setQaRunning(false);
    }
  };

  const handleConvert = async () => {
    if (!description.trim()) return;
    setIsProcessing(true);
    try {
      const min = minimumCost.trim() ? Number(minimumCost) : undefined;
      const existingPayload = (incorporateExisting && hasExisting)
        ? existingWorks!.map((w) => ({
            description: w.description || '',
            code: w.sorCode || undefined,
            qty: typeof w.qty === 'number' ? w.qty : 1,
            cost: typeof w.cost === 'number' ? w.cost : 0,
          }))
        : undefined;
      // Augment description with optional ongoing/progress context.
      const extras: string[] = [];
      if (includeOngoing && hasOngoing) extras.push(`ONGOING NOTES / REASON (admin):\n${ongoingNotes!.trim()}`);
      if (includeProgress && hasProgress) extras.push(`TEAM PROGRESS NOTES (from portal):\n${progressNotes!.trim()}`);
      const fullDescription = extras.length > 0
        ? `${description.trim()}\n\n---\n${extras.join('\n\n')}`
        : description;
      const res = await convertDescriptionToTieredQuotes(fullDescription, min, existingPayload);
      setResult(res);
      setSelectedTier('baseline');
      if (res.codeSource === 'fallback') {
        toast({ title: 'Using fallback codes', description: 'No NPH SOR books uploaded — used built-in catalogue. Upload approved PDFs for full accuracy.', variant: 'destructive' });
      }
      // PRIORITY 8 — auto-dispatch the independent Surveyor QA Agent against the baseline tier.
      // Runs in the background; the user can open the QA dialog whenever they want.
      const baseline = res.tiers.baseline;
      if (baseline && baseline.items.length > 0) {
        setQaTierAudited('baseline');
        setQaAudit(null);
        setQaRunning(true);
        runSurveyorQAAudit({
          description: fullDescription,
          tier: TIER_META.baseline.label,
          items: baseline.items.map((it) => ({
            description: it.description,
            code: it.code,
            qty: it.qty,
            cost: it.cost,
            confidence: (it as any).confidence,
            rationale: (it as any).rationale,
          })),
        })
          .then((audit) => {
            setQaAudit(audit);
            toast({
              title: `QA ${audit.decision || 'Complete'}`,
              description: audit.summary?.slice(0, 140) || 'Independent surveyor review finished.',
              variant: audit.decision === 'APPROVED' ? 'default' : 'destructive',
            });
          })
          .catch((e: any) => {
            console.warn('Auto QA audit failed', e?.message);
          })
          .finally(() => setQaRunning(false));
      }
    } catch (error) {
      console.error('Conversion error:', error);
      toast({
        title: 'Conversion Failed',
        description: error instanceof Error ? error.message : 'Could not convert description.',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirm = () => {
    if (!result) return;
    const tier = result.tiers[selectedTier];
    const workItems: WorkItem[] = tier.items.map((it) => {
      // AI returns `cost` as the LINE TOTAL (qty × unit price).
      // WorkItem.cost must be the UNIT price — the works table computes
      // line total as qty × cost. Storing the line total here caused the
      // saved works to be inflated by a factor of qty (e.g. a £642.96
      // line at qty 19 became £12,216 after save).
      const qty = typeof it.qty === 'number' && it.qty > 0 ? it.qty : 1;
      const lineTotal = typeof it.cost === 'number' ? it.cost : 0;
      const unitCost = Math.round((lineTotal / qty) * 100) / 100;
      return {
        id: crypto.randomUUID(),
        description: it.description,
        sorCode: it.code,
        qty,
        cost: unitCost,
      };
    });
    onConvert(workItems, incorporateExisting && hasExisting, description);
  };

  const handleSaveResults = () => {
    if (!result) return;
    const ts = new Date();
    const stamp = `${ts.getFullYear()}${String(ts.getMonth() + 1).padStart(2, '0')}${String(ts.getDate()).padStart(2, '0')}-${String(ts.getHours()).padStart(2, '0')}${String(ts.getMinutes()).padStart(2, '0')}`;
    const safeDesc = (description || 'conversion').replace(/[^a-z0-9]+/gi, '-').slice(0, 40).replace(/^-+|-+$/g, '') || 'conversion';

    // JSON — full payload
    const jsonPayload = {
      savedAt: ts.toISOString(),
      description,
      minimumCost: minimumCost ? Number(minimumCost) : 0,
      incorporatedExistingWorks: incorporateExisting && hasExisting ? existingWorks : null,
      includedOngoingNotes: includeOngoing && hasOngoing ? ongoingNotes : null,
      includedProgressNotes: includeProgress && hasProgress ? progressNotes : null,
      result,
    };
    const jsonBlob = new Blob([JSON.stringify(jsonPayload, null, 2)], { type: 'application/json' });
    const jsonUrl = URL.createObjectURL(jsonBlob);
    const a1 = document.createElement('a');
    a1.href = jsonUrl;
    a1.download = `sor-conversion-${safeDesc}-${stamp}.json`;
    document.body.appendChild(a1);
    a1.click();
    a1.remove();
    URL.revokeObjectURL(jsonUrl);

    // CSV — flat, NPH-ready (Tier, SOR Code, Description, Qty, Unit Cost, Line Total, Valid)
    const esc = (v: unknown) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines: string[] = [];
    lines.push('Tier,SOR Code,Description,Qty,Unit Cost (GBP),Line Total (GBP),Valid');
    (['baseline', 'enhanced', 'premium'] as TierKey[]).forEach((k) => {
      const tier = result.tiers[k];
      tier.items.forEach((it) => {
        const unit = it.qty > 0 ? it.cost / it.qty : it.cost;
        lines.push([
          TIER_META[k].label,
          esc(it.code),
          esc(it.description),
          it.qty,
          unit.toFixed(2),
          it.cost.toFixed(2),
          it.valid ? 'Y' : 'N',
        ].join(','));
      });
      lines.push([TIER_META[k].label, '', 'TIER TOTAL', '', '', tier.total.toFixed(2), ''].join(','));
      lines.push('');
    });
    const csvBlob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const csvUrl = URL.createObjectURL(csvBlob);
    const a2 = document.createElement('a');
    a2.href = csvUrl;
    a2.download = `sor-conversion-${safeDesc}-${stamp}.csv`;
    document.body.appendChild(a2);
    a2.click();
    a2.remove();
    URL.revokeObjectURL(csvUrl);

    toast({ title: 'Conversion saved', description: 'Downloaded JSON + CSV with all 3 tiers, codes, descriptions and costs.' });
  };


  const renderTierPanel = (key: TierKey, tier: ConvertTier) => {
    const meta = TIER_META[key];
    const acc = result?.accuracy[key];
    const review = result?.review?.review?.[key];
    return (
      <div className={cn('rounded-lg border p-4 space-y-3', selectedTier === key ? `ring-2 ${meta.ring} border-transparent` : 'border-border')}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge className={cn('font-semibold', meta.color)} variant="outline">{meta.label}</Badge>
            <span className="text-xs text-muted-foreground">{meta.description}</span>
          </div>
          <div className="flex items-center gap-2">
            {acc?.valid ? (
              <Badge variant="secondary" className="gap-1 text-xs"><ShieldCheck className="w-3 h-3 text-green-600" /> Codes verified</Badge>
            ) : (
              <Badge variant="destructive" className="gap-1 text-xs"><AlertTriangle className="w-3 h-3" /> {acc?.invalidCodes.length} invalid</Badge>
            )}
            {typeof review?.score === 'number' && (
              <Badge variant="outline" className="gap-1 text-xs">QS {review.score}/100</Badge>
            )}
          </div>
        </div>
        {tier.notes && <p className="text-xs text-muted-foreground italic">{tier.notes}</p>}
        {review?.issues?.length > 0 && (
          <div className="text-xs bg-amber-500/10 border border-amber-500/30 rounded-md p-2">
            <div className="font-medium text-amber-700 mb-1">Reviewer notes:</div>
            <ul className="list-disc list-inside space-y-0.5 text-amber-700/90">
              {review.issues.slice(0, 5).map((iss: string, i: number) => <li key={i}>{iss}</li>)}
            </ul>
          </div>
        )}
        <div className="space-y-2 max-h-[360px] overflow-y-auto">
          {tier.items.map((it, i) => {
            const conf = typeof (it as any).confidence === 'number' ? (it as any).confidence as number : null;
            const rationale = (it as any).rationale as string | undefined;
            const fbKey = `${key}::${i}`;
            const currentRating = feedback[fbKey];
            const submitting = !!feedbackSubmitting[fbKey];
            const confColor = conf == null ? 'bg-muted text-muted-foreground'
              : conf >= 85 ? 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30'
              : conf >= 65 ? 'bg-blue-500/15 text-blue-700 border-blue-500/30'
              : conf >= 45 ? 'bg-amber-500/15 text-amber-700 border-amber-500/30'
              : 'bg-destructive/15 text-destructive border-destructive/30';
            return (
              <div key={i} className={cn('flex flex-col gap-1.5 p-2.5 rounded-md border text-sm', it.valid ? 'border-border bg-card' : 'border-destructive/40 bg-destructive/5')}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="secondary" className="font-mono text-[10px]">{it.code}</Badge>
                      {it.qty > 1 && <span className="text-xs text-muted-foreground">× {it.qty}</span>}
                      {conf != null && (
                        <Badge variant="outline" className={cn('text-[10px] gap-1', confColor)} title="Model confidence this SOR code matches the task">
                          <ShieldCheck className="w-3 h-3" /> {conf}% match
                        </Badge>
                      )}
                      {!it.valid && <span className="text-xs text-destructive">unknown code</span>}
                    </div>
                    <p className="text-xs mt-1">{it.description}</p>
                    {(it as any).evidence && (
                      <p className="text-[11px] mt-1 leading-snug border-l-2 border-primary/40 pl-2 bg-primary/5 rounded-sm py-0.5">
                        <span className="font-medium text-primary/80">Evidence:</span>{' '}
                        <span className="italic">"{(it as any).evidence}"</span>
                      </p>
                    )}
                    {rationale && (
                      <p className="text-[11px] mt-1 text-muted-foreground italic leading-snug">
                        <span className="font-medium not-italic text-foreground/70">Why:</span> {rationale}
                      </p>
                    )}
                    {Array.isArray((it as any).alternativesConsidered) && (it as any).alternativesConsidered.length > 0 && (
                      <div className="text-[11px] mt-1 text-muted-foreground leading-snug">
                        <span className="font-medium text-foreground/70">Alternatives considered:</span>
                        <ul className="list-disc list-inside mt-0.5 space-y-0.5">
                          {(it as any).alternativesConsidered.slice(0, 3).map((a: any, ai: number) => (
                            <li key={ai}>
                              <span className="font-mono">{a.code}</span>
                              {a.reason ? ` — ${a.reason}` : ''}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                  <span className="font-semibold text-sm shrink-0">£{it.cost.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/50">
                  <span className="text-[10px] text-muted-foreground">Rate this match to train the AI:</span>
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm" variant={currentRating === 'good' ? 'default' : 'outline'}
                      disabled={submitting} onClick={() => rateMatch(key, i, 'good')}
                      className={cn('h-6 px-2 text-[10px] gap-1', currentRating === 'good' && 'bg-emerald-600 hover:bg-emerald-700 text-white')}
                    >
                      <ThumbsUp className="w-3 h-3" /> Good
                    </Button>
                    <Button
                      size="sm" variant={currentRating === 'fair' ? 'default' : 'outline'}
                      disabled={submitting} onClick={() => rateMatch(key, i, 'fair')}
                      className={cn('h-6 px-2 text-[10px] gap-1', currentRating === 'fair' && 'bg-amber-500 hover:bg-amber-600 text-white')}
                    >
                      <Minus className="w-3 h-3" /> Fair
                    </Button>
                    <Button
                      size="sm" variant={currentRating === 'bad' ? 'default' : 'outline'}
                      disabled={submitting} onClick={() => rateMatch(key, i, 'bad')}
                      className={cn('h-6 px-2 text-[10px] gap-1', currentRating === 'bad' && 'bg-destructive hover:bg-destructive/90 text-white')}
                    >
                      <ThumbsDown className="w-3 h-3" /> Bad
                    </Button>
                  </div>
                </div>
                {currentRating && (
                  <div className="flex items-start gap-2 pt-1">
                    <Textarea
                      value={feedbackNotes[fbKey] || ''}
                      onChange={(e) => { setFeedbackNotes((n) => ({ ...n, [fbKey]: e.target.value })); setNoteSaved((s) => ({ ...s, [fbKey]: false })); }}
                      placeholder={
                        currentRating === 'bad'
                          ? 'Why is this a bad match? e.g. "Wrong trade — this is a roofing job, not plumbing" or "Should be code XXXX for replace, not repair".'
                          : currentRating === 'fair'
                          ? 'What would make this match better? e.g. "Close, but the catalogue code for slate tiles fits better than concrete".'
                          : 'Add any refinement to reinforce this pairing (optional).'
                      }
                      className="min-h-[44px] text-[11px] flex-1"
                      maxLength={1000}
                    />
                    <Button
                      size="sm" variant="outline"
                      disabled={submitting || !(feedbackNotes[fbKey] || '').trim() || noteSaved[fbKey]}
                      onClick={() => saveNote(key, i)}
                      className="h-7 px-2 text-[10px] shrink-0"
                    >
                      {noteSaved[fbKey] ? 'Saved' : 'Save note'}
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-border">
          <span className="text-xs text-muted-foreground">{tier.items.length} items</span>
          <span className="text-lg font-bold">£{tier.total.toFixed(2)}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-muted/50 border border-border rounded-xl p-4 space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Wand2 className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h4 className="font-semibold text-sm">AI Work Converter</h4>
            <p className="text-xs text-muted-foreground">NPH-approved SOR pricing with 3 tier options</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="outline" onClick={() => setShowTraining(true)} title="Train the AI by rating pairings and re-converting">
            <GraduationCap className="w-3.5 h-3.5 mr-1" />
            Training loop
          </Button>
          {isAdmin && (
            <Button size="sm" variant="outline" onClick={() => setShowBooks(true)}>
              <BookOpen className="w-3.5 h-3.5 mr-1" />
              SOR Books
            </Button>
          )}
          <button onClick={onClose} className="p-1 hover:bg-muted rounded-md transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
      <SORTrainingLoop open={showTraining} onClose={() => setShowTraining(false)} initialDescription={description} />

      {!result ? (
        <>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Paste or type the works description… e.g. 'Repair leaking kitchen tap, replace broken bedroom window, make good plaster around new socket'"
            className="min-h-[120px]"
          />
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <label className="text-xs font-medium text-muted-foreground">Minimum cost target (optional)</label>
              <div className="flex items-center gap-1 mt-1">
                <span className="text-sm text-muted-foreground px-2">£</span>
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  value={minimumCost}
                  onChange={(e) => setMinimumCost(e.target.value)}
                  placeholder="0.00"
                  className="h-9"
                />
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">Baseline ≥ this figure, Enhanced ~+20%, Premium ~+45%.</p>
            </div>
          </div>
          {hasExisting && (
            <label className={cn(
              'flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors',
              incorporateExisting ? 'border-primary/50 bg-primary/5' : 'border-border hover:bg-muted/30'
            )}>
              <input
                type="checkbox"
                checked={incorporateExisting}
                onChange={(e) => setIncorporateExisting(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-primary cursor-pointer"
              />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold flex items-center gap-2">
                  Incorporate existing Works List ({existingWorks!.length} NPH item{existingWorks!.length === 1 ? '' : 's'})
                  <Badge variant="secondary" className="text-[10px]">Recommended</Badge>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Keeps every NPH-allocated SOR code intact and uses them as context to build a realistic, accurate breakdown of the works — no fabrication.
                </p>
              </div>
            </label>
          )}
          {(hasOngoing || hasProgress) && (
            <div className="space-y-2">
              {hasOngoing && (
                <label className={cn(
                  'flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors',
                  includeOngoing ? 'border-amber-500/50 bg-amber-500/5' : 'border-border hover:bg-muted/30'
                )}>
                  <input
                    type="checkbox"
                    checked={includeOngoing}
                    onChange={(e) => setIncludeOngoing(e.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-amber-500 cursor-pointer"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold">Include Ongoing Notes / Reason</div>
                    <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2 whitespace-pre-wrap">{ongoingNotes!.trim()}</p>
                  </div>
                </label>
              )}
              {hasProgress && (
                <label className={cn(
                  'flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors',
                  includeProgress ? 'border-blue-500/50 bg-blue-500/5' : 'border-border hover:bg-muted/30'
                )}>
                  <input
                    type="checkbox"
                    checked={includeProgress}
                    onChange={(e) => setIncludeProgress(e.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-blue-500 cursor-pointer"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold">Include Team Progress Notes</div>
                    <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2 whitespace-pre-wrap">{progressNotes!.trim()}</p>
                  </div>
                </label>
              )}
            </div>
          )}
          <Button onClick={handleConvert} disabled={isProcessing || !description.trim()} className="w-full">
            {isProcessing ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Processing with AI + accuracy check…</>
            ) : (
              <><Sparkles className="w-4 h-4 mr-2" />Generate 3 Tiered Quotes</>
            )}
          </Button>
          {showBooks && <SORCodeBookManager open={showBooks} onOpenChange={setShowBooks} />}
        </>
      ) : (
        <>
          <div className="flex items-center gap-2 text-xs">
            <Badge variant="outline" className="gap-1">
              <BookOpen className="w-3 h-3" />
              {result.codeSource === 'nph_books' ? `${result.codeCount} NPH codes` : 'Fallback catalogue'}
            </Badge>
            {result.review?.overall?.ok && (
              <Badge variant="secondary" className="gap-1">
                <ShieldCheck className="w-3 h-3 text-green-600" />
                Accuracy verified
              </Badge>
            )}
            {result.minimumCost > 0 && (
              <Badge variant="outline">Min £{result.minimumCost.toFixed(2)}</Badge>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2">
            {(['baseline', 'enhanced', 'premium'] as TierKey[]).map((k) => (
              <button
                key={k}
                onClick={() => setSelectedTier(k)}
                className={cn(
                  'p-3 rounded-lg border text-left transition-all',
                  selectedTier === k ? `ring-2 ${TIER_META[k].ring} border-transparent bg-card` : 'border-border hover:bg-muted/30'
                )}
              >
                <div className="text-xs font-medium">{TIER_META[k].label}</div>
                <div className="text-base font-bold mt-1">£{result.tiers[k]?.total.toFixed(2)}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">{result.tiers[k]?.items.length} items</div>
              </button>
            ))}
          </div>

          {(result.surveyorUnderstanding || result.approvalGate) && (
            <div className="rounded-lg border border-border bg-card p-3 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="text-xs font-semibold flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-primary" /> Surveyor Understanding & Approval Gate
                </div>
                {result.approvalGate && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Badge variant="outline" className={cn('text-[10px]', result.approvalGate.passed ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-700' : 'border-amber-500/50 bg-amber-500/10 text-amber-700')}>
                      {result.approvalGate.passed ? 'Gate: PASSED' : 'Gate: REVIEW'}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">Evidence {result.approvalGate.evidenceCoverage}%</Badge>
                    <Badge variant="outline" className="text-[10px]">Hallucinations {result.approvalGate.hallucinations}</Badge>
                  </div>
                )}
              </div>
              {result.surveyorUnderstanding && (
                <div className="grid sm:grid-cols-2 gap-2 text-[11px]">
                  {result.surveyorUnderstanding.rootCause && (
                    <p><span className="font-medium">Root cause:</span> {result.surveyorUnderstanding.rootCause}</p>
                  )}
                  {result.surveyorUnderstanding.consequentialDamage && (
                    <p><span className="font-medium">Consequential damage:</span> {result.surveyorUnderstanding.consequentialDamage}</p>
                  )}
                  {result.surveyorUnderstanding.scope?.length > 0 && (
                    <div className="sm:col-span-2">
                      <span className="font-medium">Scope ({result.surveyorUnderstanding.scope.length}):</span>
                      <ol className="list-decimal list-inside mt-0.5 space-y-0.5">
                        {result.surveyorUnderstanding.scope.slice(0, 12).map((s, i) => <li key={i}>{s}</li>)}
                      </ol>
                    </div>
                  )}
                  {result.surveyorUnderstanding.tradeAllocation?.length > 0 && (
                    <div className="sm:col-span-2">
                      <span className="font-medium">Trades:</span>{' '}
                      {result.surveyorUnderstanding.tradeAllocation.join(' · ')}
                    </div>
                  )}
                  {(result.surveyorUnderstanding.extractedProducts?.length ?? 0) > 0 && (
                    <div className="sm:col-span-2">
                      <span className="font-medium">Extracted products:</span>{' '}
                      <span className="text-muted-foreground">{result.surveyorUnderstanding.extractedProducts!.join(' · ')}</span>
                    </div>
                  )}
                  {(result.surveyorUnderstanding.extractedLocations?.length ?? 0) > 0 && (
                    <div className="sm:col-span-2">
                      <span className="font-medium">Extracted locations:</span>{' '}
                      <span className="text-muted-foreground">{result.surveyorUnderstanding.extractedLocations!.join(' · ')}</span>
                    </div>
                  )}
                  {(result.surveyorUnderstanding.extractedActions?.length ?? 0) > 0 && (
                    <div className="sm:col-span-2">
                      <span className="font-medium">Extracted repair actions:</span>{' '}
                      <span className="text-muted-foreground">{result.surveyorUnderstanding.extractedActions!.join(' · ')}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {renderTierPanel(selectedTier, result.tiers[selectedTier])}

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setResult(null)} className="flex-1 min-w-[120px]">
              Try Again
            </Button>
            <Button variant="outline" onClick={handleSaveResults} className="flex-1 min-w-[120px]" title="Download all 3 tiers (codes, descriptions, costs) as JSON + CSV">
              <Download className="w-4 h-4 mr-2" />
              Save Results
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                try {
                  const { flags, counts } = exportConversionValidationPDF(result, description);
                  toast({
                    title: flags.length === 0 ? 'No issues found ✓' : `Validation report: ${flags.length} flag${flags.length === 1 ? '' : 's'}`,
                    description: flags.length === 0
                      ? 'Every line has a valid SOR code, description, cost and high confidence.'
                      : `${counts.critical} critical · ${counts.warning} warnings · ${counts.info} info — PDF downloaded.`,
                    variant: counts.critical > 0 ? 'destructive' : 'default',
                  });
                } catch (e: any) {
                  toast({ title: 'Report failed', description: e?.message || 'Try again.', variant: 'destructive' });
                }
              }}
              className="flex-1 min-w-[160px] border-orange-500/50 text-orange-700 hover:bg-orange-500/10"
              title="One-click report of low-confidence matches, missing fields, and invalid SOR codes across all tiers"
            >
              <FileWarning className="w-4 h-4 mr-2" />
              Validation Report
            </Button>
            <Button
              variant="outline"
              onClick={runQAAudit}
              disabled={qaRunning}
              className="flex-1 min-w-[160px] border-amber-500/50 text-amber-700 hover:bg-amber-500/10"
              title="Independent senior-surveyor audit that challenges this schedule for missing tasks, hallucinations, wrong codes, and revenue leakage"
            >
              {qaRunning
                ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Auditing…</>
                : <><Gavel className="w-4 h-4 mr-2" />QA Audit ({TIER_META[selectedTier].label})</>}
            </Button>
            <Button onClick={handleConfirm} className="flex-1 min-w-[160px]">
              <Check className="w-4 h-4 mr-2" />
              Use {TIER_META[selectedTier].label} ({result.tiers[selectedTier].items.length} items)
            </Button>
          </div>

          <Dialog open={qaOpen} onOpenChange={setQaOpen}>
            <DialogContent className="max-w-3xl">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Gavel className="w-5 h-5 text-amber-600" />
                  Surveyor QA Audit{qaTierAudited ? ` — ${TIER_META[qaTierAudited].label}` : ''}
                </DialogTitle>
                <DialogDescription>
                  Independent senior surveyor reviewing Convert AI's schedule. Built its OWN scope first, then compared.
                </DialogDescription>
              </DialogHeader>
              {qaRunning && !qaAudit ? (
                <div className="flex items-center justify-center py-12 text-sm text-muted-foreground gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Running independent surveyor analysis…
                </div>
              ) : qaAudit ? (
                <SurveyorQAAuditPanel audit={qaAudit} />
              ) : null}
            </DialogContent>
          </Dialog>

        </>
      )}
    </div>
  );
};
