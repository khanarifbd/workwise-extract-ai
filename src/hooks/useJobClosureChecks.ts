import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface ClosureSummary {
  hasBeforePhotos: boolean;
  hasAfterPhotos: boolean;
  hasNotes: boolean;
  hasSignature: boolean;
  loading: boolean;
}

/**
 * Aggregates the four "Completion Lock" signals for one job:
 *   - Before/After photo folders (photo_folders + team_job_updates.photos)
 *   - Notes (jobs.progress_notes OR team_job_updates.notes)
 *   - Tenant signature (jobs.tenant_signature_url)
 *
 * Designed for the Progressor sign-off button. Re-runs whenever `refreshKey` changes.
 */
export function useJobClosureChecks(
  jobId: string,
  progressNotes: string | null | undefined,
  tenantSignatureUrl: string | null | undefined,
  refreshKey: number = 0,
): ClosureSummary & { refresh: () => void } {
  const [state, setState] = useState<ClosureSummary>({
    hasBeforePhotos: false,
    hasAfterPhotos: false,
    hasNotes: !!progressNotes?.trim(),
    hasSignature: !!tenantSignatureUrl,
    loading: true,
  });

  const fetchAll = useCallback(async () => {
    if (!jobId) return;
    setState((s) => ({ ...s, loading: true }));
    try {
      const [foldersRes, updatesRes] = await Promise.all([
        supabase
          .from('photo_folders')
          .select('id, name')
          .eq('job_id', jobId),
        supabase
          .from('team_job_updates')
          .select('notes, photos')
          .eq('job_id', jobId),
      ]);

      const folders = foldersRes.data || [];
      const hasBeforeFolder = folders.some((f) => /before/i.test(f.name));
      const hasAfterFolder = folders.some((f) => /after/i.test(f.name));

      const updates = updatesRes.data || [];
      const anyPhotos = updates.some((u) => Array.isArray(u.photos) && u.photos.length > 0);
      const anyNotes = updates.some((u) => !!u.notes?.trim());

      setState({
        // If explicit folders exist, require them. Otherwise fall back to "any photos present".
        hasBeforePhotos: hasBeforeFolder || anyPhotos,
        hasAfterPhotos: hasAfterFolder || anyPhotos,
        hasNotes: !!progressNotes?.trim() || anyNotes,
        hasSignature: !!tenantSignatureUrl,
        loading: false,
      });
    } catch (err) {
      console.error('useJobClosureChecks failed:', err);
      setState((s) => ({ ...s, loading: false }));
    }
  }, [jobId, progressNotes, tenantSignatureUrl]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll, refreshKey]);

  return { ...state, refresh: fetchAll };
}
