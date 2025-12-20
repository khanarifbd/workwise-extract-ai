import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { WorkItem } from '@/types/job';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Trash2, GripVertical, Search } from 'lucide-react';
import { SORCode } from '@/data/sorCodes';

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
        <Input
          placeholder="Description"
          value={item.description}
          onChange={(e) => updateFn(index, 'description', e.target.value)}
          className="text-sm"
        />
        <div className="flex gap-2">
          <div className="relative flex-1">
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
                className="w-28 font-mono text-xs"
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
            {sorSearchIndex === index && sorSearchResults.length > 0 && (
              <div className="absolute z-10 top-full left-0 mt-1 w-64 bg-popover border border-border rounded-md shadow-lg max-h-48 overflow-auto">
                {sorSearchResults.map((sor) => (
                  <button
                    key={sor.code}
                    type="button"
                    className="w-full px-3 py-2 text-left hover:bg-muted text-sm"
                    onClick={() => onSelectSOR(sor.code, index, isAdditional)}
                  >
                    <span className="font-mono text-primary">{sor.code}</span>
                    <span className="text-muted-foreground ml-2 text-xs">{sor.description}</span>
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
          <Input
            type="number"
            placeholder="Cost"
            value={item.cost}
            onChange={(e) => updateFn(index, 'cost', parseFloat(e.target.value) || 0)}
            className="w-24 text-sm"
          />
        </div>
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
