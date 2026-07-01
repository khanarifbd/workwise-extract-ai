import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowLeft, Eye, KeyRound, Loader2, LockKeyhole, Mail, ShieldCheck } from 'lucide-react';
import { z } from 'zod';
import { toast } from 'sonner';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';

const emailSchema = z.string().trim().email('Please enter a valid email address');

export default function AdminAuth() {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    isAuthenticated,
    hasAccess,
    isLoading,
    isCheckingRoles,
    error,
    signIn,
    signInWithTesterCode,
    clearError,
  } = useAdminAuth();

  const [validationError, setValidationError] = useState<string | null>(null);
  const [testerError, setTesterError] = useState<string | null>(null);
  const [isPasswordSubmitting, setIsPasswordSubmitting] = useState(false);
  const [isCodeSubmitting, setIsCodeSubmitting] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetEmailSent, setResetEmailSent] = useState(false);

  const getRedirectRoute = () => {
    const redirect = new URLSearchParams(location.search).get('redirect');
    if (!redirect || !redirect.startsWith('/') || redirect.startsWith('//')) return '/';
    if (redirect.startsWith('/admin') || redirect.startsWith('/welcome')) return '/';
    return redirect;
  };

  useEffect(() => {
    if (!isLoading && isAuthenticated && hasAccess) {
      navigate(getRedirectRoute(), { replace: true });
    }
  }, [isAuthenticated, hasAccess, isLoading, navigate, location.search]);

  const clearFormErrors = () => {
    setValidationError(null);
    setTesterError(null);
    clearError();
  };

  const handlePasswordSignIn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    clearFormErrors();

    const form = e.currentTarget;
    const formData = new FormData(form);
    const email = String(formData.get('email') ?? '').trim();
    const password = String(formData.get('password') ?? '');

    const emailCheck = emailSchema.safeParse(email);
    if (!emailCheck.success) {
      setValidationError(emailCheck.error.errors[0]?.message ?? 'Please enter a valid email address');
      return;
    }

    if (!password) {
      setValidationError('Enter your password to sign in.');
      return;
    }

    setIsPasswordSubmitting(true);
    const result = await signIn(emailCheck.data, password);
    setIsPasswordSubmitting(false);

    if (!result.error) form.reset();
  };

  const handleCodeSignIn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    clearFormErrors();

    const form = e.currentTarget;
    const formData = new FormData(form);
    const code = String(formData.get('testerCode') ?? '').trim();

    if (!code) {
      setTesterError('Enter the Genie access code.');
      return;
    }

    setIsCodeSubmitting(true);
    const result = await signInWithTesterCode(code);
    setIsCodeSubmitting(false);

    if (!result.error) form.reset();
    if (result.error) setTesterError(result.error.message);
  };

  const handleForgotPassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setValidationError(null);
    clearError();

    const emailCheck = emailSchema.safeParse(resetEmail);
    if (!emailCheck.success) {
      setValidationError(emailCheck.error.errors[0]?.message ?? 'Please enter a valid email address');
      return;
    }

    setIsPasswordSubmitting(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(emailCheck.data, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setIsPasswordSubmitting(false);

    if (resetError) {
      setValidationError(resetError.message);
      return;
    }

    setResetEmailSent(true);
    toast.success('Password reset email sent!');
  };

  if (isLoading || isCheckingRoles) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isAuthenticated && !hasAccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-destructive">Access denied</CardTitle>
            <CardDescription>
              Your account does not have Genie access. Ask an admin to enable access for this account.
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Button variant="outline" onClick={() => navigate('/welcome')} className="w-full">
              Back to portal selector
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  if (showForgotPassword) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-md">
          <button
            type="button"
            onClick={() => {
              setShowForgotPassword(false);
              setResetEmailSent(false);
              setValidationError(null);
            }}
            className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Genie login
          </button>

          <Card>
            <CardHeader className="text-center">
              <CardTitle className="text-2xl">Reset password</CardTitle>
              <CardDescription>Enter your admin email to receive a reset link</CardDescription>
            </CardHeader>

            {resetEmailSent ? (
              <CardContent className="pt-4">
                <Alert>
                  <ShieldCheck className="h-4 w-4" />
                  <AlertDescription>
                    Password reset email sent to <strong>{resetEmail}</strong>. Check your inbox and follow the link.
                  </AlertDescription>
                </Alert>
              </CardContent>
            ) : (
              <form onSubmit={handleForgotPassword}>
                <CardContent className="space-y-4 pt-4">
                  {validationError && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>{validationError}</AlertDescription>
                    </Alert>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="reset-email">Email</Label>
                    <Input
                      id="reset-email"
                      type="email"
                      placeholder="admin@example.com"
                      value={resetEmail}
                      onChange={(event) => setResetEmail(event.target.value)}
                      disabled={isPasswordSubmitting}
                      autoComplete="email"
                    />
                  </div>
                </CardContent>
                <CardFooter>
                  <Button type="submit" className="w-full" disabled={isPasswordSubmitting}>
                    {isPasswordSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
                    Send reset link
                  </Button>
                </CardFooter>
              </form>
            )}
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <Link to="/welcome" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6">
          <ArrowLeft className="h-4 w-4" />
          Switch portal
        </Link>

        <Card>
          <CardHeader className="text-center space-y-3">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-primary/30 bg-primary/10">
              <LockKeyhole className="h-6 w-6 text-primary" />
            </div>
            <div>
              <CardTitle className="text-2xl">Genie Login</CardTitle>
              <CardDescription>Access Nav&apos;s Command Center and Genie admin tools</CardDescription>
            </div>
          </CardHeader>

          <CardContent className="space-y-6 pt-2">
            <form onSubmit={handleCodeSignIn} className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-primary/30 bg-primary/10">
                  <Eye className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">Genie preview access</p>
                  <p className="text-xs text-muted-foreground">Use the existing automated Genie access code.</p>
                </div>
              </div>

              {testerError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{testerError}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="tester-code">Access code</Label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="tester-code"
                    name="testerCode"
                    type="text"
                    className="pl-9 uppercase tracking-wider"
                    placeholder="Enter Genie access code"
                    disabled={isCodeSubmitting || isPasswordSubmitting}
                    autoComplete="off"
                    spellCheck={false}
                  />
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={isCodeSubmitting || isPasswordSubmitting}>
                {isCodeSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                Enter Genie
              </Button>
            </form>

            <div className="relative flex items-center justify-center">
              <div className="absolute inset-x-0 top-1/2 border-t border-border" />
              <span className="relative bg-card px-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">Admin password</span>
            </div>

            <form onSubmit={handlePasswordSignIn} className="space-y-4">
              {(error || validationError) && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{validationError || error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="signin-email">Email</Label>
                <Input
                  id="signin-email"
                  name="email"
                  type="email"
                  placeholder="admin@example.com"
                  disabled={isPasswordSubmitting || isCodeSubmitting}
                  autoComplete="username"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="signin-password">Password</Label>
                  <button
                    type="button"
                    onClick={() => setShowForgotPassword(true)}
                    className="text-sm text-primary hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>
                <Input
                  id="signin-password"
                  name="password"
                  type="password"
                  disabled={isPasswordSubmitting || isCodeSubmitting}
                  autoComplete="current-password"
                />
              </div>

              <Button type="submit" className="w-full" disabled={isPasswordSubmitting || isCodeSubmitting}>
                {isPasswordSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LockKeyhole className="mr-2 h-4 w-4" />}
                Sign in as admin
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}