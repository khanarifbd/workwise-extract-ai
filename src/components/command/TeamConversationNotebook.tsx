import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { NotebookPen, Plus, Send, Trash2, User2, Phone } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useAdminAuth } from "@/hooks/useAdminAuth";

/**
 * TeamConversationNotebook
 * ------------------------
 * A lightweight running notebook of communications between Nav and a specific
 * team / team member. Used by the Live Monitoring Log Flags section where a
 * flag concerns a team's conduct/performance (not a tenant). Unlike the
 * tenant Call Log (which records call attempts to a tenant for a job),
 * this stores a two-way thread of messages so Nav can document
 * conversations, warnings, follow-ups and replies in one place.
 */

export type NotebookSender = "nav" | "team";

export interface NotebookEntry {
  id: string;
  team: string;
  sender: NotebookSender;
  body: string;
  channel?: "call" | "whatsapp" | "in_person" | "note";
  at: string;
}

const STORE_KEY = "command.teamNotebook.v1";

function readAll(): NotebookEntry[] {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || "[]"); } catch { return []; }
}
function writeAll(entries: NotebookEntry[]) {
  localStorage.setItem(STORE_KEY, JSON.stringify(entries));
}

const CHANNELS: { value: NonNullable<NotebookEntry["channel"]>; label: string }[] = [
  { value: "call",       label: "📞 Call" },
  { value: "whatsapp",   label: "💬 WhatsApp" },
  { value: "in_person",  label: "🤝 In person" },
  { value: "note",       label: "📝 Note" },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  team: string;
  context?: { jobNumber?: string; flagTitle?: string; severity?: string };
}

export function TeamConversationNotebook({ open, onOpenChange, team, context }: Props) {
  const { canEdit } = useAdminAuth();
  const [all, setAll] = useState<NotebookEntry[]>([]);
  const [sender, setSender] = useState<NotebookSender>("nav");
  const [channel, setChannel] = useState<NonNullable<NotebookEntry["channel"]>>("call");
  const [body, setBody] = useState("");

  useEffect(() => {
    if (open) { setAll(readAll()); setBody(""); setSender("nav"); }
  }, [open]);

  const thread = useMemo(
    () => all.filter(e => e.team === team).sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime()),
    [all, team]
  );

  const post = () => {
    if (!canEdit) return;
    if (!body.trim()) { toast.error("Type something first"); return; }
    const entry: NotebookEntry = {
      id: crypto.randomUUID(),
      team,
      sender,
      channel,
      body: body.trim(),
      at: new Date().toISOString(),
    };
    const next = [...all, entry];
    writeAll(next); setAll(next); setBody("");
    toast.success(`Logged ${sender === "nav" ? "Nav → " + team : team + " → Nav"}`);
  };

  const remove = (id: string) => {
    if (!canEdit) return;
    const next = all.filter(e => e.id !== id);
    writeAll(next); setAll(next);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <NotebookPen className="h-5 w-5 text-violet-600" />
            Communication Notebook — {team}
          </DialogTitle>
          <DialogDescription>
            Running log of conversations between Nav and {team}. Use this for warnings,
            follow-ups, replies and any informal communication tied to a flag.
          </DialogDescription>
        </DialogHeader>

        {(context?.jobNumber || context?.flagTitle) && (
          <div className="rounded-xl border bg-muted/40 p-3 text-xs space-y-1">
            {context.jobNumber && <div><b>Linked job:</b> <span className="font-mono">{context.jobNumber}</span></div>}
            {context.flagTitle && <div><b>Flag:</b> {context.flagTitle}</div>}
            {context.severity && <Badge variant="outline" className="mt-1">{context.severity}</Badge>}
          </div>
        )}

        {/* Thread */}
        <div className="rounded-xl border bg-card p-3 max-h-72 overflow-y-auto space-y-2">
          {thread.length === 0 ? (
            <p className="text-sm text-muted-foreground italic text-center py-6">
              No communications logged yet. Start the conversation below.
            </p>
          ) : thread.map(e => {
            const isNav = e.sender === "nav";
            const when = new Date(e.at);
            return (
              <div key={e.id} className={cn("flex", isNav ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow-sm relative group",
                    isNav
                      ? "bg-blue-500/15 border border-blue-500/40"
                      : "bg-amber-500/15 border border-amber-500/40"
                  )}
                >
                  <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-semibold opacity-70 mb-1">
                    {isNav ? <User2 className="h-3 w-3" /> : <Phone className="h-3 w-3" />}
                    {isNav ? "Nav" : team}
                    {e.channel && <span>· {CHANNELS.find(c => c.value === e.channel)?.label}</span>}
                    <span className="ml-auto tabular-nums">
                      {when.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap">{e.body}</p>
                  {canEdit && (
                    <button
                      onClick={() => remove(e.id)}
                      className="absolute -top-2 -right-2 p-1 rounded-full bg-background border opacity-0 group-hover:opacity-100 transition"
                      aria-label="Delete"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Composer */}
        {canEdit ? (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            <Button
              size="sm"
              variant={sender === "nav" ? "default" : "outline"}
              onClick={() => setSender("nav")}
            >
              Nav → {team}
            </Button>
            <Button
              size="sm"
              variant={sender === "team" ? "default" : "outline"}
              onClick={() => setSender("team")}
            >
              {team} → Nav
            </Button>
            <div className="ml-auto flex gap-1">
              {CHANNELS.map(c => (
                <button
                  key={c.value}
                  onClick={() => setChannel(c.value)}
                  className={cn(
                    "text-[11px] px-2 py-1 rounded border transition",
                    channel === c.value ? "bg-foreground text-background border-foreground" : "hover:border-foreground/40"
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={sender === "nav"
              ? `What did Nav say to ${team}? e.g. "Verbal warning issued re: late arrival at N260…"`
              : `What did ${team} say back? e.g. "Acknowledged, will be on site by 08:30 tomorrow"`}
            rows={3}
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
            <Button onClick={post}>
              <Send className="h-4 w-4 mr-1.5" /> Log entry
            </Button>
          </div>
        </div>
        ) : (
          <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-3">
            <Badge variant="outline">Read-only preview</Badge>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
