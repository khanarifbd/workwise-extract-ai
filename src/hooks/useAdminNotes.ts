import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface AdminNote {
  id: string;
  admin_name: string;
  job_id: string | null;
  note_text: string;
  alert_date: string | null;
  alert_dismissed: boolean;
  category: string;
  created_at: string;
  updated_at: string;
}

export const useAdminNotes = (adminName: string) => {
  const [notes, setNotes] = useState<AdminNote[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchNotes = useCallback(async () => {
    if (!adminName) return;
    const { data, error } = await supabase
      .from('admin_personal_notes')
      .select('*')
      .eq('admin_name', adminName)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setNotes(data as AdminNote[]);
    }
    setLoading(false);
  }, [adminName]);

  useEffect(() => {
    fetchNotes();

    const channel = supabase
      .channel(`admin-notes-${adminName}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'admin_personal_notes',
      }, () => fetchNotes())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchNotes, adminName]);

  const addNote = async (params: {
    jobId?: string | null;
    noteText: string;
    alertDate?: Date | null;
  }) => {
    const { error } = await supabase.from('admin_personal_notes').insert({
      admin_name: adminName,
      job_id: params.jobId || null,
      note_text: params.noteText,
      alert_date: params.alertDate?.toISOString() || null,
      category: params.jobId ? 'job' : 'general',
    } as any);

    if (error) {
      toast({ title: 'Error saving note', description: error.message, variant: 'destructive' });
      return false;
    }
    await fetchNotes();
    return true;
  };

  const updateNote = async (id: string, updates: Partial<Pick<AdminNote, 'note_text' | 'alert_date' | 'alert_dismissed'>>) => {
    const { error } = await supabase
      .from('admin_personal_notes')
      .update(updates as any)
      .eq('id', id);

    if (!error) await fetchNotes();
  };

  const deleteNote = async (id: string) => {
    const { error } = await supabase
      .from('admin_personal_notes')
      .delete()
      .eq('id', id);

    if (!error) await fetchNotes();
  };

  const dismissAlert = async (id: string) => {
    await updateNote(id, { alert_dismissed: true });
  };

  const activeAlerts = notes.filter(
    n => n.alert_date && !n.alert_dismissed && new Date(n.alert_date) <= new Date()
  );

  return { notes, loading, addNote, updateNote, deleteNote, dismissAlert, activeAlerts, fetchNotes };
};
