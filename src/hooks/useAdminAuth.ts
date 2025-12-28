import { useState, useEffect, useCallback } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

interface AdminAuthState {
  user: User | null;
  session: Session | null;
  isAdmin: boolean;
  isViewer: boolean;
  isLoading: boolean;
  isCheckingRoles: boolean;
  error: string | null;
}

export const useAdminAuth = () => {
  const [state, setState] = useState<AdminAuthState>({
    user: null,
    session: null,
    isAdmin: false,
    isViewer: false,
    isLoading: true,
    isCheckingRoles: false,
    error: null,
  });

  const checkRole = useCallback(async (userId: string, role: 'admin' | 'viewer'): Promise<boolean> => {
    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select('id')
        .eq('user_id', userId)
        .eq('role', role)
        .maybeSingle();

      if (error) {
        console.error('Error checking role:', error.message);
        return false;
      }

      return !!data;
    } catch (err) {
      console.error('Failed to check role:', err);
      return false;
    }
  }, []);

  // Check if user has admin role
  const checkAdminRole = useCallback((userId: string) => checkRole(userId, 'admin'), [checkRole]);

  // Check if user has viewer role
  const checkViewerRole = useCallback((userId: string) => checkRole(userId, 'viewer'), [checkRole]);

  // Check if user has any admin access (admin or viewer)
  const checkHasAdminAccess = useCallback(async (userId: string): Promise<boolean> => {
    const [isAdmin, isViewer] = await Promise.all([
      checkAdminRole(userId),
      checkViewerRole(userId),
    ]);
    return isAdmin || isViewer;
  }, [checkAdminRole, checkViewerRole]);

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setState(prev => ({
          ...prev,
          session,
          user: session?.user ?? null,
          isCheckingRoles: !!session?.user,
        }));

        // Defer role checks with setTimeout to prevent deadlock
        if (session?.user) {
          setTimeout(async () => {
            const [isAdmin, isViewer] = await Promise.all([
              checkAdminRole(session.user.id),
              checkViewerRole(session.user.id),
            ]);
            setState(prev => ({
              ...prev,
              isAdmin,
              isViewer,
              isLoading: false,
              isCheckingRoles: false,
            }));
          }, 0);
        } else {
          setState(prev => ({
            ...prev,
            isAdmin: false,
            isViewer: false,
            isLoading: false,
            isCheckingRoles: false,
          }));
        }
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setState(prev => ({
        ...prev,
        session,
        user: session?.user ?? null,
      }));

      if (session?.user) {
        const [isAdmin, isViewer] = await Promise.all([
          checkAdminRole(session.user.id),
          checkViewerRole(session.user.id),
        ]);
        setState(prev => ({
          ...prev,
          isAdmin,
          isViewer,
          isLoading: false,
        }));
      } else {
        setState(prev => ({
          ...prev,
          isLoading: false,
        }));
      }
    });

    return () => subscription.unsubscribe();
  }, [checkAdminRole, checkViewerRole]);

  const signIn = async (email: string, password: string): Promise<{ error: Error | null }> => {
    setState(prev => ({ ...prev, error: null }));
    
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      setState(prev => ({ ...prev, error: error.message }));
      return { error };
    }

    return { error: null };
  };

  const signUp = async (email: string, password: string): Promise<{ error: Error | null }> => {
    setState(prev => ({ ...prev, error: null }));

    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });

    if (error) {
      setState(prev => ({ ...prev, error: error.message }));
      return { error };
    }

    return { error: null };
  };

  const signOut = async (): Promise<void> => {
    await supabase.auth.signOut();
    setState({
      user: null,
      session: null,
      isAdmin: false,
      isViewer: false,
      isLoading: false,
      isCheckingRoles: false,
      error: null,
    });
  };

  const clearError = () => {
    setState(prev => ({ ...prev, error: null }));
  };

  return {
    ...state,
    signIn,
    signUp,
    signOut,
    clearError,
    isAuthenticated: !!state.session,
    // User has access if they are either admin or viewer
    hasAccess: state.isAdmin || state.isViewer,
    // User can edit only if they are a full admin
    canEdit: state.isAdmin,
  };
};
