import { FileDown, Moon, Sun, Settings, History, KeyRound, QrCode, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { TeamSettingsModal } from './TeamSettingsModal';
import { NotificationHistoryModal } from './NotificationHistoryModal';
import { TeamAccessCodesModal } from './TeamAccessCodesModal';
import { TeamPortalQRModal } from './TeamPortalQRModal';
import logo from '@/assets/logo.png';

interface HeaderProps {
  onExport: () => void;
  jobCount: number;
}

export const Header = ({ onExport, jobCount }: HeaderProps) => {
  const [isDark, setIsDark] = useState(false);
  const [showTeamSettings, setShowTeamSettings] = useState(false);
  const [showNotificationHistory, setShowNotificationHistory] = useState(false);
  const [showAccessCodes, setShowAccessCodes] = useState(false);
  const [showQRCode, setShowQRCode] = useState(false);

  useEffect(() => {
    const isDarkMode = document.documentElement.classList.contains('dark');
    setIsDark(isDarkMode);
  }, []);

  const toggleTheme = () => {
    document.documentElement.classList.toggle('dark');
    setIsDark(!isDark);
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
            <a href="/team" target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="icon" className="md:w-auto md:px-4">
                <Users className="w-4 h-4 md:mr-2" />
                <span className="hidden md:inline">Team Portal</span>
              </Button>
            </a>
            <Button variant="outline" size="icon" className="md:w-auto md:px-4" onClick={() => setShowQRCode(true)}>
              <QrCode className="w-4 h-4 md:mr-2" />
              <span className="hidden md:inline">QR Code</span>
            </Button>
            <Button variant="outline" size="icon" className="md:w-auto md:px-4" onClick={() => setShowNotificationHistory(true)}>
              <History className="w-4 h-4 md:mr-2" />
              <span className="hidden md:inline">Notifications</span>
            </Button>
            <Button variant="outline" size="icon" className="md:w-auto md:px-4" onClick={() => setShowAccessCodes(true)}>
              <KeyRound className="w-4 h-4 md:mr-2" />
              <span className="hidden md:inline">Access Codes</span>
            </Button>
            <Button variant="outline" size="icon" className="md:w-auto md:px-4" onClick={() => setShowTeamSettings(true)}>
              <Settings className="w-4 h-4 md:mr-2" />
              <span className="hidden md:inline">Team Settings</span>
            </Button>
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

      {showQRCode && (
        <TeamPortalQRModal onClose={() => setShowQRCode(false)} />
      )}
    </header>
  );
};