import { useState, useEffect } from 'react';
import { X, Download, MessageCircle, Clock, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { fetchNotificationHistory } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';

interface NotificationHistoryModalProps {
  onClose: () => void;
}

interface NotificationRecord {
  id: string;
  job_id: string;
  job_number: string;
  team_name: string;
  whatsapp_number: string | null;
  message: string;
  sent_via: string;
  status: string;
  created_at: string;
}

export const NotificationHistoryModal = ({ onClose }: NotificationHistoryModalProps) => {
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    loadNotifications();
  }, []);

  const loadNotifications = async () => {
    try {
      setIsLoading(true);
      const data = await fetchNotificationHistory();
      setNotifications(data);
    } catch (error) {
      console.error('Error loading notifications:', error);
      toast({
        title: "Error",
        description: "Failed to load notification history",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const downloadCSV = () => {
    if (notifications.length === 0) {
      toast({
        title: "No data",
        description: "No notifications to export",
        variant: "destructive",
      });
      return;
    }

    const headers = ['Date', 'Job Number', 'Team', 'WhatsApp Number', 'Sent Via', 'Status', 'Message'];
    const rows = notifications.map(n => [
      format(new Date(n.created_at), 'dd/MM/yyyy HH:mm'),
      n.job_number,
      n.team_name,
      n.whatsapp_number || 'N/A',
      n.sent_via,
      n.status,
      `"${n.message.replace(/"/g, '""')}"`
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `notification-history-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    toast({
      title: "Downloaded",
      description: "Notification history exported successfully",
    });
  };

  const getStatusIcon = (status: string) => {
    if (status === 'sent') return <CheckCircle2 className="w-4 h-4 text-success" />;
    if (status === 'failed') return <XCircle className="w-4 h-4 text-destructive" />;
    return <Clock className="w-4 h-4 text-warning" />;
  };

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-3xl flex flex-col animate-scale-in" style={{ maxHeight: 'calc(100vh - 2rem)' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-muted/30 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <MessageCircle className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Notification History</h2>
              <p className="text-xs text-muted-foreground">{notifications.length} notifications sent</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={downloadCSV} disabled={notifications.length === 0}>
              <Download className="w-4 h-4 mr-2" />
              Export CSV
            </Button>
            <button onClick={onClose} className="p-2 hover:bg-muted rounded-lg transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5" style={{ minHeight: 0 }}>
          {isLoading ? (
            <div className="text-center text-muted-foreground py-8">Loading...</div>
          ) : notifications.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              <MessageCircle className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>No notifications sent yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className="flex items-start gap-3 p-3 rounded-lg border border-border bg-muted/20"
                >
                  {getStatusIcon(notification.status)}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono font-semibold text-primary text-sm">
                        {notification.job_number}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                        {notification.team_name}
                      </span>
                      <span className="text-xs text-muted-foreground ml-auto">
                        {format(new Date(notification.created_at), 'dd/MM/yy HH:mm')}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground truncate">{notification.message}</p>
                    <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                      <span>via {notification.sent_via}</span>
                      {notification.whatsapp_number && (
                        <span>• {notification.whatsapp_number}</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border bg-muted/30 flex-shrink-0">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
};
