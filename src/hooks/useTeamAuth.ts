import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface TeamSession {
  teamId: string;
  teamName: string;
  validatedAt: string;
  expiresAt: string;
  languagePreference: string;
  isOpsManager: boolean;
}

const SESSION_KEY = 'team_portal_session';
const TEAM_JOBS_TIMEOUT_MS = 25000;

const withTimeout = async <T,>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
  let timeoutId: number | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeoutId = window.setTimeout(() => reject(new Error('Team jobs request timed out')), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId !== undefined) window.clearTimeout(timeoutId);
  }
};

export const useTeamAuth = () => {
  const [session, setSession] = useState<TeamSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const persistSession = useCallback((nextSession: TeamSession) => {
    localStorage.setItem(SESSION_KEY, JSON.stringify(nextSession));
    setSession(nextSession);
  }, []);

  // Load session from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(SESSION_KEY);
    if (stored) {
      try {
        const parsed: TeamSession = JSON.parse(stored);
        const expiresAt = new Date(parsed.expiresAt);
        const now = new Date();
        
        if (now < expiresAt) {
          setSession(parsed);
        } else {
          // Session expired
          localStorage.removeItem(SESSION_KEY);
        }
      } catch {
        localStorage.removeItem(SESSION_KEY);
      }
    }
    setIsLoading(false);
  }, []);

  const login = useCallback(async (accessCode: string, rememberMe: boolean = false): Promise<boolean> => {
    setIsLoading(true);
    setError(null);

    try {
      // Use edge function for secure validation
      const { data, error: fnError } = await supabase.functions.invoke('validate-team-code', {
        body: { accessCode },
      });

      if (fnError) {
        console.error('Validation error:', fnError);
        setError('Failed to validate access code. Please try again.');
        setIsLoading(false);
        return false;
      }

      if (!data?.success || !data?.session) {
        setError(data?.error || 'Invalid access code. Please try again.');
        setIsLoading(false);
        return false;
      }

      const newSession: TeamSession = {
        teamId: data.session.teamId,
        teamName: data.session.teamName,
        validatedAt: data.session.validatedAt,
        expiresAt: rememberMe 
          ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days
          : data.session.expiresAt, // 24 hours from server
        languagePreference: data.session.languagePreference || 'en',
        isOpsManager: data.session.isOpsManager === true,
      };

      // Store session without access code (security improvement)
      persistSession(newSession);
      setIsLoading(false);
      return true;
    } catch (err) {
      console.error('Login error:', err);
      setError('Failed to authenticate. Please try again.');
      setIsLoading(false);
      return false;
    }
  }, [persistSession]);

  const logout = useCallback(() => {
    localStorage.removeItem(SESSION_KEY);
    setSession(null);
  }, []);

  // Function to fetch jobs through backend function
  // Optional "since" enables delta polling (only jobs updated since that timestamp).
  const fetchTeamJobs = useCallback(
    async (since?: string) => {
      if (!session) {
        throw new Error('Not authenticated');
      }

      const { data, error: fnError } = await withTimeout(
        supabase.functions.invoke('get-team-jobs', {
          body: {
            teamId: session.teamId,
            teamName: session.teamName,
            ...(since ? { since } : {}),
          },
        }),
        TEAM_JOBS_TIMEOUT_MS
      );

      if (fnError) {
        throw new Error('Failed to fetch jobs');
      }

      if (!data?.success) {
        throw new Error(data?.error || 'Failed to fetch jobs');
      }

      if (data.teamName && data.teamName !== session.teamName) {
        persistSession({
          ...session,
          teamName: data.teamName,
        });
      }

      return {
        jobs: data.jobs as any[],
        serverTime: (data.serverTime as string | undefined) || undefined,
      };
    },
    [session, persistSession]
  );

  // Function to update job through edge function
  const updateTeamJob = useCallback(async (
    jobId: string, 
    updates: { 
      status?: string; 
      progress?: number; 
      notes?: string; 
      photos?: string[]; 
      videos?: string[]; 
      documents?: { name: string; url: string; type: string }[];
      workItemUpdates?: Record<string, { isConfirmed?: boolean; hasModification?: boolean; variation?: string }>;
      isOngoing?: boolean;
      ongoingReason?: string;
      isCompletion?: boolean;
    }
  ) => {
    if (!session) {
      throw new Error('Not authenticated');
    }

    const { data, error: fnError } = await supabase.functions.invoke('update-team-job', {
      body: {
        teamId: session.teamId,
        teamName: session.teamName,
        languagePreference: session.languagePreference || 'en',
        jobId,
        updates,
      },
    });

    if (fnError) {
      throw new Error(fnError.message || 'Failed to update job');
    }

    if (!data?.success) {
      throw new Error(data?.error || 'Failed to update job');
    }

    if (data.teamName && data.teamName !== session.teamName) {
      persistSession({
        ...session,
        teamName: data.teamName,
      });
    }

    return true;
  }, [session, persistSession]);

  // Function to update language preference
  const updateLanguagePreference = useCallback(async (languagePreference: string): Promise<boolean> => {
    if (!session) {
      throw new Error('Not authenticated');
    }

    const { data, error: fnError } = await supabase.functions.invoke('update-team-language', {
      body: {
        teamId: session.teamId,
        languagePreference,
      },
    });

    if (fnError || !data?.success) {
      throw new Error('Failed to update language preference');
    }

    // Update local session
    const updatedSession = { ...session, languagePreference };
    persistSession(updatedSession);

    return true;
  }, [session, persistSession]);

  // Function to remove a job from team's list (unassign team from job)
  const removeJobFromTeam = useCallback(async (jobId: string): Promise<boolean> => {
    if (!session) {
      throw new Error('Not authenticated');
    }

    const { data, error: fnError } = await supabase.functions.invoke('remove-team-job', {
      body: {
        teamId: session.teamId,
        teamName: session.teamName,
        jobId,
      },
    });

    if (fnError) {
      throw new Error('Failed to remove job from team');
    }

    if (!data?.success) {
      throw new Error(data?.error || 'Failed to remove job from team');
    }

    return true;
  }, [session]);

  return {
    session,
    isLoading,
    error,
    isAuthenticated: !!session,
    login,
    logout,
    fetchTeamJobs,
    updateTeamJob,
    updateLanguagePreference,
    removeJobFromTeam,
  };
};
