import { supabase } from '@/integrations/supabase/client';

export const useAuditLog = () => {
  const logAction = async (params: {
    action: string;
    tableName: string;
    recordId?: string;
    fieldChanged?: string;
    oldValue?: string;
    newValue?: string;
    metadata?: Record<string, any>;
  }) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get user role
      const { data: roles } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .limit(1);

      await supabase.from('audit_log' as any).insert({
        user_id: user.id,
        user_email: user.email,
        user_role: roles?.[0]?.role || 'unknown',
        action: params.action,
        table_name: params.tableName,
        record_id: params.recordId,
        field_changed: params.fieldChanged,
        old_value: params.oldValue,
        new_value: params.newValue,
        metadata: params.metadata || {},
      } as any);
    } catch (err) {
      console.error('Audit log error:', err);
    }
  };

  return { logAction };
};
