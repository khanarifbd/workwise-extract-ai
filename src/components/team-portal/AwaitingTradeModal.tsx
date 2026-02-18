import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2, Wrench, Plus } from 'lucide-react';
import { DEFAULT_TRADES } from '@/types/subTask';

interface AwaitingTradeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobId: string;
  jobName: string;
  jobAddress: string;
  onSubmit: (trades: string[], description: string) => Promise<void>;
}

export const AwaitingTradeModal = ({
  open,
  onOpenChange,
  jobId,
  jobName,
  jobAddress,
  onSubmit,
}: AwaitingTradeModalProps) => {
  const [selectedTrades, setSelectedTrades] = useState<string[]>([]);
  const [description, setDescription] = useState('');
  const [customTrade, setCustomTrade] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const toggleTrade = (trade: string) => {
    setSelectedTrades(prev =>
      prev.includes(trade) ? prev.filter(t => t !== trade) : [...prev, trade]
    );
  };

  const addCustomTrade = () => {
    if (customTrade.trim() && !selectedTrades.includes(customTrade.trim())) {
      setSelectedTrades(prev => [...prev, customTrade.trim()]);
      setCustomTrade('');
      setShowCustomInput(false);
    }
  };

  const handleSubmit = async () => {
    if (selectedTrades.length === 0) return;
    setIsSubmitting(true);
    try {
      await onSubmit(selectedTrades, description);
      onOpenChange(false);
      setSelectedTrades([]);
      setDescription('');
    } catch (err) {
      console.error('Error creating sub-tasks:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5 text-primary" />
            Complete – Awaiting Secondary Trade
          </DialogTitle>
          <p className="text-xs text-muted-foreground mt-1">
            {jobName} • {jobAddress}
          </p>
        </DialogHeader>

        <div className="space-y-4">
          {/* Trade Selection */}
          <div>
            <Label className="text-sm font-semibold mb-2 block">Select Required Trades</Label>
            <div className="grid grid-cols-2 gap-2">
              {DEFAULT_TRADES.filter(t => t !== 'Other').map(trade => (
                <label
                  key={trade}
                  className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition-all text-sm ${
                    selectedTrades.includes(trade)
                      ? 'bg-primary/10 border-primary text-primary font-medium'
                      : 'bg-background border-border hover:bg-muted/50'
                  }`}
                >
                  <Checkbox
                    checked={selectedTrades.includes(trade)}
                    onCheckedChange={() => toggleTrade(trade)}
                    className="h-4 w-4"
                  />
                  {trade}
                </label>
              ))}
            </div>

            {/* Custom trade entry */}
            {showCustomInput ? (
              <div className="flex gap-2 mt-2">
                <Input
                  value={customTrade}
                  onChange={(e) => setCustomTrade(e.target.value)}
                  placeholder="Enter trade name..."
                  className="text-sm h-9"
                  onKeyDown={(e) => e.key === 'Enter' && addCustomTrade()}
                />
                <Button size="sm" onClick={addCustomTrade} className="h-9">Add</Button>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="mt-2 w-full"
                onClick={() => setShowCustomInput(true)}
              >
                <Plus className="h-3 w-3 mr-1" />
                Other Trade
              </Button>
            )}

            {/* Selected summary */}
            {selectedTrades.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {selectedTrades.map(trade => (
                  <Badge key={trade} variant="secondary" className="text-xs">
                    {trade}
                    <button
                      onClick={() => toggleTrade(trade)}
                      className="ml-1 text-muted-foreground hover:text-foreground"
                    >
                      ×
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Description */}
          <div>
            <Label className="text-sm font-semibold mb-1 block">
              Description <span className="text-muted-foreground font-normal">(Optional)</span>
            </Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add any notes about the required work, access info, etc..."
              rows={3}
              className="text-sm"
            />
          </div>
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={selectedTrades.length === 0 || isSubmitting}
            className="bg-primary"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                Creating...
              </>
            ) : (
              `Create ${selectedTrades.length} Sub-Task${selectedTrades.length !== 1 ? 's' : ''}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
