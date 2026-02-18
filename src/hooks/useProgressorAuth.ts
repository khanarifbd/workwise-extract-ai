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

  const signInWithCode = async (code: string) => {
    setState(prev => ({ ...prev, error: null }));
    
    try {
      const response = await supabase.functions.invoke('validate-progressor-code', {
        body: { code: code.trim().toUpperCase() },
      });

      if (response.error) {
        const msg = response.error.message || 'Invalid access code';
        setState(prev => ({ ...prev, error: msg }));
        return { error: { message: msg } };
      }

      const { token_hash, email } = response.data;

      if (!token_hash) {
        setState(prev => ({ ...prev, error: 'Authentication failed' }));
        return { error: { message: 'Authentication failed' } };
      }

      // Verify the magic link token to create a session
      const { error: verifyError } = await supabase.auth.verifyOtp({
        token_hash,
        type: 'magiclink',
      });

      if (verifyError) {
        setState(prev => ({ ...prev, error: verifyError.message }));
        return { error: verifyError };
      }

      return { error: null };
    } catch (err: any) {
      const msg = err?.message || 'Failed to validate code';
      setState(prev => ({ ...prev, error: msg }));
      return { error: { message: msg } };
    }
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
    signInWithCode,
    signOut,
    clearError,
    isAuthenticated: !!state.session,
    hasAccess: state.isJobProgressor || state.isAdmin,
  };
};
