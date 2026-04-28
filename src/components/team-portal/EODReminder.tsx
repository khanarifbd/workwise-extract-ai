import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Bell, BellOff, Loader2, Send, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Job } from '@/types/job';

interface EODReminderProps {
  teamId: string;
  teamName: string;
  jobs: Job[];
  // whether we're after the cutoff time (18:00 GMT)
  enabled?: boolean;
  // when true, force-open the EOD submission dialog (deep-link from push)
  autoOpen?: boolean;
  // callback fired after the dialog is auto-opened so caller can clear the URL flag
  onAutoOpenHandled?: () => void;
}

// Plays a 2-tone alarm using Web Audio API (no asset required, works offline)
const playAlarm = () => {
  try {
    const ctx = new (window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const now = ctx.currentTime;
    [880, 660, 880, 660, 880].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + i * 0.45);
      gain.gain.exponentialRampToValueAtTime(0.35, now + i * 0.45 + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.45 + 0.4);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.45);
      osc.stop(now + i * 0.45 + 0.4);
    });
    setTimeout(() => ctx.close().catch(() => {}), 3000);
  } catch (e) {
    console.warn('Alarm playback failed', e);
  }
};

const todayStrGMT = () => new Date().toISOString().slice(0, 10);

export const EODReminder = ({ teamId, teamName, jobs, enabled = true }: EODReminderProps) => {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [showBanner, setShowBanner] = useState(false);
  const [dismissedToday, setDismissedToday] = useState(false);
  const alarmedRef = useRef(false);
  const [submitting, setSubmitting] = useState(false);

  // Per-job EOD state
  const [visited, setVisited] = useState<Record<string, boolean>>({});
  const [completed, setCompleted] = useState<Record<string, boolean>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [generalNotes, setGeneralNotes] = useState('');
  const [openReasonsSummary, setOpenReasonsSummary] = useState('');

  const dismissKey = `eod-dismissed-${teamId}-${todayStrGMT()}`;
  const submittedKey = `eod-submitted-${teamId}-${todayStrGMT()}`;

  // Check if already submitted (DB) and load dismissal
  useEffect(() => {
    if (!enabled || !teamId) return;
    if (localStorage.getItem(dismissedToday ? '__noop' : dismissKey) === '1') {
      setDismissedToday(true);
    }
    if (localStorage.getItem(submittedKey) === '1') {
      setSubmitted(true);
      return;
    }
    // Server-side check (authoritative)
    supabase
      .from('eod_reports')
      .select('id')
      .eq('team_id', teamId)
      .eq('report_date', todayStrGMT())
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setSubmitted(true);
          localStorage.setItem(submittedKey, '1');
        }
      });
  }, [teamId, enabled, dismissKey, submittedKey, dismissedToday]);

  // Show banner after cutoff time when enabled, not submitted, not dismissed
  useEffect(() => {
    if (!enabled) return setShowBanner(false);
    const update = () => {
      const nowUtc = new Date();
      const hourGmt = nowUtc.getUTCHours();
      const after6pm = hourGmt >= 18;
      const dismissed = localStorage.getItem(dismissKey) === '1';
      const sub = localStorage.getItem(submittedKey) === '1';
      const should = after6pm && !sub && !dismissed;
      setShowBanner(should);
      if (should && !alarmedRef.current) {
        alarmedRef.current = true;
        playAlarm();
      }
    };
    update();
    const i = setInterval(update, 30 * 1000);
    return () => clearInterval(i);
  }, [enabled, dismissKey, submittedKey, submitted]);

  // Filter jobs assigned today (or any active job - we present them all,
  // user ticks which were visited today)
  const activeJobs = useMemo(
    () =>
      jobs.filter(
        (j) =>
          j.status !== 'complete' &&
          !j.isCompleted,
      ),
    [jobs],
  );

  const completedJobsToday = useMemo(
    () => jobs.filter((j) => j.isCompleted || j.status === 'complete'),
    [jobs],
  );

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const visitedList = Object.entries(visited)
        .filter(([, v]) => v)
        .map(([id]) => {
          const j = jobs.find((x) => x.id === id);
          return j ? { jobId: j.id, jobNumber: j.jobNumber, address: j.address } : null;
        })
        .filter(Boolean);

      const completedList = Object.entries(completed)
        .filter(([, v]) => v)
        .map(([id]) => {
          const j = jobs.find((x) => x.id === id);
          return j ? { jobId: j.id, jobNumber: j.jobNumber, address: j.address } : null;
        })
        .filter(Boolean);

      const openList = visitedList
        .filter((v) => !completedList.some((c) => c!.jobId === v!.jobId))
        .map((v) => ({ ...v!, reason: reasons[v!.jobId] || '' }));

      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/submit-eod-report`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          teamId,
          teamName,
          submittedBy: teamName,
          jobsVisited: visitedList,
          jobsCompleted: completedList,
          jobsOpen: openList,
          openReasons: openReasonsSummary,
          generalNotes,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      localStorage.setItem(submittedKey, '1');
      setSubmitted(true);
      setShowBanner(false);
      setIsOpen(false);
      toast({
        title: '✅ EOD submitted',
        description: 'Your end-of-day report has been sent to the office.',
      });
    } catch (e) {
      toast({
        title: 'Failed to submit EOD',
        description: e instanceof Error ? e.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDismiss = () => {
    localStorage.setItem(dismissKey, '1');
    setShowBanner(false);
    setDismissedToday(true);
  };

  if (!enabled) return null;
  if (submitted && !isOpen) {
    return (
      <div className="px-3 py-2 bg-emerald-50 dark:bg-emerald-900/30 border-b border-emerald-300 text-emerald-800 dark:text-emerald-300 text-xs flex items-center gap-2">
        <BellOff className="h-3.5 w-3.5" />
        EOD report submitted for today. ✅
      </div>
    );
  }

  return (
    <>
      {showBanner && (
        <div
          className="relative animate-pulse bg-gradient-to-r from-red-600 via-red-700 to-red-600 text-white px-4 py-4 border-y-4 border-yellow-400 shadow-2xl z-30"
          role="alert"
          aria-live="assertive"
        >
          <div className="flex items-center gap-3">
            <div className="bg-yellow-400 text-red-900 rounded-full p-2 shrink-0 animate-bounce">
              <Bell className="h-6 w-6" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-lg sm:text-xl font-black uppercase leading-tight tracking-wide">
                END OF DAY REPORT REQUIRED
              </p>
              <p className="text-sm font-semibold opacity-95 mt-0.5">
                Submit jobs visited, completed &amp; reasons for any still open.
              </p>
            </div>
            <Button
              type="button"
              size="lg"
              className="bg-yellow-400 hover:bg-yellow-300 text-red-900 font-black text-base shadow-lg shrink-0"
              onClick={() => setIsOpen(true)}
            >
              SUBMIT EOD
            </Button>
            <button
              type="button"
              onClick={handleDismiss}
              className="ml-1 p-2 rounded-full bg-white/15 hover:bg-white/25 shrink-0"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <Bell className="h-5 w-5 text-red-600" />
              End of Day Report — {teamName}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            <p className="text-xs text-muted-foreground">
              Tick the jobs you visited today. Mark any that you completed. For jobs left
              open, write the reason it is still open.
            </p>

            {/* Active jobs */}
            {activeJobs.length > 0 && (
              <div>
                <h4 className="text-sm font-bold mb-2 text-foreground">
                  Open Jobs ({activeJobs.length})
                </h4>
                <div className="space-y-2 max-h-64 overflow-y-auto border rounded-lg p-2">
                  {activeJobs.map((j) => {
                    const wasVisited = !!visited[j.id];
                    const wasCompleted = !!completed[j.id];
                    return (
                      <div key={j.id} className="border-b last:border-b-0 pb-2 last:pb-0">
                        <div className="flex items-start gap-2">
                          <Checkbox
                            checked={wasVisited}
                            onCheckedChange={(v) => {
                              setVisited((s) => ({ ...s, [j.id]: !!v }));
                              if (!v) setCompleted((s) => ({ ...s, [j.id]: false }));
                            }}
                            className="mt-1"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold truncate">
                              #{j.jobNumber} — {j.name}
                            </p>
                            <p className="text-[11px] text-muted-foreground truncate">
                              {j.address}
                            </p>
                            {wasVisited && (
                              <div className="mt-1 space-y-1">
                                <label className="flex items-center gap-1.5 text-[11px]">
                                  <Checkbox
                                    checked={wasCompleted}
                                    onCheckedChange={(v) =>
                                      setCompleted((s) => ({ ...s, [j.id]: !!v }))
                                    }
                                  />
                                  Completed today
                                </label>
                                {!wasCompleted && (
                                  <Textarea
                                    placeholder="Why is this job still open? (e.g., awaiting materials, tenant unavailable...)"
                                    value={reasons[j.id] || ''}
                                    onChange={(e) =>
                                      setReasons((s) => ({ ...s, [j.id]: e.target.value }))
                                    }
                                    className="text-xs min-h-[50px]"
                                  />
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {completedJobsToday.length > 0 && (
              <div>
                <h4 className="text-sm font-bold mb-2 text-emerald-700">
                  Already Completed ({completedJobsToday.length})
                </h4>
                <div className="space-y-1 text-[11px] max-h-32 overflow-y-auto border rounded-lg p-2 bg-emerald-50/50 dark:bg-emerald-900/10">
                  {completedJobsToday.map((j) => (
                    <div key={j.id} className="flex items-center gap-2">
                      <Checkbox
                        checked={visited[j.id] !== false}
                        onCheckedChange={(v) => {
                          setVisited((s) => ({ ...s, [j.id]: !!v }));
                          setCompleted((s) => ({ ...s, [j.id]: !!v }));
                        }}
                        defaultChecked
                      />
                      <span className="truncate">
                        #{j.jobNumber} — {j.address}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="text-xs font-semibold mb-1 block">
                Overall reasons summary (optional)
              </label>
              <Textarea
                placeholder="Summary of why open jobs remain open..."
                value={openReasonsSummary}
                onChange={(e) => setOpenReasonsSummary(e.target.value)}
                className="text-sm min-h-[60px]"
              />
            </div>

            <div>
              <label className="text-xs font-semibold mb-1 block">
                Other notes (optional)
              </label>
              <Textarea
                placeholder="Anything else the office should know..."
                value={generalNotes}
                onChange={(e) => setGeneralNotes(e.target.value)}
                className="text-sm min-h-[50px]"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => setIsOpen(false)}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={submitting}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold"
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : (
                  <Send className="h-4 w-4 mr-1" />
                )}
                Submit EOD
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
