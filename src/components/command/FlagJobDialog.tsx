import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Flag, AlertTriangle, StickyNote, Info, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useCommandEvents } from "@/hooks/useCommandEvents";
import { useAdminAuth } from "@/hooks/useAdminAuth";

/**
 * Persists into the backend `command_events` table so flags are shared
 * across all admins in real time (no more browser localStorage).
 */

type Severity = "Urgent" | "Warning" | "Note";

const SEVERITIES: { value: Severity; label: string; icon: typeof Flag; cls: string; color: string }[] = [
  { value: "Urgent",  label: "Urgent",  icon: AlertTriangle, color: "#EF4444",
    cls: "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300" },
  { value: "Warning", label: "Warning", icon: Flag,           color: "#F97316",
    cls: "border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-300" },
  { value: "Note",    label: "Note",    icon: StickyNote,     color: "#3B82F6",
    cls: "border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-300" },
];

const CATEGORIES = [
  "Quality", "Safety", "Delay", "Access", "Materials",
  "Communication", "Tenant", "Other",
] as const;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  team: string;
  jobNumber?: string;
}

export function FlagJobDialog({ open, onOpenChange, team, jobNumber }: Props) {
  const { canEdit } = useAdminAuth();
  const [severity, setSeverity] = useState<Severity>("Warning");
  const [category, setCategory] = useState<string>("Quality");
  const [job, setJob] = useState(jobNumber || "");
  const [description, setDescription] = useState("");
  const { add } = useCommandEvents({ kinds: ["flag"] });

  useEffect(() => {
    if (open) {
      setSeverity("Warning");
      setCategory("Quality");
      setJob(jobNumber || "");
      setDescription("");
    }
  }, [open, jobNumber]);

  const save = async () => {
    if (!canEdit) return;
    if (!description.trim()) {
      toast.error("Add a short description of the issue");
      return;
    }
    try {
      await add({
        kind: "flag",
        severity: severity === "Urgent" ? "urgent" : severity === "Warning" ? "warning" : "note",
        category: "other",
        team,
        job_number: job.trim() || null,
        title: category,
        body: description.trim(),
        metadata: { rawSeverity: severity, rawCategory: category },
      });
      toast.success(`${severity} flag raised for ${team}`);
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to raise flag");
    }
  };


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Flag className="h-5 w-5 text-orange-600" />
            Raise a flag · {team}
          </DialogTitle>
          <DialogDescription>
            Record an issue against this team or job.
          </DialogDescription>
        </DialogHeader>

        {/* What flagging does */}
        <div className="rounded-lg border border-blue-200 bg-blue-50/60 dark:bg-blue-950/30 dark:border-blue-900 p-3 text-xs text-blue-900 dark:text-blue-200 flex gap-2">
          <Info className="h-4 w-4 mt-0.5 shrink-0" />
          <div className="space-y-1">
            <p className="font-semibold">What does flagging do?</p>
            <ul className="list-disc ml-4 space-y-0.5">
              <li>Adds the issue to the <span className="font-semibold">Live Log → Flags</span> feed.</li>
              <li>Increments the <span className="font-semibold">Active Alerts</span> tile on the Command Center.</li>
              <li>Marks the team row with the chosen severity colour for follow-up.</li>
              <li>Stays open until you mark it <span className="font-semibold">Resolved</span> in the Live Log.</li>
            </ul>
          </div>
        </div>

        {!canEdit && (
          <Badge variant="outline" className="w-fit">Read-only preview — raising flags is disabled for testers</Badge>
        )}

        {/* Severity */}
        <div>
          <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">
            Severity
          </p>
          <div className="grid grid-cols-3 gap-2">
            {SEVERITIES.map(s => {
              const active = severity === s.value;
              const Icon = s.icon;
              return (
                <button
                  key={s.value}
                  onClick={() => canEdit && setSeverity(s.value)}
                  disabled={!canEdit}
                  className={cn(
                    "flex items-center justify-center gap-1.5 rounded-lg border-2 px-3 py-2 text-sm font-medium transition",
                    active ? s.cls : "bg-card hover:border-foreground/30"
                  )}
                >
                  <Icon className="h-4 w-4" /> {s.label}
                  {active && <Check className="h-3.5 w-3.5 ml-auto" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Category */}
        <div>
          <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">
            Category
          </p>
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.map(c => {
              const active = category === c;
              return (
                <button
                  key={c}
                  onClick={() => canEdit && setCategory(c)}
                  disabled={!canEdit}
                  className={cn(
                    "px-2.5 py-1 rounded-md border text-xs font-medium transition",
                    active
                      ? "border-foreground bg-foreground text-background"
                      : "bg-card hover:border-foreground/30"
                  )}
                >
                  {c}
                </button>
              );
            })}
          </div>
        </div>

        {/* Job # */}
        <div>
          <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">
            Job number (optional)
          </p>
          <Input
            value={job}
            onChange={(e) => setJob(e.target.value)}
            disabled={!canEdit}
            placeholder="e.g. N2640199"
            className="h-9"
          />
        </div>

        {/* Description */}
        <div>
          <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">
            What's the issue? *
          </p>
          <Textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={!canEdit}
            placeholder="e.g. Tenant unreachable, materials short, overrun 2h+"
          />
        </div>

        <div className="flex items-center justify-between">
          <Badge variant="outline" className="text-xs">
            Will appear in Live Log immediately
          </Badge>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            {canEdit && (
              <Button onClick={save}>
                <Flag className="h-4 w-4 mr-1.5" /> Raise flag
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
