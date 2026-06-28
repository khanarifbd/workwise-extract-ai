import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Phone, History, Plus, Check, User, MapPin, Calendar, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export type TeamCallOutcome =
  | "ringing"
  | "spoke"
  | "voicemail"
  | "no_answer"
  | "busy"
  | "wrong_number"
  | "callback_scheduled";

export const TEAM_CALL_OUTCOMES: {
  value: TeamCallOutcome; label: string; icon: string; color: string;
}[] = [
  { value: "spoke",              label: "Spoke",              icon: "💬",  color: "#10B981" },
  { value: "ringing",            label: "Ringing (No Pickup)",icon: "📞",  color: "#3B82F6" },
  { value: "voicemail",          label: "Voicemail Left",     icon: "📧",  color: "#8B5CF6" },
  { value: "no_answer",          label: "No Answer",          icon: "📵",  color: "#F97316" },
  { value: "busy",               label: "Line Busy",          icon: "⏳",  color: "#EAB308" },
  { value: "callback_scheduled", label: "Callback Scheduled", icon: "📅",  color: "#06B6D4" },
  { value: "wrong_number",       label: "Wrong Number",       icon: "❌",  color: "#EF4444" },
];

export interface TeamCallEntry {
  id: string;
  team: string;
  phone: string;
  contactDate: string;
  outcome: TeamCallOutcome;
  notes?: string;
}

const STORE_KEY = "command.teamCallLog.v1";

function readAll(): TeamCallEntry[] {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || "[]"); } catch { return []; }
}
function writeAll(entries: TeamCallEntry[]) {
  localStorage.setItem(STORE_KEY, JSON.stringify(entries));
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  team: string;
  phone: string;
  jobNumber?: string;
  address?: string;
  bookedDate?: Date | null;
  description?: string;
}

export function TeamCallLogDialog({
  open, onOpenChange, team, phone, jobNumber, address, bookedDate, description,
}: Props) {
  const [all, setAll] = useState<TeamCallEntry[]>([]);
  const [outcome, setOutcome] = useState<TeamCallOutcome | null>(null);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (open) {
      setAll(readAll());
      setOutcome(null);
      setNotes("");
    }
  }, [open]);

  const history = useMemo(
    () => all
      .filter(e => e.team === team)
      .sort((a, b) => new Date(b.contactDate).getTime() - new Date(a.contactDate).getTime()),
    [all, team]
  );

  const bookedLabel = bookedDate
    ? new Date(bookedDate).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "2-digit" })
    : null;

  const save = () => {
    if (!outcome) {
      toast.error("Select a call outcome first");
      return;
    }
    const entry: TeamCallEntry = {
      id: crypto.randomUUID(),
      team,
      phone,
      contactDate: new Date().toISOString(),
      outcome,
      notes: notes.trim() || undefined,
    };
    const next = [entry, ...all];
    writeAll(next);
    setAll(next);
    setOutcome(null);
    setNotes("");
    toast.success(`Logged: ${TEAM_CALL_OUTCOMES.find(o => o.value === entry.outcome)?.label}`);
  };

  const dial = () => {
    if (phone) window.location.href = `tel:${phone}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5 text-blue-600" />
            Call Log — {team}
          </DialogTitle>
          <DialogDescription>
            Log the outcome of your call attempt. Tap the number to dial.
          </DialogDescription>
        </DialogHeader>

        {/* Tenant / job context card */}
        <div className="rounded-xl border bg-muted/30 p-4 space-y-3">
          {jobNumber && (
            <Badge variant="outline" className="font-mono text-xs">{jobNumber}</Badge>
          )}
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground" />
            <span className="text-lg font-semibold">{team || "Tenant"}</span>
          </div>
          {address && (
            <div className="flex items-start gap-2 text-sm text-muted-foreground">
              <MapPin className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{address}</span>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={dial}
              className="rounded-lg border border-orange-500/40 bg-orange-500/10 hover:bg-orange-500/20 px-3 py-2 text-left transition"
            >
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Phone Number</div>
              <div className="font-mono text-lg font-bold text-orange-500 tabular-nums truncate">
                {phone || "—"}
              </div>
            </button>
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                <Calendar className="h-3 w-3" /> Booked Date
              </div>
              <div className="font-mono text-lg font-bold text-amber-500 tabular-nums">
                {bookedLabel || "—"}
              </div>
            </div>
          </div>
          {description && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1 mb-1">
                <FileText className="h-3 w-3" /> Job Description
              </div>
              <div className="rounded-lg border border-orange-500/40 bg-background/40 px-3 py-2 text-sm whitespace-pre-wrap max-h-32 overflow-y-auto">
                {description}
              </div>
            </div>
          )}
        </div>

        {/* Outcome selector */}
        <div>
          <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">
            Call outcome
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {TEAM_CALL_OUTCOMES.map(o => {
              const active = outcome === o.value;
              return (
                <button
                  key={o.value}
                  onClick={() => setOutcome(o.value)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition text-left",
                    active
                      ? "border-transparent text-white shadow-sm"
                      : "bg-card hover:border-foreground/30"
                  )}
                  style={active ? { backgroundColor: o.color } : undefined}
                >
                  <span>{o.icon}</span>
                  <span className="leading-tight">{o.label}</span>
                  {active && <Check className="h-3.5 w-3.5 ml-auto" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Notes */}
        <div>
          <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">
            Notes (optional)
          </p>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Confirmed arrival at 10:30, materials onsite, will update after AM job"
            rows={3}
          />
        </div>

        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button onClick={save}>
            <Plus className="h-4 w-4 mr-1.5" /> Save log entry
          </Button>
        </div>

        {/* History */}
        <div className="pt-2 border-t">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground inline-flex items-center gap-1.5">
              <History className="h-3.5 w-3.5" /> Recent attempts
            </p>
            <span className="text-xs text-muted-foreground">{history.length} total</span>
          </div>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">No call attempts logged yet.</p>
          ) : (
            <ul className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {history.slice(0, 20).map(e => {
                const meta = TEAM_CALL_OUTCOMES.find(o => o.value === e.outcome);
                const when = new Date(e.contactDate);
                return (
                  <li key={e.id} className="rounded-lg border bg-card px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded text-white"
                        style={{ backgroundColor: meta?.color || "#64748B" }}
                      >
                        <span>{meta?.icon}</span> {meta?.label}
                      </span>
                      <span className="text-[11px] text-muted-foreground tabular-nums">
                        {when.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    {e.notes && <p className="text-xs text-muted-foreground mt-1.5 whitespace-pre-wrap">{e.notes}</p>}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
