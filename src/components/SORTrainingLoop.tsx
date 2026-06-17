import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, GraduationCap, ThumbsUp, ThumbsDown, Minus, RefreshCw, Sparkles, CheckCircle2, X } from 'lucide-react';
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

    if (toSubmit.length === 0) {
      toast({
        title: 'No feedback yet',
        description: 'Rate at least one pairing (or add a note / correct code) before re-converting.',
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
        });
        setLine(i, { saved: true });
      }
      toast({ title: `Saved ${toSubmit.length} feedback entries`, description: 'Re-running conversion with your corrections…' });
      await runConvert('retrain');
    } catch (e: any) {
      toast({ title: 'Could not save all feedback', description: e?.message || 'Try again.', variant: 'destructive' });
      setRetraining(false);
    }
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

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GraduationCap className="w-5 h-5 text-primary" />
            SOR Training Loop
            {iteration > 0 && (
              <Badge variant="outline" className="ml-2 text-xs">
                Iteration {iteration}
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            Paste a description, rate each AI pairing, and re-convert. Every rating, note and
            "correct code" suggestion is stored in <code className="text-xs">sor_match_feedback</code>
            and fed back into the next conversion as high-weight training signal.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-3 -mr-3">
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
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};
