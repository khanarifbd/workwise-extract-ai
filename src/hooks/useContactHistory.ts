import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ContactHistory, ContactOutcome } from '@/types/contactHistory';
import { useToast } from '@/hooks/use-toast';

export function useContactHistory(jobId?: string) {
  const [history, setHistory] = useState<ContactHistory[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const loadHistory = useCallback(async () => {
    if (!jobId) return;
    
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('contact_history')
        .select('*')
        .eq('job_id', jobId)
        .order('contact_date', { ascending: false });

      if (error) throw error;

      const mapped: ContactHistory[] = (data || []).map((row: any) => ({
        id: row.id,
        jobId: row.job_id,
        contactDate: new Date(row.contact_date),
        outcome: row.outcome as ContactOutcome,
        notes: row.notes,
        nextAction: row.next_action,
        nextActionDate: row.next_action_date ? new Date(row.next_action_date) : null,
        createdBy: row.created_by,
        createdAt: new Date(row.created_at),
      }));

      setHistory(mapped);
    } catch (error) {
      console.error('Failed to load contact history:', error);
    } finally {
      setIsLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // Subscribe to realtime updates
  useEffect(() => {
    if (!jobId) return;

    const channel = supabase
      .channel(`contact_history_${jobId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'contact_history',
          filter: `job_id=eq.${jobId}`,
        },
        () => {
          loadHistory();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [jobId, loadHistory]);

  const addContactAttempt = async (
    outcome: ContactOutcome,
    notes?: string,
    nextAction?: string,
    nextActionDate?: Date
  ) => {
    if (!jobId) return;

    try {
      const { error } = await supabase.from('contact_history').insert({
        job_id: jobId,
        outcome,
        notes: notes || null,
        next_action: nextAction || null,
        next_action_date: nextActionDate?.toISOString() || null,
      });

      if (error) throw error;

      toast({
        title: 'Contact Logged',
        description: 'Contact attempt has been recorded.',
      });

      await loadHistory();
    } catch (error) {
      console.error('Failed to add contact attempt:', error);
      toast({
        title: 'Error',
        description: 'Failed to log contact attempt.',
        variant: 'destructive',
      });
    }
  };

  const deleteContactAttempt = async (historyId: string) => {
    try {
      const { error } = await supabase
        .from('contact_history')
        .delete()
        .eq('id', historyId);

      if (error) throw error;

      toast({
        title: 'Deleted',
        description: 'Contact record removed.',
      });

      await loadHistory();
    } catch (error) {
      console.error('Failed to delete contact attempt:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete contact record.',
        variant: 'destructive',
      });
    }
  };

  return {
    history,
    isLoading,
    addContactAttempt,
    deleteContactAttempt,
    refreshHistory: loadHistory,
  };
}

// Hook to get all contact history for multiple jobs
export function useAllContactHistory(jobIds: string[]) {
  const [historyMap, setHistoryMap] = useState<Record<string, ContactHistory[]>>({});
  const [isLoading, setIsLoading] = useState(false);

  // Use a stable hash instead of joining all IDs (which can be absurdly long)
  const jobIdCount = jobIds.length;
  const jobIdHash = jobIds.length > 0 
    ? `${jobIds.length}_${jobIds[0]?.slice(0, 8)}_${jobIds[jobIds.length - 1]?.slice(0, 8)}`
    : 'empty';

  const loadAllHistory = useCallback(async () => {
    if (!jobIds.length) {
      setHistoryMap({});
      return;
    }

    setIsLoading(true);
    try {
      // Batch in chunks of 50 to avoid oversized IN queries
      const chunkSize = 50;
      const allData: any[] = [];
      
      for (let i = 0; i < jobIds.length; i += chunkSize) {
        const chunk = jobIds.slice(i, i + chunkSize);
        const { data, error } = await supabase
          .from('contact_history')
          .select('*')
          .in('job_id', chunk)
          .order('contact_date', { ascending: false });

        if (error) throw error;
        if (data) allData.push(...data);
      }

      const mapped: Record<string, ContactHistory[]> = {};

      allData.forEach((row: any) => {
        const entry: ContactHistory = {
          id: row.id,
          jobId: row.job_id,
          contactDate: new Date(row.contact_date),
          outcome: row.outcome as ContactOutcome,
          notes: row.notes,
          nextAction: row.next_action,
          nextActionDate: row.next_action_date ? new Date(row.next_action_date) : null,
          createdBy: row.created_by,
          createdAt: new Date(row.created_at),
        };

        if (!mapped[row.job_id]) mapped[row.job_id] = [];
        mapped[row.job_id].push(entry);
      });

      setHistoryMap(mapped);
    } catch (error) {
      console.error('Failed to load all contact history:', error);
    } finally {
      setIsLoading(false);
    }
  }, [jobIdHash, jobIdCount]);

  useEffect(() => {
    loadAllHistory();
  }, [loadAllHistory]);

  // Realtime: use a short stable channel name
  useEffect(() => {
    if (!jobIds.length) return;

    const channel = supabase
      .channel(`contact_history_bulk_${jobIdHash}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'contact_history' },
        (payload) => {
          const newJobId = (payload as any).new?.job_id as string | undefined;
          const oldJobId = (payload as any).old?.job_id as string | undefined;
          const jobIdSet = new Set(jobIds);
          if ((newJobId && jobIdSet.has(newJobId)) || (oldJobId && jobIdSet.has(oldJobId))) {
            loadAllHistory();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [jobIdHash, jobIdCount, loadAllHistory]);

  return {
    historyMap,
    isLoading,
    refreshAllHistory: loadAllHistory,
  };
}
