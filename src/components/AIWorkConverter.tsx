import { useState } from 'react';
import { WorkItem } from '@/types/job';
import { ConvertedWorkItem, SOROption } from '@/types/workItemOption';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Wand2, Loader2, X, Check, Plus, Minus, Crown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { convertDescriptionToWorkItems } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface AIWorkConverterProps {
  onConvert: (workItems: WorkItem[]) => void;
  onClose: () => void;
}

export const AIWorkConverter = ({ onConvert, onClose }: AIWorkConverterProps) => {
  const [description, setDescription] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [convertedItems, setConvertedItems] = useState<ConvertedWorkItem[]>([]);
  const { toast } = useToast();

  const handleConvert = async () => {
    if (!description.trim()) return;

    setIsProcessing(true);
    
    try {
      const items = await convertDescriptionToWorkItems(description);
      // Transform to ConvertedWorkItem format with multiple options
      const itemsWithOptions: ConvertedWorkItem[] = items.map((item: any) => ({
        id: crypto.randomUUID(),
        description: item.description,
        options: item.options || [
          { code: item.sorCode, cost: item.cost || 0 },
          { code: item.sorCode, cost: item.cost || 0 },
          { code: item.sorCode, cost: (item.cost || 0) * 1.3, isPremium: true }
        ],
        selectedOptionIndex: 0,
        qty: item.qty || 1
      }));
      setConvertedItems(itemsWithOptions);
    } catch (error) {
      console.error('Conversion error:', error);
      toast({
        title: "Conversion Failed",
        description: error instanceof Error ? error.message : "Could not convert description to work items.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSelectOption = (itemIndex: number, optionIndex: number) => {
    setConvertedItems(prev => prev.map((item, i) => 
      i === itemIndex ? { ...item, selectedOptionIndex: optionIndex } : item
    ));
  };

  const handleQtyChange = (itemIndex: number, delta: number) => {
    setConvertedItems(prev => prev.map((item, i) => 
      i === itemIndex ? { ...item, qty: Math.max(1, item.qty + delta) } : item
    ));
  };

  const handleConfirm = () => {
    const workItems: WorkItem[] = convertedItems.map(item => {
      const selectedOption = item.options[item.selectedOptionIndex];
      return {
        id: item.id,
        description: item.description,
        sorCode: selectedOption.code,
        qty: item.qty,
        cost: selectedOption.cost * item.qty
      };
    });
    onConvert(workItems);
  };

  const totalCost = convertedItems.reduce((sum, item) => {
    const selectedOption = item.options[item.selectedOptionIndex];
    return sum + (selectedOption?.cost || 0) * item.qty;
  }, 0);

  return (
    <div className="bg-muted/50 border border-border rounded-xl p-4 space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Wand2 className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h4 className="font-semibold text-sm">AI Work Converter</h4>
            <p className="text-xs text-muted-foreground">
              Convert description to itemized works with SOR codes
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-muted rounded-md transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {convertedItems.length === 0 ? (
        <>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Paste or type a description of works here... e.g., 'Repair the leaking tap in the kitchen, replace the broken window in bedroom, fix the faulty socket in the living room'"
            className="min-h-[120px]"
          />
          <Button 
            onClick={handleConvert} 
            disabled={isProcessing || !description.trim()}
            className="w-full"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Processing with AI...
              </>
            ) : (
              <>
                <Wand2 className="w-4 h-4 mr-2" />
                Convert to Works List
              </>
            )}
          </Button>
        </>
      ) : (
        <>
          <div className="space-y-4 max-h-[400px] overflow-y-auto pr-1">
            {convertedItems.map((item, itemIndex) => (
              <div 
                key={item.id}
                className="bg-card rounded-lg border border-border p-4 space-y-3"
              >
                {/* Work item description */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <span className="text-xs text-muted-foreground font-medium">Item {itemIndex + 1}</span>
                    <p className="text-sm font-medium mt-1">{item.description}</p>
                  </div>
                  
                  {/* Quantity controls */}
                  <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1">
                    <button
                      onClick={() => handleQtyChange(itemIndex, -1)}
                      className="p-1 hover:bg-muted rounded transition-colors"
                      disabled={item.qty <= 1}
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="text-sm font-medium min-w-[24px] text-center">{item.qty}</span>
                    <button
                      onClick={() => handleQtyChange(itemIndex, 1)}
                      className="p-1 hover:bg-muted rounded transition-colors"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {/* SOR Code options */}
                <div className="space-y-2">
                  <span className="text-xs text-muted-foreground">Select SOR Code:</span>
                  <div className="grid gap-2">
                    {item.options.map((option, optionIndex) => (
                      <button
                        key={optionIndex}
                        onClick={() => handleSelectOption(itemIndex, optionIndex)}
                        className={cn(
                          "flex items-center justify-between p-2 rounded-lg border transition-all text-left",
                          item.selectedOptionIndex === optionIndex
                            ? "border-primary bg-primary/5 ring-1 ring-primary"
                            : "border-border hover:border-muted-foreground/30 hover:bg-muted/30"
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <Badge 
                            variant={option.isPremium ? "default" : "secondary"} 
                            className={cn(
                              "font-mono text-xs",
                              option.isPremium && "bg-amber-500/10 text-amber-600 border-amber-500/30"
                            )}
                          >
                            {option.isPremium && <Crown className="w-3 h-3 mr-1" />}
                            {option.code}
                          </Badge>
                          {option.isPremium && (
                            <span className="text-xs text-amber-600 font-medium">Premium</span>
                          )}
                        </div>
                        <span className={cn(
                          "font-semibold text-sm",
                          option.isPremium ? "text-amber-600" : "text-foreground"
                        )}>
                          £{(option.cost * item.qty).toFixed(2)}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Summary */}
          <div className="flex items-center justify-between py-3 px-4 bg-muted/30 rounded-lg">
            <span className="text-sm font-medium">Total Estimated Cost</span>
            <span className="text-lg font-bold text-primary">£{totalCost.toFixed(2)}</span>
          </div>

          <div className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={() => setConvertedItems([])}
              className="flex-1"
            >
              Try Again
            </Button>
            <Button onClick={handleConfirm} className="flex-1">
              <Check className="w-4 h-4 mr-2" />
              Add {convertedItems.length} Items
            </Button>
          </div>
        </>
      )}
    </div>
  );
};
