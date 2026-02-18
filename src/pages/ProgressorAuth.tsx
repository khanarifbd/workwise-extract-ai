import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProgressorAuth } from '@/hooks/useProgressorAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, AlertCircle, ClipboardList, ShieldCheck } from 'lucide-react';

export default function ProgressorAuth() {
  const navigate = useNavigate();
  const { isAuthenticated, hasAccess, isLoading, isCheckingRoles, error, signInWithCode, clearError } = useProgressorAuth();
  
  const [code, setCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isLoading && !isCheckingRoles && isAuthenticated && hasAccess) {
      navigate('/progressor', { replace: true });
    }
  }, [isAuthenticated, hasAccess, isLoading, isCheckingRoles, navigate]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    clearError();
    setIsSubmitting(true);
    await signInWithCode(code);
    setIsSubmitting(false);
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
            <CardTitle className="text-destructive">Access Denied</CardTitle>
            <CardDescription>
              Your account does not have Job Progressor privileges. Contact an admin to grant you access.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-4">
      <div className="w-full max-w-md">
        <Card className="shadow-xl border-0">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-3">
              <ClipboardList className="h-7 w-7 text-primary" />
            </div>
            <CardTitle className="text-2xl font-bold">Job Progressor</CardTitle>
            <CardDescription className="text-sm">
              Enter your access code to continue
            </CardDescription>
          </CardHeader>

          <form onSubmit={handleSignIn}>
            <CardContent className="space-y-4 pt-4">
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="code">Access Code</Label>
                <Input
                  id="code"
                  type="text"
                  placeholder="Enter your access code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  disabled={isSubmitting}
                  autoComplete="off"
                  className="text-center text-lg tracking-widest font-mono"
                />
              </div>
            </CardContent>

            <CardFooter>
              <Button type="submit" className="w-full" disabled={isSubmitting || !code.trim()}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  <>
                    <ShieldCheck className="mr-2 h-4 w-4" />
                    Sign In
                  </>
                )}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
