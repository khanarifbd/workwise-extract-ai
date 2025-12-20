import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, KeyRound } from 'lucide-react';

interface TeamLoginFormProps {
  onLogin: (accessCode: string) => Promise<boolean>;
  error: string | null;
}

export const TeamLoginForm = ({ onLogin, error }: TeamLoginFormProps) => {
  const [accessCode, setAccessCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessCode.trim()) return;

    setIsLoading(true);
    await onLogin(accessCode);
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 to-secondary/5 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
            <KeyRound className="w-8 h-8 text-primary" />
          </div>
          <CardTitle className="text-2xl font-bold">Team Portal</CardTitle>
          <CardDescription>
            Enter your team access code to view and manage your assigned jobs
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Input
                type="text"
                placeholder="Enter access code"
                value={accessCode}
                onChange={(e) => setAccessCode(e.target.value.toUpperCase())}
                className="text-center text-lg tracking-widest uppercase font-mono h-12"
                maxLength={8}
                autoComplete="off"
                autoFocus
              />
            </div>
            
            {error && (
              <p className="text-sm text-destructive text-center bg-destructive/10 p-2 rounded-md">
                {error}
              </p>
            )}

            <Button 
              type="submit" 
              className="w-full h-12 text-lg"
              disabled={isLoading || !accessCode.trim()}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Authenticating...
                </>
              ) : (
                'Access Portal'
              )}
            </Button>
          </form>

          <p className="text-xs text-muted-foreground text-center mt-6">
            Contact your administrator if you don't have an access code
          </p>
        </CardContent>
      </Card>
    </div>
  );
};
