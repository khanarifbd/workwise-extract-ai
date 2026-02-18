import { useState, useEffect, useCallback } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

interface ProgressorAuthState {
  user: User | null;
  session: Session | null;
  isJobProgressor: boolean;
  isAdmin: boolean;
  isLoading: boolean;
  isCheckingRoles: boolean;
  error: string | null;
}

export const useProgressorAuth = () => {
  const [state, setState] = useState<ProgressorAuthState>({
    user: null,
    session: null,
    isJobProgressor: false,
    isAdmin: false,
    isLoading: true,
    isCheckingRoles: false,
    error: null,
  });

  const checkRoles = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId);

      if (error) return { isJobProgressor: false, isAdmin: false };

      const roles = (data || []).map((r: any) => r.role);
      return {
        isJobProgressor: roles.includes('job_progressor'),
        isAdmin: roles.includes('admin'),
      };
    } catch {
      return { isJobProgressor: false, isAdmin: false };
    }
  }, []);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setState(prev => ({
          ...prev,
          session,
          user: session?.user ?? null,
          isCheckingRoles: !!session?.user,
        }));

        if (session?.user) {
          setTimeout(async () => {
            const roles = await checkRoles(session.user.id);
            setState(prev => ({
              ...prev,
              ...roles,
              isLoading: false,
              isCheckingRoles: false,
            }));
          }, 0);
        } else {
          setState(prev => ({
            ...prev,
            isJobProgressor: false,
            isAdmin: false,
            isLoading: false,
            isCheckingRoles: false,
          }));
        }
      }
    );

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setState(prev => ({ ...prev, session, user: session?.user ?? null }));

      if (session?.user) {
        const roles = await checkRoles(session.user.id);
        setState(prev => ({ ...prev, ...roles, isLoading: false }));
      } else {
        setState(prev => ({ ...prev, isLoading: false }));
      }
    });

    return () => subscription.unsubscribe();
  }, [checkRoles]);

  const signIn = async (email: string, password: string) => {
    setState(prev => ({ ...prev, error: null }));
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      setState(prev => ({ ...prev, error: error.message }));
      return { error };
    }
    return { error: null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setState({
      user: null, session: null, isJobProgressor: false, isAdmin: false,
      isLoading: false, isCheckingRoles: false, error: null,
    });
  };

  const clearError = () => setState(prev => ({ ...prev, error: null }));

  return {
    ...state,
    signIn,
    signOut,
    clearError,
    isAuthenticated: !!state.session,
    hasAccess: state.isJobProgressor || state.isAdmin,
  };
};
