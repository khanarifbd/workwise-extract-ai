import { useState, useMemo, useRef, useEffect } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import {
  X, Save, QrCode, Camera, Mic, MapPin, Square, Search, Check,
} from "lucide-react";
import { useJobs } from "@/hooks/useJobs";

export type LogEntryDraft = {
  jobReference?: string;
  jobId?: string;
  category: string;
  severity: string;
  team?: string;
  teamOther?: string;
  issueDescription: string;
  actionTaken?: string;
  followUp?: string;
  photoDataUrl?: string;
  voiceNoteBlobUrl?: string;
  location?: { lat: number; lng: number };
  createdAt: string;
};

interface AddLogEntryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave?: (entry: LogEntryDraft) => void;
  defaultJobReference?: string;
}

const CATEGORIES = [
  "Overrun", "Sign-off Delay", "PPE", "Conduct", "Language",
  "Materials", "Tenant Issue", "Quality", "Training",
  "Communication", "Professionalism", "Other",
];

const SEVERITIES = [
  { value: "Urgent", icon: "🔴", color: "bg-red-500/10 border-red-500 text-red-600 dark:text-red-400" },
  { value: "Warning", icon: "🟡", color: "bg-yellow-500/10 border-yellow-500 text-yellow-700 dark:text-yellow-400" },
  { value: "Note", icon: "💡", color: "bg-blue-500/10 border-blue-500 text-blue-700 dark:text-blue-400" },
  { value: "Resolved", icon: "✅", color: "bg-green-500/10 border-green-500 text-green-700 dark:text-green-400" },
];

const OPERATIVES = [
  "Gupi", "Shakthi", "Indika", "Abraham", "Jess", "Bartek",
  "John Temple", "Devon", "Dave Floor",
];

const PRESET_ISSUES = [
  "Job ran over scheduled time",
  "Team did not sign off on time",
  "Missing PPE on site",
  "Unprofessional conduct reported",
  "Inappropriate language used",
  "Materials not delivered / wrong materials",
  "Tenant complaint received",
  "Quality of work below standard",
  "Training opportunity identified",
  "Communication breakdown with office",
];

const ACTIONS = ["Call", "Warning", "Training", "Resolved", "Escalated", "In Progress"];
const FOLLOWUPS = ["Today", "Tomorrow", "This Week", "Next Week", "None"];

export default function AddLogEntryModal({
  open, onOpenChange, onSave, defaultJobReference,
}: AddLogEntryModalProps) {
  const { jobs } = useJobs();
  const [jobReference, setJobReference] = useState(defaultJobReference ?? "");
  const [jobId, setJobId] = useState<string | undefined>();
  const [showJobSuggestions, setShowJobSuggestions] = useState(false);
  const [category, setCategory] = useState<string>("");
  const [severity, setSeverity] = useState<string>("");
  const [team, setTeam] = useState<string>("");
  const [teamOther, setTeamOther] = useState("");
  const [presetIssues, setPresetIssues] = useState<string[]>([]);
  const [freeText, setFreeText] = useState("");
  const [actionTaken, setActionTaken] = useState<string>("");
  const [followUp, setFollowUp] = useState<string>("");
  const [photoDataUrl, setPhotoDataUrl] = useState<string | undefined>();
  const [voiceNoteBlobUrl, setVoiceNoteBlobUrl] = useState<string | undefined>();
  const [location, setLocation] = useState<{ lat: number; lng: number } | undefined>();
  const [isRecording, setIsRecording] = useState(false);

  const photoInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    if (!open) {
      // reset on close
      setJobReference(defaultJobReference ?? "");
      setJobId(undefined);
      setCategory("");
      setSeverity("");
      setTeam("");
      setTeamOther("");
      setPresetIssues([]);
      setFreeText("");
      setActionTaken("");
      setFollowUp("");
      setPhotoDataUrl(undefined);
      setVoiceNoteBlobUrl(undefined);
      setLocation(undefined);
    }
  }, [open, defaultJobReference]);

  const jobSuggestions = useMemo(() => {
    const q = jobReference.trim().toLowerCase();
    if (!q || q.length < 2) return [];
    return jobs
      .filter(
        (j) =>
          j.jobNumber?.toLowerCase().includes(q) ||
          j.address?.toLowerCase().includes(q) ||
          j.tenantName?.toLowerCase().includes(q)
      )
      .slice(0, 6);
  }, [jobs, jobReference]);

  const teamProvided = !!(team && team !== "Other") || !!(team === "Other" && teamOther.trim());
  const jobProvided = !!jobReference.trim();
  const canSave = !!category && !!severity && (jobProvided || teamProvided);

  const togglePreset = (p: string) =>
    setPresetIssues((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));

  const handlePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPhotoDataUrl(reader.result as string);
    reader.readAsDataURL(file);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      audioChunksRef.current = [];
      mr.ondataavailable = (ev) => audioChunksRef.current.push(ev.data);
      mr.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        setVoiceNoteBlobUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach((t) => t.stop());
      };
      mr.start();
      mediaRecorderRef.current = mr;
      setIsRecording(true);
    } catch {
      toast.error("Microphone access denied");
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  };

  const addLocation = () => {
    if (!navigator.geolocation) {
      toast.error("Geolocation not supported");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        toast.success("Location captured");
      },
      () => toast.error("Could not get location")
    );
  };

  const handleSave = () => {
    if (!canSave) {
      toast.error("Fill required fields (category, severity, and either job ref or team)");
      return;
    }
    const description = [...presetIssues, freeText].filter(Boolean).join(" • ");
    const entry: LogEntryDraft = {
      jobReference: jobReference.trim() || undefined,
      jobId,
      category,
      severity,
      team: team === "Other" ? undefined : team || undefined,
      teamOther: team === "Other" ? teamOther.trim() : undefined,
      issueDescription: description,
      actionTaken: actionTaken || undefined,
      followUp: followUp || undefined,
      photoDataUrl,
      voiceNoteBlobUrl,
      location,
      createdAt: new Date().toISOString(),
    };
    onSave?.(entry);
    toast.success("Log entry saved");
    onOpenChange(false);
  };

  const Chip = ({
    active, onClick, children,
  }: { active: boolean; onClick: () => void; children: React.ReactNode }) => (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-[44px] px-4 py-2 rounded-lg border-2 text-sm font-medium transition-all active:scale-95 ${
        active
          ? "border-primary bg-primary text-primary-foreground shadow-md"
          : "border-border bg-background hover:bg-accent"
      }`}
    >
      {children}
    </button>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl w-[95vw] h-[95vh] p-0 gap-0 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-background sticky top-0 z-10">
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="min-h-[44px]">
            <X className="w-5 h-5 mr-1" /> Cancel
          </Button>
          <h2 className="text-lg font-bold tracking-wide">ADD LOG ENTRY</h2>
          <Button onClick={handleSave} disabled={!canSave} className="min-h-[44px]">
            <Save className="w-5 h-5 mr-1" /> Save
          </Button>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-4 space-y-6">
            {/* Job Reference */}
            <section>
              <label className="block text-sm font-semibold mb-2">Job Reference</label>
              <div className="flex gap-2 relative">
                <div className="flex-1 relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={jobReference}
                    onChange={(e) => {
                      setJobReference(e.target.value);
                      setJobId(undefined);
                      setShowJobSuggestions(true);
                    }}
                    onFocus={() => setShowJobSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowJobSuggestions(false), 200)}
                    placeholder="Search job number, address, tenant..."
                    className="pl-10 min-h-[48px]"
                  />
                  {showJobSuggestions && jobSuggestions.length > 0 && (
                    <div className="absolute z-20 mt-1 w-full bg-popover border rounded-lg shadow-lg max-h-64 overflow-auto">
                      {jobSuggestions.map((j) => (
                        <button
                          key={j.id}
                          type="button"
                          onMouseDown={() => {
                            setJobReference(j.jobNumber || "");
                            setJobId(j.id);
                            setShowJobSuggestions(false);
                          }}
                          className="w-full text-left px-3 py-2 hover:bg-accent border-b last:border-b-0"
                        >
                          <div className="font-semibold text-sm">{j.jobNumber}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            {j.address} {j.tenantName ? `• ${j.tenantName}` : ""}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <Button
                  variant="outline"
                  className="min-h-[48px] px-3"
                  onClick={() => toast.info("QR scanner not yet wired")}
                  title="Scan QR"
                >
                  <QrCode className="w-5 h-5" />
                </Button>
              </div>
            </section>

            {/* Category */}
            <section>
              <label className="block text-sm font-semibold mb-2">
                Category <span className="text-red-500">*</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map((c) => (
                  <Chip key={c} active={category === c} onClick={() => setCategory(c)}>
                    {c}
                  </Chip>
                ))}
              </div>
            </section>

            {/* Severity */}
            <section>
              <label className="block text-sm font-semibold mb-2">
                Severity <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {SEVERITIES.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => setSeverity(s.value)}
                    className={`min-h-[56px] rounded-lg border-2 px-3 py-2 font-semibold transition-all active:scale-95 ${
                      severity === s.value ? s.color : "border-border bg-background hover:bg-accent"
                    }`}
                  >
                    <span className="mr-2 text-lg">{s.icon}</span>
                    {s.value}
                  </button>
                ))}
              </div>
            </section>

            {/* Team / Operative */}
            <section>
              <label className="block text-sm font-semibold mb-2">
                Team / Operative {!jobProvided && <span className="text-red-500">*</span>}
              </label>
              <div className="flex flex-wrap gap-2 mb-2">
                {OPERATIVES.map((o) => (
                  <Chip key={o} active={team === o} onClick={() => setTeam(o)}>
                    {o}
                  </Chip>
                ))}
                <Chip active={team === "Other"} onClick={() => setTeam("Other")}>
                  Other
                </Chip>
              </div>
              {team === "Other" && (
                <Input
                  value={teamOther}
                  onChange={(e) => setTeamOther(e.target.value)}
                  placeholder="Enter name..."
                  className="min-h-[48px]"
                />
              )}
            </section>

            {/* Issue Description */}
            <section>
              <label className="block text-sm font-semibold mb-2">Issue Description</label>
              <div className="flex flex-wrap gap-2 mb-3">
                {PRESET_ISSUES.map((p) => {
                  const active = presetIssues.includes(p);
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => togglePreset(p)}
                      className={`min-h-[40px] text-left px-3 py-2 rounded-lg border-2 text-xs transition-all ${
                        active
                          ? "border-primary bg-primary/10"
                          : "border-border bg-background hover:bg-accent"
                      }`}
                    >
                      {active && <Check className="w-3 h-3 inline mr-1" />} {p}
                    </button>
                  );
                })}
              </div>
              <Textarea
                value={freeText}
                onChange={(e) => setFreeText(e.target.value)}
                placeholder="Additional notes..."
                rows={3}
              />
            </section>

            {/* Action Taken */}
            <section>
              <label className="block text-sm font-semibold mb-2">Action Taken</label>
              <div className="flex flex-wrap gap-2">
                {ACTIONS.map((a) => (
                  <Chip key={a} active={actionTaken === a} onClick={() => setActionTaken(a)}>
                    {a}
                  </Chip>
                ))}
              </div>
            </section>

            {/* Follow-up */}
            <section>
              <label className="block text-sm font-semibold mb-2">Follow-up Needed</label>
              <div className="flex flex-wrap gap-2">
                {FOLLOWUPS.map((f) => (
                  <Chip key={f} active={followUp === f} onClick={() => setFollowUp(f)}>
                    {f}
                  </Chip>
                ))}
              </div>
            </section>

            {/* Media */}
            <section>
              <label className="block text-sm font-semibold mb-2">Media</label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  ref={photoInputRef}
                  onChange={handlePhoto}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-[56px]"
                  onClick={() => photoInputRef.current?.click()}
                >
                  <Camera className="w-5 h-5 mr-2" /> 📸 Add Photo
                </Button>
                {isRecording ? (
                  <Button
                    type="button"
                    variant="destructive"
                    className="min-h-[56px]"
                    onClick={stopRecording}
                  >
                    <Square className="w-5 h-5 mr-2" /> Stop Recording
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-[56px]"
                    onClick={startRecording}
                  >
                    <Mic className="w-5 h-5 mr-2" /> 🎤 Voice Note
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-[56px]"
                  onClick={addLocation}
                >
                  <MapPin className="w-5 h-5 mr-2" /> 📍 Add Location
                </Button>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {photoDataUrl && (
                  <div className="relative">
                    <img src={photoDataUrl} alt="captured" className="w-24 h-24 object-cover rounded-lg border" />
                    <button
                      onClick={() => setPhotoDataUrl(undefined)}
                      className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full w-5 h-5 flex items-center justify-center text-xs"
                    >
                      ×
                    </button>
                  </div>
                )}
                {voiceNoteBlobUrl && (
                  <div className="flex items-center gap-2 px-3 py-2 border rounded-lg">
                    <audio controls src={voiceNoteBlobUrl} className="h-8" />
                    <button
                      onClick={() => setVoiceNoteBlobUrl(undefined)}
                      className="text-destructive text-sm"
                    >
                      Remove
                    </button>
                  </div>
                )}
                {location && (
                  <Badge variant="secondary" className="text-xs">
                    📍 {location.lat.toFixed(4)}, {location.lng.toFixed(4)}
                  </Badge>
                )}
              </div>
            </section>

            {/* Validation hint */}
            {!canSave && (
              <p className="text-xs text-muted-foreground italic">
                Category and severity are required. If no job reference, a team/operative is required.
              </p>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
