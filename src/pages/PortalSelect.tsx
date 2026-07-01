import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Shield, HardHat, ArrowRight, KeyRound, Loader2, Eye } from 'lucide-react';
import allsaintsLogo from '@/assets/allsaints-logo.png';
import { supabase } from '@/integrations/supabase/client';

export default function PortalSelect() {
  const navigate = useNavigate();
  const location = useLocation();
  const redirect = new URLSearchParams(location.search).get('redirect');
  const genieRoute = redirect ? `/admin?redirect=${encodeURIComponent(redirect)}` : '/admin';

  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleTesterLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const { data, error: invokeErr } = await supabase.functions.invoke('tester-login', {
        body: { code: code.trim() },
      });
      if (invokeErr || !data?.session?.access_token || !data?.session?.refresh_token) {
        setError(data?.error || 'Invalid access code.');
        setSubmitting(false);
        return;
      }
      const { error: signInErr } = await supabase.auth.setSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      });
      if (signInErr) {
        setError('Could not start your preview session. Please try again.');
        setSubmitting(false);
        return;
      }
      const { data: sessionCheck } = await supabase.auth.getSession();
      if (!sessionCheck.session) {
        setError('Could not confirm your preview session. Please try again.');
        setSubmitting(false);
        return;
      }
      navigate(redirect || '/', { replace: true });
    } catch (err) {
      console.error(err);
      setError('Something went wrong. Please try again.');
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[hsl(220,25%,8%)] via-[hsl(220,25%,12%)] to-[hsl(220,25%,16%)] flex flex-col items-center justify-center px-5 py-10">
      <div className="w-full max-w-3xl">
        {/* Branded header */}
        <div className="text-center mb-10">
          <div className="mx-auto mb-5 w-24 h-24 rounded-2xl bg-white/10 backdrop-blur-sm flex items-center justify-center p-3 shadow-2xl border border-white/10">
            <img src={allsaintsLogo} alt="AllSaints" className="w-full h-auto object-contain" />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Welcome</h1>
          <p className="text-sm text-white/60 mt-1">AllSaints Property Services</p>
          <p className="text-xs text-white/40 mt-3 uppercase tracking-wider">Choose how you want to sign in</p>
        </div>

        {/* Portal cards */}
        <div className="grid sm:grid-cols-2 gap-4">
          {/* Genie / Admin */}
          <button
            type="button"
            onClick={() => navigate(genieRoute)}
            className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-6 text-left transition-all hover:bg-white/10 hover:border-white/20 hover:-translate-y-0.5"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center">
                <Shield className="h-6 w-6 text-primary" />
              </div>
              <ArrowRight className="h-5 w-5 text-white/40 group-hover:text-white group-hover:translate-x-1 transition-all" />
            </div>
            <h2 className="text-xl font-semibold text-white mb-1">Genie</h2>
            <p className="text-sm text-white/60 mb-3">Admin dashboard, scheduling, reports and full job control.</p>
            <p className="text-xs text-white/40 uppercase tracking-wider">For office staff & managers</p>
          </button>

          {/* Team Portal */}
          <button
            type="button"
            onClick={() => navigate('/team')}
            className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-6 text-left transition-all hover:bg-white/10 hover:border-white/20 hover:-translate-y-0.5"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center">
                <HardHat className="h-6 w-6 text-amber-400" />
              </div>
              <ArrowRight className="h-5 w-5 text-white/40 group-hover:text-white group-hover:translate-x-1 transition-all" />
            </div>
            <h2 className="text-xl font-semibold text-white mb-1">Team Portal</h2>
            <p className="text-sm text-white/60 mb-3">View your assigned jobs, upload photos and sign off works.</p>
            <p className="text-xs text-white/40 uppercase tracking-wider">For field teams & trades</p>
          </button>
        </div>

        {/* Tester preview access */}
        <div className="mt-6 rounded-2xl border border-emerald-400/20 bg-emerald-500/5 backdrop-blur-sm p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center">
              <Eye className="h-4 w-4 text-emerald-300" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Code Preview access</p>
            </div>
          </div>
          <form onSubmit={handleTesterLogin} className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
              <input
                type="text"
                placeholder="Enter access code"
                value={code}
                onChange={(e) => { setCode(e.target.value); setError(null); }}
                disabled={submitting}
                autoComplete="off"
                spellCheck={false}
                className="w-full h-11 pl-10 pr-3 rounded-xl bg-white/10 border border-white/15 text-white placeholder:text-white/40 text-sm tracking-wider uppercase focus:outline-none focus:border-emerald-400/60 focus:bg-white/15 transition"
              />
            </div>
            <button
              type="submit"
              disabled={submitting || !code.trim()}
              className="h-11 px-5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-emerald-950 font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              {submitting ? 'Signing in…' : 'Enter preview'}
            </button>
          </form>
          {error && (
            <p className="mt-2 text-xs text-red-300">{error}</p>
          )}
        </div>

        <p className="text-xs text-white/30 text-center mt-8">
          Need progressor access? <button onClick={() => navigate('/progressor')} className="underline hover:text-white/60">Sign in here</button>
        </p>
      </div>
    </div>
  );
}
