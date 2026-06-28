import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  ShieldCheck, Camera, FileText, PenSquare, CheckCircle2, XCircle,
  AlertTriangle, Clock, User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const STORE_KEY = "command.signoffDecisions.v1";

export interface SignOffJob {
  jobNumber: string;
  team: string;
  address?: string;
  duration?: string;
  signOffTime?: string;
  photosOK: boolean;
  descriptionOK: boolean;
  signed: boolean;
}

type Decision = { decision: "approved" | "rejected"; reason?: string; at: string };

function readAll(): Record<string, Decision> {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || "{}"); } catch { return {}; }
}
function writeAll(d: Record<string, Decision>) {
  localStorage.setItem(STORE_KEY, JSON.stringify(d));
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: SignOffJob | null;
}

export function SignOffDialog({ open, onOpenChange, job }: Props) {
  const [reason, setReason] = useState("");
  const [existing, setExisting] = useState<Decision | null>(null);

  useEffect(() => {
    if (open && job) {
      setReason("");
      setExisting(readAll()[job.jobNumber] || null);
    }
  }, [open, job]);

  if (!job) return null;

  const Check = ({ ok, label, Icon }: { ok: boolean; label: string; Icon: typeof Camera }) => (
    <div className={cn(
      "flex items-center justify-between rounded-lg border px-3 py-2.5",
      ok ? "border-emerald-500/30 bg-emerald-500/5" : "border-amber-500/40 bg-amber-500/5"
    )}>
      <div className="flex items-center gap-2 text-sm">
        <Icon className={cn("h-4 w-4", ok ? "text-emerald-600" : "text-amber-600")} />
        <span className="font-medium">{label}</span>
      </div>
      {ok ? (
        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
      ) : (
        <AlertTriangle className="h-4 w-4 text-amber-600" />
      )}
    </div>
  );

  const allOK = job.photosOK && job.descriptionOK && job.signed;

  const decide = (decision: "approved" | "rejected") => {
    if (decision === "rejected" && !reason.trim()) {
      toast.error("Add a rejection reason");
      return;
    }
    const all = readAll();
    all[job.jobNumber] = {
      decision,
      reason: reason.trim() || undefined,
      at: new Date().toISOString(),
    };
    writeAll(all);
    setExisting(all[job.jobNumber]);
    toast.success(
      decision === "approved"
        ? `Sign-off approved for ${job.jobNumber}`
        : `Sign-off rejected for ${job.jobNumber}`
    );
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-emerald-600" />
            Sign-off · {job.jobNumber}
          </DialogTitle>
          <DialogDescription>
            Review the team's completion evidence and approve or reject the sign-off.
          </DialogDescription>
        </DialogHeader>

        {/* Job summary */}
        <div className="rounded-xl border bg-muted/30 p-3 grid grid-cols-2 gap-3 text-sm">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Team:</span>
            <span className="font-semibold">{job.team}</span>
          </div>
          {job.address && (
            <div className="flex items-center gap-2 col-span-2">
              <span className="text-muted-foreground">Address:</span>
              <span className="font-medium">{job.address}</span>
            </div>
          )}
          {job.duration && (
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Duration:</span>
              <span className="font-medium tabular-nums">{job.duration}</span>
            </div>
          )}
          {job.signOffTime && (
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Signed at:</span>
              <span className="font-medium tabular-nums">{job.signOffTime}</span>
            </div>
          )}
        </div>

        {/* Evidence checks */}
        <div>
          <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">
            Completion evidence
          </p>
          <div className="space-y-2">
            <Check ok={job.photosOK}      label="Before / After photos uploaded" Icon={Camera} />
            <Check ok={job.descriptionOK} label="Work description complete"      Icon={FileText} />
            <Check ok={job.signed}        label="Tenant signature captured"      Icon={PenSquare} />
          </div>
        </div>

        {/* Status banner */}
        <div className={cn(
          "rounded-lg border px-3 py-2.5 text-sm font-medium flex items-center gap-2",
          allOK
            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
            : "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
        )}>
          {allOK
            ? <><CheckCircle2 className="h-4 w-4" /> All checks passed — ready to approve.</>
            : <><AlertTriangle className="h-4 w-4" /> One or more checks are missing — request remedial action before approving.</>
          }
        </div>

        {existing && (
          <div className="rounded-lg border bg-card px-3 py-2 text-xs">
            <Badge variant={existing.decision === "approved" ? "default" : "destructive"}>
              {existing.decision === "approved" ? "Previously approved" : "Previously rejected"}
            </Badge>
            <span className="ml-2 text-muted-foreground">
              {new Date(existing.at).toLocaleString("en-GB")}
            </span>
            {existing.reason && <p className="mt-1 text-muted-foreground">{existing.reason}</p>}
          </div>
        )}

        {/* Reject reason */}
        <div>
          <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">
            Rejection note (required to reject)
          </p>
          <Textarea
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. After photos missing — re-upload from kitchen and bathroom."
          />
        </div>

        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button
            variant="outline"
            className="border-red-300 text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
            onClick={() => decide("rejected")}
          >
            <XCircle className="h-4 w-4 mr-1.5" /> Reject
          </Button>
          <Button onClick={() => decide("approved")} disabled={!allOK}>
            <CheckCircle2 className="h-4 w-4 mr-1.5" /> Approve sign-off
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
