import { useState, useEffect, useCallback } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

interface AdminAuthState {
  user: User | null;
  session: Session | null;
  isAdmin: boolean;
  isViewer: boolean;
  isLoading: boolean;
  error: string | null;
}

export const useAdminAuth = () => {
  const [state, setState] = useState<AdminAuthState>({
    user: null,
    session: null,
    isAdmin: false,
    isViewer: false,
    isLoading: true,
    error: null,
  });

  // Check if user has admin role
  const checkAdminRole = useCallback(async (userId: string): Promise<boolean> => {
    try {
      const { data, error } = await supabase.rpc('is_admin', { _user_id: userId });
      if (error) {
        console.error('Error checking admin role:', error.message);
        return false;
      }
      return data === true;
    } catch (err) {
      console.error('Failed to check admin role:', err);
      return false;
    }
  }, []);

  // Check if user has viewer role
  const checkViewerRole = useCallback(async (userId: string): Promise<boolean> => {
    try {
      const { data, error } = await supabase.rpc('is_viewer', { _user_id: userId });
      if (error) {
        console.error('Error checking viewer role:', error.message);
        return false;
      }
      return data === true;
    } catch (err) {
      console.error('Failed to check viewer role:', err);
      return false;
    }
  }, []);

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        // When a session exists, keep loading until role checks complete to avoid
        // briefly showing "Access Denied" for users who actually have viewer access.
        setState(prev => ({
          ...prev,
          session,
          user: session?.user ?? null,
          isAdmin: session?.user ? false : false,
          isViewer: session?.user ? false : false,
          isLoading: !!session?.user,
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
            }));
          }, 0);
        } else {
          setState(prev => ({
            ...prev,
            isAdmin: false,
            isViewer: false,
            isLoading: false,
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
        isAdmin: session?.user ? false : prev.isAdmin,
        isViewer: session?.user ? false : prev.isViewer,
        isLoading: !!session?.user,
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

    const redirectUrl = `${window.location.origin}/#/admin`;

    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: redirectUrl,
      },
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
