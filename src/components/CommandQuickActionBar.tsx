import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Flag, CheckCircle2, Mic, Phone, QrCode, X, Camera, AlertTriangle,
  Wrench, MessageSquare, ShieldAlert, Hammer, Users, BookOpen, Loader2,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useCommandMetrics } from "@/hooks/useCommandMetrics";

type SheetKey = "flag" | "complete" | "voice" | "call" | "qr" | null;

const CATEGORIES = [
  { id: "overrun", label: "Overrun", icon: AlertTriangle },
  { id: "signoff", label: "Sign-off", icon: CheckCircle2 },
  { id: "ppe", label: "PPE", icon: ShieldAlert },
  { id: "conduct", label: "Conduct", icon: Users },
  { id: "materials", label: "Materials", icon: Hammer },
  { id: "quality", label: "Quality", icon: Wrench },
  { id: "tenant", label: "Tenant", icon: MessageSquare },
  { id: "training", label: "Training", icon: BookOpen },
];

const TEAMS = [
  { name: "Gupi", phone: "+447000000001" },
  { name: "Shakthi", phone: "+447000000002" },
  { name: "Indika", phone: "+447000000003" },
  { name: "Abraham", phone: "+447000000004" },
  { name: "Jess", phone: "+447000000005" },
  { name: "Bartek", phone: "+447000000006" },
  { name: "John Temple", phone: "+447000000007" },
  { name: "Devon", phone: "+447000000008" },
  { name: "Dave Floor", phone: "+447000000009" },
];

export function CommandQuickActionBar() {
  const navigate = useNavigate();
  const { jobId } = useParams();
  const { jobs } = useCommandMetrics();
  const [open, setOpen] = useState<SheetKey>(null);
  const [collapsed, setCollapsed] = useState(false);

  // Collapse on scroll
  useEffect(() => {
    let last = window.scrollY;
    const onScroll = () => {
      const cur = window.scrollY;
      if (cur > last + 8) setCollapsed(true);
      else if (cur < last - 8) setCollapsed(false);
      last = cur;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const currentJob = jobId && Array.isArray(jobs) ? jobs.find((j: any) => j.id === jobId) : null;

  const buttons = [
    { key: "flag" as const, icon: Flag, label: "Flag", color: "text-rose-600" },
    { key: "complete" as const, icon: CheckCircle2, label: "Complete", color: "text-emerald-600" },
    { key: "voice" as const, icon: Mic, label: "Voice", color: "text-blue-600" },
    { key: "call" as const, icon: Phone, label: "Call", color: "text-indigo-600" },
    { key: "qr" as const, icon: QrCode, label: "Scan", color: "text-foreground" },
  ];

  return (
    <>
      <div
        onClick={() => collapsed && setCollapsed(false)}
        className={`fixed left-1/2 -translate-x-1/2 z-40 transition-all duration-200 bg-card border shadow-lg rounded-full
          ${collapsed ? "bottom-3 px-2 py-1.5" : "bottom-4 px-3 py-2"}`}
      >
        <div className="flex items-center gap-1">
          {buttons.map((b) => {
            const Icon = b.icon;
            return (
              <button
                key={b.key}
                onClick={(e) => { e.stopPropagation(); setOpen(b.key); }}
                aria-label={b.label}
                className={`flex flex-col items-center justify-center rounded-full hover:bg-muted active:scale-95 transition-all
                  ${collapsed ? "h-10 w-10" : "h-14 w-14"}`}
              >
                <Icon className={`${collapsed ? "h-5 w-5" : "h-6 w-6"} ${b.color}`} />
                {!collapsed && <span className="text-[10px] mt-0.5 font-medium">{b.label}</span>}
              </button>
            );
          })}
        </div>
      </div>

      <FlagSheet open={open === "flag"} onClose={() => setOpen(null)} currentJob={currentJob} />
      <CompleteSheet open={open === "complete"} onClose={() => setOpen(null)} />
      <VoiceSheet open={open === "voice"} onClose={() => setOpen(null)} currentJob={currentJob} />
      <CallSheet open={open === "call"} onClose={() => setOpen(null)} currentJob={currentJob} />
      <QRSheet open={open === "qr"} onClose={() => setOpen(null)} onScan={(id) => { setOpen(null); navigate(`/?category=${id}`); }} />
    </>
  );
}

// ---------- Flag Sheet ----------
function FlagSheet({ open, onClose, currentJob }: { open: boolean; onClose: () => void; currentJob: any }) {
  const [cat, setCat] = useState<string | null>(null);
  const [ref, setRef] = useState("");
  const [desc, setDesc] = useState("");

  useEffect(() => {
    if (open) {
      setCat(null);
      setRef(currentJob?.jobNumber || "");
      setDesc("");
    }
  }, [open, currentJob]);

  const submit = () => {
    if (!cat) return toast.error("Select a category");
    toast.success("Flag logged");
    onClose();
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="QUICK FLAG">
      <div className="grid grid-cols-4 gap-2">
        {CATEGORIES.map((c) => {
          const Icon = c.icon;
          const active = cat === c.id;
          return (
            <button
              key={c.id}
              onClick={() => setCat(c.id)}
              className={`flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition
                ${active ? "border-primary bg-primary/10" : "border-muted hover:border-muted-foreground/30"}`}
            >
              <Icon className="h-6 w-6" />
              <span className="text-xs font-medium">{c.label}</span>
            </button>
          );
        })}
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">Job reference</label>
        <Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Job #" />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">Description</label>
        <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} maxLength={200} placeholder="Brief description…" />
      </div>
      <Button onClick={submit} size="lg" className="w-full h-12">Submit Flag</Button>
    </BottomSheet>
  );
}

// ---------- Complete Sheet ----------
function CompleteSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { jobs } = useCommandMetrics();
  const list = (Array.isArray(jobs) ? jobs : []).filter(
    (j: any) => j.status !== "complete" && !j.isCompleted
  ).slice(0, 20);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => { if (open) setSelected(null); }, [open]);

  const confirm = () => {
    if (!selected) return toast.error("Select a job");
    toast.success(`Marked complete at ${new Date().toLocaleTimeString()}`);
    onClose();
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="QUICK COMPLETION">
      <div className="max-h-72 overflow-y-auto space-y-2">
        {list.length === 0 && <p className="text-sm text-muted-foreground">No in-progress jobs.</p>}
        {list.map((j: any) => (
          <button
            key={j.id}
            onClick={() => setSelected(j.id)}
            className={`w-full text-left p-3 rounded-lg border-2 transition
              ${selected === j.id ? "border-primary bg-primary/10" : "border-muted"}`}
          >
            <p className="font-semibold text-sm">#{j.jobNumber || "—"}</p>
            <p className="text-xs text-muted-foreground truncate">{j.address || j.description}</p>
          </button>
        ))}
      </div>
      <Button variant="outline" className="w-full h-11 gap-2">
        <Camera className="h-4 w-4" /> Add photos (optional)
      </Button>
      <Button onClick={confirm} size="lg" className="w-full h-12">Confirm Completion</Button>
    </BottomSheet>
  );
}

// ---------- Voice Sheet ----------
function VoiceSheet({ open, onClose, currentJob }: { open: boolean; onClose: () => void; currentJob: any }) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [transcribing, setTranscribing] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!open) {
      stop();
      setSeconds(0); setTranscript(""); setRecording(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => chunksRef.current.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setTranscribing(true);
        // Stub: replace with real STT call
        setTimeout(() => {
          setTranscript("(Transcribed voice note attached)");
          setTranscribing(false);
        }, 800);
      };
      rec.start();
      recorderRef.current = rec;
      setRecording(true);
      setSeconds(0);
      timerRef.current = window.setInterval(() => {
        setSeconds((s) => {
          if (s >= 29) { stop(); return 30; }
          return s + 1;
        });
      }, 1000);
    } catch {
      toast.error("Microphone access denied");
    }
  };

  const stop = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    setRecording(false);
  };

  const submit = () => {
    if (!transcript) return toast.error("Record a note first");
    toast.success(`Voice note attached${currentJob ? ` to #${currentJob.jobNumber}` : ""}`);
    onClose();
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="VOICE NOTE">
      <div className="flex flex-col items-center gap-4 py-4">
        <button
          onClick={recording ? stop : start}
          className={`h-24 w-24 rounded-full flex items-center justify-center transition-all
            ${recording ? "bg-destructive animate-pulse" : "bg-primary"}`}
        >
          <Mic className="h-10 w-10 text-white" />
        </button>
        <p className="text-2xl font-mono font-bold">{seconds.toString().padStart(2, "0")}s / 30s</p>
        <p className="text-sm text-muted-foreground">
          {recording ? "Recording… tap to stop" : transcript ? "Recorded" : "Tap to start (30s max)"}
        </p>
        {transcribing && <Loader2 className="h-5 w-5 animate-spin" />}
        {transcript && (
          <div className="w-full p-3 rounded-lg bg-muted">
            <p className="text-sm">{transcript}</p>
          </div>
        )}
      </div>
      <Button onClick={submit} size="lg" className="w-full h-12" disabled={!transcript}>Submit</Button>
    </BottomSheet>
  );
}

// ---------- Call Sheet ----------
function CallSheet({ open, onClose, currentJob }: { open: boolean; onClose: () => void; currentJob: any }) {
  const ordered = currentJob?.team
    ? [...TEAMS].sort((a, b) => (a.name === currentJob.team ? -1 : b.name === currentJob.team ? 1 : 0))
    : TEAMS;
  return (
    <BottomSheet open={open} onClose={onClose} title="QUICK CALL">
      <div className="space-y-2 max-h-80 overflow-y-auto">
        {ordered.map((t) => (
          <a
            key={t.name}
            href={`tel:${t.phone}`}
            onClick={() => { toast.success(`Calling ${t.name}…`); onClose(); }}
            className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-muted active:scale-[0.99] transition"
          >
            <div>
              <p className="font-semibold">{t.name}</p>
              {currentJob?.team === t.name && <p className="text-xs text-primary">Current job team</p>}
            </div>
            <div className="h-11 w-11 rounded-full bg-emerald-600 flex items-center justify-center">
              <Phone className="h-5 w-5 text-white" />
            </div>
          </a>
        ))}
      </div>
    </BottomSheet>
  );
}

// ---------- QR Sheet ----------
function QRSheet({ open, onClose, onScan }: { open: boolean; onClose: () => void; onScan: (id: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      return;
    }
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch {
        setError("Camera unavailable");
      }
    })();
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [open]);

  return (
    <BottomSheet open={open} onClose={onClose} title="SCAN JOB QR">
      <div className="aspect-square rounded-lg overflow-hidden bg-black relative">
        {error ? (
          <div className="absolute inset-0 flex items-center justify-center text-white text-sm">{error}</div>
        ) : (
          <>
            <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
            <div className="absolute inset-8 border-2 border-white/80 rounded-lg" />
          </>
        )}
      </div>
      <p className="text-sm text-muted-foreground text-center">Align the QR code within the frame</p>
      <Button variant="outline" onClick={() => onScan("demo")} className="w-full">Use demo scan</Button>
    </BottomSheet>
  );
}

// ---------- Shared bottom sheet ----------
function BottomSheet({ open, onClose, title, children }: {
  open: boolean; onClose: () => void; title: string; children: React.ReactNode;
}) {
  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[90vh] overflow-y-auto">
        <SheetHeader className="flex flex-row items-center justify-between space-y-0 mb-4">
          <SheetTitle>{title}</SheetTitle>
          <button onClick={onClose} aria-label="Close" className="h-8 w-8 rounded-full hover:bg-muted flex items-center justify-center">
            <X className="h-5 w-5" />
          </button>
        </SheetHeader>
        <div className="space-y-4 pb-4">{children}</div>
      </SheetContent>
    </Sheet>
  );
}

export default CommandQuickActionBar;
