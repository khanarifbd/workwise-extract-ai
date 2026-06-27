import { useState } from "react";
import { Bell, Check, X, AlertTriangle, CheckCircle2, Info, RefreshCw } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  useNotifications, markAllRead, markRead, dismiss, clearAll,
  ensureNotificationPermission, useCommandRealtime,
} from "@/lib/commandNotifications";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { formatDistanceToNow } from "date-fns";

const SEVERITY_ICON = {
  urgent: AlertTriangle,
  warning: AlertTriangle,
  success: CheckCircle2,
  info: Info,
} as const;

const SEVERITY_COLOR = {
  urgent: "text-destructive",
  warning: "text-amber-600",
  success: "text-emerald-600",
  info: "text-primary",
} as const;

export function CommandNotificationCenter() {
  useCommandRealtime();
  const notifications = useNotifications();
  const [open, setOpen] = useState(false);
  const unread = notifications.filter((n) => !n.read).length;
  const { refresh, refreshing, isStale, label } = useAutoRefresh();

  const requestPerm = async () => {
    const p = await ensureNotificationPermission();
    if (p === "granted") {
      // friendly confirmation note via the store
      const { pushNotification } = await import("@/lib/commandNotifications");
      pushNotification({ title: "Browser notifications enabled", severity: "success" });
    }
  };

  return (
    <div className="fixed top-3 right-3 z-40 flex items-center gap-2">
      <div className={`hidden md:flex items-center gap-2 text-xs px-3 py-1.5 rounded-full border bg-card shadow-sm ${isStale ? "border-destructive text-destructive" : "text-muted-foreground"}`}>
        <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
        Updated {label}{isStale && " · stale"}
        <button onClick={refresh} className="ml-1 underline hover:no-underline">refresh</button>
      </div>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="icon" className="relative h-10 w-10 rounded-full shadow-sm bg-card">
            <Bell className="h-5 w-5" />
            {unread > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-96 p-0">
          <div className="flex items-center justify-between p-3 border-b">
            <p className="font-semibold text-sm">Notifications</p>
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" onClick={markAllRead} disabled={unread === 0}>
                <Check className="h-3.5 w-3.5 mr-1" /> Mark read
              </Button>
              <Button variant="ghost" size="sm" onClick={clearAll} disabled={notifications.length === 0}>
                Clear
              </Button>
            </div>
          </div>

          {typeof Notification !== "undefined" && Notification.permission === "default" && (
            <div className="p-3 border-b bg-muted/50">
              <p className="text-xs mb-2">Enable browser notifications for urgent alerts.</p>
              <Button size="sm" onClick={requestPerm} className="h-7 text-xs">Enable</Button>
            </div>
          )}

          <ScrollArea className="max-h-96">
            {notifications.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No notifications</p>
            ) : (
              <div className="divide-y">
                {notifications.map((n) => {
                  const Icon = SEVERITY_ICON[n.severity];
                  return (
                    <div
                      key={n.id}
                      onClick={() => markRead(n.id)}
                      className={`p-3 flex gap-3 cursor-pointer hover:bg-muted/50 ${!n.read ? "bg-primary/5" : ""}`}
                    >
                      <Icon className={`h-5 w-5 mt-0.5 shrink-0 ${SEVERITY_COLOR[n.severity]}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{n.title}</p>
                        {n.body && <p className="text-xs text-muted-foreground line-clamp-2">{n.body}</p>}
                        <p className="text-[10px] text-muted-foreground mt-1">
                          {formatDistanceToNow(n.createdAt, { addSuffix: true })}
                        </p>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); dismiss(n.id); }}
                        className="opacity-50 hover:opacity-100"
                        aria-label="Dismiss"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export default CommandNotificationCenter;
