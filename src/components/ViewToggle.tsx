import { Button } from '@/components/ui/button';
import { LayoutGrid, Table2, Calendar, ChevronDown, LayoutTemplate } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface ViewToggleProps {
  view: 'table' | 'kanban' | 'calendar';
  onViewChange: (view: 'table' | 'kanban' | 'calendar') => void;
}

const viewOptions = [
  { value: 'table' as const, label: 'Table', icon: Table2 },
  { value: 'kanban' as const, label: 'Kanban', icon: LayoutGrid },
  { value: 'calendar' as const, label: 'Calendar', icon: Calendar },
];

export const ViewToggle = ({ view, onViewChange }: ViewToggleProps) => {
  const currentView = viewOptions.find(v => v.value === view) || viewOptions[0];
  const CurrentIcon = currentView.icon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="gap-2">
          <LayoutTemplate className="w-4 h-4" />
          <span className="hidden md:inline">LAYOUT STYLE</span>
          <ChevronDown className="w-4 h-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-40">
        {viewOptions.map((option) => {
          const Icon = option.icon;
          return (
            <DropdownMenuItem
              key={option.value}
              onClick={() => onViewChange(option.value)}
              className={`flex items-center gap-2 cursor-pointer ${view === option.value ? 'bg-accent' : ''}`}
            >
              <Icon className="w-4 h-4" />
              {option.label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

