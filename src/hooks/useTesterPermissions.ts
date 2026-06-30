import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type SectionKey =
  | 'genie'
  | 'command'
  | 'command-dm'
  | 'command-aa'
  | 'command-log'
  | 'command-reports'
  | 'command-owners'
  | 'roadmaps'
  | 'auto-assign'
  | 'archive';

export const SECTION_LIST: { key: SectionKey; label: string; description: string }[] = [
  { key: 'genie', label: 'Genie (Jobs Dashboard)', description: 'Main jobs table, monthly folders, filters' },
  { key: 'command', label: 'Command Center Home', description: "Nav's Command Center landing page" },
  { key: 'command-dm', label: 'DM Tracker', description: 'Direct maintenance job tracker' },
  { key: 'command-aa', label: 'A&A Tracker', description: 'Aids & Adaptations job tracker' },
  { key: 'command-log', label: 'Live Monitoring Log', description: 'Flags, coaching, resolved events' },
  { key: 'command-reports', label: 'Reports & Analytics', description: 'Performance and metric reports' },
  { key: 'command-owners', label: 'Owners Dashboard', description: 'High-level owner overview' },
  { key: 'roadmaps', label: 'Roadmaps', description: 'Roadmap editor and viewer' },
  { key: 'auto-assign', label: 'Auto-Assign (AI)', description: 'AI-driven job assignment panel' },
  { key: 'archive', label: 'Team Archive', description: 'Archived team jobs view' },
];

type PermMap = Record<string, boolean>;

let cache: PermMap | null = null;
const listeners = new Set<(m: PermMap) => void>();

async function fetchPerms(): Promise<PermMap> {
  const { data, error } = await supabase
    .from('tester_section_permissions')
    .select('section_key, enabled');
  if (error) {
    console.error('tester perms fetch error', error);
    return {};
  }
  const map: PermMap = {};
  (data ?? []).forEach((r: any) => { map[r.section_key] = !!r.enabled; });
  cache = map;
  listeners.forEach((cb) => cb(map));
  return map;
}

export function useTesterPermissions() {
  const [perms, setPerms] = useState<PermMap>(cache ?? {});
  const [loading, setLoading] = useState(cache === null);

  useEffect(() => {
    listeners.add(setPerms);
    if (cache === null) {
      fetchPerms().finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
    const channel = supabase
      .channel('tester-perms')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tester_section_permissions' }, () => {
        fetchPerms();
      })
      .subscribe();
    return () => {
      listeners.delete(setPerms);
      supabase.removeChannel(channel);
    };
  }, []);

  const isEnabled = useCallback(
    (key: SectionKey) => (perms[key] !== undefined ? perms[key] : true),
    [perms],
  );

  const setEnabled = useCallback(async (key: SectionKey, enabled: boolean) => {
    const { data: userRes } = await supabase.auth.getUser();
    const userId = userRes?.user?.id ?? null;
    const { error } = await supabase
      .from('tester_section_permissions')
      .upsert(
        { section_key: key, enabled, updated_by: userId, updated_at: new Date().toISOString() },
        { onConflict: 'section_key' },
      );
    if (error) throw error;
    await fetchPerms();
  }, []);

  return { perms, isEnabled, setEnabled, loading, refresh: fetchPerms };
}
