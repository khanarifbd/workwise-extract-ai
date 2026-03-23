import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface SignOffData {
  jobId: string;
  signedOffTeams: string[];
}

export const useSignOffStatus = (jobIds: string[]) => {
  const [signOffMap, setSignOffMap] = useState<Map<string, string[]>>(new Map());
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
          .select('job_id, team_name, signed_off_at')
          .in('job_id', chunk);

        if (error) throw error;
        if (data) allData.push(...data);
      }

      const map = new Map<string, string[]>();
      const dateMap = new Map<string, string>();
      allData.forEach(row => {
        const existing = map.get(row.job_id) || [];
        map.set(row.job_id, [...existing, row.team_name]);
        // Track the latest sign-off date per job
        const currentDate = dateMap.get(row.job_id);
        if (!currentDate || row.signed_off_at > currentDate) {
          dateMap.set(row.job_id, row.signed_off_at);
        }
      });

      setSignOffMap(map);
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
    const signedOffTeams = signOffMap.get(jobId) || [];
    const assignedTeams = [team1, team2].filter(Boolean) as string[];
    const totalAssigned = assignedTeams.length;
    const totalSignedOff = signedOffTeams.filter(t => assignedTeams.includes(t)).length;
    
    return {
      signedOffTeams,
      totalAssigned,
      totalSignedOff,
      allSignedOff: totalAssigned > 0 && totalSignedOff === totalAssigned,
      pending: totalAssigned > 0 && totalSignedOff < totalAssigned,
    };
  }, [signOffMap]);

  const getLatestSignOffDate = useCallback((jobId: string): string | null => {
    return signOffDateMap.get(jobId) || null;
  }, [signOffDateMap]);

  return {
    signOffMap,
    signOffDateMap,
    isLoading,
    getSignOffStatus,
    getLatestSignOffDate,
    refresh: fetchSignOffs,
  };
};
