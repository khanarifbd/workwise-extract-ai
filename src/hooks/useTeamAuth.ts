import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface TeamSession {
  teamId: string;
  teamName: string;
  validatedAt: string;
  expiresAt: string;
  languagePreference: string;
}

const SESSION_KEY = 'team_portal_session';

export const useTeamAuth = () => {
  const [session, setSession] = useState<TeamSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      };

      // Store session without access code (security improvement)
      localStorage.setItem(SESSION_KEY, JSON.stringify(newSession));
      setSession(newSession);
      setIsLoading(false);
      return true;
    } catch (err) {
      console.error('Login error:', err);
      setError('Failed to authenticate. Please try again.');
      setIsLoading(false);
      return false;
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(SESSION_KEY);
    setSession(null);
  }, []);

  // Function to fetch jobs through edge function
  const fetchTeamJobs = useCallback(async () => {
    if (!session) {
      throw new Error('Not authenticated');
    }

    const { data, error: fnError } = await supabase.functions.invoke('get-team-jobs', {
      body: { 
        teamId: session.teamId, 
        teamName: session.teamName 
      },
    });

    if (fnError) {
      throw new Error('Failed to fetch jobs');
    }

    if (!data?.success) {
      throw new Error(data?.error || 'Failed to fetch jobs');
    }

    return data.jobs;
  }, [session]);

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
      throw new Error('Failed to update job');
    }

    if (!data?.success) {
      throw new Error(data?.error || 'Failed to update job');
    }

    return true;
  }, [session]);

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
    localStorage.setItem(SESSION_KEY, JSON.stringify(updatedSession));
    setSession(updatedSession);

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
  };
};
