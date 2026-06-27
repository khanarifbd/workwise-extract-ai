import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, Download, Printer, Share2, TrendingUp, TrendingDown,
  Calendar, Minus, AlertTriangle, GraduationCap, ClipboardCheck,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, ReferenceLine,
  CartesianGrid, Legend, LabelList,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Range = "7" | "30" | "90" | "custom";

// ---- Sample data generators ----
const dayLabels = (n: number) => {
  const arr: string[] = [];
  const d = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const dd = new Date(d);
    dd.setDate(d.getDate() - i);
    arr.push(dd.toLocaleDateString(undefined, { month: "short", day: "numeric" }));
  }
  return arr;
};

const seed = (range: number) =>
  dayLabels(range).map((label, i) => ({
    day: label,
    dm: 5 + Math.round(Math.abs(Math.sin(i * 0.7)) * 5),
    aa: 3 + Math.round(Math.abs(Math.cos(i * 0.6)) * 4),
  }));

const FLAG_CATEGORIES = [
  { category: "Overrun", count: 14 },
  { category: "Sign-off Delay", count: 11 },
  { category: "PPE", count: 7 },
  { category: "Materials", count: 9 },
  { category: "Tenant Issue", count: 6 },
  { category: "Quality", count: 5 },
  { category: "Conduct", count: 3 },
  { category: "Language", count: 2 },
].sort((a, b) => b.count - a.count);

const TRAINING = [
  { area: "PPE Compliance", before: 62, after: 91 },
  { area: "Sign-off Speed", before: 55, after: 82 },
  { area: "Quality Photos", before: 48, after: 79 },
  { area: "Communication", before: 60, after: 84 },
];

const TEAMS = [
  { team: "Gupi",      jobsPerDay: 1.8, signOff: 92, flags: 2, ppe: 96, trend: "up" },
  { team: "Shakthi",   jobsPerDay: 1.6, signOff: 88, flags: 4, ppe: 90, trend: "up" },
  { team: "Indika",    jobsPerDay: 1.4, signOff: 81, flags: 5, ppe: 85, trend: "flat" },
  { team: "Abraham",   jobsPerDay: 1.2, signOff: 76, flags: 6, ppe: 82, trend: "down" },
  { team: "Jess",      jobsPerDay: 1.5, signOff: 89, flags: 3, ppe: 94, trend: "up" },
  { team: "Bartek",    jobsPerDay: 1.3, signOff: 84, flags: 4, ppe: 88, trend: "flat" },
];

const TOP_ISSUES = [
  { issue: "Sign-off photos blurry", count: 12, trend: "down", status: "Improving" },
  { issue: "Late afternoon overruns", count: 9,  trend: "up",   status: "Monitoring" },
  { issue: "Missing PPE — gloves",   count: 7,  trend: "down", status: "Coaching scheduled" },
  { issue: "Materials short on site", count: 6, trend: "flat", status: "Reviewing" },
  { issue: "Tenant access delays",   count: 5,  trend: "up",   status: "Escalated" },
];

const UPCOMING = [
  { kind: "training", title: "PPE refresher — DM teams",        when: "Mon 09:00", owner: "Nav" },
  { kind: "followup", title: "Re-inspect N2640210 sign-off",    when: "Tomorrow",  owner: "Danni" },
  { kind: "review",   title: "Conduct review — operative #4",   when: "Wed 14:00", owner: "Nav" },
  { kind: "training", title: "Quality photos workshop",         when: "Fri 10:00", owner: "Nav" },
  { kind: "followup", title: "Materials supplier escalation",   when: "Thu 11:00", owner: "Ops" },
];

const KIND_META: Record<string, { label: string; color: string; icon: any }> = {
  training: { label: "Training", color: "bg-blue-500/10 text-blue-700 border-blue-500/30 dark:text-blue-300", icon: GraduationCap },
  followup: { label: "Follow-up", color: "bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-300", icon: ClipboardCheck },
  review:   { label: "Review",   color: "bg-red-500/10 text-red-700 border-red-500/30 dark:text-red-300", icon: AlertTriangle },
};

// ---- Helpers ----
const Trend = ({ dir }: { dir: string }) => {
  if (dir === "up")   return <TrendingUp className="h-4 w-4 text-emerald-500" />;
  if (dir === "down") return <TrendingDown className="h-4 w-4 text-red-500" />;
  return <Minus className="h-4 w-4 text-muted-foreground" />;
};

const Card = ({ title, subtitle, children, className }: {
  title: string; subtitle?: string; children: React.ReactNode; className?: string;
}) => (
  <div className={cn("rounded-2xl border bg-card p-4 shadow-sm", className)}>
    <div className="flex items-end justify-between mb-3">
      <div>
        <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
    </div>
    {children}
  </div>
);

const ReportsAnalytics = () => {
  const navigate = useNavigate();
  const [range, setRange] = useState<Range>("7");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const days = range === "custom"
    ? (customFrom && customTo
        ? Math.max(1, Math.round((+new Date(customTo) - +new Date(customFrom)) / 86400000) + 1)
        : 7)
    : Number(range);

  const data = useMemo(() => seed(days), [days]);

  const dmTotal = data.reduce((s, d) => s + d.dm, 0);
  const aaTotal = data.reduce((s, d) => s + d.aa, 0);
  const dmTarget = 8 * data.length;
  const aaTarget = 6 * data.length;
  const dmPct = Math.round((dmTotal / dmTarget) * 100);
  const aaPct = Math.round((aaTotal / aaTarget) * 100);

  const dmTrend = data.length >= 2 ? data[data.length - 1].dm - data[0].dm : 0;
  const aaTrend = data.length >= 2 ? data[data.length - 1].aa - data[0].aa : 0;

  const exportCsv = () => {
    const rows = [
      ["Day", "DM Completions", "A&A Completions"],
      ...data.map(d => [d.day, d.dm, d.aa]),
    ];
    const csv = rows.map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `genie-report-${range}d.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const print = () => window.print();

  const share = async () => {
    const text = `Genie Report (${days}d): DM ${dmTotal}/${dmTarget} (${dmPct}%), A&A ${aaTotal}/${aaTarget} (${aaPct}%).`;
    if (navigator.share) {
      try { await navigator.share({ title: "Genie Report", text }); } catch {}
    } else {
      await navigator.clipboard.writeText(text);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-7xl px-3 sm:px-4 lg:px-6 py-4 space-y-4">

        {/* Header */}
        <div className="rounded-2xl border bg-card p-3 sm:p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => navigate("/command")}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Back
              </Button>
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Genie</p>
                <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight">Reports & Analytics</h1>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {([
                { v: "7",  label: "Last 7 Days"  },
                { v: "30", label: "Last 30 Days" },
                { v: "90", label: "Last 90 Days" },
                { v: "custom", label: "Custom" },
              ] as { v: Range; label: string }[]).map(r => (
                <Button
                  key={r.v}
                  size="sm"
                  variant={range === r.v ? "default" : "outline"}
                  onClick={() => setRange(r.v)}
                  className="min-h-[40px]"
                >
                  <Calendar className="h-3.5 w-3.5 mr-1.5" /> {r.label}
                </Button>
              ))}
              <Button size="sm" variant="outline" onClick={exportCsv} className="min-h-[40px]">
                <Download className="h-4 w-4 mr-1.5" /> Export
              </Button>
            </div>
          </div>
          {range === "custom" && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className="w-auto" />
              <span className="text-sm text-muted-foreground">to</span>
              <Input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className="w-auto" />
            </div>
          )}
        </div>

        {/* Summary tiles */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <SummaryTile label="DM Completions" value={`${dmTotal}/${dmTarget}`} pct={dmPct} trend={dmTrend} />
          <SummaryTile label="A&A Completions" value={`${aaTotal}/${aaTarget}`} pct={aaPct} trend={aaTrend} />
          <SummaryTile label="Open Flags" value={String(FLAG_CATEGORIES.reduce((s, f) => s + f.count, 0))} pct={null} trend={-2} suffix="this period" />
          <SummaryTile label="Training Lift" value="+27%" pct={null} trend={1} suffix="avg before→after" />
        </div>

        {/* Charts grid */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          <Card title="DM Completions vs Target" subtitle={`Target: 8 / day · Trend ${dmTrend >= 0 ? "▲" : "▼"} ${Math.abs(dmTrend)}`}>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                  <ReferenceLine y={8} stroke="hsl(var(--destructive))" strokeDasharray="4 4" label={{ value: "Target", fontSize: 10, fill: "hsl(var(--destructive))" }} />
                  <Bar dataKey="dm" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card title="A&A Completions vs Target" subtitle={`Target: 6 / day · Trend ${aaTrend >= 0 ? "▲" : "▼"} ${Math.abs(aaTrend)}`}>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                  <ReferenceLine y={6} stroke="hsl(var(--destructive))" strokeDasharray="4 4" label={{ value: "Target", fontSize: 10, fill: "hsl(var(--destructive))" }} />
                  <Bar dataKey="aa" fill="#10b981" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card title="Flag Breakdown" subtitle={`By category · last ${days} days`}>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={FLAG_CATEGORIES} layout="vertical" margin={{ left: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis dataKey="category" type="category" tick={{ fontSize: 11 }} width={110} />
                  <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                  <Bar dataKey="count" fill="#f59e0b" radius={[0, 6, 6, 0]}>
                    <LabelList dataKey="count" position="right" style={{ fontSize: 11, fill: "hsl(var(--foreground))" }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card title="Training Effectiveness" subtitle="Before vs After (% compliance)">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={TRAINING}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="area" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} />
                  <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="before" name="Before" fill="hsl(var(--muted-foreground))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="after"  name="After"  fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              Avg improvement: <span className="font-semibold text-emerald-600">+{Math.round(TRAINING.reduce((s, t) => s + (t.after - t.before), 0) / TRAINING.length)}%</span>
            </div>
          </Card>
        </div>

        {/* Team performance */}
        <Card title="Team Performance" subtitle={`Last ${days} days`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b">
                  <th className="py-2 pr-3">Team</th>
                  <th className="py-2 pr-3">Jobs / Day</th>
                  <th className="py-2 pr-3">Sign-off Rate</th>
                  <th className="py-2 pr-3">Flags</th>
                  <th className="py-2 pr-3">PPE</th>
                  <th className="py-2 pr-3">Trend</th>
                </tr>
              </thead>
              <tbody>
                {TEAMS.map(t => (
                  <tr key={t.team} className="border-b last:border-b-0">
                    <td className="py-2 pr-3 font-medium">{t.team}</td>
                    <td className="py-2 pr-3">{t.jobsPerDay.toFixed(1)}</td>
                    <td className="py-2 pr-3">
                      <Pill value={t.signOff} thresholds={[85, 75]} suffix="%" />
                    </td>
                    <td className="py-2 pr-3">
                      <Badge variant={t.flags <= 3 ? "secondary" : t.flags <= 5 ? "outline" : "destructive"}>{t.flags}</Badge>
                    </td>
                    <td className="py-2 pr-3"><Pill value={t.ppe} thresholds={[90, 80]} suffix="%" /></td>
                    <td className="py-2 pr-3"><Trend dir={t.trend} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Top issues */}
        <Card title="Top Issues" subtitle="Most reported in selected range">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b">
                  <th className="py-2 pr-3">Issue</th>
                  <th className="py-2 pr-3">Count</th>
                  <th className="py-2 pr-3">Trend</th>
                  <th className="py-2 pr-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {TOP_ISSUES.map(i => (
                  <tr key={i.issue} className="border-b last:border-b-0">
                    <td className="py-2 pr-3 font-medium">{i.issue}</td>
                    <td className="py-2 pr-3">{i.count}</td>
                    <td className="py-2 pr-3"><Trend dir={i.trend} /></td>
                    <td className="py-2 pr-3 text-muted-foreground">{i.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Upcoming actions */}
        <Card title="Upcoming Actions" subtitle="Scheduled training · follow-ups · flagged items">
          <ul className="divide-y">
            {UPCOMING.map((u, idx) => {
              const meta = KIND_META[u.kind];
              const Icon = meta.icon;
              return (
                <li key={idx} className="py-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={cn("h-9 w-9 rounded-lg border flex items-center justify-center shrink-0", meta.color)}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="font-medium truncate">{u.title}</p>
                      <p className="text-xs text-muted-foreground">{meta.label} · Owner: {u.owner}</p>
                    </div>
                  </div>
                  <Badge variant="outline" className="shrink-0">{u.when}</Badge>
                </li>
              );
            })}
          </ul>
        </Card>

        {/* Footer */}
        <div className="rounded-2xl border bg-card p-4 shadow-sm flex flex-wrap items-center justify-between gap-2 sticky bottom-2 z-10">
          <p className="text-xs text-muted-foreground">
            Range: <span className="font-semibold text-foreground">Last {days} days</span> · Generated {new Date().toLocaleString()}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={exportCsv}>
              <Download className="h-4 w-4 mr-1.5" /> Export Full Report
            </Button>
            <Button size="sm" variant="outline" onClick={print}>
              <Printer className="h-4 w-4 mr-1.5" /> Print Summary
            </Button>
            <Button size="sm" variant="outline" onClick={share}>
              <Share2 className="h-4 w-4 mr-1.5" /> Share with Owners
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

const SummaryTile = ({ label, value, pct, trend, suffix }: {
  label: string; value: string; pct: number | null; trend: number; suffix?: string;
}) => (
  <div className="rounded-2xl border bg-card p-4 shadow-sm">
    <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
    <div className="mt-1 flex items-end justify-between gap-2">
      <span className="text-2xl font-bold tracking-tight">{value}</span>
      <span className={cn(
        "text-xs flex items-center gap-1 font-medium",
        trend > 0 ? "text-emerald-600" : trend < 0 ? "text-red-600" : "text-muted-foreground"
      )}>
        {trend > 0 ? <TrendingUp className="h-3.5 w-3.5" /> : trend < 0 ? <TrendingDown className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />}
        {pct !== null ? `${pct}%` : suffix}
      </span>
    </div>
    {pct !== null && (
      <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={cn("h-full", pct >= 100 ? "bg-emerald-500" : pct >= 80 ? "bg-blue-500" : pct >= 60 ? "bg-amber-500" : "bg-red-500")} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
    )}
  </div>
);

const Pill = ({ value, thresholds, suffix }: { value: number; thresholds: [number, number]; suffix?: string }) => {
  const [good, ok] = thresholds;
  const tone = value >= good ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
    : value >= ok ? "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30"
    : "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/30";
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-md border text-xs font-medium", tone)}>
      {value}{suffix}
    </span>
  );
};

export default ReportsAnalytics;
