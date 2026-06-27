import { useMemo, useState, type ReactNode } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type DatedItem<T> = T & { dateISO: string };

export type BucketKey = "today" | "yesterday" | "thisWeek" | "thisMonth" | "older";

const BUCKETS: { key: BucketKey; label: string }[] = [
  { key: "today",     label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "thisWeek",  label: "Earlier this week" },
  { key: "thisMonth", label: "Earlier this month" },
  { key: "older",     label: "Older" },
];

function startOfDay(d: Date) { const x = new Date(d); x.setHours(0,0,0,0); return x; }

function bucketFor(iso: string): BucketKey {
  const d = startOfDay(new Date(iso));
  const today = startOfDay(new Date());
  const yest = startOfDay(new Date(today.getTime() - 86400000));

  // week starts Monday
  const dayIdx = (today.getDay() + 6) % 7; // 0=Mon
  const weekStart = startOfDay(new Date(today.getTime() - dayIdx * 86400000));
  const monthStart = startOfDay(new Date(today.getFullYear(), today.getMonth(), 1));

  if (d.getTime() === today.getTime()) return "today";
  if (d.getTime() === yest.getTime()) return "yesterday";
  if (d.getTime() >= weekStart.getTime()) return "thisWeek";
  if (d.getTime() >= monthStart.getTime()) return "thisMonth";
  return "older";
}

interface Props<T> {
  items: DatedItem<T>[];
  defaultOpen?: BucketKey[];
  render: (item: DatedItem<T>) => ReactNode;
  emptyLabel?: string;
}

export function CollapsibleDateGroups<T>({
  items, defaultOpen = ["today"], render, emptyLabel = "Nothing here yet.",
}: Props<T>) {
  const grouped = useMemo(() => {
    const out: Record<BucketKey, DatedItem<T>[]> = {
      today: [], yesterday: [], thisWeek: [], thisMonth: [], older: [],
    };
    for (const it of items) out[bucketFor(it.dateISO)].push(it);
    return out;
  }, [items]);

  const [openMap, setOpenMap] = useState<Record<BucketKey, boolean>>(() => {
    const o: any = { today: false, yesterday: false, thisWeek: false, thisMonth: false, older: false };
    defaultOpen.forEach(k => { o[k] = true; });
    return o;
  });

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border bg-card p-6 text-center text-sm text-muted-foreground">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {BUCKETS.map(({ key, label }) => {
        const list = grouped[key];
        if (list.length === 0) return null;
        const open = openMap[key];
        return (
          <Collapsible
            key={key}
            open={open}
            onOpenChange={(v) => setOpenMap(prev => ({ ...prev, [key]: v }))}
            className="rounded-xl border bg-card/60 shadow-sm overflow-hidden"
          >
            <CollapsibleTrigger className="w-full flex items-center justify-between px-3 py-2 hover:bg-muted/50 transition">
              <div className="flex items-center gap-2">
                <ChevronDown className={cn("h-4 w-4 transition-transform", !open && "-rotate-90")} />
                <span className="text-sm font-semibold">{label}</span>
                <Badge variant="outline" className="tabular-nums text-[10px] h-5">{list.length}</Badge>
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="p-3 pt-1 space-y-2">
                {list.map(render)}
              </div>
            </CollapsibleContent>
          </Collapsible>
        );
      })}
    </div>
  );
}
