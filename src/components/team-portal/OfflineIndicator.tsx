import { useState, useEffect } from 'react';
import { Wifi, WifiOff, RefreshCw, Loader2, Clock, CheckCircle2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { format, formatDistanceToNow, isToday, isYesterday } from 'date-fns';
import { cn } from '@/lib/utils';

interface OfflineIndicatorProps {
  isOnline: boolean;
  pendingSyncCount: number;
  isSyncing: boolean;
  lastSyncTime?: Date | null;
  onSync: () => void;
  onManualRefresh?: () => void;
  isRefreshing?: boolean;
  justSynced?: boolean; // New prop to trigger pulse animation
}

const formatLastSync = (date: Date): string => {
  if (isToday(date)) {
    return `Today at ${format(date, 'HH:mm')}`;
  }
  if (isYesterday(date)) {
    return `Yesterday at ${format(date, 'HH:mm')}`;
  }
  return formatDistanceToNow(date, { addSuffix: true });
};

export const OfflineIndicator = ({
  isOnline,
  pendingSyncCount,
  isSyncing,
  lastSyncTime,
  onSync,
  onManualRefresh,
  isRefreshing = false,
  justSynced = false,
}: OfflineIndicatorProps) => {
  const [showPulse, setShowPulse] = useState(false);
  const [prevSyncTime, setPrevSyncTime] = useState<Date | null>(null);

  // Trigger pulse animation when sync completes
  useEffect(() => {
    if (lastSyncTime && prevSyncTime && lastSyncTime.getTime() !== prevSyncTime.getTime()) {
      setShowPulse(true);
      const timer = setTimeout(() => setShowPulse(false), 2000);
      return () => clearTimeout(timer);
    }
    setPrevSyncTime(lastSyncTime || null);
  }, [lastSyncTime]);

  // Also trigger pulse when justSynced prop changes
  useEffect(() => {
    if (justSynced) {
      setShowPulse(true);
      const timer = setTimeout(() => setShowPulse(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [justSynced]);
  
  return (
    <div className={cn(
      "px-3 py-2 flex items-center justify-between gap-2 transition-all duration-300",
      !isOnline 
        ? 'bg-red-50 dark:bg-red-950 border-b border-red-200 dark:border-red-800' 
        : pendingSyncCount > 0 
          ? 'bg-yellow-50 dark:bg-yellow-950 border-b border-yellow-200 dark:border-yellow-800'
          : 'bg-green-50/50 dark:bg-green-950/30 border-b border-green-200/50 dark:border-green-800/50',
      showPulse && 'animate-[pulse_0.5s_ease-in-out_3]'
    )}>
      {/* Left side: Status + sync info */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        {isOnline ? (
          pendingSyncCount > 0 ? (
            <Wifi className="h-4 w-4 text-yellow-600 dark:text-yellow-400 flex-shrink-0" />
          ) : (
            <CheckCircle2 className={cn(
              "h-4 w-4 text-green-600 dark:text-green-400 flex-shrink-0 transition-transform",
              showPulse && "scale-125"
            )} />
          )
        ) : (
          <WifiOff className="h-4 w-4 text-red-600 dark:text-red-400 flex-shrink-0" />
        )}
        
        <div className="flex flex-col min-w-0">
          <span className={cn(
            "text-sm font-medium leading-tight",
            !isOnline 
              ? 'text-red-800 dark:text-red-200' 
              : pendingSyncCount > 0 
                ? 'text-yellow-800 dark:text-yellow-200'
                : 'text-green-800 dark:text-green-200'
          )}>
            {showPulse && isOnline && pendingSyncCount === 0 ? (
              <span className="flex items-center gap-1">
                <Sparkles className="h-3 w-3 animate-pulse" />
                Synced!
              </span>
            ) : (
              isOnline ? (pendingSyncCount > 0 ? 'Online' : 'Synced') : 'Offline'
            )}
          </span>
          
          {lastSyncTime && (
            <span className="text-xs text-muted-foreground flex items-center gap-1 truncate">
              <Clock className="h-3 w-3 flex-shrink-0" />
              <span className="truncate">Last: {formatLastSync(lastSyncTime)}</span>
            </span>
          )}
        </div>

        {pendingSyncCount > 0 && (
          <Badge variant="secondary" className="text-xs flex-shrink-0 ml-1">
            {pendingSyncCount} pending
          </Badge>
        )}
      </div>

      {/* Right side: Action buttons */}
      <div className="flex items-center gap-1 flex-shrink-0">
        {/* Sync pending button (when there are pending items) */}
        {isOnline && pendingSyncCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onSync}
            disabled={isSyncing}
            className="h-8 px-2"
          >
            {isSyncing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-1" />
                Sync
              </>
            )}
          </Button>
        )}

        {/* Manual refresh button (always available when online) */}
        {isOnline && onManualRefresh && (
          <Button
            variant="outline"
            size="sm"
            onClick={onManualRefresh}
            disabled={isRefreshing || isSyncing}
            className={cn(
              "h-8 px-2",
              showPulse && "ring-2 ring-green-500 ring-offset-1"
            )}
          >
            {isRefreshing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className={cn("h-4 w-4", showPulse && "text-green-600")} />
            )}
          </Button>
        )}
      </div>
    </div>
  );
};
