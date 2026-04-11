import { useMemo } from 'react';
import { format, parseISO, isValid } from 'date-fns';
import { Job } from '@/types/job';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { FolderOpen, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MonthlyFolderTabsProps {
  jobs: Job[];
  activeFolder: string | null;
  onFolderChange: (folder: string | null) => void;
}

interface MonthFolder {
  id: string;
  label: string;
  shortLabel: string;
  monthKey: string;
  jobCount: number;
  year: number;
  month: number;
}

export const MonthlyFolderTabs = ({ 
  jobs, 
  activeFolder, 
  onFolderChange 
}: MonthlyFolderTabsProps) => {
  
  // Generate folders from job dates
  const folders = useMemo(() => {
    const monthMap = new Map<string, Job[]>();
    
    jobs.forEach(job => {
      const date = job.dateIssued;
      if (!date || !isValid(date)) return;
      
      const monthKey = format(date, 'yyyy-MM');
      if (!monthMap.has(monthKey)) {
        monthMap.set(monthKey, []);
      }
      monthMap.get(monthKey)!.push(job);
    });
    
    // Convert to array and sort by date (newest first)
    const folderList: MonthFolder[] = Array.from(monthMap.entries())
      .map(([monthKey, jobs]) => {
        const [year, month] = monthKey.split('-').map(Number);
        const date = new Date(year, month - 1, 1);
        
        return {
          id: monthKey,
          label: format(date, 'MMMM yyyy'),
          shortLabel: format(date, 'MMM yy'),
          monthKey,
          jobCount: jobs.length,
          year,
          month,
        };
      })
      .sort((a, b) => {
        // Sort by year descending, then month descending
        if (a.year !== b.year) return b.year - a.year;
        return b.month - a.month;
      });
    
    return folderList;
  }, [jobs]);

  const totalJobs = jobs.length;

  // Current month key
  const currentMonthKey = format(new Date(), 'yyyy-MM');
  const currentMonthFolder = folders.find(f => f.id === currentMonthKey);
  const otherFolders = folders.filter(f => f.id !== currentMonthKey);
  const [showOlderMonths, setShowOlderMonths] = useState(false);

  return (
    <div className="bg-muted/30 rounded-lg p-2">
      <ScrollArea className="w-full">
        <div className="flex items-center gap-1.5 pb-1">
          {/* All Jobs Tab */}
          <Button
            variant={activeFolder === null ? 'default' : 'ghost'}
            size="sm"
            className={cn(
              "h-8 px-3 gap-1.5 flex-shrink-0 text-xs",
              activeFolder === null && "shadow-sm"
            )}
            onClick={() => onFolderChange(null)}
          >
            <FolderOpen className="w-3.5 h-3.5" />
            All Jobs
            <Badge 
              variant={activeFolder === null ? 'secondary' : 'outline'}
              className="ml-1 h-5 text-[10px] px-1.5"
            >
              {totalJobs}
            </Badge>
          </Button>
          
          {/* Divider */}
          <div className="h-6 w-px bg-border flex-shrink-0" />
          
          {/* Current month (always visible) */}
          {currentMonthFolder && (
            <Button
              key={currentMonthFolder.id}
              variant={activeFolder === currentMonthFolder.id ? 'default' : 'ghost'}
              size="sm"
              className={cn(
                "h-8 px-3 gap-1.5 flex-shrink-0 text-xs",
                activeFolder === currentMonthFolder.id && "shadow-sm"
              )}
              onClick={() => onFolderChange(currentMonthFolder.id)}
              title={currentMonthFolder.label}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{currentMonthFolder.label}</span>
              <span className="sm:hidden">{currentMonthFolder.shortLabel}</span>
              <Badge 
                variant={activeFolder === currentMonthFolder.id ? 'secondary' : 'outline'}
                className="ml-1 h-5 text-[10px] px-1.5"
              >
                {currentMonthFolder.jobCount}
              </Badge>
            </Button>
          )}

          {/* Toggle for older months */}
          {otherFolders.length > 0 && (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-xs text-muted-foreground gap-1"
                onClick={() => setShowOlderMonths(!showOlderMonths)}
              >
                {showOlderMonths ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                {showOlderMonths ? 'Hide' : `${otherFolders.length} more`}
              </Button>

              {showOlderMonths && otherFolders.map(folder => (
                <Button
                  key={folder.id}
                  variant={activeFolder === folder.id ? 'default' : 'ghost'}
                  size="sm"
                  className={cn(
                    "h-8 px-3 gap-1.5 flex-shrink-0 text-xs",
                    activeFolder === folder.id && "shadow-sm"
                  )}
                  onClick={() => onFolderChange(folder.id)}
                  title={folder.label}
                >
                  <Calendar className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{folder.label}</span>
                  <span className="sm:hidden">{folder.shortLabel}</span>
                  <Badge 
                    variant={activeFolder === folder.id ? 'secondary' : 'outline'}
                    className="ml-1 h-5 text-[10px] px-1.5"
                  >
                    {folder.jobCount}
                  </Badge>
                </Button>
              ))}
            </>
          )}
          
          {folders.length === 0 && (
            <p className="text-xs text-muted-foreground px-2">No jobs uploaded yet</p>
          )}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
};
