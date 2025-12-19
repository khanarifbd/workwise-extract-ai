import { FileDown, Plus, Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState, useEffect } from 'react';

interface HeaderProps {
  onExport: () => void;
  jobCount: number;
}

export const Header = ({ onExport, jobCount }: HeaderProps) => {
  const [isDark, setIsDark] = useState(false);

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
              <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shadow-glow">
                <span className="text-primary-foreground font-bold text-lg">A</span>
              </div>
              <div>
                <h1 className="text-xl font-bold text-foreground">Allsaints Jobs</h1>
                <p className="text-sm text-muted-foreground">
                  {jobCount} {jobCount === 1 ? 'job' : 'jobs'} in database
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={onExport}>
              <FileDown className="w-4 h-4 mr-2" />
              Export
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
    </header>
  );
};
