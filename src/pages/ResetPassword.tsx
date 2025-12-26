import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { usePasswordBreachCheck } from '@/hooks/usePasswordBreachCheck';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { PasswordStrengthMeter } from '@/components/PasswordStrengthMeter';
import { Loader2, AlertCircle, ShieldAlert, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { z } from 'zod';
import { toast } from 'sonner';

const passwordSchema = z.string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number');

export default function ResetPassword() {
  const navigate = useNavigate();
  const { checkPassword, isChecking } = usePasswordBreachCheck();
  
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [breachWarning, setBreachWarning] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isValidSession, setIsValidSession] = useState<boolean | null>(null);

  useEffect(() => {
    // Check if user has a valid recovery session
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      // Check URL for recovery token
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      const accessToken = hashParams.get('access_token');
      const type = hashParams.get('type');
      
      if (type === 'recovery' && accessToken) {
        // Set the session from the recovery token
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: hashParams.get('refresh_token') || '',
        });
        
        if (error) {
          console.error('Error setting session:', error);
          setIsValidSession(false);
        } else {
          setIsValidSession(true);
        }
      } else if (session) {
        setIsValidSession(true);
      } else {
        setIsValidSession(false);
      }
    };

    checkSession();
  }, []);

  const validateForm = (): boolean => {
    setValidationError(null);
    setBreachWarning(null);

    try {
      passwordSchema.parse(password);
    } catch (e) {
      if (e instanceof z.ZodError) {
        setValidationError(e.errors[0].message);
        return false;
      }
    }

    if (password !== confirmPassword) {
      setValidationError('Passwords do not match');
      return false;
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsSubmitting(true);
    setBreachWarning(null);

    // Check if password has been breached
    const breachResult = await checkPassword(password);
    
    if (breachResult.breached) {
      setBreachWarning(breachResult.message || 'This password has been found in data breaches. Please choose a different password.');
      setIsSubmitting(false);
      return;
    }

    // Update the password
    const { error } = await supabase.auth.updateUser({ password });
    setIsSubmitting(false);

    if (error) {
      setValidationError(error.message);
    } else {
      setIsSuccess(true);
      toast.success('Password updated successfully!');
      
      // Redirect after a short delay
      setTimeout(() => {
        navigate('/admin', { replace: true });
      }, 2000);
    }
  };

  if (isValidSession === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isValidSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-destructive">Invalid or Expired Link</CardTitle>
            <CardDescription>
              This password reset link is invalid or has expired. Please request a new password reset.
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Button onClick={() => navigate('/admin')} className="w-full">
              Go to Sign In
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  if (isSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-4">
              <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <CardTitle className="text-green-600 dark:text-green-400">Password Updated!</CardTitle>
            <CardDescription>
              Your password has been successfully updated. Redirecting you to sign in...
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Set New Password</CardTitle>
          <CardDescription>
            Enter your new password below. Make sure it's strong and unique.
          </CardDescription>
        </CardHeader>

        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {validationError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{validationError}</AlertDescription>
              </Alert>
            )}

            {breachWarning && (
              <Alert variant="destructive" className="border-orange-500 bg-orange-50 dark:bg-orange-950/20">
                <ShieldAlert className="h-4 w-4 text-orange-600" />
                <AlertDescription className="text-orange-800 dark:text-orange-200">
                  <strong>Password Security Warning:</strong> {breachWarning}
                  <p className="mt-2 text-sm">
                    This password was found in known data breaches. Using it puts your account at risk.
                    Please choose a unique password that you haven't used elsewhere.
                  </p>
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="new-password">New Password</Label>
              <Input
                id="new-password"
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setBreachWarning(null);
                }}
                disabled={isSubmitting || isChecking}
                autoComplete="new-password"
                placeholder="Enter new password"
              />
            </div>

            <PasswordStrengthMeter password={password} />

            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm New Password</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={isSubmitting || isChecking}
                autoComplete="new-password"
                placeholder="Confirm new password"
              />
            </div>
          </CardContent>

          <CardFooter>
            <Button type="submit" className="w-full" disabled={isSubmitting || isChecking}>
              {isSubmitting || isChecking ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {isChecking ? 'Checking password security...' : 'Updating password...'}
                </>
              ) : (
                <>
                  <ShieldCheck className="mr-2 h-4 w-4" />
                  Set New Password
                </>
              )}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
