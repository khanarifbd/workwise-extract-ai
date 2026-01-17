import { FileDown, Moon, Sun, Settings, History, KeyRound, Users, LogOut, ChevronDown, CalendarDays, CheckCircle2, Briefcase } from 'lucide-react';
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
import { useAdminAuth } from '@/hooks/useAdminAuth';
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
}

export const Header = ({ onExport, jobCount, onJobClick, onRefresh }: HeaderProps) => {
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
  const { signOut, user } = useAdminAuth();

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
    </header>
  );
};
