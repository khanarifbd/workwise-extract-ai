import { useState } from 'react';
import { WorkItem } from '@/types/job';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Wand2, Loader2, X, Check } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { convertDescriptionToWorkItems } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';

interface AIWorkConverterProps {
  onConvert: (workItems: WorkItem[]) => void;
  onClose: () => void;
}

export const AIWorkConverter = ({ onConvert, onClose }: AIWorkConverterProps) => {
  const [description, setDescription] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [convertedItems, setConvertedItems] = useState<WorkItem[]>([]);
  const { toast } = useToast();

  const handleConvert = async () => {
    if (!description.trim()) return;

    setIsProcessing(true);
    
    try {
      const items = await convertDescriptionToWorkItems(description);
      setConvertedItems(items);
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

  const handleConfirm = () => {
    onConvert(convertedItems);
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
          <div className="space-y-2 max-h-[200px] overflow-y-auto">
            {convertedItems.map((item, index) => (
              <div 
                key={item.id}
                className="flex items-center gap-3 p-3 bg-card rounded-lg border border-border"
              >
                <span className="text-xs text-muted-foreground w-6">{index + 1}.</span>
                <span className="flex-1 text-sm">{item.description}</span>
                <Badge variant="secondary" className="font-mono">
                  {item.sorCode}
                </Badge>
              </div>
            ))}
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
