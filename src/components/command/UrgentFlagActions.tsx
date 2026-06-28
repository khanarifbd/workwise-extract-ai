import { useMemo, useState } from "react";
import { PhoneCall, StickyNote, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TeamCallLogDialog } from "./TeamCallLogDialog";
import type { TrackerRow } from "@/hooks/useTrackerJobs";

/**
 * Actions row for an Urgent Flag tied to a JOB.
 * Because a flag here references a job number, the "Call" action opens the
 * tenant Call Log (with tenant name, address, phone & job description) —
 * not a team-only call. This matches the Genie job call-log pattern.
 */
interface Props {
  row: TrackerRow;
  onAddNote: (jobNumber: string) => void;
  onResolve: (jobNumber: string) => void;
}

export function UrgentFlagActions({ row, onAddNote, onResolve }: Props) {
  const [callOpen, setCallOpen] = useState(false);

  const tenant = useMemo(() => {
    const j: any = row.job;
    return {
      name:  j.name || j.tenantName || j.tenant || `Tenant @ ${row.jobNumber}`,
      phone: j.phoneNumber || j.tenantPhone || j.phone || j.contactNumber || "",
      desc:  j.description || j.summaryOfWorks || row.description,
    };
  }, [row]);

  return (
    <div className="flex flex-wrap gap-1.5">
      <Button size="sm" variant="outline" onClick={() => setCallOpen(true)}>
        <PhoneCall className="h-3.5 w-3.5 mr-1" />Call Tenant
      </Button>
      <Button size="sm" variant="outline" onClick={() => onAddNote(row.jobNumber)}>
        <StickyNote className="h-3.5 w-3.5 mr-1" />Add Note
      </Button>
      <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => onResolve(row.jobNumber)}>
        <CheckCircle2 className="h-3.5 w-3.5 mr-1" />Resolve
      </Button>

      <TeamCallLogDialog
        open={callOpen}
        onOpenChange={setCallOpen}
        team={tenant.name}
        phone={tenant.phone}
        jobNumber={row.jobNumber}
        address={row.address}
        bookedDate={row.bookedDate}
        description={tenant.desc}
      />
    </div>
  );
}
