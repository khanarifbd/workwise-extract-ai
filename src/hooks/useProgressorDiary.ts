import { useEffect, useCallback, useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface DiaryEntry {
  id: string;
  jobId: string | null;
  title: string;
  notes: string;
  scheduledAt: string;          // ISO
  notifyAt: string | null;      // ISO
  notifyEnabled: boolean;
  notified: boolean;
  isDone: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

const mapRow = (r: any): DiaryEntry => ({
  id: r.id,
  jobId: r.job_id,
  title: r.title,
  notes: r.notes || '',
  scheduledAt: r.scheduled_at,
  notifyAt: r.notify_at,
  notifyEnabled: !!r.notify_enabled,
  notified: !!r.notified,
  isDone: !!r.is_done,
  createdBy: r.created_by,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export interface NewDiaryInput {
  jobId?: string | null;
  title: string;
  notes?: string;
  scheduledAt: string;       // ISO
  notifyAt?: string | null;  // ISO
  notifyEnabled?: boolean;
  createdBy?: string | null;
}

export const useProgressorDiary = () => {
  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const firedRef = useRef<Set<string>>(new Set());

  const load = useCallback(async (background = false) => {
    if (!background) setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('progressor_diary_entries')
        .select('*')
        .order('scheduled_at', { ascending: true })
        .limit(2000);
      if (error) throw error;
      setEntries((data || []).map(mapRow));
    } catch (e) {
      console.error('useProgressorDiary load', e);
    } finally {
      if (!background) setIsLoading(false);
    }
  }, []);

  useEffect(() => { load(false); }, [load]);

  // realtime
  useEffect(() => {
    const ch = supabase
      .channel('progressor-diary')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'progressor_diary_entries' }, () => load(true))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  // alarm poller — every 30s scan for due notifications
  useEffect(() => {
    const tick = async () => {
      const now = Date.now();
      const due = entries.filter(e =>
        e.notifyEnabled && !e.notified && !e.isDone && e.notifyAt &&
        new Date(e.notifyAt).getTime() <= now &&
        !firedRef.current.has(e.id),
      );
      for (const e of due) {
        firedRef.current.add(e.id);
        // browser notification (best-effort)
        try {
          if (typeof Notification !== 'undefined') {
            if (Notification.permission === 'default') {
              await Notification.requestPermission().catch(() => {});
            }
            if (Notification.permission === 'granted') {
              new Notification('Progressor reminder', {
                body: e.title + (e.notes ? `\n${e.notes}` : ''),
                tag: e.id,
              });
            }
          }
        } catch {}
        // sound ping
        try {
          const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain); gain.connect(ctx.destination);
          osc.frequency.value = 880; gain.gain.value = 0.08;
          osc.start();
          setTimeout(() => { osc.stop(); ctx.close(); }, 350);
        } catch {}
        // mark as fired in DB
        await supabase.from('progressor_diary_entries').update({ notified: true }).eq('id', e.id);
      }
    };
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, [entries]);

  const create = useCallback(async (input: NewDiaryInput) => {
    const { data, error } = await supabase.from('progressor_diary_entries').insert({
      job_id: input.jobId ?? null,
      title: input.title,
      notes: input.notes ?? '',
      scheduled_at: input.scheduledAt,
      notify_at: input.notifyAt ?? null,
      notify_enabled: !!input.notifyEnabled,
      created_by: input.createdBy ?? null,
    }).select('*').single();
    if (error) throw error;
    setEntries(prev => [...prev, mapRow(data)].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)));
    return mapRow(data);
  }, []);

  const update = useCallback(async (id: string, patch: Partial<DiaryEntry>) => {
    const dbPatch: any = {};
    if (patch.title !== undefined) dbPatch.title = patch.title;
    if (patch.notes !== undefined) dbPatch.notes = patch.notes;
    if (patch.scheduledAt !== undefined) dbPatch.scheduled_at = patch.scheduledAt;
    if (patch.notifyAt !== undefined) dbPatch.notify_at = patch.notifyAt;
    if (patch.notifyEnabled !== undefined) dbPatch.notify_enabled = patch.notifyEnabled;
    if (patch.notified !== undefined) dbPatch.notified = patch.notified;
    if (patch.isDone !== undefined) dbPatch.is_done = patch.isDone;
    const { error } = await supabase.from('progressor_diary_entries').update(dbPatch).eq('id', id);
    if (error) throw error;
    setEntries(prev => prev.map(e => e.id === id ? { ...e, ...patch } : e));
  }, []);

  const remove = useCallback(async (id: string) => {
    const { error } = await supabase.from('progressor_diary_entries').delete().eq('id', id);
    if (error) throw error;
    setEntries(prev => prev.filter(e => e.id !== id));
  }, []);

  const toggleDone = useCallback((id: string, isDone: boolean) => update(id, { isDone }), [update]);

  return { entries, isLoading, refresh: () => load(true), create, update, remove, toggleDone };
};
