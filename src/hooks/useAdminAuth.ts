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

  const resolveRoles = useCallback(async (userId: string): Promise<{ isAdmin: boolean; isViewer: boolean }> => {
    // Retry once to avoid transient auth timing issues right after sign-in
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const [{ data: isAdmin, error: adminError }, { data: isViewer, error: viewerError }] = await Promise.all([
          supabase.rpc('has_role', { _user_id: userId, _role: 'admin' }),
          supabase.rpc('has_role', { _user_id: userId, _role: 'viewer' }),
        ]);

        if (adminError || viewerError) {
          throw adminError ?? viewerError;
        }

        return {
          isAdmin: Boolean(isAdmin),
          isViewer: Boolean(isViewer),
        };
      } catch (err) {
        if (attempt === 1) {
          console.error('Failed to resolve admin roles:', err);
          return { isAdmin: false, isViewer: false };
        }

        await new Promise((resolve) => setTimeout(resolve, 120));
      }
    }

    return { isAdmin: false, isViewer: false };
  }, []);

  useEffect(() => {
    let isMounted = true;

    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        // CRITICAL: Skip disruptive state resets on token refresh events.
        // TOKEN_REFRESHED fires periodically and should NOT cause the UI to
        // unmount/remount (which loses all page state and redirects the user).
        if (event === 'TOKEN_REFRESHED') {
          // Silently update session/user refs without touching role flags
          if (!isMounted) return;

          setState(prev => ({
            ...prev,
            session,
            user: session?.user ?? null,
          }));
          return;
        }

        // For SIGNED_IN, SIGNED_OUT, USER_UPDATED etc. do the full flow
        if (!isMounted) return;

        setState(prev => ({
          ...prev,
          session,
          user: session?.user ?? null,
          isCheckingRoles: !!session?.user,
        }));

        // Defer role checks with setTimeout to prevent deadlock
        if (session?.user) {
          setTimeout(async () => {
            const { isAdmin, isViewer } = await resolveRoles(session.user.id);

            if (!isMounted) return;

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
      if (!isMounted) return;

      setState(prev => ({
        ...prev,
        session,
        user: session?.user ?? null,
        isCheckingRoles: !!session?.user,
      }));

      if (session?.user) {
        const { isAdmin, isViewer } = await resolveRoles(session.user.id);

        if (!isMounted) return;

        setState(prev => ({
          ...prev,
          isAdmin,
          isViewer,
          isLoading: false,
          isCheckingRoles: false,
        }));
      } else {
        setState(prev => ({
          ...prev,
          isLoading: false,
          isCheckingRoles: false,
        }));
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [resolveRoles]);

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
