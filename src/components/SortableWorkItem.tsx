import { useState, useEffect } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { WorkItem } from '@/types/job';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Trash2, GripVertical, Search, AlertCircle, ChevronDown, ChevronUp, Crown, Check } from 'lucide-react';
import { SORCode, getSORCodeDetails, searchSORCodes } from '@/data/sorCodes';
import { cn } from '@/lib/utils';

interface SORSuggestion {
  code: string;
  description: string;
  cost: number;
  isPremium?: boolean;
  matchReason?: string;
}

interface SortableWorkItemProps {
  item: WorkItem;
  index: number;
  isAdditional: boolean;
  updateFn: (index: number, field: keyof WorkItem, value: string | number) => void;
  removeFn: (index: number) => void;
  onSORSearch: (term: string, index: number, isAdditional: boolean) => void;
  sorSearchIndex: number | null;
  sorSearchResults: SORCode[];
  onSelectSOR: (code: string, index: number, isAdditional: boolean) => void;
  onToggleSearch: (index: number) => void;
}

export const SortableWorkItem = ({
  item,
  index,
  isAdditional,
  updateFn,
  removeFn,
  onSORSearch,
  sorSearchIndex,
  sorSearchResults,
  onSelectSOR,
  onToggleSearch,
}: SortableWorkItemProps) => {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<SORSuggestion[]>([]);
  const [codeNotFound, setCodeNotFound] = useState(false);
  const [showManualCost, setShowManualCost] = useState(false);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  // Check if SOR code exists and get its cost when code changes
  useEffect(() => {
    if (item.sorCode && item.sorCode.length >= 4) {
      const sorDetails = getSORCodeDetails(item.sorCode);
      if (sorDetails) {
        // Code found - auto-populate cost if not already set or if cost is 0
        if (item.cost === 0 || !item.cost) {
          updateFn(index, 'cost', sorDetails.cost);
        }
        setCodeNotFound(false);
        setSuggestions([]);
        setShowSuggestions(false);
      } else {
        // Code not found - find alternative suggestions
        setCodeNotFound(true);
        findAlternativeCodes(item.description || item.sorCode);
      }
    } else {
      setCodeNotFound(false);
      setSuggestions([]);
    }
  }, [item.sorCode]);

  // Find alternative codes based on description
  const findAlternativeCodes = (searchTerm: string) => {
    if (!searchTerm) return;

    const results = searchSORCodes(searchTerm);
    
    if (results.length >= 2) {
      // Get 2 aligned codes + 1 premium option
      const primaryMatch = results[0];
      const alternativeMatch = results[1];
      
      // Find a premium option (higher cost, still relevant)
      let premiumMatch = results.find(r => r.cost > primaryMatch.cost && r.code !== primaryMatch.code && r.code !== alternativeMatch.code);
      
      if (!premiumMatch && results.length > 2) {
        premiumMatch = results[2];
      }

      const newSuggestions: SORSuggestion[] = [
        {
          code: primaryMatch.code,
          description: primaryMatch.description,
          cost: primaryMatch.cost,
          matchReason: `Best match for "${searchTerm.substring(0, 30)}..."`
        },
        {
          code: alternativeMatch.code,
          description: alternativeMatch.description,
          cost: alternativeMatch.cost,
          matchReason: `Alternative approach`
        }
      ];

      if (premiumMatch) {
        newSuggestions.push({
          code: premiumMatch.code,
          description: premiumMatch.description,
          cost: Math.round(premiumMatch.cost * 1.2), // Premium pricing
          isPremium: true,
          matchReason: `Premium option with enhanced scope`
        });
      }

      setSuggestions(newSuggestions);
    } else if (results.length === 1) {
      setSuggestions([{
        code: results[0].code,
        description: results[0].description,
        cost: results[0].cost,
        matchReason: `Only matching code found`
      }]);
    }
  };

  const handleSelectSuggestion = (suggestion: SORSuggestion) => {
    updateFn(index, 'sorCode', suggestion.code);
    updateFn(index, 'cost', suggestion.cost);
    setShowSuggestions(false);
    setCodeNotFound(false);
    setSuggestions([]);
  };

  const handleSelectSORFromSearch = (code: string) => {
    const sorDetails = getSORCodeDetails(code);
    onSelectSOR(code, index, isAdditional);
    if (sorDetails) {
      updateFn(index, 'cost', sorDetails.cost);
    }
  };

  // Get current SOR details for display
  const currentSORDetails = item.sorCode ? getSORCodeDetails(item.sorCode) : null;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex gap-2 items-start p-3 bg-muted/30 rounded-lg"
    >
      <button
        className="mt-2 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="w-4 h-4" />
      </button>
      <div className="flex-1 space-y-2">
        <div className="flex gap-2">
          <Input
            placeholder="Description"
            value={item.description}
            onChange={(e) => {
              updateFn(index, 'description', e.target.value);
              // If no SOR code set, enable manual cost entry
              if (!item.sorCode) {
                setShowManualCost(true);
              }
            }}
            className="text-sm flex-1"
          />
          {/* Manual cost toggle for custom descriptions */}
          {!item.sorCode && item.description && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground"
              onClick={() => setShowManualCost(!showManualCost)}
            >
              £ Cost
            </Button>
          )}
        </div>

        {/* SOR Code Display with Cost */}
        {currentSORDetails && (
          <div className="flex items-center gap-2 text-xs bg-primary/10 text-primary px-2 py-1 rounded">
            <Check className="w-3 h-3" />
            <span className="font-mono">{currentSORDetails.code}</span>
            <span className="text-muted-foreground">-</span>
            <span className="truncate flex-1">{currentSORDetails.description}</span>
            <span className="font-semibold">£{currentSORDetails.cost}</span>
          </div>
        )}

        <div className="flex gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[120px]">
            <div className="flex gap-1">
              <Input
                placeholder="SOR Code"
                value={item.sorCode}
                onChange={(e) => {
                  updateFn(index, 'sorCode', e.target.value);
                  onSORSearch(e.target.value, index, isAdditional);
                }}
                onFocus={() => {
                  if (item.sorCode.length >= 2) {
                    onSORSearch(item.sorCode, index, isAdditional);
                  }
                }}
                className={cn(
                  "w-28 font-mono text-xs",
                  codeNotFound && item.sorCode.length >= 4 && "border-amber-500"
                )}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-9 w-9"
                onClick={() => onToggleSearch(index)}
              >
                <Search className="w-3 h-3" />
              </Button>
            </div>

            {/* Code not found warning with suggestions toggle */}
            {codeNotFound && item.sorCode.length >= 4 && suggestions.length > 0 && (
              <div className="mt-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full text-xs text-amber-600 hover:text-amber-700 justify-start p-1 h-auto"
                  onClick={() => setShowSuggestions(!showSuggestions)}
                >
                  <AlertCircle className="w-3 h-3 mr-1" />
                  Code not found - {suggestions.length} alternatives
                  {showSuggestions ? <ChevronUp className="w-3 h-3 ml-auto" /> : <ChevronDown className="w-3 h-3 ml-auto" />}
                </Button>

                {/* Alternative code suggestions */}
                {showSuggestions && (
                  <div className="mt-1 bg-popover border border-border rounded-md shadow-lg p-2 space-y-2">
                    <p className="text-xs text-muted-foreground px-1">Select a replacement code:</p>
                    {suggestions.map((suggestion, idx) => (
                      <button
                        key={suggestion.code}
                        type="button"
                        className={cn(
                          "w-full p-2 text-left rounded-md text-sm transition-colors",
                          suggestion.isPremium 
                            ? "bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30" 
                            : "hover:bg-muted"
                        )}
                        onClick={() => handleSelectSuggestion(suggestion)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {suggestion.isPremium && <Crown className="w-3 h-3 text-amber-500" />}
                            <span className="font-mono text-primary">{suggestion.code}</span>
                          </div>
                          <span className={cn(
                            "font-semibold",
                            suggestion.isPremium ? "text-amber-600" : "text-foreground"
                          )}>
                            £{suggestion.cost}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">{suggestion.description}</p>
                        {suggestion.matchReason && (
                          <p className="text-xs text-primary/70 mt-0.5 italic">{suggestion.matchReason}</p>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Regular SOR search results */}
            {sorSearchIndex === index && sorSearchResults.length > 0 && (
              <div className="absolute z-10 top-full left-0 mt-1 w-80 bg-popover border border-border rounded-md shadow-lg max-h-48 overflow-auto">
                {sorSearchResults.map((sor) => (
                  <button
                    key={sor.code}
                    type="button"
                    className="w-full px-3 py-2 text-left hover:bg-muted text-sm flex justify-between items-center"
                    onClick={() => handleSelectSORFromSearch(sor.code)}
                  >
                    <div className="flex-1">
                      <span className="font-mono text-primary">{sor.code}</span>
                      <span className="text-muted-foreground ml-2 text-xs">{sor.description}</span>
                    </div>
                    <span className="font-semibold text-xs ml-2">£{sor.cost}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <Input
            type="number"
            placeholder="Qty"
            value={item.qty}
            onChange={(e) => updateFn(index, 'qty', parseInt(e.target.value) || 0)}
            className="w-16 text-sm"
          />
          <div className="relative">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">£</span>
            <Input
              type="number"
              placeholder="Cost"
              value={item.cost}
              onChange={(e) => updateFn(index, 'cost', parseFloat(e.target.value) || 0)}
              className={cn(
                "w-24 text-sm pl-6",
                currentSORDetails && "bg-primary/5"
              )}
            />
          </div>
        </div>

        {/* Manual cost entry for custom descriptions without SOR code */}
        {showManualCost && !item.sorCode && item.description && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 px-2 py-1.5 rounded">
            <span>Custom description - enter cost manually above</span>
          </div>
        )}

        {/* Total line cost display */}
        {item.qty > 0 && item.cost > 0 && (
          <div className="text-xs text-right text-muted-foreground">
            Line total: <span className="font-semibold text-foreground">£{(item.qty * item.cost).toLocaleString()}</span>
          </div>
        )}
      </div>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => removeFn(index)}
        className="text-destructive hover:text-destructive h-8 w-8"
      >
        <Trash2 className="w-4 h-4" />
      </Button>
    </div>
  );
};
