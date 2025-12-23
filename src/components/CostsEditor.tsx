import { useState } from 'react';
import { JobCosts } from '@/types/job';
import { PoundSterling, Wand2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface CostsEditorProps {
  costs: JobCosts | null;
  onUpdate: (costs: JobCosts) => void;
}

export const CostsEditor = ({ costs, onUpdate }: CostsEditorProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [localCosts, setLocalCosts] = useState<JobCosts>(
    costs || { materials: 0, labour: 0, other: 0, notes: '' }
  );
  const [aiInput, setAiInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const { toast } = useToast();

  const total = localCosts.materials + localCosts.labour + localCosts.other;

  const handleSave = () => {
    onUpdate(localCosts);
    setIsOpen(false);
  };

  const handleAIParse = async () => {
    if (!aiInput.trim()) return;
    
    setIsProcessing(true);
    try {
      const { data, error } = await supabase.functions.invoke('parse-costs', {
        body: { input: aiInput }
      });

      if (error) throw error;

      if (data?.costs) {
        setLocalCosts({
          materials: data.costs.materials || 0,
          labour: data.costs.labour || 0,
          other: data.costs.other || 0,
          notes: data.costs.notes || aiInput
        });
        setAiInput('');
        toast({
          title: "Costs Parsed",
          description: "AI has extracted the cost breakdown.",
        });
      }
    } catch (error) {
      console.error('AI cost parsing error:', error);
      toast({
        title: "Parsing Failed",
        description: "Could not parse costs. Please enter manually.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (open) {
      setLocalCosts(costs || { materials: 0, labour: 0, other: 0, notes: '' });
    }
  };

  const hasData = costs && (costs.materials > 0 || costs.labour > 0 || costs.other > 0);
  const displayTotal = costs ? (costs.materials + costs.labour + costs.other) : 0;

  return (
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button className="flex items-center">
          {hasData ? (
            <Badge className="bg-green-500/20 text-green-700 dark:text-green-400 border-green-500/30 cursor-pointer hover:bg-green-500/30">
              <PoundSterling className="w-3 h-3 mr-0.5" />
              {displayTotal.toLocaleString()}
            </Badge>
          ) : (
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs">
              <PoundSterling className="w-3 h-3 mr-1" />
              Add Costs
            </Button>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-3" align="start">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-medium text-sm flex items-center gap-2">
              <PoundSterling className="w-4 h-4 text-green-500" />
              Job Costs
            </h4>
            <Badge variant="outline" className="font-mono">
              Total: £{total.toLocaleString()}
            </Badge>
          </div>

          {/* AI Input */}
          <div className="space-y-2 p-2 bg-muted/30 rounded-lg border border-dashed border-border">
            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <Wand2 className="w-3 h-3" />
              Quick Entry (AI)
            </label>
            <Textarea
              value={aiInput}
              onChange={(e) => setAiInput(e.target.value)}
              placeholder="Type naturally, e.g: 'Materials £500, labour 2 days at £200/day, skip hire £150'"
              className="min-h-[60px] text-xs resize-none"
            />
            <Button
              size="sm"
              variant="outline"
              className="w-full h-7"
              onClick={handleAIParse}
              disabled={isProcessing || !aiInput.trim()}
            >
              {isProcessing ? (
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              ) : (
                <Wand2 className="w-3 h-3 mr-1" />
              )}
              Parse with AI
            </Button>
          </div>

          {/* Manual Entry */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Manual Entry</label>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-[10px] text-muted-foreground block mb-1">Materials</label>
                <div className="relative">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">£</span>
                  <Input
                    type="number"
                    value={localCosts.materials || ''}
                    onChange={(e) => setLocalCosts({ ...localCosts, materials: parseFloat(e.target.value) || 0 })}
                    className="h-8 text-xs pl-5"
                    min={0}
                  />
                </div>
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground block mb-1">Labour</label>
                <div className="relative">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">£</span>
                  <Input
                    type="number"
                    value={localCosts.labour || ''}
                    onChange={(e) => setLocalCosts({ ...localCosts, labour: parseFloat(e.target.value) || 0 })}
                    className="h-8 text-xs pl-5"
                    min={0}
                  />
                </div>
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground block mb-1">Other</label>
                <div className="relative">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">£</span>
                  <Input
                    type="number"
                    value={localCosts.other || ''}
                    onChange={(e) => setLocalCosts({ ...localCosts, other: parseFloat(e.target.value) || 0 })}
                    className="h-8 text-xs pl-5"
                    min={0}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Cost Notes</label>
            <Textarea
              value={localCosts.notes}
              onChange={(e) => setLocalCosts({ ...localCosts, notes: e.target.value })}
              placeholder="Breakdown details..."
              className="min-h-[50px] text-xs resize-none"
            />
          </div>

          {/* Summary */}
          <div className="bg-muted/50 rounded-lg p-2 space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Materials:</span>
              <span className="font-mono">£{localCosts.materials.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Labour:</span>
              <span className="font-mono">£{localCosts.labour.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Other:</span>
              <span className="font-mono">£{localCosts.other.toLocaleString()}</span>
            </div>
            <div className="flex justify-between pt-1 border-t border-border font-semibold">
              <span>Total:</span>
              <span className="font-mono text-green-600 dark:text-green-400">£{total.toLocaleString()}</span>
            </div>
          </div>

          {/* Save Button */}
          <Button size="sm" className="w-full" onClick={handleSave}>
            Save Costs
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};
