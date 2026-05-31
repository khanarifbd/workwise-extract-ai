import { useRoleMode, RoleMode } from '@/contexts/RoleModeContext';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { UserCog, Sparkles, BarChart3, Check } from 'lucide-react';

const LABELS: Record<RoleMode, { name: string; tone: string; icon: React.ReactNode }> = {
  default: { name: 'Default', tone: 'bg-muted text-foreground', icon: <UserCog className="h-3.5 w-3.5" /> },
  daniella: { name: 'Daniella', tone: 'bg-rose-600 text-white', icon: <Sparkles className="h-3.5 w-3.5" /> },
  nav: { name: 'Nav', tone: 'bg-indigo-600 text-white', icon: <BarChart3 className="h-3.5 w-3.5" /> },
};

export function RoleModeSwitcher() {
  const { mode, setMode } = useRoleMode();
  const current = LABELS[mode];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline" className={`gap-1.5 ${mode !== 'default' ? current.tone : ''}`}>
          {current.icon}
          <span className="text-xs font-bold">{current.name} Mode</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Role Mode</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {(Object.keys(LABELS) as RoleMode[]).map(m => (
          <DropdownMenuItem key={m} onClick={() => setMode(m)} className="gap-2">
            {LABELS[m].icon}
            <span className="flex-1">{LABELS[m].name}</span>
            {mode === m && <Check className="h-3.5 w-3.5" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
