import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MessageSquare, Send, Mic, Square, Loader2, Check, Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface Team {
  team_id: string;
  team_name: string;
}

interface SendTeamMessageModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SendTeamMessageModal = ({ isOpen, onClose }: SendTeamMessageModalProps) => {
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeams, setSelectedTeams] = useState<string[]>([]);
  const [messageText, setMessageText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (!isOpen) return;
    const fetchTeams = async () => {
      const { data } = await supabase
        .from('team_access_codes')
        .select('team_id, team_name')
        .eq('is_active', true)
        .order('team_name');
      if (data) setTeams(data);
    };
    fetchTeams();
  }, [isOpen]);

  const toggleTeam = (teamId: string) => {
    setSelectedTeams(prev =>
      prev.includes(teamId) ? prev.filter(id => id !== teamId) : [...prev, teamId]
    );
  };

  const selectAllTeams = () => {
    if (selectedTeams.length === teams.length) {
      setSelectedTeams([]);
    } else {
      setSelectedTeams(teams.map(t => t.team_id));
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];
      setRecordingTime(0);

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);
        stream.getTracks().forEach(t => t.stop());
        if (timerRef.current) clearInterval(timerRef.current);
      };

      mediaRecorder.start();
      setIsRecording(true);
      timerRef.current = window.setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (err) {
      toast({ title: 'Microphone access denied', variant: 'destructive' });
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  };

  const handleSend = async () => {
    if (selectedTeams.length === 0) {
      toast({ title: 'Select at least one team', variant: 'destructive' });
      return;
    }
    if (!messageText.trim() && !audioBlob) {
      toast({ title: 'Enter a message or record audio', variant: 'destructive' });
      return;
    }

    setIsSending(true);
    try {
      let audioUrl: string | null = null;

      // Upload audio if present
      if (audioBlob) {
        const filename = `messages/audio-${Date.now()}.webm`;
        const { error: uploadError } = await supabase.storage
          .from('job-attachments')
          .upload(filename, audioBlob, { contentType: 'audio/webm' });
        
        if (uploadError) throw uploadError;
        
        const { data: urlData } = supabase.storage
          .from('job-attachments')
          .getPublicUrl(filename);
        audioUrl = urlData.publicUrl;
      }

      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-team-message`,
        {
          method: 'POST',
          headers: {
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            teamIds: selectedTeams,
            messageText: messageText.trim() || null,
            messageType: audioUrl ? 'audio' : 'text',
            audioUrl,
            senderName: 'Genie',
          }),
        }
      );

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to send');
      }

      const result = await response.json();
      toast({
        title: 'Messages Sent',
        description: `${result.count} message${result.count !== 1 ? 's' : ''} sent successfully.`,
      });

      // Reset
      setMessageText('');
      setAudioBlob(null);
      setSelectedTeams([]);
      setRecordingTime(0);
      onClose();
    } catch (error) {
      console.error('Send error:', error);
      toast({
        title: 'Failed to send',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSending(false);
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            Send Message to Teams
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Team selection */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium">Select Teams</label>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={selectAllTeams}>
                {selectedTeams.length === teams.length ? 'Deselect All' : 'Select All'}
              </Button>
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-[120px] overflow-y-auto p-2 border rounded-lg">
              {teams.map((team) => (
                <Badge
                  key={team.team_id}
                  variant={selectedTeams.includes(team.team_id) ? 'default' : 'outline'}
                  className={cn(
                    "cursor-pointer transition-all text-xs py-1 px-2",
                    selectedTeams.includes(team.team_id)
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted"
                  )}
                  onClick={() => toggleTeam(team.team_id)}
                >
                  {selectedTeams.includes(team.team_id) && <Check className="h-3 w-3 mr-1" />}
                  {team.team_name}
                </Badge>
              ))}
            </div>
            {selectedTeams.length > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                <Users className="h-3 w-3 inline mr-1" />
                {selectedTeams.length} team{selectedTeams.length !== 1 ? 's' : ''} selected
              </p>
            )}
          </div>

          {/* Message text */}
          <div>
            <label className="text-sm font-medium mb-1.5 block">Message</label>
            <Textarea
              placeholder="Type your message to the team..."
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              className="min-h-[100px] resize-none"
            />
          </div>

          {/* Audio recording */}
          <div className="flex items-center gap-2">
            {!isRecording && !audioBlob && (
              <Button variant="outline" size="sm" className="gap-1.5" onClick={startRecording}>
                <Mic className="h-4 w-4" />
                Record Audio
              </Button>
            )}
            {isRecording && (
              <div className="flex items-center gap-2">
                <Button variant="destructive" size="sm" className="gap-1.5" onClick={stopRecording}>
                  <Square className="h-3 w-3" />
                  Stop
                </Button>
                <span className="text-sm text-destructive font-mono animate-pulse">
                  ● {formatTime(recordingTime)}
                </span>
              </div>
            )}
            {audioBlob && !isRecording && (
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs">
                  🎙️ Audio recorded ({formatTime(recordingTime)})
                </Badge>
                <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive" onClick={() => { setAudioBlob(null); setRecordingTime(0); }}>
                  Remove
                </Button>
              </div>
            )}
          </div>

          {/* Send button */}
          <Button
            className="w-full gap-2"
            onClick={handleSend}
            disabled={isSending || selectedTeams.length === 0 || (!messageText.trim() && !audioBlob)}
          >
            {isSending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            {isSending ? 'Sending...' : `Send to ${selectedTeams.length} team${selectedTeams.length !== 1 ? 's' : ''}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
