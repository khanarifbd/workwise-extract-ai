import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { usePasswordBreachCheck } from '@/hooks/usePasswordBreachCheck';
import { PasswordStrengthMeter } from '@/components/PasswordStrengthMeter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, AlertCircle, ArrowLeft, ShieldAlert, ShieldCheck } from 'lucide-react';
import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const emailSchema = z.string().email('Please enter a valid email address');
const passwordSchema = z.string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number');

export default function AdminAuth() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, isAdmin, isViewer, hasAccess, isLoading, isCheckingRoles, error, signIn, signUp, clearError } = useAdminAuth();
  const { checkPassword, isChecking: isCheckingBreach } = usePasswordBreachCheck();
  const passwordInputRef = useRef<HTMLInputElement>(null);
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [breachWarning, setBreachWarning] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [signUpSuccess, setSignUpSuccess] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmailSent, setResetEmailSent] = useState(false);
  const [failedSignInCount, setFailedSignInCount] = useState(0);

  const getRedirectRoute = () => {
    const redirect = new URLSearchParams(location.search).get('redirect');
    if (!redirect || !redirect.startsWith('/') || redirect.startsWith('//')) return '/';
    if (redirect.startsWith('/admin') || redirect.startsWith('/welcome')) return '/';
    return redirect;
  };

  // Redirect if already authenticated with access
  useEffect(() => {
    if (!isLoading && isAuthenticated && hasAccess) {
      navigate(getRedirectRoute(), { replace: true });
    }
  }, [isAuthenticated, hasAccess, isLoading, navigate, location.search]);

  const validateForm = (isSignUp: boolean): boolean => {
    setValidationError(null);
    setBreachWarning(null);
    clearError();

    try {
      emailSchema.parse(email);
    } catch (e) {
      if (e instanceof z.ZodError) {
        setValidationError(e.errors[0].message);
        return false;
      }
    }

    try {
      passwordSchema.parse(password);
    } catch (e) {
      if (e instanceof z.ZodError) {
        setValidationError(e.errors[0].message);
        return false;
      }
    }

    if (isSignUp && password !== confirmPassword) {
      setValidationError('Passwords do not match');
      return false;
    }

    return true;
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm(false)) return;

    const latestPassword = passwordInputRef.current?.value ?? password;

    setIsSubmitting(true);
    const { error } = await signIn(email, latestPassword);
    setIsSubmitting(false);

    if (error) {
      setFailedSignInCount((count) => count + 1);
      setPassword('');
      requestAnimationFrame(() => passwordInputRef.current?.focus());
    } else {
      setFailedSignInCount(0);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm(true)) return;

    setIsSubmitting(true);
    setBreachWarning(null);

    // Check if password has been breached
    const breachResult = await checkPassword(password);
    
    if (breachResult.breached) {
      setBreachWarning(breachResult.message || 'This password has been found in data breaches. Please choose a different password.');
      setIsSubmitting(false);
      return;
    }

    const { error } = await signUp(email, password);
    setIsSubmitting(false);

    if (!error) {
      setSignUpSuccess(true);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    try {
      emailSchema.parse(email);
    } catch (e) {
      if (e instanceof z.ZodError) {
        setValidationError(e.errors[0].message);
        return;
      }
    }

    setIsSubmitting(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/#/reset-password`,
    });
    setIsSubmitting(false);

    if (error) {
      setValidationError(error.message);
    } else {
      setResetEmailSent(true);
      toast.success('Password reset email sent!');
    }
  };

  if (isLoading || isCheckingRoles) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Show message if authenticated but no access
  if (isAuthenticated && !hasAccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-destructive">Access Denied</CardTitle>
            <CardDescription>
              Your account does not have administrator, viewer, or tester privileges. Please contact an existing admin to grant you access.
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Button variant="outline" onClick={() => navigate('/')} className="w-full">
              Go Back
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  // Forgot Password View
  if (showForgotPassword) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-md">
          <button
            onClick={() => {
              setShowForgotPassword(false);
              setResetEmailSent(false);
              setValidationError(null);
            }}
            className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Sign In
          </button>

          <Card>
            <CardHeader className="text-center">
              <CardTitle className="text-2xl">Reset Password</CardTitle>
              <CardDescription>
                Enter your email to receive a password reset link
              </CardDescription>
            </CardHeader>

            {resetEmailSent ? (
              <CardContent className="pt-4">
                <Alert>
                  <AlertDescription>
                    Password reset email sent to <strong>{email}</strong>. Please check your inbox and follow the link to reset your password.
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
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={isSubmitting}
                      autoComplete="email"
                    />
                  </div>
                </CardContent>

                <CardFooter>
                  <Button type="submit" className="w-full" disabled={isSubmitting}>
                    {isSubmitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      'Send Reset Link'
                    )}
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
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Admin Portal</CardTitle>
            <CardDescription>
              Sign in to manage jobs, teams, and settings
            </CardDescription>
          </CardHeader>

          <Tabs defaultValue="signin" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mx-4" style={{ width: 'calc(100% - 2rem)' }}>
              <TabsTrigger value="signin">Sign In</TabsTrigger>
              <TabsTrigger value="signup">Sign Up</TabsTrigger>
            </TabsList>

            <TabsContent value="signin">
              <form onSubmit={handleSignIn}>
                <CardContent className="space-y-4 pt-4">
                  {(error || validationError) && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        {validationError || error}
                        {error && failedSignInCount > 0 && !validationError && (
                          <span className="mt-2 block text-sm">
                            I have cleared the password box. Type the password manually again so the browser cannot reuse a saved value.
                          </span>
                        )}
                      </AlertDescription>
                    </Alert>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="signin-email">Email</Label>
                    <Input
                      id="signin-email"
                      type="email"
                      placeholder="admin@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={isSubmitting}
                      autoComplete="email"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
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
                      ref={passwordInputRef}
                      type="password"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (error) clearError();
                      }}
                      disabled={isSubmitting}
                      autoComplete="current-password"
                      data-1p-ignore="true"
                      data-lpignore="true"
                    />
                  </div>
                </CardContent>

                <CardFooter>
                  <Button type="submit" className="w-full" disabled={isSubmitting}>
                    {isSubmitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Signing in...
                      </>
                    ) : (
                      'Sign In'
                    )}
                  </Button>
                </CardFooter>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              {signUpSuccess ? (
                <CardContent className="pt-4">
                  <Alert>
                    <AlertDescription>
                      Account created successfully! Please check your email to confirm your account, then sign in.
                      <br /><br />
                      <strong>Note:</strong> You'll need an existing admin to grant you admin, viewer, or tester privileges before you can access the Genie portal.
                    </AlertDescription>
                  </Alert>
                </CardContent>
              ) : (
                <form onSubmit={handleSignUp}>
                  <CardContent className="space-y-4 pt-4">
                    {(error || validationError) && (
                      <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>{validationError || error}</AlertDescription>
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
                      <Label htmlFor="signup-email">Email</Label>
                      <Input
                        id="signup-email"
                        type="email"
                        placeholder="admin@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        disabled={isSubmitting}
                        autoComplete="email"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="signup-password">Password</Label>
                      <Input
                        id="signup-password"
                        type="password"
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value);
                          setBreachWarning(null);
                        }}
                        disabled={isSubmitting || isCheckingBreach}
                        autoComplete="new-password"
                      />
                    </div>

                    <PasswordStrengthMeter password={password} />

                    <div className="space-y-2">
                      <Label htmlFor="signup-confirm">Confirm Password</Label>
                      <Input
                        id="signup-confirm"
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        disabled={isSubmitting || isCheckingBreach}
                        autoComplete="new-password"
                      />
                    </div>
                  </CardContent>

                  <CardFooter>
                    <Button type="submit" className="w-full" disabled={isSubmitting || isCheckingBreach}>
                      {isSubmitting || isCheckingBreach ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          {isCheckingBreach ? 'Checking password security...' : 'Creating account...'}
                        </>
                      ) : (
                        <>
                          <ShieldCheck className="mr-2 h-4 w-4" />
                          Create Secure Account
                        </>
                      )}
                    </Button>
                  </CardFooter>
                </form>
              )}
            </TabsContent>
          </Tabs>
        </Card>
      </div>
    </div>
  );
}
