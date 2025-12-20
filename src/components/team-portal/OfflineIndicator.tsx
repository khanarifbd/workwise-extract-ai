import { Wifi, WifiOff, RefreshCw, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface OfflineIndicatorProps {
  isOnline: boolean;
  pendingSyncCount: number;
  isSyncing: boolean;
  onSync: () => void;
}

export const OfflineIndicator = ({
  isOnline,
  pendingSyncCount,
  isSyncing,
  onSync,
}: OfflineIndicatorProps) => {
  if (isOnline && pendingSyncCount === 0) {
    return null;
  }

  return (
    <div className={`
      sticky top-0 z-20 px-4 py-2 flex items-center justify-between
      ${isOnline ? 'bg-yellow-50 dark:bg-yellow-950 border-b border-yellow-200 dark:border-yellow-800' : 'bg-red-50 dark:bg-red-950 border-b border-red-200 dark:border-red-800'}
    `}>
      <div className="flex items-center gap-2">
        {isOnline ? (
          <Wifi className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
        ) : (
          <WifiOff className="h-4 w-4 text-red-600 dark:text-red-400" />
        )}
        <span className={`text-sm font-medium ${isOnline ? 'text-yellow-800 dark:text-yellow-200' : 'text-red-800 dark:text-red-200'}`}>
          {isOnline ? 'Online' : 'Offline'}
        </span>
        {pendingSyncCount > 0 && (
          <Badge variant="secondary" className="text-xs">
            {pendingSyncCount} pending
          </Badge>
        )}
      </div>

      {isOnline && pendingSyncCount > 0 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onSync}
          disabled={isSyncing}
          className="h-7"
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
    </div>
  );
};
