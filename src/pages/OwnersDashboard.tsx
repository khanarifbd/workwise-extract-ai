import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { Eye, AlertTriangle, TrendingDown, TrendingUp, FileDown, ArrowRight, GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useCommandMetrics } from "@/hooks/useCommandMetrics";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { downloadPDF } from "@/lib/pdfDownload";

const DM_DAILY = 8;
const DM_WEEKLY = 32;
const AA_DAILY = 6;
const AA_WEEKLY = 18;

export default function OwnersDashboard() {
  const navigate = useNavigate();
  const cm = useCommandMetrics();

  const today = new Date();
  const todayKey = format(today, "yyyy-MM-dd");

  const metrics = useMemo(() => {
    const dmToday = cm.dm.completedToday;
    const dmWeek = cm.dm.completedThisWeek;
    const aaToday = cm.aa.completedToday;
    const aaWeek = cm.aa.completedThisWeek;
    const dmPct = Math.round((dmWeek / DM_WEEKLY) * 100) || 0;
    const aaPct = Math.round((aaWeek / AA_WEEKLY) * 100) || 0;
    const overallPct = Math.round(((dmWeek + aaWeek) / (DM_WEEKLY + AA_WEEKLY)) * 100) || 0;
    return { dmToday, dmWeek, aaToday, aaWeek, dmPct, aaPct, overallPct };
  }, [cm.dm, cm.aa]);

  const flags = useMemo(() => {
    const open = cm.openFlags.slice(0, 12).map((j: any) => ({
      id: j.id,
      jobNumber: j.jobNumber || "—",
      team: j.team || j.team2 || "Unassigned",
      issue:
        j.referBackReason ||
        j.blockerNotes ||
        j.progressNotes ||
        (j.description || "").slice(0, 80) ||
        "Flagged for review",
      severity:
        j.isUrgent || j.status === "no_show" || j.referBack ? "Urgent" : "Warning",
    }));
    const closed = cm.totals.complete; // proxy: total completions logged
    return { open, closedCount: closed };
  }, [cm.openFlags, cm.totals.complete]);


  const training = [
    { team: "Indika", issue: "Sign-off photo quality", date: "Mon" },
    { team: "Gupi", issue: "PPE compliance refresh", date: "Tue" },
    { team: "Abraham", issue: "Tenant communication", date: "Thu" },
  ];

  const exportPDF = () => {
    const doc = new jsPDF({ orientation: "portrait" });
    doc.setFontSize(16);
    doc.text("AllSaints Genie — Owners Weekly Report", 14, 18);
    doc.setFontSize(10);
    doc.text(format(today, "EEEE, dd MMM yyyy"), 14, 25);
    autoTable(doc, {
      startY: 32,
      head: [["Metric", "Today", "Week", "Target"]],
      body: [
        ["DM Jobs", String(metrics.dmToday), String(metrics.dmWeek), `${DM_DAILY}/${DM_WEEKLY}`],
        ["A&A Jobs", String(metrics.aaToday), String(metrics.aaWeek), `${AA_DAILY}/${AA_WEEKLY}`],
        ["Flags Open", String(flags.open.length), String(flags.closedCount) + " closed", "—"],
        ["DM %", `${metrics.dmPct}%`, "", "100%"],
        ["A&A %", `${metrics.aaPct}%`, "", "100%"],
        ["Overall %", `${metrics.overallPct}%`, "", "100%"],
      ],
    });
    autoTable(doc, {
      head: [["Job", "Team", "Issue", "Severity"]],
      body: flags.open.map((f) => [f.jobNumber, f.team, f.issue, f.severity]),
    });
    downloadPDF(doc, `Owners-Weekly-${todayKey}.pdf`);
  };

  const trend = metrics.overallPct - 100;

  return (
    <div className="min-h-screen bg-background p-6 space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">ALLSAINTS GENIE – OWNERS DASHBOARD</h1>
          <p className="text-sm text-muted-foreground">{format(today, "EEEE, dd MMMM yyyy")}</p>
        </div>
        <Badge variant="secondary" className="gap-1 text-sm py-1.5 px-3">
          <Eye className="h-4 w-4" /> View-Only
        </Badge>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">DM Jobs</p>
          <p className="text-3xl font-bold mt-2">{metrics.dmToday}<span className="text-base text-muted-foreground">/{DM_DAILY}</span></p>
          <p className="text-sm text-muted-foreground mt-1">Today</p>
          <p className="text-sm mt-3">Week: <span className="font-semibold">{metrics.dmWeek}/{DM_WEEKLY}</span></p>
        </Card>
        <Card className="p-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">A&A Jobs</p>
          <p className="text-3xl font-bold mt-2">{metrics.aaToday}<span className="text-base text-muted-foreground">/{AA_DAILY}</span></p>
          <p className="text-sm text-muted-foreground mt-1">Today</p>
          <p className="text-sm mt-3">Week: <span className="font-semibold">{metrics.aaWeek}/{AA_WEEKLY}</span></p>
        </Card>
        <Card className="p-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Flags</p>
          <p className="text-3xl font-bold mt-2 text-destructive">{flags.open.length}<span className="text-base text-muted-foreground"> open</span></p>
          <p className="text-sm text-muted-foreground mt-1">Active issues</p>
          <p className="text-sm mt-3">{flags.closedCount} closed this week</p>
        </Card>
      </section>

      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Weekly Performance</h2>
          <div className={`flex items-center gap-1 text-sm font-medium ${trend >= 0 ? "text-emerald-600" : "text-destructive"}`}>
            {trend >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
            {trend >= 0 ? "+" : ""}{trend}% vs target
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "DM", val: metrics.dmPct },
            { label: "A&A", val: metrics.aaPct },
            { label: "Overall", val: metrics.overallPct },
          ].map((m) => (
            <div key={m.label}>
              <div className="flex justify-between text-sm mb-1">
                <span className="font-medium">{m.label}</span>
                <span className="text-muted-foreground">{m.val}%</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-primary" style={{ width: `${Math.min(100, m.val)}%` }} />
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-destructive" /> Open Flags
        </h2>
        {flags.open.length === 0 ? (
          <p className="text-sm text-muted-foreground">No open flags.</p>
        ) : (
          <div className="space-y-2">
            {flags.open.map((f) => (
              <div key={f.id} className="flex items-start justify-between gap-3 p-3 rounded-md border bg-card">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">#{f.jobNumber} <span className="text-muted-foreground font-normal">· {f.team}</span></p>
                  <p className="text-sm text-muted-foreground truncate">{f.issue}</p>
                </div>
                <Badge variant={f.severity === "Urgent" ? "destructive" : "secondary"}>{f.severity}</Badge>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-5">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <GraduationCap className="h-5 w-5 text-primary" /> Training Pipeline
        </h2>
        <div className="space-y-2">
          {training.map((t, i) => (
            <div key={i} className="flex items-center justify-between p-3 rounded-md border bg-card">
              <div>
                <p className="text-sm font-semibold">{t.team}</p>
                <p className="text-sm text-muted-foreground">{t.issue}</p>
              </div>
              <Badge variant="outline">{t.date}</Badge>
            </div>
          ))}
        </div>
      </Card>

      <div className="flex flex-wrap gap-3 pt-2">
        <Button onClick={() => navigate("/command?readonly=1")} variant="outline" className="gap-2">
          View Nav's Full Dashboard <ArrowRight className="h-4 w-4" />
        </Button>
        <Button onClick={exportPDF} className="gap-2">
          <FileDown className="h-4 w-4" /> Export Weekly Report
        </Button>
      </div>
    </div>
  );
}
