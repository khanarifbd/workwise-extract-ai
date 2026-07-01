import { useState, useEffect, useCallback, useRef } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

interface AdminAuthState {
  user: User | null;
  session: Session | null;
  isAdmin: boolean;
  isViewer: boolean;
  isTester: boolean;
  isLoading: boolean;
  isCheckingRoles: boolean;
  error: string | null;
}

export const useAdminAuth = () => {
  const authCheckRunRef = useRef(0);
  const [state, setState] = useState<AdminAuthState>({
    user: null,
    session: null,
    isAdmin: false,
    isViewer: false,
    isTester: false,
    isLoading: true,
    isCheckingRoles: false,
    error: null,
  });

  const resolveRoles = useCallback(async (userId: string): Promise<{ isAdmin: boolean; isViewer: boolean; isTester: boolean }> => {
    const maxAttempts = 5;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        const [{ data: isAdmin, error: adminError }, { data: isViewer, error: viewerError }, { data: isTester, error: testerError }] = await Promise.all([
          supabase.rpc('is_admin', { _user_id: userId }),
          supabase.rpc('is_viewer', { _user_id: userId }),
          supabase.rpc('is_tester', { _user_id: userId }),
        ]);

        if (adminError || viewerError || testerError) {
          throw adminError ?? viewerError ?? testerError;
        }

        return {
          isAdmin: Boolean(isAdmin),
          isViewer: Boolean(isViewer),
          isTester: Boolean(isTester),
        };
      } catch (err) {
        if (attempt === maxAttempts - 1) {
          console.error('Failed to resolve admin roles:', err);
          return { isAdmin: false, isViewer: false, isTester: false };
        }

        await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
      }
    }

    return { isAdmin: false, isViewer: false, isTester: false };
  }, []);

  useEffect(() => {
    let isMounted = true;
    let subscription: { unsubscribe: () => void } | null = null;

    const applySession = async (session: Session | null) => {
      const runId = ++authCheckRunRef.current;

      if (!isMounted) return;

      setState(prev => ({
        ...prev,
        session,
        user: session?.user ?? null,
        isCheckingRoles: !!session?.user,
      }));

      if (session?.user) {
        const { isAdmin, isViewer, isTester } = await resolveRoles(session.user.id);

        if (!isMounted || runId !== authCheckRunRef.current) return;

        setState(prev => ({
          ...prev,
          isAdmin,
          isViewer,
          isTester,
          isLoading: false,
          isCheckingRoles: false,
        }));
      } else {
        if (!isMounted || runId !== authCheckRunRef.current) return;

        setState(prev => ({
          ...prev,
          isAdmin: false,
          isViewer: false,
          isTester: false,
          isLoading: false,
          isCheckingRoles: false,
        }));
      }
    };

    // Restore the stored auth session before subscribing, so role-gated queries
    // do not run while auth.uid() is still temporarily unavailable.
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      await applySession(session);

      if (!isMounted) return;

      const { data } = supabase.auth.onAuthStateChange((event, session) => {
        if (!isMounted) return;

        if (event === 'TOKEN_REFRESHED') {
          setState(prev => ({
            ...prev,
            session,
            user: session?.user ?? null,
          }));
          return;
        }

        // Defer role checks outside the auth callback to avoid blocking auth.
        setTimeout(() => {
          void applySession(session);
        }, 0);
      });

      subscription = data.subscription;
    }).catch((err) => {
      console.error('Failed to initialise admin auth:', err);
      if (isMounted) {
        setState(prev => ({
          ...prev,
          isLoading: false,
          isCheckingRoles: false,
          error: 'Sign-in could not start. Please refresh and try again.',
        }));
      }
    });

    return () => {
      isMounted = false;
      subscription?.unsubscribe();
    };
  }, [resolveRoles]);

  const applyAuthenticatedSession = async (session: Session): Promise<void> => {
    const runId = ++authCheckRunRef.current;
    setState(prev => ({
      ...prev,
      session,
      user: session.user,
      error: null,
      isLoading: false,
      isCheckingRoles: true,
    }));

    const { isAdmin, isViewer, isTester } = await resolveRoles(session.user.id);

    if (runId === authCheckRunRef.current) {
      setState(prev => ({
        ...prev,
        isAdmin,
        isViewer,
        isTester,
        isCheckingRoles: false,
      }));
    }
  };

  const signIn = async (email: string, password: string): Promise<{ error: Error | null }> => {
    setState(prev => ({ ...prev, error: null }));

    const cleanEmail = email.trim().toLowerCase();
    const normalizedPassword = password.normalize('NFC');

    let error: Error | null = null;

    try {
      const { data, error: functionError } = await supabase.functions.invoke('admin-password-login', {
        body: { email: cleanEmail, password: normalizedPassword },
      });

      if (functionError) {
        error = new Error((data as { error?: string } | null)?.error || functionError.message);
      } else if (!data?.session?.access_token || !data?.session?.refresh_token) {
        error = new Error('Login service did not return a valid session. Please try again.');
      } else {
        const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });

        if (sessionError || !sessionData.session) {
          error = sessionError ?? new Error('Could not start your Genie session. Please try again.');
        } else {
          await applyAuthenticatedSession(sessionData.session);
        }
      }
    } catch (err) {
      error = err instanceof Error ? err : new Error('Login service could not be reached. Please try again.');
    }

    if (error) {
      console.warn('[admin-auth] sign-in failed', {
        emailLength: cleanEmail.length,
        passwordLength: normalizedPassword.trim().length,
        rawPasswordLength: password.length,
        passwordTrimmed: normalizedPassword.trim().length !== normalizedPassword.length,
        message: error.message,
      });
      setState(prev => ({ ...prev, error: error.message }));
      return { error };
    }

    return { error: null };
  };

  const signInWithTesterCode = async (code: string): Promise<{ error: Error | null }> => {
    setState(prev => ({ ...prev, error: null }));

    try {
      const { data, error: functionError } = await supabase.functions.invoke('tester-login', {
        body: { code: code.trim() },
      });

      if (functionError) {
        const message = (data as { error?: string } | null)?.error || functionError.message || 'Invalid access code.';
        const error = new Error(message);
        setState(prev => ({ ...prev, error: message }));
        return { error };
      }

      if (!data?.session?.access_token || !data?.session?.refresh_token) {
        const error = new Error('Could not start your Genie preview session. Please try again.');
        setState(prev => ({ ...prev, error: error.message }));
        return { error };
      }

      const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      });

      if (sessionError || !sessionData.session) {
        const error = sessionError ?? new Error('Could not start your Genie preview session. Please try again.');
        setState(prev => ({ ...prev, error: error.message }));
        return { error };
      }

      await applyAuthenticatedSession(sessionData.session);
      return { error: null };
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Preview access could not be reached. Please try again.');
      setState(prev => ({ ...prev, error: error.message }));
      return { error };
    }
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
      isTester: false,
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
    signInWithTesterCode,
    signUp,
    signOut,
    clearError,
    isAuthenticated: !!state.session,
    // Admin = full access; Viewer = read-only; Tester = full feature access gated by section permissions
    hasAccess: state.isAdmin || state.isViewer || state.isTester,
    // Admins and testers can edit (tester scope is limited via tester_section_permissions).
    // Viewers remain strictly read-only.
    canEdit: state.isAdmin || state.isTester,
  };
};
