import { useEffect, useMemo, useState } from "react";
import { PhoneCall, Flag, ClipboardCheck, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { TeamCallLogDialog } from "./TeamCallLogDialog";
import { FlagJobDialog } from "./FlagJobDialog";
import type { TrackerRow } from "@/hooks/useTrackerJobs";
import { useAdminAuth } from "@/hooks/useAdminAuth";

const PREVISIT_KEY = "command.previsit.v1";

type PreVisitRecord = { done: boolean; notes: string; at?: string };
type PreVisitStore = Record<string, PreVisitRecord>;

function readStore(): PreVisitStore {
  try { return JSON.parse(localStorage.getItem(PREVISIT_KEY) || "{}"); } catch { return {}; }
}
function writeStore(s: PreVisitStore) {
  localStorage.setItem(PREVISIT_KEY, JSON.stringify(s));
}

export function usePreVisit(jobNumber: string) {
  const [store, setStore] = useState<PreVisitStore>(() => readStore());
  useEffect(() => {
    const sync = () => setStore(readStore());
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  const record = store[jobNumber] || { done: false, notes: "" };
  const update = (next: PreVisitRecord) => {
    const updated = { ...readStore(), [jobNumber]: next };
    writeStore(updated);
    setStore(updated);
  };
  return [record, update] as const;
}

interface Props {
  row: TrackerRow;
}

export function PipelineActions({ row }: Props) {
  const { canEdit } = useAdminAuth();
  const [callOpen, setCallOpen] = useState(false);
  const [flagOpen, setFlagOpen] = useState(false);
  const [popOpen, setPopOpen] = useState(false);
  const [preVisit, setPreVisit] = usePreVisit(row.jobNumber);
  const [draftNotes, setDraftNotes] = useState(preVisit.notes);
  const [draftDone, setDraftDone] = useState(preVisit.done);

  useEffect(() => {
    if (popOpen) {
      setDraftNotes(preVisit.notes);
      setDraftDone(preVisit.done);
    }
  }, [popOpen, preVisit.notes, preVisit.done]);

  const tenantName = useMemo(() => {
    const j: any = row.job;
    return j.name || j.tenantName || j.tenant || `Tenant @ ${row.jobNumber}`;
  }, [row]);

  const tenantPhone = useMemo(() => {
    const j: any = row.job;
    return j.phoneNumber || j.tenantPhone || j.phone || j.contactNumber || "";
  }, [row]);


  const saveVisit = () => {
    if (!canEdit) return;
    setPreVisit({ done: draftDone, notes: draftNotes.trim(), at: new Date().toISOString() });
    toast.success(draftDone ? `Pre-visit marked done for ${row.jobNumber}` : `Pre-visit notes saved for ${row.jobNumber}`);
    setPopOpen(false);
  };

  return (
    <div className="flex flex-col items-end gap-1.5">
      {(preVisit.done || preVisit.notes) && (
        <div className="flex flex-wrap gap-1.5 justify-end">
          {preVisit.done && (
            <Badge variant="outline" className="border-emerald-500/40 text-emerald-700 dark:text-emerald-300 gap-1">
              <CheckCircle2 className="h-3 w-3" /> Pre-visit done
            </Badge>
          )}
          {preVisit.notes && (
            <Badge variant="outline" className="border-blue-500/40 text-blue-700 dark:text-blue-300 max-w-[260px] truncate" title={preVisit.notes}>
              Notes: {preVisit.notes}
            </Badge>
          )}
        </div>
      )}
      {canEdit ? (
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" variant="outline" onClick={() => setCallOpen(true)}>
          <PhoneCall className="h-3.5 w-3.5 mr-1" />Call Tenant
        </Button>
        <Button size="sm" variant="outline" onClick={() => setFlagOpen(true)}>
          <Flag className="h-3.5 w-3.5 mr-1" />Flag
        </Button>
        <Popover open={popOpen} onOpenChange={setPopOpen}>
          <PopoverTrigger asChild>
            <Button
              size="sm"
              variant="outline"
              className={cn(preVisit.done && "border-emerald-500/60 text-emerald-700 dark:text-emerald-300")}
            >
              <ClipboardCheck className="h-3.5 w-3.5 mr-1" />
              {preVisit.done ? "Pre-visit ✓" : "Pre-visit"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80" align="end">
            <div className="space-y-3">
              <div>
                <p className="text-sm font-semibold">Pre-visit prep — {row.jobNumber}</p>
                <p className="text-xs text-muted-foreground">{row.address}</p>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox checked={draftDone} onCheckedChange={(v) => setDraftDone(!!v)} />
                <Label className="cursor-pointer">Pre-visit done</Label>
              </label>
              <div>
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">Notes / special info</Label>
                <Textarea
                  rows={4}
                  value={draftNotes}
                  onChange={(e) => setDraftNotes(e.target.value)}
                  placeholder="Access details, tenant preferences, vulnerabilities, parking, materials, etc."
                  className="mt-1"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setPopOpen(false)}>Cancel</Button>
                <Button size="sm" onClick={saveVisit}>Save</Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>
      ) : (
        <Badge variant="outline" className="text-xs">Read-only preview</Badge>
      )}

      <TeamCallLogDialog
        open={callOpen}
        onOpenChange={setCallOpen}
        team={tenantName}
        phone={tenantPhone}
        jobNumber={row.jobNumber}
        address={row.address}
        bookedDate={row.bookedDate}
        description={(row.job as any).description || (row.job as any).summaryOfWorks || row.description}
      />

      <FlagJobDialog
        open={flagOpen}
        onOpenChange={setFlagOpen}
        team={row.team}
        jobNumber={row.jobNumber}
      />
    </div>
  );
}
