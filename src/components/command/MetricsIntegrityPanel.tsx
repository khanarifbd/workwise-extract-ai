import { useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, ShieldCheck } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { useMetricsReconciliation } from "@/hooks/useMetricsReconciliation";

/**
 * Diagnostics card — auto-reconciles every Command Center figure against
 * the canonical `genieMetrics` numbers and surfaces drift instantly.
 * Used on Nav's Command Center; also exposes <MetricsDriftBanner /> for
 * a top-of-page alert when anything is out of sync.
 */
export function MetricsIntegrityPanel({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const { ok, checks, errors, summary } = useMetricsReconciliation();
  const [open, setOpen] = useState(defaultOpen || !ok);
  const failing = checks.filter((c) => !c.ok);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className={cn(
        "rounded-2xl border-2 bg-card shadow-sm",
        ok ? "border-emerald-500/40" : "border-red-500/60",
      )}>
        <CollapsibleTrigger asChild>
          <button className="w-full flex items-center justify-between px-5 py-3.5 text-left">
            <div className="flex items-center gap-2.5">
              <span className={cn(
                "h-8 w-8 rounded-lg grid place-items-center",
                ok ? "bg-emerald-500" : "bg-red-500",
              )}>
                {ok
                  ? <ShieldCheck className="h-4 w-4 text-white" />
                  : <AlertTriangle className="h-4 w-4 text-white" />}
              </span>
              <div>
                <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
                  Diagnostics
                </p>
                <h3 className="text-base font-semibold">
                  {ok ? "Metrics aligned" : `Metrics drift — ${failing.length} check(s) failing`}
                </h3>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="tabular-nums">
                {summary.total} jobs
              </Badge>
              <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
            </div>
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="px-5 pb-5 space-y-3">
            {errors.length > 0 && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Checksum errors</AlertTitle>
                <AlertDescription>
                  <ul className="list-disc ml-4 mt-1 space-y-0.5">
                    {errors.map((e, i) => <li key={i} className="text-xs">{e}</li>)}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            <div className="rounded-xl border bg-muted/30 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="text-[11px] uppercase tracking-wider text-muted-foreground bg-muted/50">
                  <tr>
                    <th className="text-left px-4 py-2 font-semibold">Check</th>
                    <th className="text-right px-4 py-2 font-semibold">Command shows</th>
                    <th className="text-right px-4 py-2 font-semibold">Canonical</th>
                    <th className="text-center px-4 py-2 font-semibold w-20">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {checks.map((c) => (
                    <tr key={c.label} className={cn(
                      "border-t",
                      !c.ok && "bg-red-500/5",
                    )}>
                      <td className="px-4 py-2">{c.label}</td>
                      <td className="px-4 py-2 text-right tabular-nums font-semibold">{c.shown}</td>
                      <td className="px-4 py-2 text-right tabular-nums font-semibold">{c.canonical}</td>
                      <td className="px-4 py-2 text-center">
                        {c.ok
                          ? <CheckCircle2 className="h-4 w-4 text-emerald-500 mx-auto" />
                          : <AlertTriangle className="h-4 w-4 text-red-500 mx-auto" />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="text-[11px] text-muted-foreground">
              All figures derived from <code className="font-mono">src/lib/genieMetrics.ts</code> — the single
              canonical source used by both Command Center and the main Genie.
            </p>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

export function MetricsDriftBanner({ onShowDetails }: { onShowDetails?: () => void }) {
  const { ok, checks, errors } = useMetricsReconciliation();
  if (ok) return null;
  const failing = checks.filter((c) => !c.ok).length;
  return (
    <Alert variant="destructive" className="border-2">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>Metrics drift detected</AlertTitle>
      <AlertDescription className="flex items-center justify-between gap-3 flex-wrap">
        <span className="text-xs">
          {failing} reconciliation check(s) and {errors.length} checksum issue(s) need review.
        </span>
        {onShowDetails && (
          <Button size="sm" variant="outline" onClick={onShowDetails}>
            Show details
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}
