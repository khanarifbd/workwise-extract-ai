/**
 * useCommandEvents — backend-backed store for Command Center events
 * (flags, notes, calls, training, patterns, sign-offs, schedule entries).
 *
 * Replaces the previous localStorage approach. Realtime updates flow in
 * via Supabase subscriptions so every admin sees the same log.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type CommandEventKind =
  | 'flag' | 'note' | 'call' | 'training' | 'pattern' | 'signoff' | 'schedule';
export type CommandEventSeverity = 'urgent' | 'warning' | 'note';
export type CommandEventCategory = 'dm' | 'aa' | 'other';

export interface CommandEvent {
  id: string;
  job_id: string | null;
  job_number: string | null;
  team: string | null;
  kind: CommandEventKind;
  severity: CommandEventSeverity;
  category: CommandEventCategory;
  title: string | null;
  body: string | null;
  metadata: Record<string, any>;
  resolved_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CommandEventInput {
  job_id?: string | null;
  job_number?: string | null;
  team?: string | null;
  kind: CommandEventKind;
  severity?: CommandEventSeverity;
  category?: CommandEventCategory;
  title?: string | null;
  body?: string | null;
  metadata?: Record<string, any>;
}

interface Filter {
  kinds?: CommandEventKind[];
  category?: CommandEventCategory;
  includeResolved?: boolean;
}

export function useCommandEvents(filter: Filter = {}) {
  const [events, setEvents] = useState<CommandEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    let q = supabase
      .from('command_events' as any)
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1000);
    if (filter.kinds?.length) q = q.in('kind', filter.kinds as any);
    if (filter.category) q = q.eq('category', filter.category);
    if (!filter.includeResolved) q = q.is('resolved_at', null);
    const { data, error } = await q;
    if (!error && data) setEvents(data as any as CommandEvent[]);
    setLoading(false);
  }, [filter.kinds?.join(','), filter.category, filter.includeResolved]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    const channel = supabase
      .channel(`command_events_changes_${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'command_events' },
        () => { refresh(); },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [refresh]);

  const add = useCallback(async (input: CommandEventInput) => {
    const { data: userData } = await supabase.auth.getUser();
    const payload = {
      severity: 'note' as CommandEventSeverity,
      category: 'other' as CommandEventCategory,
      metadata: {},
      ...input,
      created_by: userData?.user?.id ?? null,
    };
    const { data, error } = await supabase
      .from('command_events' as any)
      .insert(payload as any)
      .select()
      .single();
    if (error) throw error;
    return data as any as CommandEvent;
  }, []);

  const resolve = useCallback(async (id: string) => {
    const { error } = await supabase
      .from('command_events' as any)
      .update({ resolved_at: new Date().toISOString() } as any)
      .eq('id', id);
    if (error) throw error;
  }, []);

  const remove = useCallback(async (id: string) => {
    const { error } = await supabase
      .from('command_events' as any)
      .delete()
      .eq('id', id);
    if (error) throw error;
  }, []);

  const byKind = useMemo(() => {
    const map: Record<string, CommandEvent[]> = {};
    for (const e of events) (map[e.kind] ||= []).push(e);
    return map;
  }, [events]);

  return { events, byKind, loading, refresh, add, resolve, remove };
}
