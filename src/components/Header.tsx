import { FileDown, Moon, Sun, Settings, History, KeyRound, Users, LogOut, ChevronDown, CalendarDays, CheckCircle2, Briefcase, AlertTriangle, Mic, MessageSquare, Clock, StickyNote } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { TeamSettingsModal } from './TeamSettingsModal';
import { NotificationHistoryModal } from './NotificationHistoryModal';
import { TeamAccessCodesModal } from './TeamAccessCodesModal';
import { TeamAvailabilityModal } from './TeamAvailabilityModal';
import { SignOffNotificationBell } from './SignOffNotificationBell';
import { GlobalSignOffHistoryModal } from './GlobalSignOffHistoryModal';
import { AdminTeamJobsModal } from './AdminTeamJobsModal';
import { SendTeamMessageModal } from './SendTeamMessageModal';
import { OpsNotesModal } from './OpsNotesModal';
import { ADMIN_USERS } from './AdminNotesOrganiser';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { supabase } from '@/integrations/supabase/client';
import logo from '@/assets/logo.png';
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
  danniCount?: number;
  onShowDanni?: () => void;
  onShowAdminNotes?: (adminName: string) => void;
}

export const Header = ({ onExport, jobCount, onJobClick, onRefresh, overdueCount = 0, onShowOverdue, danniCount = 0, onShowDanni, onShowAdminNotes }: HeaderProps) => {
  const [isDark, setIsDark] = useState(() => {
    // Initialize from localStorage or system preference
    const stored = localStorage.getItem('theme');
    if (stored) {
      return stored === 'dark';
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });
  const [showTeamSettings, setShowTeamSettings] = useState(false);
  const [showNotificationHistory, setShowNotificationHistory] = useState(false);
  const [showAccessCodes, setShowAccessCodes] = useState(false);
  const [showAvailability, setShowAvailability] = useState(false);
  const [showSignOffHistory, setShowSignOffHistory] = useState(false);
  const [showTeamJobs, setShowTeamJobs] = useState(false);
  const [showOpsNotes, setShowOpsNotes] = useState(false);
  const [showSendMessage, setShowSendMessage] = useState(false);
  const [opsNotesCount, setOpsNotesCount] = useState(0);
  const { signOut, user } = useAdminAuth();

  // Fetch unresolved ops notes count
  useEffect(() => {
    const fetchOpsNotesCount = async () => {
      const { count, error } = await supabase
        .from('ops_manager_notes')
        .select('*', { count: 'exact', head: true })
        .eq('is_resolved', false);
      
      if (!error && count !== null) {
        setOpsNotesCount(count);
      }
    };

    fetchOpsNotesCount();

    // Subscribe to realtime updates
    const channel = supabase
      .channel('ops-notes-count')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ops_manager_notes' },
        () => fetchOpsNotesCount()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Apply theme on mount and when isDark changes
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  const toggleTheme = () => {
    setIsDark(prev => !prev);
  };

  const handleLogout = async () => {
    await signOut();
  };

  return (
    <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border">
      <div className="container mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <img src={logo} alt="Allsaints Logo" className="w-10 h-10 object-contain" />
              <div>
                <h1 className="text-xl font-bold text-foreground">Allsaints JOB GENIE</h1>
                <p className="text-sm text-muted-foreground">
                  {jobCount} {jobCount === 1 ? 'job' : 'jobs'} in database
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 md:gap-3">
            {user && (
              <span className="text-xs text-muted-foreground hidden lg:inline-block mr-2">
                {user.email}
              </span>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <Users className="w-4 h-4" />
                  <span className="hidden md:inline">TEAMS</span>
                  <ChevronDown className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
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
                  Send Message to Teams
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
                  Team Availability
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowAccessCodes(true)} className="flex items-center gap-2 cursor-pointer">
                  <KeyRound className="w-4 h-4" />
                  Access Codes
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowTeamSettings(true)} className="flex items-center gap-2 cursor-pointer">
                  <Settings className="w-4 h-4" />
                  Team Settings
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {danniCount > 0 && onShowDanni && (
              <Button
                variant="outline"
                size="icon"
                className="relative md:w-auto md:px-4 border-red-300 text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-950"
                onClick={onShowDanni}
                title={`${danniCount} job${danniCount !== 1 ? 's' : ''} awaiting sign-off`}
              >
                <Clock className="w-4 h-4 md:mr-2" />
                <span className="hidden md:inline">Danni</span>
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full h-4 min-w-4 flex items-center justify-center px-1">
                  {danniCount > 99 ? '99+' : danniCount}
                </span>
              </Button>
            )}
            {overdueCount > 0 && onShowOverdue && (
              <Button 
                variant="outline" 
                size="icon" 
                className="relative md:w-auto md:px-4 border-orange-300 text-orange-600 hover:bg-orange-50 dark:border-orange-700 dark:text-orange-400 dark:hover:bg-orange-950"
                onClick={onShowOverdue}
                title={`${overdueCount} overdue job${overdueCount !== 1 ? 's' : ''}`}
              >
                <AlertTriangle className="w-4 h-4 md:mr-2 animate-pulse" />
                <span className="hidden md:inline">Overdue</span>
                <span className="absolute -top-1 -right-1 bg-orange-500 text-white text-[10px] font-bold rounded-full h-4 min-w-4 flex items-center justify-center px-1">
                  {overdueCount > 99 ? '99+' : overdueCount}
                </span>
              </Button>
            )}
            {/* Individual Admin Notes Buttons */}
            {onShowAdminNotes && ADMIN_USERS.map(admin => (
              <Button
                key={admin.name}
                variant="outline"
                size="icon"
                className={`relative md:w-auto md:px-3 ${admin.headerBorder} ${admin.headerText} ${admin.headerHover}`}
                onClick={() => onShowAdminNotes(admin.name)}
                title={`${admin.name}'s Notes`}
              >
                <StickyNote className="w-4 h-4 md:mr-1.5" />
                <span className="hidden md:inline text-xs font-bold">{admin.name}</span>
              </Button>
            ))}
            {/* OP NOTES Button */}
            <Button 
              variant="outline" 
              size="icon" 
              className="relative md:w-auto md:px-4"
              onClick={() => setShowOpsNotes(true)}
              title="Operations Manager Notes"
            >
              <Mic className="w-4 h-4 md:mr-2" />
              <span className="hidden md:inline">OP NOTES</span>
              {opsNotesCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-orange-500 text-white text-[10px] font-bold rounded-full h-4 min-w-4 flex items-center justify-center px-1">
                  {opsNotesCount > 99 ? '99+' : opsNotesCount}
                </span>
              )}
            </Button>
            <SignOffNotificationBell onJobClick={onJobClick} />
            <Button variant="outline" size="icon" className="md:w-auto md:px-4" onClick={onExport}>
              <FileDown className="w-4 h-4 md:mr-2" />
              <span className="hidden md:inline">Export</span>
            </Button>
            <button
              onClick={toggleTheme}
              className="p-2 hover:bg-muted rounded-lg transition-colors"
            >
              {isDark ? (
                <Sun className="w-5 h-5" />
              ) : (
                <Moon className="w-5 h-5" />
              )}
            </button>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={handleLogout}
              className="text-muted-foreground hover:text-destructive"
              title="Sign out"
            >
              <LogOut className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </div>

      {showTeamSettings && (
        <TeamSettingsModal onClose={() => setShowTeamSettings(false)} />
      )}
      
      {showNotificationHistory && (
        <NotificationHistoryModal onClose={() => setShowNotificationHistory(false)} />
      )}

      {showAccessCodes && (
        <TeamAccessCodesModal onClose={() => setShowAccessCodes(false)} />
      )}

      <TeamAvailabilityModal 
        open={showAvailability} 
        onOpenChange={setShowAvailability} 
      />

      <GlobalSignOffHistoryModal
        isOpen={showSignOffHistory}
        onClose={() => setShowSignOffHistory(false)}
        onJobClick={onJobClick}
      />

      <AdminTeamJobsModal
        isOpen={showTeamJobs}
        onClose={() => setShowTeamJobs(false)}
        onJobRemoved={onRefresh}
      />

      <OpsNotesModal
        isOpen={showOpsNotes}
        onClose={() => setShowOpsNotes(false)}
        onJobClick={onJobClick}
      />

      <SendTeamMessageModal
        isOpen={showSendMessage}
        onClose={() => setShowSendMessage(false)}
      />
    </header>
  );
};
