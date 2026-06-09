import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface SignOffRow {
  team_id: string | null;
  team_name: string | null;
  signed_off_at: string;
  on_behalf_of: 'team' | 'external' | null;
  external_assignee_id: string | null;
  signed_off_by_admin: boolean | null;
}

export const useSignOffStatus = (jobIds: string[]) => {
  const [signOffMap, setSignOffMap] = useState<Map<string, string[]>>(new Map());
  const [signOffRowsMap, setSignOffRowsMap] = useState<Map<string, SignOffRow[]>>(new Map());
  const [signOffDateMap, setSignOffDateMap] = useState<Map<string, string>>(new Map());
  const [isLoading, setIsLoading] = useState(true);

  // Stable dependency instead of jobIds.join(',') which creates huge strings
  const jobIdCount = jobIds.length;
  const jobIdHash = jobIds.length > 0
    ? `${jobIds.length}_${jobIds[0]?.slice(0, 8)}_${jobIds[jobIds.length - 1]?.slice(0, 8)}`
    : 'empty';

  const fetchSignOffs = useCallback(async () => {
    if (jobIds.length === 0) {
      setSignOffMap(new Map());
      setSignOffRowsMap(new Map());
      setIsLoading(false);
      return;
    }

    try {
      // Batch in chunks of 100 to avoid oversized IN queries
      const chunkSize = 100;
      const allData: any[] = [];
      
      for (let i = 0; i < jobIds.length; i += chunkSize) {
        const chunk = jobIds.slice(i, i + chunkSize);
        const { data, error } = await supabase
          .from('team_sign_offs')
          .select('job_id, team_id, team_name, signed_off_at, on_behalf_of, external_assignee_id, signed_off_by_admin')
          .in('job_id', chunk);

        if (error) throw error;
        if (data) allData.push(...data);
      }

      const map = new Map<string, string[]>();
      const rowsMap = new Map<string, SignOffRow[]>();
      const dateMap = new Map<string, string>();
      allData.forEach(row => {
        // Legacy team_name list (used for team-name-based assignedTeams matching)
        if (row.team_name) {
          const existing = map.get(row.job_id) || [];
          map.set(row.job_id, [...existing, row.team_name]);
        }
        // Full rows (covers team + external sign-offs)
        const rows = rowsMap.get(row.job_id) || [];
        rows.push({
          team_id: row.team_id ?? null,
          team_name: row.team_name ?? null,
          signed_off_at: row.signed_off_at,
          on_behalf_of: (row.on_behalf_of as 'team' | 'external' | null) ?? null,
          external_assignee_id: row.external_assignee_id ?? null,
          signed_off_by_admin: row.signed_off_by_admin ?? null,
        });
        rowsMap.set(row.job_id, rows);
        // Track the latest sign-off date per job
        const currentDate = dateMap.get(row.job_id);
        if (!currentDate || row.signed_off_at > currentDate) {
          dateMap.set(row.job_id, row.signed_off_at);
        }
      });

      setSignOffMap(map);
      setSignOffRowsMap(rowsMap);
      setSignOffDateMap(dateMap);
    } catch (error) {
      console.error('Failed to fetch sign-off status:', error);
    } finally {
      setIsLoading(false);
    }
  }, [jobIdHash, jobIdCount]);

  useEffect(() => {
    fetchSignOffs();

    // Subscribe to realtime updates
    const channel = supabase
      .channel(`sign-offs-${jobIdHash}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'team_sign_offs',
        },
        () => {
          fetchSignOffs();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchSignOffs]);

  const getSignOffStatus = useCallback((jobId: string, team1?: string | null, team2?: string | null) => {
    // Only count TEAM sign-offs against assigned teams; external sign-offs are tracked separately
    const rows = signOffRowsMap.get(jobId) || [];
    const teamSignedNames = rows
      .filter(r => (r.on_behalf_of ?? 'team') === 'team' && r.team_name)
      .map(r => r.team_name as string);
    const assignedTeams = [team1, team2].filter(Boolean) as string[];
    const totalAssigned = assignedTeams.length;
    const totalSignedOff = assignedTeams.filter(t => teamSignedNames.includes(t)).length;

    return {
      signedOffTeams: teamSignedNames,
      totalAssigned,
      totalSignedOff,
      allSignedOff: totalAssigned > 0 && totalSignedOff === totalAssigned,
      pending: totalAssigned > 0 && totalSignedOff < totalAssigned,
    };
  }, [signOffRowsMap]);

  const getLatestSignOffDate = useCallback((jobId: string): string | null => {
    return signOffDateMap.get(jobId) || null;
  }, [signOffDateMap]);

  const getSignOffRows = useCallback((jobId: string): SignOffRow[] => {
    return signOffRowsMap.get(jobId) || [];
  }, [signOffRowsMap]);

  return {
    signOffMap,
    signOffDateMap,
    signOffRowsMap,
    isLoading,
    getSignOffStatus,
    getLatestSignOffDate,
    getSignOffRows,
    refresh: fetchSignOffs,
  };
};
