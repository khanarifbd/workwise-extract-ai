import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, GraduationCap, ThumbsUp, ThumbsDown, Minus, RefreshCw, Sparkles, CheckCircle2, X, ListChecks } from 'lucide-react';
import {
  convertDescriptionToTieredQuotes,
  ConvertResponse,
  submitSORMatchFeedback,
  SORMatchRating,
} from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface Props {
  open: boolean;
  onClose: () => void;
  initialDescription?: string;
}

interface LineState {
  rating?: SORMatchRating;
  note: string;
  correctCode: string;
  saved: boolean;
}

/**
 * SOR Training Loop
 * ------------------
 * 1. User pastes a works description.
 * 2. Convert-AI returns the baseline tier pairings (SOR code + description).
 * 3. User rates each pairing (Good / Fair / Bad), adds a refinement note,
 *    and optionally suggests the correct SOR code.
 * 4. "Save feedback & re-convert" submits every rating + note to
 *    sor_match_feedback (which the edge function ingests as training signal),
 *    then re-runs the conversion so the user can immediately see if the
 *    pairings improved. The cycle repeats until accuracy is satisfactory.
 */
export const SORTrainingLoop = ({ open, onClose, initialDescription }: Props) => {
  const { toast } = useToast();
  const [description, setDescription] = useState(initialDescription ?? '');
  const [iteration, setIteration] = useState(0);
  const [running, setRunning] = useState(false);
  const [retraining, setRetraining] = useState(false);
  const [result, setResult] = useState<ConvertResponse | null>(null);
  const [lines, setLines] = useState<Record<number, LineState>>({});
  const [overallRating, setOverallRating] = useState<SORMatchRating | undefined>(undefined);
  const [overallNote, setOverallNote] = useState('');
  const [missingTasks, setMissingTasks] = useState('');

  const runConvert = async (mode: 'initial' | 'retrain') => {
    if (!description.trim()) {
      toast({ title: 'Paste a description first', variant: 'destructive' });
      return;
    }
    mode === 'initial' ? setRunning(true) : setRetraining(true);
    try {
      const res = await convertDescriptionToTieredQuotes(description);
      setResult(res);
      setLines({});
      setIteration((n) => n + 1);
      toast({
        title: mode === 'initial' ? 'Conversion complete' : 'Re-converted with your feedback',
        description: `${res.tiers.baseline.items.length} pairings — rate each one to keep training.`,
      });
    } catch (e: any) {
      toast({ title: 'Conversion failed', description: e?.message || 'Try again.', variant: 'destructive' });
    } finally {
      setRunning(false);
      setRetraining(false);
    }
  };

  const setLine = (i: number, patch: Partial<LineState>) =>
    setLines((s) => ({ ...s, [i]: { rating: undefined, note: '', correctCode: '', saved: false, ...s[i], ...patch } }));

  const submitAllAndRetrain = async () => {
    if (!result) return;
    const items = result.tiers.baseline.items;
    const toSubmit = items
      .map((it, i) => ({ it, i, st: lines[i] }))
      .filter((x) => x.st && (x.st.rating || x.st.note.trim() || x.st.correctCode.trim()));

    const hasOverall = overallRating || overallNote.trim().length > 0;
    const hasMissing = missingTasks.trim().length > 0;

    if (toSubmit.length === 0 && !hasOverall && !hasMissing) {
      toast({
        title: 'No feedback yet',
        description: 'Rate at least one pairing, add overall feedback, or list missing tasks before re-converting.',
        variant: 'destructive',
      });
      return;
    }

    setRetraining(true);
    try {
      for (const { it, i, st } of toSubmit) {
        const note = [
          st.note.trim(),
          st.correctCode.trim() ? `Correct SOR code should be: ${st.correctCode.trim().toUpperCase()}` : '',
        ]
          .filter(Boolean)
          .join(' — ');
        await submitSORMatchFeedback({
          sourceDescription: description,
          lineDescription: it.description,
          sorCode: it.code,
          rating: st.rating ?? 'fair',
          tier: 'baseline',
          confidence: (it as any).confidence,
          rationale: (it as any).rationale,
          note: note || undefined,
          feedbackScope: 'line',
        });
        setLine(i, { saved: true });
      }

      if (hasOverall) {
        await submitSORMatchFeedback({
          sourceDescription: description,
          rating: overallRating ?? 'fair',
          note: overallNote.trim() || 'Overall description coverage feedback',
          feedbackScope: 'overall',
        });
      }
      if (hasMissing) {
        await submitSORMatchFeedback({
          sourceDescription: description,
          rating: 'bad',
          note: `MISSING TASKS — these were in the description but not paired: ${missingTasks.trim()}`,
          feedbackScope: 'missing_task',
        });
      }

      const total = toSubmit.length + (hasOverall ? 1 : 0) + (hasMissing ? 1 : 0);
      toast({ title: `Saved ${total} feedback entries`, description: 'Re-running conversion with your corrections…' });
      await runConvert('retrain');
    } catch (e: any) {
      toast({ title: 'Could not save all feedback', description: e?.message || 'Try again.', variant: 'destructive' });
      setRetraining(false);
    }
  };

  const overallRatingBtn = (rating: SORMatchRating, label: string, Icon: any, active: string) => {
    const on = overallRating === rating;
    return (
      <Button
        size="sm"
        variant="outline"
        onClick={() => setOverallRating(on ? undefined : rating)}
        className={cn('h-8 px-2 text-[11px] gap-1', on && active)}
      >
        <Icon className="w-3 h-3" />
        {label}
      </Button>
    );
  };

  const ratingBtn = (i: number, rating: SORMatchRating, label: string, Icon: any, active: string) => {
    const cur = lines[i]?.rating;
    const on = cur === rating;
    return (
      <Button
        size="sm"
        variant="outline"
        onClick={() => setLine(i, { rating })}
        className={cn('h-7 px-2 text-[11px] gap-1', on && active)}
      >
        <Icon className="w-3 h-3" />
        {label}
      </Button>
    );
  };

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-background border rounded-lg shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col"
      >
        <div className="flex items-start justify-between p-6 pb-3 border-b">
          <div>
            <h2 className="text-lg font-semibold leading-none tracking-tight flex items-center gap-2">
              <GraduationCap className="w-5 h-5 text-primary" />
              SOR Training Loop
              {iteration > 0 && (
                <Badge variant="outline" className="ml-2 text-xs">
                  Iteration {iteration}
                </Badge>
              )}
            </h2>
            <p className="text-sm text-muted-foreground mt-1.5">
              Paste a description, rate each AI pairing, and re-convert. Every rating, note and
              correct-code suggestion is stored and fed back into the next conversion as high-weight training signal.
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-muted transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>


        <ScrollArea className="flex-1 min-h-0 px-6 py-4">
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Works description</label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Paste the surveyor's description here. E.g.&#10;RENEW INSULATION: remove and relay 11 rolls of loft insulation due to damage, including making good.&#10;WALL TILES: rake out and regrout all wall tiles in the bathroom (6m²).&#10;Repoint brickwork in external wall crack…"
                className="min-h-[120px] font-mono text-xs"
                disabled={running || retraining}
              />
              <div className="flex items-center gap-2">
                <Button
                  onClick={() => runConvert('initial')}
                  disabled={running || retraining || !description.trim()}
                  size="sm"
                >
                  {running ? (
                    <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4 mr-1" />
                  )}
                  {result ? 'Reset & convert fresh' : 'Run conversion'}
                </Button>
                {result && (
                  <Button
                    onClick={submitAllAndRetrain}
                    disabled={running || retraining}
                    size="sm"
                    variant="default"
                    className="bg-primary"
                  >
                    {retraining ? (
                      <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4 mr-1" />
                    )}
                    Save feedback & re-convert
                  </Button>
                )}
              </div>
            </div>

            {result && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold">Baseline pairings</h4>
                  <span className="text-xs text-muted-foreground">
                    {result.tiers.baseline.items.length} items · £{result.tiers.baseline.total.toFixed(2)}
                  </span>
                </div>
                {result.tiers.baseline.items.map((it, i) => {
                  const st = lines[i];
                  const conf = (it as any).confidence;
                  const rationale = (it as any).rationale;
                  return (
                    <div
                      key={i}
                      className={cn(
                        'rounded-lg border p-3 space-y-2 bg-card',
                        st?.saved && 'border-emerald-500/40 bg-emerald-500/5',
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="secondary" className="font-mono text-[10px]">
                              {it.code}
                            </Badge>
                            {typeof conf === 'number' && (
                              <Badge
                                variant="outline"
                                className={cn(
                                  'text-[10px]',
                                  conf >= 80
                                    ? 'border-emerald-500/40 text-emerald-700'
                                    : conf >= 60
                                      ? 'border-amber-500/40 text-amber-700'
                                      : 'border-red-500/40 text-red-700',
                                )}
                              >
                                {conf}% confidence
                              </Badge>
                            )}
                            {st?.saved && (
                              <Badge variant="outline" className="text-[10px] border-emerald-500/40 text-emerald-700 gap-1">
                                <CheckCircle2 className="w-3 h-3" /> Feedback saved
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm mt-1">{it.description}</p>
                          {rationale && (
                            <p className="text-[11px] text-muted-foreground italic mt-1">
                              Why: {rationale}
                            </p>
                          )}
                          <p className="text-[11px] text-muted-foreground mt-1">
                            Qty {it.qty} · £{it.cost.toFixed(2)}
                          </p>
                        </div>
                        <div className="flex flex-col gap-1 shrink-0">
                          {ratingBtn(i, 'good', 'Good', ThumbsUp, 'bg-emerald-500/15 border-emerald-500/40 text-emerald-700')}
                          {ratingBtn(i, 'fair', 'Fair', Minus, 'bg-amber-500/15 border-amber-500/40 text-amber-700')}
                          {ratingBtn(i, 'bad', 'Bad', ThumbsDown, 'bg-red-500/15 border-red-500/40 text-red-700')}
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-[1fr_180px] gap-2">
                        <Textarea
                          value={st?.note ?? ''}
                          onChange={(e) => setLine(i, { note: e.target.value })}
                          placeholder={
                            st?.rating === 'bad'
                              ? 'Why is this wrong? e.g. "Should be remove & relay, not install new" / "Wrong surface — this is wall not floor"'
                              : 'Add a refinement note to teach the AI (optional but powerful)…'
                          }
                          className="min-h-[60px] text-xs"
                        />
                        <Input
                          value={st?.correctCode ?? ''}
                          onChange={(e) => setLine(i, { correctCode: e.target.value })}
                          placeholder="Correct SOR code (optional)"
                          className="h-9 text-xs font-mono"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {result && (
              <div className="rounded-lg border-2 border-primary/30 bg-primary/5 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <ListChecks className="w-4 h-4 text-primary" />
                  <h4 className="text-sm font-semibold">Overall description feedback</h4>
                  <Badge variant="outline" className="text-[10px]">Highest training weight</Badge>
                </div>
                <p className="text-[11px] text-muted-foreground -mt-1">
                  Rate how well the AI covered the WHOLE description — did it identify every task, or miss
                  some (e.g. "missed loft insulation lift-and-relay", "missed mould treatment for BACT DET / HALOPHEN",
                  "didn't use 11 rolls hint to estimate loft area")? This trains coverage, not just per-line accuracy.
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Coverage rating:</span>
                  {overallRatingBtn('good', 'Complete', ThumbsUp, 'bg-emerald-500/15 border-emerald-500/40 text-emerald-700')}
                  {overallRatingBtn('fair', 'Partial', Minus, 'bg-amber-500/15 border-amber-500/40 text-amber-700')}
                  {overallRatingBtn('bad', 'Missed lots', ThumbsDown, 'bg-red-500/15 border-red-500/40 text-red-700')}
                </div>
                <div className="space-y-2">
                  <label className="text-[11px] font-medium text-muted-foreground">
                    Overall feedback (what went well / what was missed at the description level)
                  </label>
                  <Textarea
                    value={overallNote}
                    onChange={(e) => setOverallNote(e.target.value)}
                    placeholder={`e.g. "Only paired 2 of ~6 tasks. Missed remove-and-relay loft insulation, missed BACT DET mould treatment, didn't treat 11 rolls as a size indicator (~88m² of loft)."`}
                    className="min-h-[80px] text-xs"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[11px] font-medium text-muted-foreground">
                    Missing tasks (list any tasks the description contains that got NO SOR pairing)
                  </label>
                  <Textarea
                    value={missingTasks}
                    onChange={(e) => setMissingTasks(e.target.value)}
                    placeholder='e.g. "remove and relay loft insulation (11 rolls); apply BACT DET + HALOPHEN to mould areas; clean gutters; renew silicone sealant to bath"'
                    className="min-h-[60px] text-xs"
                  />
                </div>
              </div>
            )}
          </div>

        </ScrollArea>
      </div>
    </div>,
    document.body,
  );

};
