import { useState } from 'react';
import { WorkItem } from '@/types/job';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Wand2, Loader2, X, Check, BookOpen, ShieldCheck, AlertTriangle, Sparkles } from 'lucide-react';
import { convertDescriptionToTieredQuotes, ConvertResponse, ConvertTier } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { cn } from '@/lib/utils';
import { SORCodeBookManager } from './SORCodeBookManager';

interface AIWorkConverterProps {
  onConvert: (workItems: WorkItem[]) => void;
  onClose: () => void;
  existingWorks?: WorkItem[];
}

type TierKey = 'baseline' | 'enhanced' | 'premium';
const TIER_META: Record<TierKey, { label: string; color: string; ring: string; description: string }> = {
  baseline: { label: 'Baseline', color: 'bg-blue-500/10 text-blue-600 border-blue-500/30', ring: 'ring-blue-500', description: 'Minimum compliant scope' },
  enhanced: { label: 'Enhanced', color: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30', ring: 'ring-emerald-500', description: 'Standard NPH scope (~+20%)' },
  premium:  { label: 'Premium',  color: 'bg-amber-500/10 text-amber-600 border-amber-500/30',     ring: 'ring-amber-500',  description: 'Full scope with allied works (~+45%)' },
};

export const AIWorkConverter = ({ onConvert, onClose, existingWorks }: AIWorkConverterProps) => {
  const [description, setDescription] = useState('');
  const [minimumCost, setMinimumCost] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<ConvertResponse | null>(null);
  const [selectedTier, setSelectedTier] = useState<TierKey>('baseline');
  const [showBooks, setShowBooks] = useState(false);
  const hasExisting = !!(existingWorks && existingWorks.length > 0);
  const [incorporateExisting, setIncorporateExisting] = useState<boolean>(hasExisting);
  const { toast } = useToast();
  const { isAdmin } = useAdminAuth();

  const handleConvert = async () => {
    if (!description.trim()) return;
    setIsProcessing(true);
    try {
      const min = minimumCost.trim() ? Number(minimumCost) : undefined;
      const res = await convertDescriptionToTieredQuotes(description, min);
      setResult(res);
      setSelectedTier('baseline');
      if (res.codeSource === 'fallback') {
        toast({ title: 'Using fallback codes', description: 'No NPH SOR books uploaded — used built-in catalogue. Upload approved PDFs for full accuracy.', variant: 'destructive' });
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
    const workItems: WorkItem[] = tier.items.map((it) => ({
      id: crypto.randomUUID(),
      description: it.description,
      sorCode: it.code,
      qty: it.qty,
      cost: it.cost,
    }));
    onConvert(workItems);
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
        <div className="space-y-1 max-h-[260px] overflow-y-auto">
          {tier.items.map((it, i) => (
            <div key={i} className={cn('flex items-center justify-between gap-2 p-2 rounded-md border text-sm', it.valid ? 'border-border bg-card' : 'border-destructive/40 bg-destructive/5')}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="font-mono text-[10px]">{it.code}</Badge>
                  {it.qty > 1 && <span className="text-xs text-muted-foreground">× {it.qty}</span>}
                  {!it.valid && <span className="text-xs text-destructive">unknown code</span>}
                </div>
                <p className="text-xs mt-0.5 truncate">{it.description}</p>
              </div>
              <span className="font-semibold text-sm shrink-0">£{it.cost.toFixed(2)}</span>
            </div>
          ))}
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

          {renderTierPanel(selectedTier, result.tiers[selectedTier])}

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setResult(null)} className="flex-1">
              Try Again
            </Button>
            <Button onClick={handleConfirm} className="flex-1">
              <Check className="w-4 h-4 mr-2" />
              Use {TIER_META[selectedTier].label} ({result.tiers[selectedTier].items.length} items)
            </Button>
          </div>
        </>
      )}
    </div>
  );
};
