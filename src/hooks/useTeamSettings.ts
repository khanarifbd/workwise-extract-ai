import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from './use-toast';

export interface TeamSetting {
  id: string;
  teamId: string;
  teamName: string;
  whatsappGroup: string | null;
}

export const useTeamSettings = () => {
  const [settings, setSettings] = useState<TeamSetting[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  const loadSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('team_notification_settings')
        .select('*')
        .order('team_name');

      if (error) throw error;

      setSettings(
        (data || []).map((row: any) => ({
          id: row.id,
          teamId: row.team_id,
          teamName: row.team_name,
          whatsappGroup: row.whatsapp_group,
        }))
      );
    } catch (error) {
      console.error('Error loading team settings:', error);
      toast({
        title: 'Error loading team settings',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const updateSetting = async (teamId: string, whatsappGroup: string | null) => {
    try {
      const { error } = await supabase
        .from('team_notification_settings')
        .update({ whatsapp_group: whatsappGroup || null })
        .eq('team_id', teamId);

      if (error) throw error;

      setSettings((prev) =>
        prev.map((s) =>
          s.teamId === teamId ? { ...s, whatsappGroup } : s
        )
      );

      toast({
        title: 'Team settings updated',
      });
    } catch (error) {
      console.error('Error updating team setting:', error);
      toast({
        title: 'Failed to update team setting',
        variant: 'destructive',
      });
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  return { settings, isLoading, updateSetting, refreshSettings: loadSettings };
};
