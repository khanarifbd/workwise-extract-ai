import { useState, useEffect } from 'react';
import { Bell, CheckCircle2, Image, Video, FileText, Wrench, X, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNow } from 'date-fns';

interface SignOffNotification {
  id: string;
  job_id: string;
  job_number: string;
  job_name: string;
  team_name: string;
  photos_count: number;
  videos_count: number;
  documents_count: number;
  work_items_modified: number;
  work_items_total: number;
  progress_notes: string | null;
  is_read: boolean;
  created_at: string;
}

interface SignOffNotificationBellProps {
  onJobClick?: (jobId: string) => void;
}

export const SignOffNotificationBell = ({ onJobClick }: SignOffNotificationBellProps) => {
  const [notifications, setNotifications] = useState<SignOffNotification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const unreadCount = notifications.filter(n => !n.is_read).length;

  const fetchNotifications = async () => {
    try {
      const { data, error } = await supabase
        .from('team_sign_off_notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      setNotifications((data as SignOffNotification[]) || []);
    } catch (error) {
      console.error('Failed to fetch sign-off notifications:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();

    // Subscribe to new notifications
    const channel = supabase
      .channel('sign-off-notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'team_sign_off_notifications',
        },
        () => {
          fetchNotifications();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const markAsRead = async (id: string) => {
    try {
      await supabase
        .from('team_sign_off_notifications')
        .update({ is_read: true })
        .eq('id', id);

      setNotifications(prev =>
        prev.map(n => (n.id === id ? { ...n, is_read: true } : n))
      );
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      const unreadIds = notifications.filter(n => !n.is_read).map(n => n.id);
      if (unreadIds.length === 0) return;

      await supabase
        .from('team_sign_off_notifications')
        .update({ is_read: true })
        .in('id', unreadIds);

      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    } catch (error) {
      console.error('Failed to mark all as read:', error);
    }
  };

  const handleNotificationClick = (notification: SignOffNotification) => {
    if (!notification.is_read) {
      markAsRead(notification.id);
    }
    if (onJobClick) {
      onJobClick(notification.job_id);
    }
    setIsOpen(false);
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs bg-destructive text-destructive-foreground"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0" align="end">
        <div className="flex items-center justify-between p-3 border-b">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-success" />
            Team Sign-Offs
          </h3>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-7"
              onClick={markAllAsRead}
            >
              <Check className="h-3 w-3 mr-1" />
              Mark all read
            </Button>
          )}
        </div>

        <ScrollArea className="max-h-96">
          {isLoading ? (
            <div className="p-4 text-center text-muted-foreground text-sm">
              Loading...
            </div>
          ) : notifications.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground text-sm">
              No sign-off notifications yet
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map(notification => (
                <div
                  key={notification.id}
                  onClick={() => handleNotificationClick(notification)}
                  className={`p-3 cursor-pointer transition-colors hover:bg-muted/50 ${
                    !notification.is_read ? 'bg-primary/5' : ''
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <div
                      className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${
                        notification.is_read ? 'bg-muted' : 'bg-success'
                      }`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium text-sm truncate">
                          {notification.job_name}
                        </p>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatDistanceToNow(new Date(notification.created_at), {
                            addSuffix: true,
                          })}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground font-mono">
                        {notification.job_number}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Signed off by{' '}
                        <span className="font-medium text-foreground">
                          {notification.team_name}
                        </span>
                      </p>

                      {/* Summary badges */}
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {notification.photos_count > 0 && (
                          <Badge variant="secondary" className="text-xs gap-1">
                            <Image className="h-3 w-3" />
                            {notification.photos_count}
                          </Badge>
                        )}
                        {notification.videos_count > 0 && (
                          <Badge variant="secondary" className="text-xs gap-1">
                            <Video className="h-3 w-3" />
                            {notification.videos_count}
                          </Badge>
                        )}
                        {notification.documents_count > 0 && (
                          <Badge variant="secondary" className="text-xs gap-1">
                            <FileText className="h-3 w-3" />
                            {notification.documents_count}
                          </Badge>
                        )}
                        {notification.work_items_modified > 0 && (
                          <Badge
                            variant="outline"
                            className="text-xs gap-1 text-amber-600 border-amber-600"
                          >
                            <Wrench className="h-3 w-3" />
                            {notification.work_items_modified} modified
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
};
