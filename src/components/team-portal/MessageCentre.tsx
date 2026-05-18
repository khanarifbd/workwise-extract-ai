import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MessageSquare, ArrowLeft, Volume2, Check, CheckCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { format, isToday, isYesterday } from 'date-fns';

interface Message {
  id: string;
  team_id: string;
  team_name: string;
  sender_name: string;
  message_type: string;
  message_text: string | null;
  audio_url: string | null;
  is_read: boolean;
  created_at: string;
}

interface MessageCentreProps {
  teamId: string;
  teamName: string;
}

export const MessageCentre = ({ teamId, teamName }: MessageCentreProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const fetchMessages = useCallback(async () => {
    try {
      
      // Use fetch directly since invoke doesn't support query params well for GET
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-team-messages?teamId=${teamId}`;
      const response = await fetch(url, {
        headers: {
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          'Content-Type': 'application/json',
        },
      });
      
      if (response.ok) {
        const result = await response.json();
        setMessages(result.messages || []);
        setUnreadCount((result.messages || []).filter((m: Message) => !m.is_read).length);
      }
    } catch (err) {
      console.error('Error fetching messages:', err);
    }
  }, [teamId]);

  const markAsRead = useCallback(async () => {
    if (unreadCount === 0) return;
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mark-messages-read`;
      await fetch(url, {
        method: 'POST',
        headers: {
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ teamId }),
      });
      setMessages(prev => prev.map(m => ({ ...m, is_read: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error('Error marking messages read:', err);
    }
  }, [teamId, unreadCount]);

  // Fetch on mount
  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  // Poll every 15 seconds
  useEffect(() => {
    const interval = setInterval(fetchMessages, 15000);
    return () => clearInterval(interval);
  }, [fetchMessages]);

  // Listen for realtime inserts
  useEffect(() => {
    const channel = supabase
      .channel(`team-messages-${teamId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'team_messages', filter: `team_id=eq.${teamId}` },
        (payload) => {
          const newMsg = payload.new as Message;
          setMessages(prev => [newMsg, ...prev]);
          setUnreadCount(prev => prev + 1);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [teamId]);

  // Mark as read when opening
  useEffect(() => {
    if (isOpen && unreadCount > 0) {
      markAsRead();
    }
  }, [isOpen, unreadCount, markAsRead]);

  const playAudio = (messageId: string, audioUrl: string) => {
    if (playingAudioId === messageId) {
      audioRef.current?.pause();
      setPlayingAudioId(null);
      return;
    }
    if (audioRef.current) audioRef.current.pause();
    const audio = new Audio(audioUrl);
    audioRef.current = audio;
    setPlayingAudioId(messageId);
    audio.play();
    audio.onended = () => setPlayingAudioId(null);
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    if (isToday(date)) return format(date, 'HH:mm');
    if (isYesterday(date)) return `Yesterday ${format(date, 'HH:mm')}`;
    return format(date, 'dd MMM HH:mm');
  };

  return (
    <>
      {/* Message icon button */}
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-primary-foreground/80 hover:text-primary-foreground hover:bg-white/10 relative"
        onClick={() => setIsOpen(true)}
      >
        <MessageSquare className="h-3.5 w-3.5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-destructive text-destructive-foreground text-[9px] font-bold rounded-full h-4 min-w-4 flex items-center justify-center px-0.5 animate-pulse">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </Button>

      {/* Fullscreen message panel overlay */}
      {isOpen && (
        <div className="fixed inset-0 z-[2147483646] bg-background flex flex-col safe-area-bottom safe-area-left safe-area-right">
          {/* Floating Back button — fixed position, max z-index, can never be covered */}
          <button
            type="button"
            className="fixed left-3 z-[2147483647] h-11 min-w-[92px] px-4 flex items-center justify-center gap-1.5 rounded-full bg-black/80 hover:bg-black active:bg-black text-white shadow-lg backdrop-blur-sm font-semibold text-sm border border-white/20"
            style={{ top: 'calc(env(safe-area-inset-top, 0px) + 0.5rem)' }}
            onClick={() => setIsOpen(false)}
            aria-label="Back to home"
          >
            <ArrowLeft className="h-5 w-5" />
            <span>Back</span>
          </button>

          {/* Header — leaves room for the floating Back button on the left */}
          <div
            className="bg-gradient-to-r from-primary to-[hsl(38,92%,50%)] text-primary-foreground px-3 pb-3"
            style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.5rem)' }}
          >
            <div className="flex items-center justify-end gap-2 mb-2 pl-[108px] min-h-11">
              <span className="text-[10px] text-primary-foreground/70 pr-1">
                {messages.length} message{messages.length !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="flex items-center gap-2 px-1">
              <MessageSquare className="h-5 w-5" />
              <h2 className="text-sm font-bold">Messages</h2>
            </div>
          </div>

          {/* Messages list */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
                <MessageSquare className="h-12 w-12 opacity-20" />
                <p className="text-sm">No messages yet</p>
                <p className="text-xs text-center">Messages from your manager will appear here</p>
              </div>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={cn(
                    "rounded-xl p-3 border transition-all",
                    msg.is_read
                      ? "bg-card border-border/50"
                      : "bg-primary/5 border-primary/20 shadow-sm"
                  )}
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold text-foreground">{msg.sender_name}</span>
                      {!msg.is_read && (
                        <Badge className="text-[9px] px-1 py-0 h-[14px] bg-primary text-primary-foreground">NEW</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      {msg.is_read ? (
                        <CheckCheck className="h-3 w-3 text-primary" />
                      ) : (
                        <Check className="h-3 w-3" />
                      )}
                      {formatTime(msg.created_at)}
                    </div>
                  </div>

                  {msg.message_text && (
                    <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">
                      {msg.message_text}
                    </p>
                  )}

                  {msg.message_type === 'audio' && msg.audio_url && (
                    <Button
                      variant="outline"
                      size="sm"
                      className={cn(
                        "mt-2 h-8 text-xs gap-1.5 rounded-full",
                        playingAudioId === msg.id && "bg-primary text-primary-foreground"
                      )}
                      onClick={() => playAudio(msg.id, msg.audio_url!)}
                    >
                      <Volume2 className={cn("h-3.5 w-3.5", playingAudioId === msg.id && "animate-pulse")} />
                      {playingAudioId === msg.id ? 'Playing...' : 'Play Audio'}
                    </Button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </>
  );
};
