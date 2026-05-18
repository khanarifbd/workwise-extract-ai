import { useEffect, useRef } from 'react';
import { RoadmapItem } from '@/hooks/useRoadmaps';
import { parseLocalDate, toISODate } from '@/lib/roadmapUtils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

/**
 * Polls roadmap items every 30s, plays a two-tone alert and shows a browser
 * notification whenever a task crosses its start or end (with optional
 * lead-time). Stamps `last_notified_at` so the same milestone never fires
 * twice from the same browser session.
 */
export const useRoadmapAlerts = (items: RoadmapItem[]) => {
  const audioCtxRef = useRef<AudioContext | null>(null);

  const ensureCtx = () => {
    if (!audioCtxRef.current) {
      try { audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)(); }
      catch { /* no audio */ }
    }
    return audioCtxRef.current;
  };

  const playChime = () => {
    const ctx = ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    [880, 660].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.0001, now + i * 0.45);
      gain.gain.exponentialRampToValueAtTime(0.25, now + i * 0.45 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.45 + 0.4);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + i * 0.45);
      osc.stop(now + i * 0.45 + 0.45);
    });
  };

  const notify = (title: string, body: string) => {
    playChime();
    toast(title, { description: body, duration: 8000 });
    if ('Notification' in window && Notification.permission === 'granted') {
      try { new Notification(title, { body, icon: '/placeholder.svg' }); } catch { /* ignore */ }
    }
  };

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (!items.length) return;
    let cancelled = false;

    const check = async () => {
      const now = new Date();
      const today = toISODate(now);
      for (const it of items) {
        if (!it.notify_on_start && !it.notify_on_end) continue;
        const lastKey = `roadmap-alert-${it.id}`;
        const lastFired = sessionStorage.getItem(lastKey) || it.last_notified_at || '';

        const startDate = parseLocalDate(it.start_date);
        const endDate = parseLocalDate(it.end_date);
        const lead = (it.notify_lead_minutes || 0) * 60_000;
        const startThreshold = new Date(startDate.getTime() - lead);

        if (it.notify_on_start && now >= startThreshold && today >= it.start_date) {
          const key = `start-${it.start_date}`;
          if (!lastFired.includes(key)) {
            notify(`Starting: ${it.label}`, it.notes || `Scheduled to begin ${it.start_date}`);
            sessionStorage.setItem(lastKey, `${lastFired}|${key}`);
            if (!cancelled) {
              await supabase.from('roadmap_items').update({ last_notified_at: new Date().toISOString() }).eq('id', it.id);
            }
          }
        }
        if (it.notify_on_end && today >= it.end_date) {
          const key = `end-${it.end_date}`;
          if (!lastFired.includes(key)) {
            notify(`Ending: ${it.label}`, it.notes || `Scheduled to finish ${it.end_date}`);
            sessionStorage.setItem(lastKey, `${lastFired}|${key}`);
            if (!cancelled) {
              await supabase.from('roadmap_items').update({ last_notified_at: new Date().toISOString() }).eq('id', it.id);
            }
          }
        }
      }
    };

    check();
    const t = setInterval(check, 30_000);
    return () => { cancelled = true; clearInterval(t); };
  }, [items]);
};
