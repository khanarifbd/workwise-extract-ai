import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from './use-toast';

export interface TeamUnavailableDay {
  id: string;
  teamId: string;
  unavailableDate: string; // YYYY-MM-DD format
  reason: string | null;
  createdAt: string;
  createdBy: string | null;
}

export const useTeamAvailability = () => {
  const [unavailableDays, setUnavailableDays] = useState<TeamUnavailableDay[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  const loadAvailability = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('team_availability')
        .select('*')
        .order('unavailable_date');

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
      console.error('Error loading team availability:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Real-time subscription
  useEffect(() => {
    loadAvailability();

    const channel = supabase
      .channel('team-availability-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'team_availability',
        },
        (payload) => {
          console.log('Team availability changed:', payload);
          loadAvailability();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadAvailability]);

  const addUnavailableDay = async (
    teamId: string,
    date: string,
    reason?: string,
    createdBy?: string
  ) => {
    try {
      const { error } = await supabase.from('team_availability').insert({
        team_id: teamId,
        unavailable_date: date,
        reason: reason || null,
        created_by: createdBy || null,
      });

      if (error) {
        if (error.code === '23505') {
          toast({
            title: 'Day already marked unavailable',
            variant: 'destructive',
          });
          return false;
        }
        throw error;
      }

      toast({
        title: 'Day marked as unavailable',
      });
      return true;
    } catch (error) {
      console.error('Error adding unavailable day:', error);
      toast({
        title: 'Failed to mark day unavailable',
        variant: 'destructive',
      });
      return false;
    }
  };

  const removeUnavailableDay = async (teamId: string, date: string) => {
    try {
      const { error } = await supabase
        .from('team_availability')
        .delete()
        .eq('team_id', teamId)
        .eq('unavailable_date', date);

      if (error) throw error;

      toast({
        title: 'Day marked as available',
      });
      return true;
    } catch (error) {
      console.error('Error removing unavailable day:', error);
      toast({
        title: 'Failed to update availability',
        variant: 'destructive',
      });
      return false;
    }
  };

  // Check if a team is unavailable on a specific date
  const isTeamUnavailable = useCallback(
    (teamId: string, date: string): boolean => {
      return unavailableDays.some(
        (day) => day.teamId === teamId && day.unavailableDate === date
      );
    },
    [unavailableDays]
  );

  // Get all unavailable dates for a team
  const getTeamUnavailableDates = useCallback(
    (teamId: string): TeamUnavailableDay[] => {
      return unavailableDays.filter((day) => day.teamId === teamId);
    },
    [unavailableDays]
  );

  // Get unavailable reason for a specific date
  const getUnavailableReason = useCallback(
    (teamId: string, date: string): string | null => {
      const day = unavailableDays.find(
        (d) => d.teamId === teamId && d.unavailableDate === date
      );
      return day?.reason || null;
    },
    [unavailableDays]
  );

  // Check if any assigned job has a conflict (team unavailable on booked date)
  const hasAvailabilityConflict = useCallback(
    (teamId: string | null | undefined, bookedDate: string | null | undefined): boolean => {
      if (!teamId || !bookedDate) return false;
      const dateStr = bookedDate.split('T')[0]; // Convert to YYYY-MM-DD
      return isTeamUnavailable(teamId, dateStr);
    },
    [isTeamUnavailable]
  );

  return {
    unavailableDays,
    isLoading,
    addUnavailableDay,
    removeUnavailableDay,
    isTeamUnavailable,
    getTeamUnavailableDates,
    getUnavailableReason,
    hasAvailabilityConflict,
    refreshAvailability: loadAvailability,
  };
};
