import { useState, useEffect } from 'react';
import { JobCosts } from '@/types/job';
import { PoundSterling, Wand2, Loader2, Trash2, ChevronDown, ChevronUp, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface CostItem {
  id: string;
  description: string;
  amount: number;
  category: 'materials' | 'labour' | 'other';
  enabled: boolean;
}

interface ExtendedJobCosts extends JobCosts {
  items?: CostItem[];
}

interface CostsEditorProps {
  costs: JobCosts | null;
  onUpdate: (costs: JobCosts) => void;
}

export const CostsEditor = ({ costs, onUpdate }: CostsEditorProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);
  const [costItems, setCostItems] = useState<CostItem[]>([]);
  const [notes, setNotes] = useState('');
  const [aiInput, setAiInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const { toast } = useToast();

  // Initialize from existing costs
  useEffect(() => {
    if (costs) {
      const extCosts = costs as ExtendedJobCosts;
      if (extCosts.items && Array.isArray(extCosts.items)) {
        setCostItems(extCosts.items);
      } else {
        // Legacy format - convert to items
        const items: CostItem[] = [];
        if (costs.materials > 0) {
          items.push({
            id: `legacy-materials-${Date.now()}`,
            description: 'Materials',
            amount: costs.materials,
            category: 'materials',
            enabled: true
          });
        }
        if (costs.labour > 0) {
          items.push({
            id: `legacy-labour-${Date.now()}`,
            description: 'Labour',
            amount: costs.labour,
            category: 'labour',
            enabled: true
          });
        }
        if (costs.other > 0) {
          items.push({
            id: `legacy-other-${Date.now()}`,
            description: 'Other',
            amount: costs.other,
            category: 'other',
            enabled: true
          });
        }
        if (items.length > 0) {
          setCostItems(items);
        }
      }
      setNotes(costs.notes || '');
    }
  }, [costs]);

  const calculateTotals = () => {
    const enabledItems = costItems.filter(item => item.enabled);
    const materials = enabledItems
      .filter(item => item.category === 'materials')
      .reduce((sum, item) => sum + item.amount, 0);
    const labour = enabledItems
      .filter(item => item.category === 'labour')
      .reduce((sum, item) => sum + item.amount, 0);
    const other = enabledItems
      .filter(item => item.category === 'other')
      .reduce((sum, item) => sum + item.amount, 0);
    const total = materials + labour + other;
    
    return { materials, labour, other, total };
  };

  const handleSave = () => {
    const totals = calculateTotals();
    const extendedCosts: ExtendedJobCosts = {
      materials: totals.materials,
      labour: totals.labour,
      other: totals.other,
      notes,
      items: costItems
    };
    onUpdate(extendedCosts as JobCosts);
    setIsOpen(false);
    toast({
      title: "Costs Saved",
      description: `Total: £${totals.total.toLocaleString()}`,
    });
  };

  const handleAIParse = async () => {
    if (!aiInput.trim()) return;
    
    setIsProcessing(true);
    try {
      const { data, error } = await supabase.functions.invoke('parse-costs', {
        body: { input: aiInput }
      });

      if (error) throw error;

      if (data?.items && Array.isArray(data.items)) {
        // Add parsed items to existing items
        const newItems: CostItem[] = data.items.map((item: any, index: number) => ({
          id: `ai-${Date.now()}-${index}`,
          description: item.description || 'Item',
          amount: Number(item.amount) || 0,
          category: (['materials', 'labour', 'other'].includes(item.category) ? item.category : 'other') as 'materials' | 'labour' | 'other',
          enabled: true
        }));
        
        setCostItems(prev => [...prev, ...newItems]);
        setAiInput(''); // Clear input after successful parse
        toast({
          title: "Items Added",
          description: `Added ${newItems.length} cost item(s)`,
        });
      } else if (data?.costs) {
        // Fallback to legacy format
        const newItems: CostItem[] = [];
        if (data.costs.materials > 0) {
          newItems.push({
            id: `ai-materials-${Date.now()}`,
            description: 'Materials',
            amount: data.costs.materials,
            category: 'materials',
            enabled: true
          });
        }
        if (data.costs.labour > 0) {
          newItems.push({
            id: `ai-labour-${Date.now()}`,
            description: 'Labour',
            amount: data.costs.labour,
            category: 'labour',
            enabled: true
          });
        }
        if (data.costs.other > 0) {
          newItems.push({
            id: `ai-other-${Date.now()}`,
            description: 'Other',
            amount: data.costs.other,
            category: 'other',
            enabled: true
          });
        }
        setCostItems(prev => [...prev, ...newItems]);
        setAiInput('');
        toast({
          title: "Costs Parsed",
          description: `Added ${newItems.length} cost item(s)`,
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

  const toggleItem = (id: string) => {
    setCostItems(prev => prev.map(item => 
      item.id === id ? { ...item, enabled: !item.enabled } : item
    ));
  };

  const deleteItem = (id: string) => {
    setCostItems(prev => prev.filter(item => item.id !== id));
  };

  const addManualItem = (category: 'materials' | 'labour' | 'other') => {
    const newItem: CostItem = {
      id: `manual-${Date.now()}`,
      description: `New ${category}`,
      amount: 0,
      category,
      enabled: true
    };
    setCostItems(prev => [...prev, newItem]);
  };

  const updateItemAmount = (id: string, amount: number) => {
    setCostItems(prev => prev.map(item => 
      item.id === id ? { ...item, amount } : item
    ));
  };

  const updateItemDescription = (id: string, description: string) => {
    setCostItems(prev => prev.map(item => 
      item.id === id ? { ...item, description } : item
    ));
  };

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (open) {
      const extCosts = costs as ExtendedJobCosts;
      if (extCosts?.items && Array.isArray(extCosts.items)) {
        setCostItems(extCosts.items);
      }
      setNotes(costs?.notes || '');
    }
  };

  const getCategoryBadgeClass = (category: string) => {
    switch (category) {
      case 'materials': return 'bg-blue-500/20 text-blue-700 dark:text-blue-300 border-blue-500/30';
      case 'labour': return 'bg-green-500/20 text-green-700 dark:text-green-300 border-green-500/30';
      case 'other': return 'bg-orange-500/20 text-orange-700 dark:text-orange-300 border-orange-500/30';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const totals = calculateTotals();
  const hasData = totals.total > 0;

  return (
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button className="flex items-center">
          {hasData ? (
            <Badge className="bg-green-500/20 text-green-700 dark:text-green-400 border-green-500/30 cursor-pointer hover:bg-green-500/30">
              <PoundSterling className="w-3 h-3 mr-0.5" />
              {totals.total.toLocaleString('en-GB', { maximumFractionDigits: 2, minimumFractionDigits: 0 })}
            </Badge>
          ) : (
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs">
              <PoundSterling className="w-3 h-3 mr-1" />
              Add
            </Button>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-3" align="start">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-medium text-sm flex items-center gap-2">
              <PoundSterling className="w-4 h-4 text-green-500" />
              Job Costs
            </h4>
            <Badge variant="outline" className="font-mono text-sm">
              Total: £{totals.total.toLocaleString('en-GB', { maximumFractionDigits: 2, minimumFractionDigits: 0 })}
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
              placeholder="Type naturally, e.g: 'Materials £500, 2 workers for 3 days at £180 each, skip hire £150'"
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

          {/* Collapsible Cost Items List */}
          <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
            <CollapsibleTrigger asChild>
              <Button variant="outline" size="sm" className="w-full justify-between h-7">
                <span className="text-xs">Cost Items ({costItems.length})</span>
                {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2">
              {costItems.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-3">
                  No items yet. Use AI entry or add manually below.
                </p>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {costItems.map((item) => (
                    <div 
                      key={item.id} 
                      className={`flex items-center gap-1.5 p-1.5 rounded border ${
                        item.enabled ? 'bg-background' : 'bg-muted/50 opacity-50'
                      }`}
                    >
                      <Checkbox
                        checked={item.enabled}
                        onCheckedChange={() => toggleItem(item.id)}
                        className="h-3.5 w-3.5"
                      />
                      <Badge className={`text-[10px] px-1 py-0 ${getCategoryBadgeClass(item.category)}`}>
                        {item.category.charAt(0).toUpperCase()}
                      </Badge>
                      <Input
                        value={item.description}
                        onChange={(e) => updateItemDescription(item.id, e.target.value)}
                        className="h-6 text-xs flex-1 px-1.5"
                      />
                      <div className="relative">
                        <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">£</span>
                        <Input
                          type="number"
                          value={item.amount || ''}
                          onChange={(e) => updateItemAmount(item.id, Number(e.target.value))}
                          className="h-6 text-xs w-24 pl-4 pr-1 font-mono"
                          min={0}
                        />
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteItem(item.id)}
                        className="h-6 w-6 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {/* Manual Add Buttons */}
              <div className="flex gap-1.5 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => addManualItem('materials')}
                  className="flex-1 text-[10px] h-6"
                >
                  <Plus className="h-2.5 w-2.5 mr-0.5" />
                  Material
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => addManualItem('labour')}
                  className="flex-1 text-[10px] h-6"
                >
                  <Plus className="h-2.5 w-2.5 mr-0.5" />
                  Labour
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => addManualItem('other')}
                  className="flex-1 text-[10px] h-6"
                >
                  <Plus className="h-2.5 w-2.5 mr-0.5" />
                  Other
                </Button>
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Notes */}
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Notes</label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional notes..."
              className="min-h-[40px] text-xs resize-none"
            />
          </div>

          {/* Summary */}
          <div className="bg-muted/50 rounded-lg p-2 space-y-0.5 text-xs">
            <div className="text-[10px] text-muted-foreground mb-1">Summary (enabled items only)</div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Materials:</span>
              <span className="font-mono">£{totals.materials.toLocaleString('en-GB', { maximumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Labour:</span>
              <span className="font-mono">£{totals.labour.toLocaleString('en-GB', { maximumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Other:</span>
              <span className="font-mono">£{totals.other.toLocaleString('en-GB', { maximumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between pt-1 border-t border-border font-semibold">
              <span>Total:</span>
              <span className="font-mono text-green-600 dark:text-green-400">£{totals.total.toLocaleString('en-GB', { maximumFractionDigits: 2 })}</span>
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
