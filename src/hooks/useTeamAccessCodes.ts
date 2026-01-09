import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface TeamAccessCode {
  id: string;
  teamId: string;
  teamName: string;
  accessCode: string;
  isActive: boolean;
  isOpsManager: boolean;
  createdAt: string;
  updatedAt: string;
}

export const useTeamAccessCodes = () => {
  const [codes, setCodes] = useState<TeamAccessCode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  const fetchCodes = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('team_access_codes')
        .select('*')
        .order('team_name');

      if (error) throw error;

      setCodes(
        (data || []).map((row) => ({
          id: row.id,
          teamId: row.team_id,
          teamName: row.team_name,
          accessCode: row.access_code,
          isActive: row.is_active,
          isOpsManager: row.is_ops_manager === true,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        }))
      );
    } catch (error) {
      console.error('Error fetching team access codes:', error);
      toast({
        title: 'Error',
        description: 'Failed to load team access codes',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchCodes();
  }, [fetchCodes]);

  const addCode = async (teamName: string, accessCode: string) => {
    try {
      const teamId = `team_${teamName.toLowerCase().replace(/\s+/g, '_')}`;
      const { error } = await supabase.from('team_access_codes').insert({
        team_id: teamId,
        team_name: teamName,
        access_code: accessCode.toUpperCase(),
        is_active: true,
      });

      if (error) throw error;

      toast({
        title: 'Success',
        description: `Access code created for ${teamName}`,
      });

      await fetchCodes();
      return true;
    } catch (error: any) {
      console.error('Error adding access code:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to create access code',
        variant: 'destructive',
      });
      return false;
    }
  };

  const updateCode = async (id: string, updates: { accessCode?: string; isActive?: boolean; teamName?: string; isOpsManager?: boolean }) => {
    try {
      const updateData: any = {};
      if (updates.accessCode !== undefined) {
        updateData.access_code = updates.accessCode.toUpperCase();
      }
      if (updates.isActive !== undefined) {
        updateData.is_active = updates.isActive;
      }
      if (updates.teamName !== undefined) {
        updateData.team_name = updates.teamName;
        updateData.team_id = `team_${updates.teamName.toLowerCase().replace(/\s+/g, '_')}`;
      }
      if (updates.isOpsManager !== undefined) {
        updateData.is_ops_manager = updates.isOpsManager;
      }

      const { error } = await supabase
        .from('team_access_codes')
        .update(updateData)
        .eq('id', id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Access code updated',
      });

      await fetchCodes();
      return true;
    } catch (error: any) {
      console.error('Error updating access code:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to update access code',
        variant: 'destructive',
      });
      return false;
    }
  };

  const deleteCode = async (id: string) => {
    try {
      const { error } = await supabase.from('team_access_codes').delete().eq('id', id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Access code deleted',
      });

      await fetchCodes();
      return true;
    } catch (error: any) {
      console.error('Error deleting access code:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete access code',
        variant: 'destructive',
      });
      return false;
    }
  };

  return {
    codes,
    isLoading,
    addCode,
    updateCode,
    deleteCode,
    refreshCodes: fetchCodes,
  };
};
