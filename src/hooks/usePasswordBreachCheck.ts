import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface BreachCheckResult {
  breached: boolean;
  count?: number;
  message?: string;
  error?: string;
}

export const usePasswordBreachCheck = () => {
  const [isChecking, setIsChecking] = useState(false);

  const checkPassword = useCallback(async (password: string): Promise<BreachCheckResult> => {
    setIsChecking(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('check-password-breach', {
        body: { password },
      });

      if (error) {
        console.error('Error checking password breach:', error);
        // Fail open - don't block signup if service is unavailable
        return { breached: false, error: 'Unable to verify password security' };
      }

      return data as BreachCheckResult;
    } catch (err) {
      console.error('Password breach check failed:', err);
      // Fail open
      return { breached: false, error: 'Unable to verify password security' };
    } finally {
      setIsChecking(false);
    }
  }, []);

  return {
    checkPassword,
    isChecking,
  };
};
