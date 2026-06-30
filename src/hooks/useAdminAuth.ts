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

  const signIn = async (email: string, password: string): Promise<{ error: Error | null }> => {
    setState(prev => ({ ...prev, error: null }));

    const cleanEmail = email.trim().toLowerCase();
    const rawPassword = password.normalize('NFC');
    const zeroWidthCleaned = rawPassword.replace(/[\u200B-\u200D\uFEFF]/g, '');
    const compatibilityNormalized = rawPassword.normalize('NFKC');
    const passwordAttempts = Array.from(new Set([
      rawPassword,
      rawPassword.trim(),
      zeroWidthCleaned,
      zeroWidthCleaned.trim(),
      compatibilityNormalized,
      compatibilityNormalized.trim(),
    ].filter(Boolean)));

    let data: Awaited<ReturnType<typeof supabase.auth.signInWithPassword>>['data'] | null = null;
    let error: Awaited<ReturnType<typeof supabase.auth.signInWithPassword>>['error'] | null = null;

    for (const attemptPassword of passwordAttempts) {
      const result = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password: attemptPassword,
      });

      data = result.data;
      error = result.error;

      if (!error) break;
      if ((error as { code?: string }).code !== 'invalid_credentials') break;
    }

    if (error && (error as { code?: string }).code === 'invalid_credentials') {
      try {
        const fallback = await supabase.functions.invoke('admin-password-login', {
          body: { email: cleanEmail, password },
        });

        if (!fallback.error && fallback.data?.session?.access_token && fallback.data?.session?.refresh_token) {
          const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
            access_token: fallback.data.session.access_token,
            refresh_token: fallback.data.session.refresh_token,
          });

          if (!sessionError && sessionData.session) {
            data = { user: sessionData.session.user, session: sessionData.session };
            error = null;
          } else if (sessionError) {
            error = sessionError;
          }
        }
      } catch (fallbackErr) {
        console.warn('[admin-auth] backend fallback unavailable', fallbackErr);
      }
    }

    if (error) {
      console.warn('[admin-auth] sign-in failed', {
        emailLength: cleanEmail.length,
        passwordLength: rawPassword.trim().length,
        rawPasswordLength: password.length,
        passwordTrimmed: rawPassword.trim().length !== rawPassword.length,
        attemptedPasswordVariants: passwordAttempts.length,
        code: (error as { code?: string }).code ?? null,
        message: error.message,
      });
      const message = (error as { code?: string }).code === 'invalid_credentials'
        ? 'Login details were rejected by the authentication service. Please reselect the saved login or use Forgot password if it still fails.'
        : error.message;
      setState(prev => ({ ...prev, error: message }));
      return { error };
    }

    const session = data?.session ?? null;

    if (session?.user) {
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
    signUp,
    signOut,
    clearError,
    isAuthenticated: !!state.session,
    // Admin = full access; Viewer & Tester = read-only end-to-end access
    hasAccess: state.isAdmin || state.isViewer || state.isTester,
    // Only full admins can edit
    canEdit: state.isAdmin,
  };
};
