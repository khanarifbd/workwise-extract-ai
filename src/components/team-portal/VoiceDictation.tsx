import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Mic,
  Square,
  Loader2,
  Send,
  Trash2,
  AlertCircle,
  Sparkles,
  Languages,
  Check,
  Plus,
  Pencil,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface Question {
  id: string;
  phrase?: string;
  question: string;
}

interface Props {
  currentText: string;
  onAccept: (text: string) => void;
  fieldType?: "description" | "notes";
  jobContext?: string;
  /** Compact button label / variant */
  label?: string;
}

export const VoiceDictation = ({
  currentText,
  onAccept,
  fieldType = "description",
  jobContext,
  label,
}: Props) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "processing" | "review">("idle");
  const [draftText, setDraftText] = useState("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [appendMode, setAppendMode] = useState(true);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const { toast } = useToast();

  const reset = useCallback(() => {
    setIsRecording(false);
    setDuration(0);
    setAudioBlob(null);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
    setPhase("idle");
    setDraftText("");
    setQuestions([]);
    setAnswers({});
    setError(null);
    chunksRef.current = [];
    if (timerRef.current) clearInterval(timerRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    mediaRecorderRef.current = null;
  }, [audioUrl]);

  useEffect(() => {
    if (!isOpen) reset();
  }, [isOpen, reset]);

  useEffect(() => () => reset(), [reset]);

  const startRec = async () => {
    try {
      setError(null);
      chunksRef.current = [];
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/mp4")
        ? "audio/mp4"
        : "audio/webm";
      const mr = new MediaRecorder(stream, { mimeType: mime });
      mediaRecorderRef.current = mr;
      mr.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mime });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
      };
      mr.start(1000);
      setIsRecording(true);
      setDuration(0);
      timerRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
    } catch (e) {
      setError("Microphone permission denied. Enable it in browser settings.");
    }
  };

  const stopRec = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const blobToBase64 = (b: Blob) =>
    new Promise<string>((res, rej) => {
      const fr = new FileReader();
      fr.onloadend = () => res((fr.result as string).split(",")[1]);
      fr.onerror = rej;
      fr.readAsDataURL(b);
    });

  const transcribe = async () => {
    if (!audioBlob) return;
    setPhase("processing");
    setError(null);
    try {
      const audioBase64 = await blobToBase64(audioBlob);
      const { data, error: fnErr } = await supabase.functions.invoke("dictate-description", {
        body: {
          audioBase64,
          mimeType: audioBlob.type,
          existingText: currentText,
          appendMode,
          fieldType,
          jobContext,
        },
      });
      if (fnErr) throw new Error(fnErr.message || "Dictation failed");
      if (data?.error) throw new Error(data.error);
      setDraftText(data?.finalText || "");
      setQuestions(data?.questions || []);
      setPhase("review");
    } catch (e: any) {
      setError(e.message || "Dictation failed");
      setPhase("idle");
    }
  };

  const submitAnswers = async () => {
    const filled = questions
      .filter((q) => answers[q.id]?.trim())
      .map((q) => ({ question: q.question, answer: answers[q.id] }));
    if (!filled.length) {
      setQuestions([]);
      return;
    }
    setPhase("processing");
    try {
      const { data, error: fnErr } = await supabase.functions.invoke("dictate-description", {
        body: {
          draftText,
          existingText: "", // already merged
          appendMode: false,
          fieldType,
          jobContext,
          clarifications: filled,
        },
      });
      if (fnErr) throw new Error(fnErr.message);
      if (data?.error) throw new Error(data.error);
      setDraftText(data?.finalText || draftText);
      setQuestions(data?.questions || []);
      setAnswers({});
      setPhase("review");
    } catch (e: any) {
      setError(e.message);
      setPhase("review");
    }
  };

  const handleAccept = () => {
    if (!draftText.trim()) return;
    onAccept(draftText.trim());
    toast({
      title: "Dictation applied",
      description: `${fieldType === "notes" ? "Progress notes" : "Description"} updated.`,
    });
    setIsOpen(false);
  };

  const fmt = (s: number) =>
    `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(true)}
        className="h-7 px-2 text-xs gap-1 bg-gradient-to-r from-rose-500/10 to-orange-500/10 border-rose-200 dark:border-rose-800 hover:from-rose-500/20 hover:to-orange-500/20"
      >
        <Mic className="h-3 w-3 text-rose-600 dark:text-rose-400" />
        <span className="hidden sm:inline">{label || "Dictate"}</span>
        <span className="sm:hidden">🎙️</span>
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent
          className="max-w-md max-h-[92vh] overflow-hidden flex flex-col"
          aria-describedby={undefined}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-gradient-to-br from-rose-500 to-orange-500">
                <Mic className="h-4 w-4 text-white" />
              </div>
              Voice Dictation
              <span className="text-xs font-normal text-muted-foreground ml-1">
                ({fieldType === "notes" ? "progress notes" : "description"})
              </span>
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-3 py-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
              <Languages className="h-4 w-4 flex-shrink-0" />
              <span>
                Speak any language — AI auto-detects and writes the result in clear British English.
              </span>
            </div>

            {currentText.trim() && phase === "idle" && (
              <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
                <input
                  id="append-mode"
                  type="checkbox"
                  checked={appendMode}
                  onChange={(e) => setAppendMode(e.target.checked)}
                  className="h-4 w-4 accent-primary"
                />
                <label htmlFor="append-mode" className="text-xs flex items-center gap-1.5">
                  {appendMode ? <Plus className="h-3 w-3" /> : <Pencil className="h-3 w-3" />}
                  {appendMode ? "Append to existing text" : "Replace existing text"}
                </label>
              </div>
            )}

            {error && (
              <div className="flex items-start gap-2 rounded-lg bg-destructive/10 text-destructive text-sm p-3">
                <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {phase === "idle" && (
              <div className="flex flex-col items-center gap-3 py-4">
                <div
                  className={cn(
                    "w-24 h-24 rounded-full flex items-center justify-center transition-all",
                    isRecording
                      ? "bg-red-100 dark:bg-red-900/30 animate-pulse"
                      : audioBlob
                      ? "bg-green-100 dark:bg-green-900/30"
                      : "bg-muted",
                  )}
                >
                  {isRecording ? (
                    <Mic className="h-10 w-10 text-red-600 animate-pulse" />
                  ) : audioBlob ? (
                    <Check className="h-10 w-10 text-green-600" />
                  ) : (
                    <Mic className="h-10 w-10 text-muted-foreground" />
                  )}
                </div>
                <span className="font-mono text-sm">{fmt(duration)}</span>
                {audioUrl && !isRecording && (
                  <audio controls src={audioUrl} className="w-full max-w-[280px]" />
                )}
                {!isRecording && !audioBlob && (
                  <p className="text-xs text-muted-foreground text-center px-2">
                    Tap record. Speak naturally with all details — names, rooms, materials,
                    measurements, dates.
                  </p>
                )}
              </div>
            )}

            {phase === "processing" && (
              <div className="flex flex-col items-center gap-3 py-10">
                <Loader2 className="h-10 w-10 text-rose-500 animate-spin" />
                <p className="text-sm text-muted-foreground">
                  AI is transcribing & translating…
                </p>
              </div>
            )}

            {phase === "review" && (
              <div className="space-y-3">
                <div>
                  <label className="text-xs uppercase font-semibold text-muted-foreground flex items-center gap-1 mb-1">
                    <Sparkles className="h-3 w-3 text-violet-600" />
                    Transcribed text — edit freely
                  </label>
                  <Textarea
                    value={draftText}
                    onChange={(e) => setDraftText(e.target.value)}
                    rows={6}
                    className="text-sm"
                  />
                </div>

                {questions.length > 0 && (
                  <div className="rounded-lg border-2 border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 p-3 space-y-3">
                    <div className="text-xs font-bold uppercase text-amber-700 dark:text-amber-300 flex items-center gap-1">
                      <AlertCircle className="h-3.5 w-3.5" />
                      AI needs clarification
                    </div>
                    {questions.map((q) => (
                      <div key={q.id} className="space-y-1">
                        <div className="text-sm font-medium">
                          {q.question}
                          {q.phrase && (
                            <span className="ml-2 text-xs italic text-muted-foreground">
                              (re: "{q.phrase}")
                            </span>
                          )}
                        </div>
                        <Input
                          value={answers[q.id] || ""}
                          onChange={(e) =>
                            setAnswers((p) => ({ ...p, [q.id]: e.target.value }))
                          }
                          placeholder="Type your answer…"
                          className="h-9 text-sm"
                        />
                      </div>
                    ))}
                    <Button
                      size="sm"
                      onClick={submitAnswers}
                      className="w-full bg-amber-600 hover:bg-amber-700"
                    >
                      <Send className="h-3.5 w-3.5 mr-1.5" />
                      Apply answers & refine
                    </Button>
                  </div>
                )}

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      reset();
                    }}
                    className="flex-1"
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1" /> Discard
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      // Re-record additional segment that appends to current draft
                      reset();
                      setAppendMode(true);
                    }}
                    className="flex-1"
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" /> Add more
                  </Button>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="flex-row gap-2 sm:gap-2">
            {phase === "idle" && !isRecording && !audioBlob && (
              <>
                <Button variant="outline" onClick={() => setIsOpen(false)} className="flex-1">
                  Cancel
                </Button>
                <Button
                  onClick={startRec}
                  className="flex-1 bg-red-600 hover:bg-red-700"
                >
                  <Mic className="h-4 w-4 mr-2" /> Record
                </Button>
              </>
            )}
            {phase === "idle" && isRecording && (
              <Button onClick={stopRec} className="w-full bg-red-600 hover:bg-red-700">
                <Square className="h-4 w-4 mr-2" /> Stop
              </Button>
            )}
            {phase === "idle" && audioBlob && !isRecording && (
              <>
                <Button variant="outline" onClick={reset} className="flex-1">
                  <Trash2 className="h-4 w-4 mr-2" /> Discard
                </Button>
                <Button onClick={transcribe} className="flex-1 bg-rose-600 hover:bg-rose-700">
                  <Sparkles className="h-4 w-4 mr-2" /> Transcribe
                </Button>
              </>
            )}
            {phase === "review" && (
              <>
                <Button variant="outline" onClick={() => setIsOpen(false)} className="flex-1">
                  Cancel
                </Button>
                <Button
                  onClick={handleAccept}
                  disabled={!draftText.trim()}
                  className="flex-1 bg-green-600 hover:bg-green-700"
                >
                  <Check className="h-4 w-4 mr-2" /> Use text
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
