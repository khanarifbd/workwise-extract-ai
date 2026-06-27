import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CalendarClock, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const TIME_SLOTS = [
  "08:00","08:30","09:00","09:30","10:00","10:30","11:00","11:30",
  "12:00","12:30","13:00","13:30","14:00","14:30","15:00","15:30",
  "16:00","16:30","17:00","17:30",
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle?: string;
  initialDate?: string; // ISO yyyy-MM-dd
  initialTime?: string;
  initialNotes?: string;
  onSchedule: (payload: { date: string; time: string; notes?: string }) => void;
}

export function ScheduleDialog({
  open, onOpenChange, title, subtitle,
  initialDate, initialTime, initialNotes,
  onSchedule,
}: Props) {
  const [date, setDate] = useState<Date | undefined>(initialDate ? new Date(initialDate) : new Date());
  const [time, setTime] = useState<string>(initialTime || "10:00");
  const [notes, setNotes] = useState<string>(initialNotes || "");

  useEffect(() => {
    if (open) {
      setDate(initialDate ? new Date(initialDate) : new Date());
      setTime(initialTime || "10:00");
      setNotes(initialNotes || "");
    }
  }, [open, initialDate, initialTime, initialNotes]);

  const save = () => {
    if (!date) { toast.error("Pick a date"); return; }
    if (!time) { toast.error("Pick a time"); return; }
    onSchedule({
      date: format(date, "yyyy-MM-dd"),
      time,
      notes: notes.trim() || undefined,
    });
    onOpenChange(false);
    toast.success(`Scheduled ${format(date, "EEE d MMM")} at ${time}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-blue-600" />
            {title}
          </DialogTitle>
          {subtitle && <DialogDescription>{subtitle}</DialogDescription>}
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-xl border bg-card p-2">
            <Calendar
              mode="single"
              selected={date}
              onSelect={setDate}
              initialFocus
              className={cn("p-2 pointer-events-auto")}
            />
          </div>

          <div className="space-y-3">
            <div>
              <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">
                Time slot
              </p>
              <div className="grid grid-cols-4 gap-1.5 max-h-44 overflow-y-auto pr-1">
                {TIME_SLOTS.map(t => {
                  const active = time === t;
                  return (
                    <button
                      key={t}
                      onClick={() => setTime(t)}
                      className={cn(
                        "rounded-md border px-2 py-1.5 text-xs font-medium tabular-nums transition",
                        active
                          ? "bg-blue-600 text-white border-transparent"
                          : "bg-card hover:border-foreground/30"
                      )}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>
              <div className="mt-2">
                <Input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="h-8"
                />
              </div>
            </div>

            <div>
              <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">
                Notes (optional)
              </p>
              <Textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Topic, location, attendees…"
              />
            </div>

            <div className="rounded-lg border bg-muted/40 px-3 py-2 text-xs">
              <span className="text-muted-foreground">Selected:</span>{" "}
              <span className="font-semibold">
                {date ? format(date, "EEE d MMM yyyy") : "—"} · {time || "—"}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save}>
            <Check className="h-4 w-4 mr-1.5" /> Confirm booking
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
