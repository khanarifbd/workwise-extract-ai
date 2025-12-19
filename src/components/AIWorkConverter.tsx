import { useState } from 'react';
import { WorkItem } from '@/types/job';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Wand2, Loader2, X, Check } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

// Sample SOR codes from the SOR 7.2 v2 book (in production, this would come from the actual PDF)
const SOR_CODES_DATABASE = [
  { code: 'SOR001', description: 'Supply and install new radiator', category: 'Heating' },
  { code: 'SOR002', description: 'Repair leaking tap', category: 'Plumbing' },
  { code: 'SOR003', description: 'Replace broken window pane', category: 'Glazing' },
  { code: 'SOR004', description: 'Repair faulty socket', category: 'Electrical' },
  { code: 'SOR005', description: 'Install new light fitting', category: 'Electrical' },
  { code: 'SOR006', description: 'Replace door lock', category: 'Carpentry' },
  { code: 'SOR007', description: 'Repair roof tiles', category: 'Roofing' },
  { code: 'SOR008', description: 'Clear blocked drain', category: 'Drainage' },
  { code: 'SOR009', description: 'Patch plaster repair', category: 'Plastering' },
  { code: 'SOR010', description: 'Paint internal walls', category: 'Decorating' },
  { code: 'SOR011', description: 'Replace kitchen unit', category: 'Carpentry' },
  { code: 'SOR012', description: 'Install extractor fan', category: 'Ventilation' },
  { code: 'SOR013', description: 'Repair fence panel', category: 'External' },
  { code: 'SOR014', description: 'Replace toilet seat', category: 'Plumbing' },
  { code: 'SOR015', description: 'Repair floor boards', category: 'Carpentry' },
];

interface AIWorkConverterProps {
  onConvert: (workItems: WorkItem[]) => void;
  onClose: () => void;
}

export const AIWorkConverter = ({ onConvert, onClose }: AIWorkConverterProps) => {
  const [description, setDescription] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [convertedItems, setConvertedItems] = useState<WorkItem[]>([]);

  const matchSORCode = (workDescription: string): string => {
    const lowerDesc = workDescription.toLowerCase();
    
    // Find best matching SOR code based on keywords
    const matches = SOR_CODES_DATABASE.filter(sor => {
      const keywords = sor.description.toLowerCase().split(' ');
      return keywords.some(keyword => 
        keyword.length > 3 && lowerDesc.includes(keyword)
      );
    });

    return matches.length > 0 ? matches[0].code : 'SOR000';
  };

  const parseDescriptionToWorks = (text: string): WorkItem[] => {
    // Split by common delimiters and clean up
    const lines = text
      .split(/[,.\n;]/)
      .map(line => line.trim())
      .filter(line => line.length > 5);

    return lines.map(line => ({
      id: crypto.randomUUID(),
      description: line.charAt(0).toUpperCase() + line.slice(1),
      sorCode: matchSORCode(line),
      qty: 1,
      cost: 0
    }));
  };

  const handleConvert = async () => {
    if (!description.trim()) return;

    setIsProcessing(true);
    
    // Simulate AI processing delay
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    const items = parseDescriptionToWorks(description);
    setConvertedItems(items);
    setIsProcessing(false);
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
