import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from './use-toast';

export interface TeamUnavailableDay {
  id: string;
  teamId: string;
  unavailableDate: string;
  reason: string | null;
  createdAt: string;
  createdBy: string | null;
}

interface TeamAccessCode {
  teamId: string;
  teamName: string;
}

export const useTeamAvailability = () => {
  const [unavailableDays, setUnavailableDays] = useState<TeamUnavailableDay[]>([]);
  const [teamAccessCodes, setTeamAccessCodes] = useState<TeamAccessCode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  const loadAvailability = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('team_availability')
        .select('*')
        .order('unavailable_date', { ascending: true });

      if (error) throw error;

      setUnavailableDays(
        (data || []).map((row: any) => ({
          id: row.id,
          teamId: row.team_id,
          unavailableDate: row.unavailable_date,
          reason: row.reason,
          createdAt: row.created_at,
          createdBy: row.created_by,
        }))
      );
    } catch (error) {
      console.error('Error loading availability:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load team access codes for name-to-id mapping
  const loadTeamAccessCodes = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('team_access_codes')
        .select('team_id, team_name')
        .eq('is_active', true);

      if (error) throw error;

      setTeamAccessCodes(
        (data || []).map((row: any) => ({
          teamId: row.team_id,
          teamName: row.team_name,
        }))
      );
    } catch (error) {
      console.error('Error loading team access codes:', error);
    }
  }, []);

  useEffect(() => {
    loadAvailability();
    loadTeamAccessCodes();

    // Subscribe to realtime changes
    const channel = supabase
      .channel('team-availability-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'team_availability',
        },
        () => {
          loadAvailability();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadAvailability, loadTeamAccessCodes]);

  // Helper to get team_id from team_access_codes by team name
  const getTeamIdByName = useCallback((teamName: string | null | undefined): string | null => {
    if (!teamName) return null;
    const normalizedName = teamName.toLowerCase().trim();
    const accessCode = teamAccessCodes.find(tc => 
      tc.teamName.toLowerCase().trim() === normalizedName
    );
    return accessCode?.teamId || null;
  }, [teamAccessCodes]);

  const addUnavailableDay = async (teamId: string, date: string, reason?: string, createdBy?: string): Promise<boolean> => {
    try {
      // Check if already exists
      const existing = unavailableDays.find(
        d => d.teamId === teamId && d.unavailableDate === date
      );
      if (existing) {
        toast({
          title: 'Already unavailable',
          description: 'This date is already marked as unavailable.',
          variant: 'destructive',
        });
        return false;
      }

      const { error } = await supabase
        .from('team_availability')
        .insert({
          team_id: teamId,
          unavailable_date: date,
          reason: reason || null,
          created_by: createdBy || null,
        });

      if (error) throw error;

      toast({
        title: 'Day marked unavailable',
        description: `${date} has been marked as unavailable.`,
      });

      await loadAvailability();
      return true;
    } catch (error) {
      console.error('Error adding unavailable day:', error);
      toast({
        title: 'Error',
        description: 'Failed to mark day as unavailable.',
        variant: 'destructive',
      });
      return false;
    }
  };

  const removeUnavailableDay = async (teamId: string, date: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('team_availability')
        .delete()
        .eq('team_id', teamId)
        .eq('unavailable_date', date);

      if (error) throw error;

      toast({
        title: 'Day now available',
        description: `${date} is now available.`,
      });

      await loadAvailability();
      return true;
    } catch (error) {
      console.error('Error removing unavailable day:', error);
      toast({
        title: 'Error',
        description: 'Failed to mark day as available.',
        variant: 'destructive',
      });
      return false;
    }
  };

  // Check by teamId (from team_access_codes format like "team_indika")
  const isTeamUnavailable = useCallback((teamId: string, date: string): boolean => {
    return unavailableDays.some(
      d => d.teamId === teamId && d.unavailableDate === date
    );
  }, [unavailableDays]);

  // Check by team name (maps to team_access_codes team_id)
  const isTeamUnavailableByName = useCallback((teamName: string | null | undefined, date: string): boolean => {
    if (!teamName || !date) return false;
    const teamId = getTeamIdByName(teamName);
    if (!teamId) return false;
    return isTeamUnavailable(teamId, date);
  }, [getTeamIdByName, isTeamUnavailable]);

  const getTeamUnavailableDates = useCallback((teamId: string): TeamUnavailableDay[] => {
    return unavailableDays.filter(d => d.teamId === teamId);
  }, [unavailableDays]);

  const getUnavailableReason = useCallback((teamId: string, date: string): string | null => {
    const day = unavailableDays.find(
      d => d.teamId === teamId && d.unavailableDate === date
    );
    return day?.reason || null;
  }, [unavailableDays]);

  // Get reason by team name
  const getUnavailableReasonByName = useCallback((teamName: string | null | undefined, date: string): string | null => {
    if (!teamName || !date) return null;
    const teamId = getTeamIdByName(teamName);
    if (!teamId) return null;
    return getUnavailableReason(teamId, date);
  }, [getTeamIdByName, getUnavailableReason]);

  // Check for availability conflict - now supports both teamId and teamName
  const hasAvailabilityConflict = useCallback((
    teamIdOrName: string | null | undefined, 
    bookedDate: string | null | undefined
  ): boolean => {
    if (!teamIdOrName || !bookedDate) return false;
    
    // Extract date part (handle ISO strings)
    const dateStr = bookedDate.split('T')[0];
    
    // First try direct teamId match
    if (isTeamUnavailable(teamIdOrName, dateStr)) {
      return true;
    }
    
    // Then try by team name
    return isTeamUnavailableByName(teamIdOrName, dateStr);
  }, [isTeamUnavailable, isTeamUnavailableByName]);

  return {
    unavailableDays,
    teamAccessCodes,
    isLoading,
    addUnavailableDay,
    removeUnavailableDay,
    isTeamUnavailable,
    isTeamUnavailableByName,
    getTeamUnavailableDates,
    getUnavailableReason,
    getUnavailableReasonByName,
    hasAvailabilityConflict,
    getTeamIdByName,
    refreshAvailability: loadAvailability,
  };
};
