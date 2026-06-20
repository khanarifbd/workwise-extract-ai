import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Loader2, ArrowRight, Shield, ArrowLeft } from 'lucide-react';
import allsaintsLogo from '@/assets/allsaints-logo.png';

interface TeamLoginFormProps {
  onLogin: (accessCode: string, rememberMe: boolean) => Promise<boolean>;
  error: string | null;
}

export const TeamLoginForm = ({ onLogin, error }: TeamLoginFormProps) => {
  const [accessCode, setAccessCode] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessCode.trim()) return;

    setIsLoading(true);
    await onLogin(accessCode, rememberMe);
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Full-bleed branded header */}
      <div className="relative bg-gradient-to-br from-[hsl(220,25%,10%)] to-[hsl(220,25%,18%)] pt-16 pb-12 px-6 text-center overflow-hidden">
        <Link to="/welcome" className="absolute top-4 left-4 z-20 inline-flex items-center gap-1 text-xs text-white/60 hover:text-white transition-colors">
          <ArrowLeft className="h-3.5 w-3.5" /> Switch portal
        </Link>
        {/* Subtle pattern overlay */}
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
          backgroundSize: '24px 24px'
        }} />
        <div className="relative z-10">
          <div className="mx-auto mb-5 w-28 h-28 rounded-2xl bg-white/10 backdrop-blur-sm flex items-center justify-center p-3 shadow-2xl border border-white/10">
            <img src={allsaintsLogo} alt="AllSaints" className="w-full h-auto object-contain" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Team Portal</h1>
          <p className="text-sm text-white/60 mt-1">AllSaints Property Services</p>
        </div>
      </div>

      {/* Login form card - overlapping header */}
      <div className="flex-1 px-5 -mt-6 relative z-10">
        <div className="bg-card rounded-2xl shadow-xl border border-border/50 p-6 max-w-md mx-auto">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
                Access Code
              </label>
              <Input
                type="text"
                placeholder="Enter your code"
                value={accessCode}
                onChange={(e) => setAccessCode(e.target.value.toUpperCase())}
                className="text-center text-xl tracking-[0.3em] uppercase font-mono h-14 bg-muted/50 border-2 border-border focus:border-primary rounded-xl"
                maxLength={8}
                autoComplete="off"
                autoFocus
              />
            </div>

            <div className="flex items-center justify-between py-1">
              <label
                htmlFor="remember-v2"
                className="text-sm text-muted-foreground cursor-pointer select-none"
              >
                Remember me (30 days)
              </label>
              <Switch
                id="remember-v2"
                checked={rememberMe}
                onCheckedChange={setRememberMe}
              />
            </div>
            
            {error && (
              <div className="text-sm text-destructive text-center bg-destructive/10 p-3 rounded-xl border border-destructive/20">
                {error}
              </div>
            )}

            <Button 
              type="submit" 
              className="w-full h-14 text-base font-semibold rounded-xl gap-2"
              disabled={isLoading || !accessCode.trim()}
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Authenticating...
                </>
              ) : (
                <>
                  GO TO MY JOBS
                  <ArrowRight className="h-5 w-5" />
                </>
              )}
            </Button>
          </form>

          <div className="flex items-center justify-center gap-1.5 mt-5 text-xs text-muted-foreground/60">
            <Shield className="h-3 w-3" />
            <span>Secure team access</span>
          </div>
        </div>

        <p className="text-xs text-muted-foreground text-center mt-6 pb-8">
          Contact your administrator if you don't have an access code
        </p>
      </div>
    </div>
  );
};
