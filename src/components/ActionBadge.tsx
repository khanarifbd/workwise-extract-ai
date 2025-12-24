import { Badge } from '@/components/ui/badge';
import { NextAction, NEXT_ACTION_BADGES } from '@/types/contactHistory';
import { cn } from '@/lib/utils';

interface ActionBadgeProps {
  action: NextAction;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function ActionBadge({ action, className, size = 'md' }: ActionBadgeProps) {
  const badge = NEXT_ACTION_BADGES.find(b => b.value === action);
  
  if (!badge || action === 'none' || !badge.label) {
    return null;
  }

  const sizeClasses = {
    sm: 'text-[10px] px-1.5 py-0.5',
    md: 'text-xs px-2 py-0.5',
    lg: 'text-sm px-3 py-1',
  };

  return (
    <Badge
      className={cn(
        'font-bold tracking-wide border-0 whitespace-nowrap animate-pulse',
        sizeClasses[size],
        className
      )}
      style={{
        backgroundColor: badge.bgColor,
        color: badge.color,
      }}
    >
      {badge.label}
    </Badge>
  );
}
