import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft, AlertTriangle, Clock, CheckCircle2, Flag,
  StickyNote, Eye, ShieldCheck, Package, Camera, FileText,
  PenSquare, Plus, Filter, Download, Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface InProgressJob {
  id: string;
  jobNumber: string;
  team: string;
  address: string;
  elapsed: string;
  jobType: string;
  materialsOK: boolean;
}

interface CompletedJob {
  id: string;
  jobNumber: string;
  team: string;
  duration: string;
  signOffTime: string;
  photosOK: boolean;
  descriptionOK: boolean;
  signed: boolean;
}

const IN_PROGRESS: InProgressJob[] = [
  { id: "p1", jobNumber: "N2640155", team: "Carpenter Crew", address: "12 High St, SE5",   elapsed: "1h 50m", jobType: "Fire door install (3 doors) + closer adjustments",   materialsOK: true  },
  { id: "p2", jobNumber: "N2640190", team: "Carpenter Crew", address: "33 Vale Rd, SE22",  elapsed: "0h 35m", jobType: "Grab rails to bathroom & WC, lever taps",            materialsOK: false },
  { id: "p3", jobNumber: "N2640205", team: "Flooring Co",    address: "14 Lime Ave, SE15", elapsed: "2h 20m", jobType: "Non-slip vinyl to kitchen & hallway",                 materialsOK: true  },
];

const COMPLETED: CompletedJob[] = [
  { id: "c1", jobNumber: "N2640161", team: "Roofing Pro",     duration: "2h 40m", signOffTime: "10:55", photosOK: true,  descriptionOK: true,  signed: true  },
  { id: "c2", jobNumber: "N2640173", team: "Carpenter Crew",  duration: "1h 30m", signOffTime: "11:20", photosOK: true,  descriptionOK: false, signed: true  },
  { id: "c3", jobNumber: "N2640181", team: "Flooring Co",     duration: "3h 05m", signOffTime: "12:48", photosOK: true,  descriptionOK: true,  signed: true  },
];

const Tick = ({ ok }: { ok: boolean }) => ok ? (
  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
) : (
  <AlertTriangle className="h-4 w-4 text-amber-500" />
);

const toneMap = {
  blue:    "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30",
  emerald: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  amber:   "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30",
  red:     "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/30",
} as const;

const SummaryPill = ({ label, value, tone }: { label: string; value: string; tone: keyof typeof toneMap }) => (
  <div className={cn("rounded-xl border px-3 py-2 text-center", toneMap[tone])}>
    <div className="text-[10px] uppercase tracking-wide font-medium opacity-80">{label}</div>
    <div className="text-xl font-bold tabular-nums leading-tight">{value}</div>
  </div>
);

const SectionHeader = ({
  title, count, icon: Icon, accent,
}: { title: string; count: number; icon: typeof Flag; accent: string }) => (
  <header className="flex items-center justify-between px-5 py-3 border-b">
    <div className="flex items-center gap-2.5">
      <span className={cn("rounded-lg p-1.5", accent)}>
        <Icon className="h-4 w-4 text-white" />
      </span>
      <h2 className="text-base sm:text-lg font-semibold">{title}</h2>
    </div>
    <Badge variant="outline" className="tabular-nums">{count}</Badge>
  </header>
);

const Stat = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="rounded-md border bg-muted/30 px-2 py-1.5 text-center">
    <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
    <div className="font-semibold flex items-center justify-center mt-0.5">{value}</div>
  </div>
);

const AAJobTracker = () => {
  const navigate = useNavigate();
  const [log, setLog] = useState<string | null>(null);
  const fire = (msg: string) => { setLog(msg); console.log(`[AA-Tracker] ${msg}`); setTimeout(() => setLog(null), 1500); };

  const flagged = 0;
  const stats = useMemo(() => ({
    target: 6,
    completed: COMPLETED.length,
    inProgress: IN_PROGRESS.length,
    flagged,
  }), []);

  const today = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-background to-slate-100 dark:from-slate-950 dark:via-background dark:to-slate-900 pb-24">
      <div className="mx-auto max-w-[1400px] p-4 sm:p-6 lg:p-8 space-y-5">

        {/* Header */}
        <div className="rounded-2xl border bg-card p-4 sm:p-5 shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            <div className="flex items-start sm:items-center gap-3">
              <Button variant="outline" size="icon" onClick={() => navigate(-1)} aria-label="Back">
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Genie · Adaption &amp; Assistance</p>
                <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight">A&amp;A Job Tracker</h1>
                <p className="text-sm text-muted-foreground">{today}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 lg:gap-3">
              <SummaryPill label="Target/day" value={`${stats.target}`} tone="blue" />
              <SummaryPill label="Completed" value={`${stats.completed}`} tone="emerald" />
              <SummaryPill label="In Progress" value={`${stats.inProgress}`} tone="amber" />
              <SummaryPill label="Flagged" value={`${stats.flagged}`} tone="red" />
            </div>
          </div>
        </div>

        {/* In progress */}
        <section className="rounded-2xl border bg-card shadow-sm overflow-hidden">
          <SectionHeader title="In Progress" count={IN_PROGRESS.length} icon={Wrench} accent="bg-amber-500" />

          {/* Desktop / landscape table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="text-left px-5 py-2.5 font-medium">Job</th>
                  <th className="text-left px-5 py-2.5 font-medium">Team / Address</th>
                  <th className="text-left px-5 py-2.5 font-medium">Elapsed</th>
                  <th className="text-left px-5 py-2.5 font-medium">Job Type (A&amp;A)</th>
                  <th className="text-center px-5 py-2.5 font-medium">Materials</th>
                  <th className="text-right px-5 py-2.5 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {IN_PROGRESS.map((j) => (
                  <tr key={j.id} className="border-t hover:bg-muted/30">
                    <td className="px-5 py-3 font-semibold tabular-nums">{j.jobNumber}</td>
                    <td className="px-5 py-3">
                      <div className="font-medium">{j.team}</div>
                      <div className="text-xs text-muted-foreground">{j.address}</div>
                    </td>
                    <td className="px-5 py-3 tabular-nums">{j.elapsed}</td>
                    <td className="px-5 py-3 text-muted-foreground max-w-[280px]">{j.jobType}</td>
                    <td className="px-5 py-3 text-center"><Tick ok={j.materialsOK} /></td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-1.5">
                        <Button size="sm" variant="outline" onClick={() => fire(`View ${j.jobNumber}`)}><Eye className="h-3.5 w-3.5 mr-1" />Details</Button>
                        <Button size="sm" variant="outline" onClick={() => fire(`Note ${j.jobNumber}`)}><StickyNote className="h-3.5 w-3.5 mr-1" />Note</Button>
                        <Button size="sm" variant="outline" onClick={() => fire(`Flag ${j.jobNumber}`)}><Flag className="h-3.5 w-3.5 mr-1" />Flag</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <ul className="md:hidden divide-y">
            {IN_PROGRESS.map((j) => (
              <li key={j.id} className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold tabular-nums">{j.jobNumber}</div>
                    <div className="text-xs text-muted-foreground">{j.team} · {j.address}</div>
                  </div>
                  <Badge variant="outline" className="bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300">A&amp;A</Badge>
                </div>
                <p className="text-xs text-muted-foreground">{j.jobType}</p>
                <div className="grid grid-cols-2 gap-1 text-xs">
                  <Stat label="Elapsed" value={j.elapsed} />
                  <Stat label="Materials" value={<Tick ok={j.materialsOK} />} />
                </div>
                <div className="flex gap-1.5">
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => fire(`View ${j.jobNumber}`)}><Eye className="h-3.5 w-3.5 mr-1" />Details</Button>
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => fire(`Note ${j.jobNumber}`)}><StickyNote className="h-3.5 w-3.5 mr-1" />Note</Button>
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => fire(`Flag ${j.jobNumber}`)}><Flag className="h-3.5 w-3.5 mr-1" />Flag</Button>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* Completed today */}
        <section className="rounded-2xl border bg-card shadow-sm overflow-hidden">
          <SectionHeader title="Completed Today" count={COMPLETED.length} icon={CheckCircle2} accent="bg-emerald-500" />
          <ul className="divide-y">
            {COMPLETED.map((c) => (
              <li key={c.id} className="px-5 py-3 flex flex-col md:flex-row md:items-center gap-3">
                <div className="flex-1 min-w-0 flex flex-wrap items-center gap-2">
                  <span className="font-semibold tabular-nums">{c.jobNumber}</span>
                  <Badge variant="outline">{c.team}</Badge>
                  <span className="text-xs text-muted-foreground">Duration {c.duration}</span>
                  <span className="text-xs text-muted-foreground">· Signed off {c.signOffTime}</span>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className="inline-flex items-center gap-1"><Camera className="h-3.5 w-3.5 text-muted-foreground" /><Tick ok={c.photosOK} /> Photos</span>
                  <span className="inline-flex items-center gap-1"><FileText className="h-3.5 w-3.5 text-muted-foreground" /><Tick ok={c.descriptionOK} /> Desc</span>
                  <span className="inline-flex items-center gap-1"><PenSquare className="h-3.5 w-3.5 text-muted-foreground" /><Tick ok={c.signed} /> Signed</span>
                </div>
                <Button size="sm" variant="outline" onClick={() => fire(`Sign-off ${c.jobNumber}`)}>
                  <ShieldCheck className="h-3.5 w-3.5 mr-1" />View Sign-off
                </Button>
              </li>
            ))}
          </ul>
        </section>

        {log && (
          <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 rounded-full bg-foreground text-background text-xs font-medium px-4 py-2 shadow-lg">
            {log}
          </div>
        )}
      </div>

      {/* Bottom bar */}
      <div className="fixed bottom-0 inset-x-0 border-t bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/75 z-40">
        <div className="mx-auto max-w-[1400px] px-4 py-3 flex items-center justify-between gap-2">
          <Link to="/command" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
            <ArrowLeft className="h-3.5 w-3.5" /> Command
          </Link>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => fire("Filter")}><Filter className="h-4 w-4 mr-1.5" />Filter</Button>
            <Button variant="outline" size="sm" onClick={() => fire("Export")}><Download className="h-4 w-4 mr-1.5" />Export</Button>
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => fire("Add Job")}>
              <Plus className="h-4 w-4 mr-1.5" />Add Job
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AAJobTracker;
