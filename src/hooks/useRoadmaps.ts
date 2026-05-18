import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface Roadmap {
  id: string;
  name: string;
  category_id: string | null;
  job_id: string | null;
  start_date: string;   // YYYY-MM-DD
  end_date: string;     // YYYY-MM-DD
  time_unit: 'week' | 'day';
  notes: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface RoadmapItem {
  id: string;
  roadmap_id: string;
  label: string;
  start_date: string;
  end_date: string;
  color: string;
  symbol: string | null;
  sort_order: number;
  notes: string;
  progress: number;
  assigned_team: string | null;
  is_milestone: boolean;
  depends_on: string | null;
  notify_on_start: boolean;
  notify_on_end: boolean;
  notify_lead_minutes: number;
  last_notified_at: string | null;
  parent_id: string | null;
  collapsed: boolean;
  created_at?: string;
}

export const useRoadmaps = () => {
  const [roadmaps, setRoadmaps] = useState<Roadmap[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetch = useCallback(async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('roadmaps')
      .select('*')
      .order('created_at', { ascending: false });
    if (!error) setRoadmaps((data || []) as Roadmap[]);
    setIsLoading(false);
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const create = async (payload: Partial<Roadmap>) => {
    const { data, error } = await supabase
      .from('roadmaps')
      .insert(payload as any)
      .select()
      .single();
    if (error) throw error;
    await fetch();
    return data as Roadmap;
  };

  const update = async (id: string, patch: Partial<Roadmap>) => {
    const { error } = await supabase.from('roadmaps').update(patch).eq('id', id);
    if (error) throw error;
    await fetch();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from('roadmaps').delete().eq('id', id);
    if (error) throw error;
    await fetch();
  };

  return { roadmaps, isLoading, refresh: fetch, create, update, remove };
};

export const useRoadmapItems = (roadmapId: string | undefined) => {
  const [items, setItems] = useState<RoadmapItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!roadmapId) { setItems([]); setIsLoading(false); return; }
    setIsLoading(true);
    const { data, error } = await supabase
      .from('roadmap_items')
      .select('*')
      .eq('roadmap_id', roadmapId)
      .order('sort_order', { ascending: true })
      .order('start_date', { ascending: true });
    if (!error) setItems((data || []) as RoadmapItem[]);
    setIsLoading(false);
  }, [roadmapId]);

  useEffect(() => { fetch(); }, [fetch]);

  useEffect(() => {
    if (!roadmapId) return;
    const ch = supabase
      .channel(`roadmap-items-${roadmapId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'roadmap_items', filter: `roadmap_id=eq.${roadmapId}` }, () => fetch())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [roadmapId, fetch]);

  const create = async (payload: Partial<RoadmapItem>) => {
    const { error } = await supabase.from('roadmap_items').insert({ ...payload, roadmap_id: roadmapId } as any);
    if (error) throw error;
    await fetch();
  };

  const update = async (id: string, patch: Partial<RoadmapItem>) => {
    const { error } = await supabase.from('roadmap_items').update(patch).eq('id', id);
    if (error) throw error;
    await fetch();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from('roadmap_items').delete().eq('id', id);
    if (error) throw error;
    await fetch();
  };

  return { items, isLoading, refresh: fetch, create, update, remove };
};
