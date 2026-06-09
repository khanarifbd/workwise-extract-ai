import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface Subcontractor {
  id: string;
  name: string;
  company: string | null;
  phone: string | null;
  email: string | null;
  trade: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type SubcontractorInput = Omit<Subcontractor, 'id' | 'created_at' | 'updated_at'>;

export const useSubcontractors = (opts?: { activeOnly?: boolean }) => {
  const [items, setItems] = useState<Subcontractor[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setIsLoading(true);
    let q = supabase.from('subcontractors').select('*').order('name', { ascending: true });
    if (opts?.activeOnly) q = q.eq('is_active', true);
    const { data, error } = await q;
    if (error) {
      console.error('[useSubcontractors] fetch error', error);
      toast.error('Failed to load sub-contractors');
    } else {
      setItems((data ?? []) as Subcontractor[]);
    }
    setIsLoading(false);
  }, [opts?.activeOnly]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const create = async (input: Partial<SubcontractorInput> & { name: string }) => {
    const payload = {
      name: input.name.trim(),
      company: input.company?.trim() || null,
      phone: input.phone?.trim() || null,
      email: input.email?.trim() || null,
      trade: input.trade?.trim() || null,
      notes: input.notes?.trim() || null,
      is_active: input.is_active ?? true,
    };
    const { data, error } = await supabase.from('subcontractors').insert(payload).select().single();
    if (error) {
      toast.error(`Failed to add: ${error.message}`);
      return null;
    }
    toast.success(`Added ${data.name}`);
    await fetchAll();
    return data as Subcontractor;
  };

  const update = async (id: string, patch: Partial<SubcontractorInput>) => {
    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(patch)) {
      if (typeof v === 'string') clean[k] = v.trim() || null;
      else clean[k] = v;
    }
    const { error } = await supabase.from('subcontractors').update(clean).eq('id', id);
    if (error) {
      toast.error(`Failed to update: ${error.message}`);
      return false;
    }
    toast.success('Updated');
    await fetchAll();
    return true;
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from('subcontractors').delete().eq('id', id);
    if (error) {
      // likely FK violation (in use). Fall back to soft-deactivate.
      const { error: e2 } = await supabase.from('subcontractors').update({ is_active: false }).eq('id', id);
      if (e2) { toast.error(`Failed: ${error.message}`); return false; }
      toast.success('Sub-contractor is in use — deactivated instead of deleted');
    } else {
      toast.success('Deleted');
    }
    await fetchAll();
    return true;
  };

  const toggleActive = async (id: string, isActive: boolean) => update(id, { is_active: isActive });

  return { items, isLoading, refresh: fetchAll, create, update, remove, toggleActive };
};
