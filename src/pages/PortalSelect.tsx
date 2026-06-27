import { useLocation, useNavigate } from 'react-router-dom';
import { Shield, HardHat, ArrowRight } from 'lucide-react';
import allsaintsLogo from '@/assets/allsaints-logo.png';

export default function PortalSelect() {
  const navigate = useNavigate();
  const location = useLocation();
  const redirect = new URLSearchParams(location.search).get('redirect');
  const genieRoute = redirect ? `/admin?redirect=${encodeURIComponent(redirect)}` : '/admin';

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

        <p className="text-xs text-white/30 text-center mt-8">
          Need progressor access? <button onClick={() => navigate('/progressor')} className="underline hover:text-white/60">Sign in here</button>
        </p>
      </div>
    </div>
  );
}
