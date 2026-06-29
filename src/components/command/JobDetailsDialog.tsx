/**
 * JobDetailsDialog — full read-only details view for a tracker row.
 * Shows description (with progressor markup), notes/ongoing notes,
 * core job metadata, and team flags so Nav can see everything in one place.
 */
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { RenderWithProgressor } from "@/lib/progressorMarkup";
import { format } from "date-fns";
import {
  MapPin, Calendar, User, Phone, Wrench, Flag, AlertTriangle,
  CheckCircle2, Clock, StickyNote, FileText, ListChecks,
} from "lucide-react";
import type { TrackerRow } from "@/hooks/useTrackerJobs";

interface Props {
  row: TrackerRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Local notes captured in the tracker for this job number. */
  notes?: string[];
  /** Flag reason captured in the tracker for this job number. */
  flagReason?: string;
}

const fmt = (d?: Date | null) =>
  d ? format(d, "EEE d MMM yyyy · HH:mm") : "—";

const Row = ({ icon: Icon, label, children }: { icon: typeof MapPin; label: string; children: React.ReactNode }) => (
  <div className="flex gap-2 items-start text-sm">
    <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
    <div className="min-w-0 flex-1">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</div>
      <div className="text-sm">{children}</div>
    </div>
  </div>
);

export function JobDetailsDialog({ row, open, onOpenChange, notes = [], flagReason }: Props) {
  if (!row) return null;
  const job: any = row.job;
  const description = job.description as string | undefined;
  const ongoing = (job.ongoingNotes || job.notes) as string | undefined;
  const completionDescription = job.completionDescription as string | undefined;
  const tenantName = job.tenantName || job.tenant || job.contactName;
  const tenantPhone = job.tenantPhone || job.contactPhone || job.phone;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3 border-b">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <DialogTitle className="text-lg font-bold tabular-nums">{row.jobNumber}</DialogTitle>
              <DialogDescription className="text-xs">
                {row.team} · {row.address || "No address"}
              </DialogDescription>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <Badge variant="outline" className="text-[10px]">{row.status}</Badge>
              {row.isUrgent && (
                <Badge variant="outline" className="bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-300 text-[10px]">
                  <AlertTriangle className="h-3 w-3 mr-1" />Urgent
                </Badge>
              )}
              {row.isFlagged && (
                <Badge variant="outline" className="bg-orange-500/10 border-orange-500/30 text-orange-700 dark:text-orange-300 text-[10px]">
                  <Flag className="h-3 w-3 mr-1" />Flagged
                </Badge>
              )}
              {row.isReferBack && (
                <Badge variant="outline" className="bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300 text-[10px]">
                  Refer back
                </Badge>
              )}
              {row.isOngoing && (
                <Badge variant="outline" className="bg-blue-500/10 border-blue-500/30 text-blue-700 dark:text-blue-300 text-[10px]">
                  <Clock className="h-3 w-3 mr-1" />Ongoing
                </Badge>
              )}
              {row.signed && (
                <Badge variant="outline" className="bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-[10px]">
                  <CheckCircle2 className="h-3 w-3 mr-1" />Signed off
                </Badge>
              )}
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh]">
          <div className="px-5 py-4 space-y-4">
            {/* Core metadata */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Row icon={MapPin} label="Address">{row.address || "—"}</Row>
              <Row icon={Wrench} label="Team">{row.team}</Row>
              {tenantName && <Row icon={User} label="Tenant">{tenantName}</Row>}
              {tenantPhone && (
                <Row icon={Phone} label="Phone">
                  <a className="underline" href={`tel:${tenantPhone}`}>{tenantPhone}</a>
                </Row>
              )}
              <Row icon={Calendar} label="Booked">{fmt(row.bookedDate)}</Row>
              <Row icon={CheckCircle2} label="Completed">{fmt(row.completionDate)}</Row>
            </div>

            <Separator />

            {/* Description (with progressor highlighting) */}
            <section>
              <h3 className="flex items-center gap-1.5 text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">
                <FileText className="h-3.5 w-3.5" /> Description
                <span className="text-[9px] text-indigo-500 dark:text-indigo-400 font-normal ml-1 normal-case tracking-normal">
                  (Progressor edits shown in purple)
                </span>
              </h3>
              <div className="rounded-lg border bg-muted/30 p-3 text-sm whitespace-pre-wrap break-words">
                {description ? (
                  <RenderWithProgressor text={description} />
                ) : (
                  <span className="text-muted-foreground italic">No description on file.</span>
                )}
              </div>
            </section>

            {/* Ongoing / job notes */}
            {ongoing && (
              <section>
                <h3 className="flex items-center gap-1.5 text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">
                  <StickyNote className="h-3.5 w-3.5" /> Ongoing notes
                </h3>
                <div className="rounded-lg border bg-muted/30 p-3 text-sm whitespace-pre-wrap break-words">
                  <RenderWithProgressor text={ongoing} />
                </div>
              </section>
            )}

            {/* Completion description */}
            {completionDescription && (
              <section>
                <h3 className="flex items-center gap-1.5 text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Completion notes
                </h3>
                <div className="rounded-lg border bg-emerald-500/5 border-emerald-500/30 p-3 text-sm whitespace-pre-wrap break-words">
                  <RenderWithProgressor text={completionDescription} />
                </div>
              </section>
            )}

            {/* Tracker notes (local to command center) */}
            {notes.length > 0 && (
              <section>
                <h3 className="flex items-center gap-1.5 text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">
                  <ListChecks className="h-3.5 w-3.5" /> Command notes ({notes.length})
                </h3>
                <ul className="space-y-1.5">
                  {notes.map((n, i) => (
                    <li key={i} className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                      {n}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Active flag */}
            {flagReason && (
              <section>
                <h3 className="flex items-center gap-1.5 text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">
                  <Flag className="h-3.5 w-3.5" /> Active flag
                </h3>
                <div className="rounded-lg border border-orange-500/40 bg-orange-500/5 p-3 text-sm">
                  {flagReason}
                </div>
              </section>
            )}

            {/* Refer-back reason */}
            {row.risk && !flagReason && (
              <section>
                <h3 className="flex items-center gap-1.5 text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">
                  <AlertTriangle className="h-3.5 w-3.5" /> Risk / refer-back note
                </h3>
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
                  {row.risk}
                </div>
              </section>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
