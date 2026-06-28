import { useMemo, useState, type ReactNode } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, Folder, FolderOpen, CalendarDays, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

export type DatedItem<T> = T & { dateISO: string };

/* ---------- Date helpers ---------- */
function startOfDay(d: Date) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function isoDay(d: Date)   { return startOfDay(d).toISOString().slice(0, 10); }
function isoMonth(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; }

function monthLabel(key: string) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}
function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = startOfDay(new Date());
  const yest = new Date(today.getTime() - 86400000);
  if (isoDay(d) === isoDay(today)) return "Today";
  if (isoDay(d) === isoDay(yest))  return "Yesterday";
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short" });
}

type RecentKey = "today" | "yesterday" | "thisWeek";
const RECENT: { key: RecentKey; label: string }[] = [
  { key: "today",     label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "thisWeek",  label: "Earlier this week" },
];

function recentBucket(iso: string): RecentKey | null {
  const d = startOfDay(new Date(iso));
  const today = startOfDay(new Date());
  const yest = startOfDay(new Date(today.getTime() - 86400000));
  const dayIdx = (today.getDay() + 6) % 7;
  const weekStart = startOfDay(new Date(today.getTime() - dayIdx * 86400000));
  if (d.getTime() === today.getTime()) return "today";
  if (d.getTime() === yest.getTime())  return "yesterday";
  if (d.getTime() >= weekStart.getTime()) return "thisWeek";
  return null;
}

/* ---------- Component ---------- */
interface Props<T> {
  items: DatedItem<T>[];
  defaultOpen?: RecentKey[];
  render: (item: DatedItem<T>) => ReactNode;
  emptyLabel?: string;
}

export function CollapsibleDateGroups<T>({
  items,
  defaultOpen = ["today"],
  render,
  emptyLabel = "Nothing here yet.",
}: Props<T>) {
  // Group items
  const { recent, archive } = useMemo(() => {
    const recent: Record<RecentKey, DatedItem<T>[]> = { today: [], yesterday: [], thisWeek: [] };
    // archive[monthKey][dayISO] = items[]
    const archive: Record<string, Record<string, DatedItem<T>[]>> = {};

    for (const it of items) {
      const r = recentBucket(it.dateISO);
      if (r) { recent[r].push(it); continue; }
      const d = new Date(it.dateISO);
      const mk = isoMonth(d);
      const dk = isoDay(d);
      archive[mk] ??= {};
      archive[mk][dk] ??= [];
      archive[mk][dk].push(it);
    }
    return { recent, archive };
  }, [items]);

  const monthKeys = useMemo(
    () => Object.keys(archive).sort((a, b) => (a < b ? 1 : -1)),
    [archive],
  );
  const archiveTotal = useMemo(
    () => monthKeys.reduce((sum, mk) => sum + Object.values(archive[mk]).reduce((s, v) => s + v.length, 0), 0),
    [archive, monthKeys],
  );

  /* ---------- Open-state maps ---------- */
  const [openRecent, setOpenRecent] = useState<Record<RecentKey, boolean>>(() => {
    const o: Record<RecentKey, boolean> = { today: false, yesterday: false, thisWeek: false };
    defaultOpen.forEach(k => { o[k] = true; });
    return o;
  });
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [openMonth, setOpenMonth] = useState<Record<string, boolean>>({});
  const [openDay, setOpenDay] = useState<Record<string, boolean>>({});

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border bg-card p-6 text-center text-sm text-muted-foreground">
        {emptyLabel}
      </div>
    );
  }

  const expandAll = () => {
    setOpenRecent({ today: true, yesterday: true, thisWeek: true });
    setArchiveOpen(true);
    const mo: Record<string, boolean> = {}; monthKeys.forEach(k => { mo[k] = true; });
    const dyo: Record<string, boolean> = {};
    monthKeys.forEach(mk => Object.keys(archive[mk]).forEach(dk => { dyo[dk] = true; }));
    setOpenMonth(mo); setOpenDay(dyo);
  };
  const collapseAll = () => {
    setOpenRecent({ today: false, yesterday: false, thisWeek: false });
    setArchiveOpen(false);
    setOpenMonth({}); setOpenDay({});
  };

  return (
    <div className="space-y-2">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-1">
        <span className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
          {items.length} total
        </span>
        <div className="flex items-center gap-1 text-[11px]">
          <button onClick={expandAll}   className="px-2 py-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition">Expand all</button>
          <span className="text-muted-foreground/40">·</span>
          <button onClick={collapseAll} className="px-2 py-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition">Collapse all</button>
        </div>
      </div>

      {/* Recent buckets */}
      {RECENT.map(({ key, label }) => {
        const list = recent[key];
        if (list.length === 0) return null;
        const open = openRecent[key];
        return (
          <Collapsible
            key={key}
            open={open}
            onOpenChange={(v) => setOpenRecent(prev => ({ ...prev, [key]: v }))}
            className="rounded-xl border bg-card/70 shadow-sm overflow-hidden"
          >
            <CollapsibleTrigger className="w-full flex items-center justify-between px-3 py-2 hover:bg-muted/50 transition">
              <div className="flex items-center gap-2">
                <ChevronDown className={cn("h-4 w-4 transition-transform text-muted-foreground", !open && "-rotate-90")} />
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-sm font-semibold">{label}</span>
                <Badge variant="outline" className="tabular-nums text-[10px] h-5">{list.length}</Badge>
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="p-3 pt-1 space-y-2">{list.map(render)}</div>
            </CollapsibleContent>
          </Collapsible>
        );
      })}

      {/* Archive */}
      {monthKeys.length > 0 && (
        <Collapsible
          open={archiveOpen}
          onOpenChange={setArchiveOpen}
          className="rounded-xl border bg-gradient-to-b from-muted/40 to-card shadow-sm overflow-hidden"
        >
          <CollapsibleTrigger className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-muted/60 transition">
            <div className="flex items-center gap-2">
              <ChevronDown className={cn("h-4 w-4 transition-transform text-muted-foreground", !archiveOpen && "-rotate-90")} />
              {archiveOpen ? <FolderOpen className="h-4 w-4 text-amber-600" /> : <Folder className="h-4 w-4 text-amber-600" />}
              <span className="text-sm font-semibold">Archive</span>
              <Badge variant="outline" className="tabular-nums text-[10px] h-5">{archiveTotal}</Badge>
              <span className="text-[11px] text-muted-foreground hidden sm:inline">· {monthKeys.length} month{monthKeys.length === 1 ? "" : "s"}</span>
            </div>
          </CollapsibleTrigger>

          <CollapsibleContent>
            <div className="p-2 pl-3 space-y-1.5 border-t bg-card/40">
              {monthKeys.map(mk => {
                const days = archive[mk];
                const dayKeys = Object.keys(days).sort((a, b) => (a < b ? 1 : -1));
                const monthCount = dayKeys.reduce((s, dk) => s + days[dk].length, 0);
                const mOpen = !!openMonth[mk];
                return (
                  <Collapsible
                    key={mk}
                    open={mOpen}
                    onOpenChange={(v) => setOpenMonth(prev => ({ ...prev, [mk]: v }))}
                    className="rounded-lg border bg-card/80 overflow-hidden"
                  >
                    <CollapsibleTrigger className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-muted/50 transition">
                      <div className="flex items-center gap-2">
                        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform text-muted-foreground", !mOpen && "-rotate-90")} />
                        <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-sm font-medium">{monthLabel(mk)}</span>
                      </div>
                      <Badge variant="secondary" className="tabular-nums text-[10px] h-5">{monthCount}</Badge>
                    </CollapsibleTrigger>

                    <CollapsibleContent>
                      <div className="p-2 pl-3 space-y-1.5 border-t bg-background/40">
                        {dayKeys.map(dk => {
                          const list = days[dk];
                          const dOpen = !!openDay[dk];
                          return (
                            <Collapsible
                              key={dk}
                              open={dOpen}
                              onOpenChange={(v) => setOpenDay(prev => ({ ...prev, [dk]: v }))}
                              className="rounded-md border bg-card overflow-hidden"
                            >
                              <CollapsibleTrigger className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-muted/40 transition">
                                <div className="flex items-center gap-2">
                                  <ChevronDown className={cn("h-3 w-3 transition-transform text-muted-foreground", !dOpen && "-rotate-90")} />
                                  <span className="text-xs font-medium tabular-nums">{dayLabel(dk)}</span>
                                  <span className="text-[10px] text-muted-foreground tabular-nums">{dk}</span>
                                </div>
                                <Badge variant="outline" className="tabular-nums text-[10px] h-4 px-1.5">{list.length}</Badge>
                              </CollapsibleTrigger>
                              <CollapsibleContent>
                                <div className="p-2 space-y-2 border-t">{list.map(render)}</div>
                              </CollapsibleContent>
                            </Collapsible>
                          );
                        })}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                );
              })}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}
