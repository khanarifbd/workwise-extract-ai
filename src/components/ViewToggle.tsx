import { Button } from '@/components/ui/button';
import { LayoutGrid, Table2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ViewToggleProps {
  view: 'table' | 'kanban';
  onViewChange: (view: 'table' | 'kanban') => void;
}

export const ViewToggle = ({ view, onViewChange }: ViewToggleProps) => {
  return (
    <div className="inline-flex items-center bg-muted rounded-lg p-1">
      <Button
        variant="ghost"
        size="sm"
        className={cn(
          "h-7 px-3 gap-1.5",
          view === 'table' && "bg-background shadow-sm"
        )}
        onClick={() => onViewChange('table')}
      >
        <Table2 className="w-4 h-4" />
        Table
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className={cn(
          "h-7 px-3 gap-1.5",
          view === 'kanban' && "bg-background shadow-sm"
        )}
        onClick={() => onViewChange('kanban')}
      >
        <LayoutGrid className="w-4 h-4" />
        Kanban
      </Button>
    </div>
  );
};
