import { FileDown, Moon, Sun, Settings, History, KeyRound, Users, LogOut, ChevronDown, CalendarDays, CheckCircle2, Briefcase, AlertTriangle, Mic, MessageSquare, StickyNote, MoreHorizontal, Package, Workflow, Sparkles, HardHat, Scan, Command as CommandIcon, ExternalLink, ShieldCheck } from 'lucide-react';
import { backfillTradeScans } from '@/lib/backfillTradeScans';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { TeamSettingsModal } from './TeamSettingsModal';
import { SubcontractorsModal } from './SubcontractorsModal';
import { NotificationHistoryModal } from './NotificationHistoryModal';
import { TeamAccessCodesModal } from './TeamAccessCodesModal';
import { TeamAvailabilityModal } from './TeamAvailabilityModal';
import { SignOffNotificationBell } from './SignOffNotificationBell';
import { GlobalSignOffHistoryModal } from './GlobalSignOffHistoryModal';
import { AdminTeamJobsModal } from './AdminTeamJobsModal';
import { SendTeamMessageModal } from './SendTeamMessageModal';
import { OpsNotesModal } from './OpsNotesModal';
import { MaterialsReportModal } from './MaterialsReportModal';
import { ADMIN_USERS } from './AdminNotesOrganiser';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { supabase } from '@/integrations/supabase/client';
import logo from '@/assets/logo.png';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface HeaderProps {
  onExport: () => void;
  jobCount: number;
  onJobClick?: (jobId: string) => void;
  onRefresh?: () => void;
  overdueCount?: number;
  onShowOverdue?: () => void;
  onShowAdminNotes?: (adminName: string) => void;
}

export const Header = ({ onExport, jobCount, onJobClick, onRefresh, overdueCount = 0, onShowOverdue, onShowAdminNotes }: HeaderProps) => {
  const [isDark, setIsDark] = useState(() => {
    const stored = localStorage.getItem('theme');
    if (stored) return stored === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });
  const [showTeamSettings, setShowTeamSettings] = useState(false);
  const [showNotificationHistory, setShowNotificationHistory] = useState(false);
  const [showAccessCodes, setShowAccessCodes] = useState(false);
  const [showAvailability, setShowAvailability] = useState(false);
  const [showSignOffHistory, setShowSignOffHistory] = useState(false);
  const [showTeamJobs, setShowTeamJobs] = useState(false);
  const [showMaterialsReport, setShowMaterialsReport] = useState(false);
  const [showOpsNotes, setShowOpsNotes] = useState(false);
  const [showSendMessage, setShowSendMessage] = useState(false);
  const [opsNotesCount, setOpsNotesCount] = useState(0);
  const [showSubcontractors, setShowSubcontractors] = useState(false);
  const { signOut, user } = useAdminAuth();
  const { toast } = useToast();
  const [isBackfilling, setIsBackfilling] = useState(false);

  const handleBackfillScans = async () => {
    if (isBackfilling) return;
    if (!confirm('Backfill trade scans on all parent jobs missing scan markers? This may take several minutes and use AI credits.')) return;
    setIsBackfilling(true);
    const t = toast({ title: 'Backfill started', description: 'Scanning parent jobs…' });
    try {
      const result = await backfillTradeScans((p) => {
        t.update({
          id: t.id,
          title: `Backfill ${p.processed}/${p.total}`,
          description: `Found: ${p.found.fans} fans, ${p.found.roofing} roof, ${p.found.flooring} floor, ${p.found.insulation} insul, ${p.found.fireDoors} doors. Fails: ${p.failures}`,
        });
      });
      toast({
        title: 'Backfill complete',
        description: `Scanned ${result.processed} parents. Found ${result.found.fans} fans, ${result.found.roofing} roof, ${result.found.flooring} floor, ${result.found.insulation} insul, ${result.found.fireDoors} doors. ${result.failures} failures.`,
      });
    } catch (e: any) {
      toast({ title: 'Backfill failed', description: e?.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setIsBackfilling(false);
    }
  };

  useEffect(() => {
    const fetchOpsNotesCount = async () => {
      const { count, error } = await supabase
        .from('ops_manager_notes')
        .select('*', { count: 'exact', head: true })
        .eq('is_resolved', false);
      if (!error && count !== null) setOpsNotesCount(count);
    };
    fetchOpsNotesCount();
    const channel = supabase
      .channel('ops-notes-count')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ops_manager_notes' }, () => fetchOpsNotesCount())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  useEffect(() => {
    if (isDark) { document.documentElement.classList.add('dark'); }
    else { document.documentElement.classList.remove('dark'); }
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  const handleLogout = async () => { await signOut(); };

  // Admin initials for compact buttons
  const adminColors: Record<string, { dot: string; text: string; hover: string }> = {
    Cecil: { dot: 'bg-amber-500', text: 'text-amber-600 dark:text-amber-400', hover: 'hover:bg-amber-500/10' },
    Suki: { dot: 'bg-blue-500', text: 'text-blue-600 dark:text-blue-400', hover: 'hover:bg-blue-500/10' },
    Helen: { dot: 'bg-rose-500', text: 'text-rose-600 dark:text-rose-400', hover: 'hover:bg-rose-500/10' },
  };

  return (
    <header className="sticky top-0 z-40 bg-background/90 backdrop-blur-xl border-b border-border">
      <div className="container mx-auto px-4 py-2.5">
        <div className="flex items-center justify-between">
          {/* ─── Logo ─── */}
          <div className="flex items-center gap-2.5">
            <img src={logo} alt="Allsaints Logo" className="w-8 h-8 object-contain" />
            <div className="leading-tight">
              <h1 className="text-sm font-bold text-foreground tracking-tight">JOB GENIE</h1>
              <p className="text-[10px] text-muted-foreground">{jobCount} jobs</p>
            </div>
          </div>

          {/* ─── Centre: Alert badges (Overdue) ─── */}
          <div className="flex items-center gap-1.5">
            {overdueCount > 0 && onShowOverdue && (
              <button
                onClick={onShowOverdue}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-orange-500/10 text-orange-600 dark:text-orange-400 text-xs font-semibold transition-colors hover:bg-orange-500/20"
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                Overdue
                <span className="bg-orange-500 text-white text-[10px] font-bold rounded-full h-4 min-w-4 flex items-center justify-center px-1">
                  {overdueCount > 99 ? '99+' : overdueCount}
                </span>
              </button>
            )}
          </div>

          {/* ─── Command Center launcher (opens as its own app) ─── */}
          <a
            href="#/command"
            target="_blank"
            rel="noopener noreferrer"
            title="Open Command Center in a new tab"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all bg-gradient-to-r from-orange-500 to-amber-500 text-white hover:from-orange-600 hover:to-amber-600 shadow-sm"
          >
            <CommandIcon className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Command Center</span>
            <ExternalLink className="w-3 h-3 opacity-80" />
          </a>

          {/* ─── Right: Compact action row ─── */}
          <div className="flex items-center gap-1">
            {/* Admin Notes: 3 compact pills */}
            {onShowAdminNotes && (
              <div className="flex items-center gap-0.5 mr-1">
                {ADMIN_USERS.map(admin => {
                  const c = adminColors[admin.name];
                  return (
                    <button
                      key={admin.name}
                      onClick={() => onShowAdminNotes(admin.name)}
                      title={`${admin.name}'s Notes`}
                      className={cn(
                        "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all",
                        c.text, c.hover,
                        "border border-transparent hover:border-border"
                      )}
                    >
                      <span className={cn("w-2 h-2 rounded-full flex-shrink-0", c.dot)} />
                      {admin.name}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Ops Notes */}
            <button
              onClick={() => setShowOpsNotes(true)}
              title="Operations Notes"
              className="relative flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <Mic className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Ops</span>
              {opsNotesCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 bg-orange-500 text-white text-[9px] font-bold rounded-full h-3.5 min-w-3.5 flex items-center justify-center px-0.5">
                  {opsNotesCount > 9 ? '9+' : opsNotesCount}
                </span>
              )}
            </button>





            {/* Sign-off bell */}
            <SignOffNotificationBell onJobClick={onJobClick} />

            {/* Teams dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                  <Users className="w-3.5 h-3.5" />
                  <span className="hidden md:inline">Teams</span>
                  <ChevronDown className="w-3 h-3 opacity-50" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem asChild>
                  <Link to="/team" className="flex items-center gap-2 cursor-pointer">
                    <Users className="w-4 h-4" />
                    Team Portal
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowTeamJobs(true)} className="flex items-center gap-2 cursor-pointer">
                  <Briefcase className="w-4 h-4" />
                  Manage Team Jobs
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setShowSendMessage(true)} className="flex items-center gap-2 cursor-pointer">
                  <MessageSquare className="w-4 h-4" />
                  Send Message
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowSignOffHistory(true)} className="flex items-center gap-2 cursor-pointer">
                  <CheckCircle2 className="w-4 h-4" />
                  Sign-Off History
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowNotificationHistory(true)} className="flex items-center gap-2 cursor-pointer">
                  <History className="w-4 h-4" />
                  Notifications
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setShowAvailability(true)} className="flex items-center gap-2 cursor-pointer">
                  <CalendarDays className="w-4 h-4" />
                  Availability
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowAccessCodes(true)} className="flex items-center gap-2 cursor-pointer">
                  <KeyRound className="w-4 h-4" />
                  Access Codes
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowSubcontractors(true)} className="flex items-center gap-2 cursor-pointer">
                  <HardHat className="w-4 h-4" />
                  Sub-Contractors
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowTeamSettings(true)} className="flex items-center gap-2 cursor-pointer">
                  <Settings className="w-4 h-4" />
                  Settings
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* More: Export, theme, logout */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                  <MoreHorizontal className="w-4 h-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                {user && (
                  <>
                    <div className="px-2 py-1.5 text-[10px] text-muted-foreground truncate">{user.email}</div>
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuItem onClick={onExport} className="flex items-center gap-2 cursor-pointer">
                  <FileDown className="w-4 h-4" />
                  Export
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/auto-assign" className="flex items-center gap-2 cursor-pointer font-semibold text-violet-600 dark:text-violet-400">
                    <Sparkles className="w-4 h-4" />
                    Auto-Assign (AI)
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowMaterialsReport(true)} className="flex items-center gap-2 cursor-pointer">
                  <Package className="w-4 h-4" />
                  Materials Report
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleBackfillScans} disabled={isBackfilling} className="flex items-center gap-2 cursor-pointer">
                  <Scan className="w-4 h-4" />
                  {isBackfilling ? 'Backfilling…' : 'Backfill Trade Scans'}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setIsDark(prev => !prev)} className="flex items-center gap-2 cursor-pointer">
                  {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                  {isDark ? 'Light Mode' : 'Dark Mode'}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="flex items-center gap-2 cursor-pointer text-destructive">
                  <LogOut className="w-4 h-4" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {showTeamSettings && <TeamSettingsModal onClose={() => setShowTeamSettings(false)} />}
      <SubcontractorsModal open={showSubcontractors} onOpenChange={setShowSubcontractors} />

      {showNotificationHistory && <NotificationHistoryModal onClose={() => setShowNotificationHistory(false)} />}
      {showAccessCodes && <TeamAccessCodesModal onClose={() => setShowAccessCodes(false)} />}
      <TeamAvailabilityModal open={showAvailability} onOpenChange={setShowAvailability} />
      <GlobalSignOffHistoryModal isOpen={showSignOffHistory} onClose={() => setShowSignOffHistory(false)} onJobClick={onJobClick} />
      <AdminTeamJobsModal isOpen={showTeamJobs} onClose={() => setShowTeamJobs(false)} onJobRemoved={onRefresh} />
      <OpsNotesModal isOpen={showOpsNotes} onClose={() => setShowOpsNotes(false)} onJobClick={onJobClick} />
      <MaterialsReportModal open={showMaterialsReport} onOpenChange={setShowMaterialsReport} />
      <SendTeamMessageModal isOpen={showSendMessage} onClose={() => setShowSendMessage(false)} />
    </header>
  );
};
