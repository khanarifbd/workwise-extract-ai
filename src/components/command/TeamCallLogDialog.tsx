import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Phone, History, Plus, Check } from "lucide-react";
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
  contactDate: string; // ISO
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
}

export function TeamCallLogDialog({ open, onOpenChange, team, phone }: Props) {
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
    window.location.href = `tel:${phone}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5 text-blue-600" />
            Call Log — {team}
          </DialogTitle>
          <DialogDescription>
            Log the outcome of your call attempt. Tap the number to dial.
          </DialogDescription>
        </DialogHeader>

        {/* Phone bar */}
        <button
          onClick={dial}
          className="w-full flex items-center justify-between rounded-xl border bg-muted/40 hover:bg-muted px-4 py-3 transition"
        >
          <div className="flex items-center gap-2 text-sm">
            <Phone className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium tabular-nums">{phone || "No number on file"}</span>
          </div>
          <Badge variant="secondary" className="text-xs">Tap to dial</Badge>
        </button>

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
