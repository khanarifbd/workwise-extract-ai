import { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Mic, MicOff, Square, Loader2, Send, Trash2, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface VoiceNoteRecorderProps {
  isOpen: boolean;
  onClose: () => void;
  teamId: string;
  teamName: string;
  onNoteCreated?: () => void;
}

export const VoiceNoteRecorder = ({
  isOpen,
  onClose,
  teamId,
  teamName,
  onNoteCreated,
}: VoiceNoteRecorderProps) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  
  const { toast } = useToast();

  // Cleanup on unmount or close
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [audioUrl]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!isOpen) {
      resetRecording();
    }
  }, [isOpen]);

  const resetRecording = useCallback(() => {
    setIsRecording(false);
    setIsPaused(false);
    setIsProcessing(false);
    setRecordingDuration(0);
    setError(null);
    
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
    setAudioBlob(null);
    setAudioUrl(null);
    audioChunksRef.current = [];
    
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    mediaRecorderRef.current = null;
  }, [audioUrl]);

  const startRecording = async () => {
    try {
      setError(null);
      audioChunksRef.current = [];
      
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      });
      
      streamRef.current = stream;
      
      // Use webm if available, fallback to mp4
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') 
        ? 'audio/webm;codecs=opus' 
        : MediaRecorder.isTypeSupported('audio/mp4')
          ? 'audio/mp4'
          : 'audio/webm';
      
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      
      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
      };
      
      mediaRecorder.start(1000); // Collect data every second
      setIsRecording(true);
      setRecordingDuration(0);
      
      // Start timer
      timerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
      
    } catch (err) {
      console.error('Error starting recording:', err);
      setError('Could not access microphone. Please grant permission and try again.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  const discardRecording = () => {
    resetRecording();
  };

  const submitRecording = async () => {
    if (!audioBlob) return;
    
    setIsProcessing(true);
    setError(null);
    
    try {
      // Convert blob to base64
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onloadend = () => {
          const base64 = (reader.result as string).split(',')[1];
          resolve(base64);
        };
        reader.onerror = reject;
      });
      reader.readAsDataURL(audioBlob);
      const audioBase64 = await base64Promise;
      
      // Send to edge function
      const { data, error: fnError } = await supabase.functions.invoke('process-voice-note', {
        body: {
          audioBase64,
          teamId,
          teamName,
          mimeType: audioBlob.type,
        },
      });
      
      if (fnError) {
        throw new Error(fnError.message || 'Failed to process voice note');
      }
      
      if (data?.error) {
        throw new Error(data.error);
      }
      
      toast({
        title: '✅ Voice Note Saved',
        description: data.note?.title || 'Your voice note has been processed and saved.',
      });
      
      onNoteCreated?.();
      onClose();
      
    } catch (err) {
      console.error('Submit error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to submit voice note';
      setError(errorMessage);
      toast({
        title: 'Failed to Save',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mic className="h-5 w-5 text-orange-600" />
            Voice Note
          </DialogTitle>
        </DialogHeader>
        
        <div className="py-6 flex flex-col items-center gap-4">
          {error && (
            <div className="w-full bg-destructive/10 text-destructive text-sm rounded-lg p-3 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
          
          {/* Recording visualization */}
          <div className={cn(
            "w-24 h-24 rounded-full flex items-center justify-center transition-all",
            isRecording 
              ? "bg-red-100 dark:bg-red-900/30 animate-pulse" 
              : audioBlob 
                ? "bg-green-100 dark:bg-green-900/30"
                : "bg-muted"
          )}>
            {isProcessing ? (
              <Loader2 className="h-10 w-10 text-orange-600 animate-spin" />
            ) : isRecording ? (
              <div className="relative">
                <Mic className="h-10 w-10 text-red-600 animate-pulse" />
                <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-sm font-mono">
                  {formatDuration(recordingDuration)}
                </span>
              </div>
            ) : audioBlob ? (
              <div className="text-center">
                <span className="text-2xl">🎙️</span>
                <span className="block text-xs text-muted-foreground mt-1">
                  {formatDuration(recordingDuration)}
                </span>
              </div>
            ) : (
              <MicOff className="h-10 w-10 text-muted-foreground" />
            )}
          </div>
          
          {/* Audio preview */}
          {audioUrl && !isRecording && (
            <audio controls src={audioUrl} className="w-full max-w-[250px]" />
          )}
          
          {/* Instructions */}
          {!isRecording && !audioBlob && !isProcessing && (
            <p className="text-sm text-muted-foreground text-center">
              Tap the microphone to start recording.<br />
              Speak clearly about jobs, teams, or issues.
            </p>
          )}
          
          {isRecording && (
            <p className="text-sm text-red-600 font-medium animate-pulse">
              Recording... Tap stop when done
            </p>
          )}
        </div>
        
        <DialogFooter className="flex-row gap-2 sm:gap-2">
          {!isRecording && !audioBlob && !isProcessing && (
            <>
              <Button variant="outline" onClick={onClose} className="flex-1">
                Cancel
              </Button>
              <Button 
                onClick={startRecording} 
                className="flex-1 bg-red-600 hover:bg-red-700"
              >
                <Mic className="h-4 w-4 mr-2" />
                Record
              </Button>
            </>
          )}
          
          {isRecording && (
            <Button 
              onClick={stopRecording} 
              className="w-full bg-red-600 hover:bg-red-700"
            >
              <Square className="h-4 w-4 mr-2" />
              Stop Recording
            </Button>
          )}
          
          {audioBlob && !isProcessing && (
            <>
              <Button 
                variant="outline" 
                onClick={discardRecording}
                className="flex-1"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Discard
              </Button>
              <Button 
                onClick={submitRecording} 
                className="flex-1 bg-green-600 hover:bg-green-700"
              >
                <Send className="h-4 w-4 mr-2" />
                Save Note
              </Button>
            </>
          )}
          
          {isProcessing && (
            <Button disabled className="w-full">
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Processing with AI...
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
