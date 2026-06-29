/**
 * Today's Schedule board for Nav's Command Center.
 *
 * - Silo tabs: All / DM / A&A
 * - Each team is a row with ordered slot cards (1st, 2nd, 3rd, …)
 * - Horizontal scroll within each team row so any number of jobs fit
 * - Vertical scroll across teams via ScrollArea
 * - Drag-and-drop a job card onto any slot (same team or another team) to reorder
 *   and reassign the running order. Order persists per-day in localStorage.
 */
import { useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { CheckCircle2, Clock, Flag, AlertTriangle, Eye, PhoneCall, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { ScheduleRow } from "@/hooks/useCommandMetrics";

type Silo = "all" | "dm" | "aa";
type Status = ScheduleRow["status"];

const STATUS_META: Record<Status, { label: string; icon: typeof CheckCircle2; cls: string; dot: string }> = {
  done:        { label: "Done",        icon: CheckCircle2, cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30", dot: "bg-emerald-500" },
  in_progress: { label: "In Progress", icon: Clock,        cls: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30",        dot: "bg-amber-500" },
  flagged:     { label: "Flagged",     icon: Flag,         cls: "bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-500/30",     dot: "bg-orange-500" },
  urgent:      { label: "Urgent",      icon: AlertTriangle,cls: "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/30",                 dot: "bg-red-500" },
};

const ORDINALS = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th", "10th"];
const ord = (i: number) => ORDINALS[i] ?? `${i + 1}th`;

interface TeamGroup {
  team: string;
  aa: boolean;
  jobs: ScheduleRow[];
}

const storageKey = (dateKey: string) => `command-schedule-order-${dateKey}`;

type OrderMap = Record<string, string[]>; // team -> jobId[]

const loadOrder = (dateKey: string): OrderMap => {
  try {
    const raw = localStorage.getItem(storageKey(dateKey));
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
};

const saveOrder = (dateKey: string, map: OrderMap) => {
  try { localStorage.setItem(storageKey(dateKey), JSON.stringify(map)); } catch { /* ignore */ }
};

interface Props {
  schedule: ScheduleRow[];
  onView: (row: ScheduleRow) => void;
  onFlag: (row: ScheduleRow) => void;
  onCall: (row: ScheduleRow) => void;
}

export function TodaysScheduleBoard({ schedule, onView, onFlag, onCall }: Props) {
  const [silo, setSilo] = useState<Silo>("all");
  const dateKey = format(new Date(), "yyyy-MM-dd");
  const [orderMap, setOrderMap] = useState<OrderMap>(() => loadOrder(dateKey));

  useEffect(() => { saveOrder(dateKey, orderMap); }, [orderMap, dateKey]);

  // Group rows by team, applying silo filter and persisted ordering.
  const groups = useMemo<TeamGroup[]>(() => {
    const filtered = schedule.filter((r) =>
      silo === "all" ? true : silo === "aa" ? r.isAA : !r.isAA
    );
    const byTeam = new Map<string, ScheduleRow[]>();
    for (const r of filtered) {
      const list = byTeam.get(r.team) || [];
      list.push(r);
      byTeam.set(r.team, list);
    }
    const out: TeamGroup[] = [];
    for (const [team, rows] of byTeam) {
      const persisted = orderMap[team] || [];
      const byId = new Map(rows.map((r) => [r.id, r]));
      const ordered: ScheduleRow[] = [];
      for (const id of persisted) {
        const r = byId.get(id);
        if (r) { ordered.push(r); byId.delete(id); }
      }
      // append any new ones, sorted by bookedDate
      const rest = [...byId.values()].sort((a, b) => a.bookedDate.getTime() - b.bookedDate.getTime());
      ordered.push(...rest);
      out.push({ team, aa: ordered.some((r) => r.isAA), jobs: ordered });
    }
    return out.sort((a, b) => a.team.localeCompare(b.team));
  }, [schedule, silo, orderMap]);

  // Drag state — we only need the source id; team is read from current data on drop.
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const findTeamOf = (jobId: string): string | undefined =>
    groups.find((g) => g.jobs.some((j) => j.id === jobId))?.team;

  const moveJob = (jobId: string, targetTeam: string, targetIndex: number) => {
    const sourceTeam = findTeamOf(jobId);
    if (!sourceTeam) return;

    setOrderMap((prev) => {
      // Build full current ordering across ALL teams (not just filtered),
      // so dragging within the silo view doesn't drop other-silo siblings.
      const next: OrderMap = { ...prev };

      // Reconstruct current ordering for source and target teams using the
      // global schedule (not the filtered groups), to preserve hidden jobs.
      const fullByTeam = new Map<string, string[]>();
      for (const r of schedule) {
        const arr = fullByTeam.get(r.team) || [];
        arr.push(r.id);
        fullByTeam.set(r.team, arr);
      }
      const applyPersisted = (team: string): string[] => {
        const all = fullByTeam.get(team) || [];
        const persisted = next[team] || [];
        const set = new Set(all);
        const inOrder = persisted.filter((id) => set.has(id));
        const remaining = all.filter((id) => !inOrder.includes(id));
        return [...inOrder, ...remaining];
      };

      const sourceList = applyPersisted(sourceTeam).filter((id) => id !== jobId);
      next[sourceTeam] = sourceList;

      if (targetTeam === sourceTeam) {
        const insertAt = Math.min(Math.max(0, targetIndex), sourceList.length);
        sourceList.splice(insertAt, 0, jobId);
        next[targetTeam] = sourceList;
      } else {
        const targetList = applyPersisted(targetTeam).filter((id) => id !== jobId);
        const insertAt = Math.min(Math.max(0, targetIndex), targetList.length);
        targetList.splice(insertAt, 0, jobId);
        next[targetTeam] = targetList;
      }
      return next;
    });
  };

  return (
    <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
      {/* Silo tabs */}
      <div className="flex items-center justify-between gap-3 border-b px-4 py-2.5 bg-muted/30">
        <div className="inline-flex rounded-lg border bg-card p-0.5">
          {([
            { id: "all", label: "All" },
            { id: "dm", label: "DM" },
            { id: "aa", label: "A&A" },
          ] as { id: Silo; label: string }[]).map((t) => (
            <button
              key={t.id}
              onClick={() => setSilo(t.id)}
              className={cn(
                "px-3 py-1 text-xs font-semibold rounded-md transition-colors",
                silo === t.id
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground hidden sm:block">
          Drag a job onto a slot to reorder. Slots show running order (1st, 2nd, 3rd…).
        </p>
      </div>

      {groups.length === 0 ? (
        <p className="px-5 py-8 text-sm text-muted-foreground text-center">
          No {silo === "all" ? "" : silo === "dm" ? "DM " : "A&A "}jobs scheduled for today.
        </p>
      ) : (
        <ScrollArea className="max-h-[640px]">
          <ul className="divide-y">
            {groups.map((g) => (
              <li key={g.team} className="p-3 sm:p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-semibold">
                    {g.team}
                    {g.aa && <span className="text-emerald-600 font-bold ml-0.5">*</span>}
                  </span>
                  <Badge variant="outline" className="text-[10px] py-0 px-1.5">
                    {g.jobs.length} {g.jobs.length === 1 ? "job" : "jobs"}
                  </Badge>
                </div>

                {/* Horizontal scroll row of ordered job slots */}
                <ScrollArea className="w-full whitespace-nowrap">
                  <div className="flex gap-2.5 pb-2">
                    {g.jobs.map((j, idx) => {
                      const meta = STATUS_META[j.status];
                      const StatusIcon = meta.icon;
                      const isDragging = draggingId === j.id;
                      return (
                        <div
                          key={j.id}
                          draggable
                          onDragStart={(e) => {
                            setDraggingId(j.id);
                            e.dataTransfer.effectAllowed = "move";
                            e.dataTransfer.setData("text/plain", j.id);
                          }}
                          onDragEnd={() => setDraggingId(null)}
                          onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
                          onDrop={(e) => {
                            e.preventDefault();
                            const id = e.dataTransfer.getData("text/plain") || draggingId;
                            if (id && id !== j.id) moveJob(id, g.team, idx);
                            setDraggingId(null);
                          }}
                          className={cn(
                            "shrink-0 w-[260px] sm:w-[280px] rounded-xl border bg-card p-3 transition-all",
                            "hover:shadow-md hover:-translate-y-0.5 cursor-grab active:cursor-grabbing",
                            isDragging && "opacity-40 ring-2 ring-primary"
                          )}
                        >
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-1.5">
                              <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
                                {ord(idx)}
                              </span>
                              {j.isAA && (
                                <Badge variant="outline" className="text-[9px] py-0 px-1 bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300">
                                  A&amp;A
                                </Badge>
                              )}
                            </div>
                            <span className={cn("inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-medium", meta.cls)}>
                              <StatusIcon className="h-2.5 w-2.5" /> {meta.label}
                            </span>
                          </div>
                          <div className="font-semibold text-sm tabular-nums">{j.jobNumber}</div>
                          <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5 whitespace-normal">
                            {j.address || "—"}
                          </div>
                          <div className="flex gap-1 mt-2">
                            <Button size="sm" variant="outline" className="h-7 px-2 flex-1" onClick={() => onView(j)}>
                              <Eye className="h-3 w-3 mr-1" />View
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => onFlag(j)}>
                              <Flag className="h-3 w-3" />
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => onCall(j)}>
                              <PhoneCall className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}

                    {/* Trailing drop zone — append to end of this team */}
                    <div
                      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
                      onDrop={(e) => {
                        e.preventDefault();
                        const id = e.dataTransfer.getData("text/plain") || draggingId;
                        if (id) moveJob(id, g.team, g.jobs.length);
                        setDraggingId(null);
                      }}
                      className={cn(
                        "shrink-0 w-[140px] rounded-xl border-2 border-dashed flex items-center justify-center text-[11px] text-muted-foreground",
                        draggingId ? "border-primary/60 bg-primary/5" : "border-muted"
                      )}
                    >
                      Drop here
                    </div>
                  </div>
                  <ScrollBar orientation="horizontal" />
                </ScrollArea>
              </li>
            ))}
          </ul>
        </ScrollArea>
      )}
    </div>
  );
}
