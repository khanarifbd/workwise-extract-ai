import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from './use-toast';

export interface TeamSetting {
  id: string;
  teamId: string;
  teamName: string;
  whatsappGroup: string | null;
  color?: string;
  type?: 'dm' | 'fan';
  isCustom?: boolean;
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
          color: row.color,
          type: row.team_type,
          isCustom: row.is_custom || false,
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

  const addTeamMember = async (member: {
    name: string;
    color: string;
    whatsappGroup: string | null;
    type: 'dm' | 'fan';
  }) => {
    try {
      const teamId = `custom-${member.type}-${Date.now()}`;
      const { data, error } = await supabase
        .from('team_notification_settings')
        .insert({
          team_id: teamId,
          team_name: member.name,
          whatsapp_group: member.whatsappGroup,
          color: member.color,
          team_type: member.type,
          is_custom: true,
        } as any)
        .select()
        .single();

      if (error) throw error;

      const row = data as any;
      setSettings((prev) => [
        ...prev,
        {
          id: row.id,
          teamId: row.team_id,
          teamName: row.team_name,
          whatsappGroup: row.whatsapp_group,
          color: row.color,
          type: row.team_type,
          isCustom: true,
        },
      ]);

      toast({
        title: 'Team member added',
        description: `${member.name} has been added to the team.`,
      });
    } catch (error) {
      console.error('Error adding team member:', error);
      toast({
        title: 'Failed to add team member',
        variant: 'destructive',
      });
    }
  };

  const removeTeamMember = async (teamId: string) => {
    try {
      const { error } = await supabase
        .from('team_notification_settings')
        .delete()
        .eq('team_id', teamId);

      if (error) throw error;

      setSettings((prev) => prev.filter((s) => s.teamId !== teamId));

      toast({
        title: 'Team member removed',
      });
    } catch (error) {
      console.error('Error removing team member:', error);
      toast({
        title: 'Failed to remove team member',
        variant: 'destructive',
      });
    }
  };

  const updateTeamMember = async (teamId: string, updates: {
    name: string;
    color: string;
    whatsappGroup: string | null;
  }) => {
    try {
      const { error } = await supabase
        .from('team_notification_settings')
        .update({
          team_name: updates.name,
          color: updates.color,
          whatsapp_group: updates.whatsappGroup,
        })
        .eq('team_id', teamId);

      if (error) throw error;

      setSettings((prev) =>
        prev.map((s) =>
          s.teamId === teamId
            ? { ...s, teamName: updates.name, color: updates.color, whatsappGroup: updates.whatsappGroup }
            : s
        )
      );

      toast({
        title: 'Team member updated',
      });
    } catch (error) {
      console.error('Error updating team member:', error);
      toast({
        title: 'Failed to update team member',
        variant: 'destructive',
      });
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  return { 
    settings, 
    isLoading, 
    updateSetting, 
    addTeamMember, 
    removeTeamMember, 
    updateTeamMember,
    refreshSettings: loadSettings 
  };
};
