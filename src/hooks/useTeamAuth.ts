import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface TeamSession {
  teamId: string;
  teamName: string;
  accessCode: string;
  authenticatedAt: string;
  rememberMe?: boolean;
}

const SESSION_KEY = 'team_portal_session';
const SESSION_DURATION_STANDARD = 24; // hours
const SESSION_DURATION_EXTENDED = 24 * 30; // 30 days

export const useTeamAuth = () => {
  const [session, setSession] = useState<TeamSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load session from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(SESSION_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        const authTime = new Date(parsed.authenticatedAt);
        const now = new Date();
        const hoursDiff = (now.getTime() - authTime.getTime()) / (1000 * 60 * 60);
        const maxDuration = parsed.rememberMe ? SESSION_DURATION_EXTENDED : SESSION_DURATION_STANDARD;
        
        if (hoursDiff < maxDuration) {
          setSession(parsed);
        } else {
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
      const { data, error: queryError } = await supabase
        .from('team_access_codes')
        .select('*')
        .eq('access_code', accessCode.toUpperCase().trim())
        .eq('is_active', true)
        .single();

      if (queryError || !data) {
        setError('Invalid access code. Please try again.');
        setIsLoading(false);
        return false;
      }

      const newSession: TeamSession = {
        teamId: data.team_id,
        teamName: data.team_name,
        accessCode: data.access_code,
        authenticatedAt: new Date().toISOString(),
        rememberMe,
      };

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

  return {
    session,
    isLoading,
    error,
    isAuthenticated: !!session,
    login,
    logout,
  };
};
