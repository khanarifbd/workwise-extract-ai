import { useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, Clock,
  Flag, PhoneCall, Eye, RefreshCw, FileBarChart, Settings,
  PlusCircle, StickyNote, Activity, ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { TeamCallLogDialog } from "@/components/command/TeamCallLogDialog";
import { FlagJobDialog } from "@/components/command/FlagJobDialog";
import { useSectionTone, type SectionPresetId } from "@/lib/sectionTheme";


type Status = "done" | "in_progress" | "flagged" | "urgent";

interface TeamRow {
  team: string;
  aa?: boolean;
  am: string;
  pm: string;
  status: Status;
  phone: string;
  trackerPath: string;
}

const SAMPLE_TEAMS: TeamRow[] = [
  { team: "Shakthi",        am: "N2640150 – 12 High St",            pm: "N2640201 – 8 Park Ave",  status: "in_progress", phone: "+447000000002", trackerPath: "/command/dm" },
  { team: "Indika",         am: "N2640177 – 44 King Rd",            pm: "N2640188 – 21 Oak Cl",   status: "done",        phone: "+447000000003", trackerPath: "/command/dm" },
  { team: "Pradeep",        am: "N2640199 – 5 Elm Way",             pm: "—",                      status: "urgent",      phone: "+447000000010", trackerPath: "/command/dm" },
  { team: "Suresh",         am: "N2640210 – 17 Beech Dr",           pm: "N2640218 – 9 Mill Ln",   status: "flagged",     phone: "+447000000011", trackerPath: "/command/dm" },
  { team: "Carpenter Crew", aa: true, am: "N2640155 – 12 High St (Fire Door)", pm: "N2640190 – 33 Vale", status: "in_progress", phone: "+447000000012", trackerPath: "/command/aa" },
  { team: "Roofing Pro",    aa: true, am: "N2640161 – 7 Hill Rd",   pm: "—",                      status: "done",        phone: "+447000000013", trackerPath: "/command/aa" },
  { team: "Flooring Co",    aa: true, am: "—",                      pm: "N2640205 – 14 Lime Ave", status: "in_progress", phone: "+447000000009", trackerPath: "/command/aa" },
];

const STATUS_META: Record<Status, { label: string; icon: typeof CheckCircle2; cls: string; dot: string }> = {
  done:        { label: "Done",        icon: CheckCircle2, cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30", dot: "bg-emerald-500" },
  in_progress: { label: "In Progress", icon: Clock,        cls: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30",        dot: "bg-amber-500" },
  flagged:     { label: "Flagged",     icon: Flag,         cls: "bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-500/30",     dot: "bg-orange-500" },
  urgent:      { label: "Urgent",      icon: AlertTriangle,cls: "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/30",                 dot: "bg-red-500" },
};

/* ───────── Building blocks ───────── */

const SectionHeader = ({
  eyebrow, title, hint, action,
}: { eyebrow: string; title: string; hint?: string; action?: React.ReactNode }) => (
  <div className="flex items-end justify-between gap-3 mb-5">
    <div>
      <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">{eyebrow}</p>
      <h2 className="text-xl font-semibold tracking-tight mt-1">{title}</h2>
      {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
    </div>
    {action}
  </div>
);

/** Distinct tinted band wrapping each section so they don't bleed together. */
const Band = ({
  id, label, defaultPreset, className, children,
}: {
  id: string;
  label: string;
  defaultPreset: SectionPresetId;
  className?: string;
  children: React.ReactNode;
}) => {
  const tone = useSectionTone(id, label, "Command Center", defaultPreset);
  return (
    <section className={cn("rounded-3xl border-2 p-5 sm:p-6 lg:p-8 shadow-md", tone, className)}>
      {children}
    </section>
  );
};


interface MetricCardProps {
  title: string; value: string; sub: string;
  trend: "up" | "down" | "flat"; trendText: string;
  accent: string; ringAccent: string; icon: typeof Activity;
}

const MetricCard = ({ title, value, sub, trend, trendText, accent, ringAccent, icon: Icon }: MetricCardProps) => {
  const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Activity;
  const trendCls =
    trend === "up" ? "text-emerald-600 dark:text-emerald-400"
    : trend === "down" ? "text-red-600 dark:text-red-400"
    : "text-muted-foreground";

  return (
    <div className="rounded-2xl border bg-card p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">{title}</p>
        <div className={cn("h-9 w-9 rounded-xl grid place-items-center", ringAccent)}>
          <Icon className="h-4 w-4 text-white" />
        </div>
      </div>
      <div className="mt-4 flex items-baseline gap-2">
        <p className={cn("text-4xl font-bold tabular-nums leading-none", accent)}>{value}</p>
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">{sub}</p>
      <div className="mt-4 pt-3 border-t flex items-center justify-between">
        <span className={cn("inline-flex items-center gap-1 text-xs font-medium", trendCls)}>
          <TrendIcon className="h-3.5 w-3.5" />
          {trendText}
        </span>
      </div>
    </div>
  );
};

const QuickAction = ({
  label, icon: Icon, onClick, accent, to,
}: { label: string; icon: typeof PlusCircle; onClick?: () => void; accent: string; to?: string }) => {
  const inner = (
    <>
      <div className={cn("rounded-lg p-2.5", accent)}>
        <Icon className="h-5 w-5 text-white" />
      </div>
      <span className="text-sm font-medium">{label}</span>
      <ArrowRight className="h-4 w-4 ml-auto text-muted-foreground" />
    </>
  );
  const cls = "group flex items-center gap-3 rounded-xl border bg-card p-3 shadow-sm hover:shadow-md hover:border-foreground/20 transition-all";
  return to
    ? <Link to={to} className={cls}>{inner}</Link>
    : <button onClick={onClick} className={cn(cls, "w-full text-left")}>{inner}</button>;
};

/* ───────── Page ───────── */

const NavCommandCenter = () => {
  const navigate = useNavigate();
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [callTarget, setCallTarget] = useState<TeamRow | null>(null);
  const [flagTarget, setFlagTarget] = useState<TeamRow | null>(null);

  const dmDoneToday = 5;
  const dmTargetToday = 8;
  const aaDoneToday = 3;
  const aaTargetToday = 6;
  const urgentFlags = 2;
  const warningFlags = 3;

  const dmWeek = 22;
  const dmWeekTarget = 32;
  const aaWeek = 11;
  const aaWeekTarget = 18;

  const dmWeekPct = Math.round((dmWeek / dmWeekTarget) * 100);
  const aaWeekPct = Math.round((aaWeek / aaWeekTarget) * 100);
  const overallPct = Math.round(((dmWeek + aaWeek) / (dmWeekTarget + aaWeekTarget)) * 100);
  const onTrack = overallPct >= 65;

  const teams = useMemo(() => SAMPLE_TEAMS, []);
  const refresh = () => {
    setLastUpdated(new Date());
    toast.success("Refreshed");
  };

  const onView = (t: TeamRow) => navigate(t.trackerPath);
  const onFlag = (t: TeamRow) => setFlagTarget(t);
  const onCall = (t: TeamRow) => setCallTarget(t);

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-100 via-sky-200 to-sky-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <div className="mx-auto max-w-[1400px] p-4 sm:p-6 lg:p-8 space-y-6">
        <CommandTabs />


        {/* ───── HEADER ───── */}
        <header className="rounded-3xl border bg-gradient-to-r from-slate-900 to-slate-800 text-slate-50 shadow-md p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.22em] text-slate-400 font-semibold">Genie</p>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-0.5">Nav's Command Center</h1>
            <p className="text-sm text-slate-300 mt-1">
              {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={cn("text-xs px-2.5 py-1 border-2 bg-transparent",
                onTrack ? "border-emerald-400/60 text-emerald-300"
                        : "border-red-400/60 text-red-300")}
            >
              <span className={cn("mr-1.5 inline-block h-2 w-2 rounded-full",
                onTrack ? "bg-emerald-400 animate-pulse" : "bg-red-400 animate-pulse")} />
              {onTrack ? "On Track" : "Behind Target"}
            </Badge>
            <Button variant="secondary" size="sm" onClick={refresh}>
              <RefreshCw className="h-4 w-4 mr-1.5" /> Refresh
            </Button>
          </div>
        </header>

        {/* ───── 01 · PULSE (sky) ───── */}
        <Band id="command.pulse" label="01 · Pulse" defaultPreset="sky">
          <SectionHeader
            eyebrow="01 — Pulse"
            title="Today at a glance"
            hint="Live snapshot of completions and active alerts"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <MetricCard title="DM Jobs" value={`${dmDoneToday}/${dmTargetToday}`} sub="Today's target"
              trend="up" trendText="+2 vs yesterday"
              accent="text-blue-600 dark:text-blue-400" ringAccent="bg-blue-500" icon={Activity} />
            <MetricCard title="A & A Jobs" value={`${aaDoneToday}/${aaTargetToday}`} sub="Today's target"
              trend="flat" trendText="On pace"
              accent="text-emerald-600 dark:text-emerald-400" ringAccent="bg-emerald-500" icon={Activity} />
            <MetricCard title="Active Alerts" value={`${urgentFlags + warningFlags}`} sub={`${urgentFlags} urgent · ${warningFlags} warning`}
              trend="down" trendText="-1 since morning"
              accent="text-red-600 dark:text-red-400" ringAccent="bg-red-500" icon={AlertTriangle} />
          </div>
        </Band>

        {/* ───── 02 · FIELD (amber) ───── */}
        <Band id="command.field" label="02 · Field" defaultPreset="powder">
          <SectionHeader
            eyebrow="02 — Field"
            title="Today's Schedule"
            hint="All teams · AM/PM allocations · * = A&A team"
            action={<Badge variant="outline" className="px-2.5 py-1 bg-card">{teams.length} teams</Badge>}
          />

          <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="text-left px-5 py-3 font-semibold">Team</th>
                    <th className="text-left px-5 py-3 font-semibold">AM Job</th>
                    <th className="text-left px-5 py-3 font-semibold">PM Job</th>
                    <th className="text-left px-5 py-3 font-semibold">Status</th>
                    <th className="text-right px-5 py-3 font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {teams.map((t) => {
                    const meta = STATUS_META[t.status];
                    const StatusIcon = meta.icon;
                    return (
                      <tr key={t.team} className="border-t hover:bg-muted/30 transition-colors">
                        <td className="px-5 py-3.5 font-medium">
                          <div className="flex items-center gap-2">
                            <span className={cn("h-2 w-2 rounded-full", meta.dot)} />
                            {t.team}{t.aa && <span className="text-emerald-600 font-bold ml-0.5">*</span>}
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-muted-foreground">{t.am}</td>
                        <td className="px-5 py-3.5 text-muted-foreground">{t.pm}</td>
                        <td className="px-5 py-3.5">
                          <span className={cn("inline-flex items-center gap-1 px-2 py-1 rounded-md border text-xs font-medium", meta.cls)}>
                            <StatusIcon className="h-3 w-3" /> {meta.label}
                          </span>
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button size="sm" variant="outline" className="h-8" onClick={() => onView(t)}>
                              <Eye className="h-3.5 w-3.5 mr-1" />View
                            </Button>
                            <Button size="sm" variant="outline" className="h-8" onClick={() => onFlag(t)}>
                              <Flag className="h-3.5 w-3.5 mr-1" />Flag
                            </Button>
                            <Button size="sm" variant="outline" className="h-8" onClick={() => onCall(t)}>
                              <PhoneCall className="h-3.5 w-3.5 mr-1" />Call
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden divide-y">
              {teams.map((t) => {
                const meta = STATUS_META[t.status];
                const StatusIcon = meta.icon;
                return (
                  <div key={t.team} className="p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="font-semibold flex items-center gap-1.5">
                        <span className={cn("h-2 w-2 rounded-full", meta.dot)} />
                        {t.team}{t.aa && <span className="text-emerald-600 font-bold">*</span>}
                      </div>
                      <span className={cn("inline-flex items-center gap-1 px-2 py-1 rounded-md border text-xs font-medium", meta.cls)}>
                        <StatusIcon className="h-3 w-3" /> {meta.label}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div><span className="text-muted-foreground">AM:</span> {t.am}</div>
                      <div><span className="text-muted-foreground">PM:</span> {t.pm}</div>
                    </div>
                    <div className="flex gap-1.5 pt-1">
                      <Button size="sm" variant="outline" className="flex-1 h-9" onClick={() => onView(t)}>
                        <Eye className="h-3.5 w-3.5 mr-1" />View
                      </Button>
                      <Button size="sm" variant="outline" className="flex-1 h-9" onClick={() => onFlag(t)}>
                        <Flag className="h-3.5 w-3.5 mr-1" />Flag
                      </Button>
                      <Button size="sm" variant="outline" className="flex-1 h-9" onClick={() => onCall(t)}>
                        <PhoneCall className="h-3.5 w-3.5 mr-1" />Call
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </Band>

        {/* ───── 03 · PERFORMANCE (emerald) ───── */}
        <Band id="command.performance" label="03 · Performance" defaultPreset="ice">
          <SectionHeader
            eyebrow="03 — Performance"
            title="Week to Date"
            hint="Progress vs weekly targets"
            action={
              <Badge
                variant="outline"
                className={cn("px-2.5 py-1 border-2 bg-card",
                  onTrack ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
                          : "border-red-500/40 text-red-700 dark:text-red-300")}
              >
                {onTrack ? "On Track" : "Behind Target"}
              </Badge>
            }
          />
          <div className="rounded-2xl border bg-card shadow-sm p-5 sm:p-6 space-y-5">
            {[
              { label: "DM",      done: dmWeek, target: dmWeekTarget, pct: dmWeekPct, color: "bg-blue-500" },
              { label: "A&A",     done: aaWeek, target: aaWeekTarget, pct: aaWeekPct, color: "bg-emerald-500" },
              { label: "Overall", done: dmWeek + aaWeek, target: dmWeekTarget + aaWeekTarget, pct: overallPct, color: "bg-violet-500" },
            ].map(row => (
              <div key={row.label}>
                <div className="flex items-baseline justify-between mb-2">
                  <span className="text-sm font-semibold">{row.label}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {row.done}/{row.target} · <span className="font-semibold text-foreground">{row.pct}%</span>
                  </span>
                </div>
                <Progress value={row.pct} className="h-2.5" />
              </div>
            ))}
          </div>
        </Band>

        {/* ───── 04 · ACTIONS (violet) ───── */}
        <Band id="command.actions" label="04 · Actions" defaultPreset="mist">
          <SectionHeader
            eyebrow="04 — Actions"
            title="Quick Actions"
            hint="One tap to log, flag, or jump to a tracker"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            <QuickAction to="/command/log"     label="Open Live Log"   icon={Activity}     accent="bg-blue-500" />
            <QuickAction to="/command/log"     label="Flag Issue"      icon={Flag}         accent="bg-red-500" />
            <QuickAction to="/command/log"     label="Log Completion"  icon={CheckCircle2} accent="bg-emerald-500" />
            <QuickAction to="/command/log"     label="Add Note"        icon={StickyNote}   accent="bg-amber-500" />
            <QuickAction to="/command/reports" label="Run Report"      icon={FileBarChart} accent="bg-violet-500" />
            <QuickAction to="/command/owners"  label="Owner's View"    icon={Eye}          accent="bg-slate-700" />
          </div>
        </Band>

        {/* ───── FOOTER ───── */}
        <footer className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-4 pb-2 border-t text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Last updated: {lastUpdated.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </div>
          <div className="flex items-center gap-4">
            <button onClick={refresh} className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors">
              <RefreshCw className="h-4 w-4" /> Refresh
            </button>
            <Link to="/command/reports" className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors">
              <FileBarChart className="h-4 w-4" /> Reports
            </Link>
            <Link to="/" className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors">
              <Settings className="h-4 w-4" /> Settings
            </Link>
          </div>
        </footer>
      </div>

      <TeamCallLogDialog
        open={!!callTarget}
        onOpenChange={(o) => !o && setCallTarget(null)}
        team={callTarget?.team || ""}
        phone={callTarget?.phone || ""}
      />

      <FlagJobDialog
        open={!!flagTarget}
        onOpenChange={(o) => !o && setFlagTarget(null)}
        team={flagTarget?.team || ""}
        jobNumber={
          flagTarget
            ? (flagTarget.am.split(" – ")[0] !== "—"
                ? flagTarget.am.split(" – ")[0]
                : flagTarget.pm.split(" – ")[0])
            : undefined
        }
      />

    </div>
  );
};

export default NavCommandCenter;
