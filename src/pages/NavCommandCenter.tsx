import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, Clock,
  Flag, PhoneCall, Eye, RefreshCw, FileBarChart, Settings,
  PlusCircle, StickyNote, Activity,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Status = "done" | "in_progress" | "flagged" | "urgent";

interface TeamRow {
  team: string;
  aa?: boolean;
  am: string;
  pm: string;
  status: Status;
}

const SAMPLE_TEAMS: TeamRow[] = [
  { team: "Shakthi", am: "N2640150 – 12 High St", pm: "N2640201 – 8 Park Ave", status: "in_progress" },
  { team: "Indika", am: "N2640177 – 44 King Rd", pm: "N2640188 – 21 Oak Cl", status: "done" },
  { team: "Pradeep", am: "N2640199 – 5 Elm Way", pm: "—", status: "urgent" },
  { team: "Suresh", am: "N2640210 – 17 Beech Dr", pm: "N2640218 – 9 Mill Ln", status: "flagged" },
  { team: "Carpenter Crew", aa: true, am: "N2640155 – 12 High St (Fire Door)", pm: "N2640190 – 33 Vale", status: "in_progress" },
  { team: "Roofing Pro", aa: true, am: "N2640161 – 7 Hill Rd", pm: "—", status: "done" },
  { team: "Flooring Co", aa: true, am: "—", pm: "N2640205 – 14 Lime Ave", status: "in_progress" },
];

const STATUS_META: Record<Status, { label: string; icon: typeof CheckCircle2; cls: string; dot: string }> = {
  done:        { label: "Done",        icon: CheckCircle2, cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30", dot: "bg-emerald-500" },
  in_progress: { label: "In Progress", icon: Clock,        cls: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30",        dot: "bg-amber-500" },
  flagged:     { label: "Flagged",     icon: Flag,         cls: "bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-500/30",     dot: "bg-orange-500" },
  urgent:      { label: "Urgent",      icon: AlertTriangle,cls: "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/30",                 dot: "bg-red-500" },
};

interface MetricCardProps {
  title: string;
  value: string;
  sub: string;
  trend: "up" | "down" | "flat";
  trendText: string;
  accent: string;
  icon: typeof Activity;
}

const MetricCard = ({ title, value, sub, trend, trendText, accent, icon: Icon }: MetricCardProps) => {
  const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Activity;
  const trendCls =
    trend === "up" ? "text-emerald-600 dark:text-emerald-400"
    : trend === "down" ? "text-red-600 dark:text-red-400"
    : "text-muted-foreground";

  return (
    <div className="relative overflow-hidden rounded-2xl border bg-card p-5 sm:p-6 shadow-sm">
      <div className={cn("absolute inset-x-0 top-0 h-1", accent)} />
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs sm:text-sm font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
          <p className="mt-2 text-3xl sm:text-4xl font-bold tabular-nums">{value}</p>
          <p className="mt-1 text-sm text-muted-foreground">{sub}</p>
        </div>
        <div className={cn("rounded-xl p-2.5", accent, "bg-opacity-20")}>
          <Icon className="h-6 w-6 text-white" />
        </div>
      </div>
      <div className={cn("mt-4 inline-flex items-center gap-1.5 text-xs font-medium", trendCls)}>
        <TrendIcon className="h-3.5 w-3.5" />
        {trendText}
      </div>
    </div>
  );
};

interface QuickActionProps {
  label: string;
  icon: typeof PlusCircle;
  onClick: () => void;
  accent: string;
}

const QuickAction = ({ label, icon: Icon, onClick, accent }: QuickActionProps) => (
  <button
    onClick={onClick}
    className="group flex flex-col items-center justify-center gap-2 rounded-2xl border bg-card p-5 sm:p-6 min-h-[110px] sm:min-h-[130px] shadow-sm transition-all hover:shadow-md active:scale-[0.98]"
  >
    <div className={cn("rounded-xl p-3 transition-transform group-hover:scale-110", accent)}>
      <Icon className="h-6 w-6 sm:h-7 sm:w-7 text-white" />
    </div>
    <span className="text-sm sm:text-base font-semibold text-center leading-tight">{label}</span>
  </button>
);

const NavCommandCenter = () => {
  const [lastUpdated, setLastUpdated] = useState(new Date());

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

  const handleAction = (label: string) => {
    // eslint-disable-next-line no-console
    console.log(`[NavCC] ${label}`);
  };

  const refresh = () => setLastUpdated(new Date());

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-background to-slate-100 dark:from-slate-950 dark:via-background dark:to-slate-900">
      <div className="mx-auto max-w-[1400px] p-4 sm:p-6 lg:p-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Genie</p>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight">Nav's Command Center</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={onTrack ? "default" : "destructive"} className="text-xs">
              <span className={cn("mr-1.5 inline-block h-2 w-2 rounded-full", onTrack ? "bg-emerald-400" : "bg-red-400")} />
              {onTrack ? "On Track" : "Behind Target"}
            </Badge>
            <Button variant="outline" size="sm" onClick={refresh}>
              <RefreshCw className="h-4 w-4 mr-1.5" /> Refresh
            </Button>
          </div>
        </div>

        {/* Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <MetricCard
            title="DM Jobs"
            value={`${dmDoneToday}/${dmTargetToday}`}
            sub="Today's target"
            trend="up"
            trendText="+2 vs yesterday"
            accent="bg-blue-500"
            icon={Activity}
          />
          <MetricCard
            title="A & A Jobs"
            value={`${aaDoneToday}/${aaTargetToday}`}
            sub="Today's target"
            trend="flat"
            trendText="On pace"
            accent="bg-emerald-500"
            icon={Activity}
          />
          <MetricCard
            title="Alerts"
            value={`${urgentFlags + warningFlags}`}
            sub={`${urgentFlags} urgent · ${warningFlags} warning`}
            trend="down"
            trendText="-1 since this morning"
            accent="bg-red-500"
            icon={AlertTriangle}
          />
        </div>

        {/* Today's Schedule */}
        <section className="rounded-2xl border bg-card shadow-sm overflow-hidden">
          <header className="flex items-center justify-between px-5 py-4 border-b">
            <div>
              <h2 className="text-lg font-semibold">Today's Schedule</h2>
              <p className="text-xs text-muted-foreground">All teams · AM/PM allocations · * = A&A team</p>
            </div>
            <Badge variant="outline">{teams.length} teams</Badge>
          </header>

          {/* Desktop / tablet landscape table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="text-left px-5 py-3 font-medium">Team</th>
                  <th className="text-left px-5 py-3 font-medium">AM Job</th>
                  <th className="text-left px-5 py-3 font-medium">PM Job</th>
                  <th className="text-left px-5 py-3 font-medium">Status</th>
                  <th className="text-right px-5 py-3 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {teams.map((t) => {
                  const meta = STATUS_META[t.status];
                  const StatusIcon = meta.icon;
                  return (
                    <tr key={t.team} className="border-t hover:bg-muted/30 transition-colors">
                      <td className="px-5 py-3 font-medium">
                        <div className="flex items-center gap-2">
                          <span className={cn("h-2 w-2 rounded-full", meta.dot)} />
                          {t.team}{t.aa && <span className="text-emerald-600 font-bold">*</span>}
                        </div>
                      </td>
                      <td className="px-5 py-3 text-muted-foreground">{t.am}</td>
                      <td className="px-5 py-3 text-muted-foreground">{t.pm}</td>
                      <td className="px-5 py-3">
                        <span className={cn("inline-flex items-center gap-1 px-2 py-1 rounded-md border text-xs font-medium", meta.cls)}>
                          <StatusIcon className="h-3 w-3" /> {meta.label}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button size="sm" variant="outline" className="h-8" onClick={() => handleAction(`view-${t.team}`)}>
                            <Eye className="h-3.5 w-3.5 mr-1" /> View
                          </Button>
                          <Button size="sm" variant="outline" className="h-8" onClick={() => handleAction(`flag-${t.team}`)}>
                            <Flag className="h-3.5 w-3.5 mr-1" /> Flag
                          </Button>
                          <Button size="sm" variant="outline" className="h-8" onClick={() => handleAction(`call-${t.team}`)}>
                            <PhoneCall className="h-3.5 w-3.5 mr-1" /> Call
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile / portrait cards */}
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
                    <Button size="sm" variant="outline" className="flex-1 h-9" onClick={() => handleAction(`view-${t.team}`)}><Eye className="h-3.5 w-3.5 mr-1" />View</Button>
                    <Button size="sm" variant="outline" className="flex-1 h-9" onClick={() => handleAction(`flag-${t.team}`)}><Flag className="h-3.5 w-3.5 mr-1" />Flag</Button>
                    <Button size="sm" variant="outline" className="flex-1 h-9" onClick={() => handleAction(`call-${t.team}`)}><PhoneCall className="h-3.5 w-3.5 mr-1" />Call</Button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Quick Actions */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold px-1">Quick Actions</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
            <QuickAction label="Log Completion" icon={CheckCircle2} accent="bg-emerald-500" onClick={() => handleAction("log-completion")} />
            <QuickAction label="Flag Issue"     icon={Flag}          accent="bg-red-500"     onClick={() => handleAction("flag-issue")} />
            <QuickAction label="Add Note"       icon={StickyNote}    accent="bg-amber-500"   onClick={() => handleAction("add-note")} />
            <QuickAction label="Run Report"     icon={FileBarChart}  accent="bg-blue-500"    onClick={() => handleAction("run-report")} />
            <QuickAction label="Call Team"      icon={PhoneCall}     accent="bg-violet-500"  onClick={() => handleAction("call-team")} />
          </div>
        </section>

        {/* Week to Date */}
        <section className="rounded-2xl border bg-card p-5 sm:p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="text-lg font-semibold">Week to Date</h2>
            <Badge className={onTrack ? "bg-emerald-500 hover:bg-emerald-500" : "bg-red-500 hover:bg-red-500"}>
              {onTrack ? "On Track" : "Behind Target"}
            </Badge>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div>
              <div className="flex items-baseline justify-between mb-1.5">
                <span className="text-sm font-medium">DM</span>
                <span className="text-xs text-muted-foreground tabular-nums">{dmWeek}/{dmWeekTarget} ({dmWeekPct}%)</span>
              </div>
              <Progress value={dmWeekPct} className="h-2.5" />
            </div>
            <div>
              <div className="flex items-baseline justify-between mb-1.5">
                <span className="text-sm font-medium">A&A</span>
                <span className="text-xs text-muted-foreground tabular-nums">{aaWeek}/{aaWeekTarget} ({aaWeekPct}%)</span>
              </div>
              <Progress value={aaWeekPct} className="h-2.5" />
            </div>
            <div>
              <div className="flex items-baseline justify-between mb-1.5">
                <span className="text-sm font-medium">Overall</span>
                <span className="text-xs text-muted-foreground tabular-nums">{overallPct}%</span>
              </div>
              <Progress value={overallPct} className="h-2.5" />
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2 pb-6 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Last updated: {lastUpdated.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </div>
          <div className="flex items-center gap-3">
            <button onClick={refresh} className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors">
              <RefreshCw className="h-4 w-4" /> Refresh
            </button>
            <Link to="/" className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors">
              <FileBarChart className="h-4 w-4" /> View Reports
            </Link>
            <Link to="/" className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors">
              <Settings className="h-4 w-4" /> Settings
            </Link>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default NavCommandCenter;
