import { useMemo } from 'react';
import { Job } from '@/types/job';
import { format, isToday, isTomorrow, isThisWeek, isThisMonth, parseISO, isValid, startOfDay } from 'date-fns';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Calendar, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BookedDateSidebarProps {
  jobs: Job[];
  selectedDate: string | null;
  onDateSelect: (dateKey: string | null) => void;
}

interface DateGroup {
  key: string;
  label: string;
  count: number;
  date: Date;
  isSpecial?: 'today' | 'tomorrow' | 'thisWeek';
}

export const BookedDateSidebar = ({ jobs, selectedDate, onDateSelect }: BookedDateSidebarProps) => {
  const dateGroups = useMemo(() => {
    const groups = new Map<string, { date: Date; count: number }>();
    
    jobs.forEach(job => {
      if (!job.bookedDate) return;
      
      const date = job.bookedDate instanceof Date ? job.bookedDate : parseISO(job.bookedDate as any);
      if (!isValid(date)) return;
      
      const dateKey = format(date, 'yyyy-MM-dd');
      const existing = groups.get(dateKey);
      
      if (existing) {
        existing.count++;
      } else {
        groups.set(dateKey, { date: startOfDay(date), count: 1 });
      }
    });

    // Convert to array and add labels
    const result: DateGroup[] = Array.from(groups.entries()).map(([key, { date, count }]) => {
      let label = format(date, 'EEE, dd MMM yyyy');
      let isSpecial: DateGroup['isSpecial'] = undefined;
      
      if (isToday(date)) {
        label = 'Today';
        isSpecial = 'today';
      } else if (isTomorrow(date)) {
        label = 'Tomorrow';
        isSpecial = 'tomorrow';
      } else if (isThisWeek(date)) {
        label = format(date, 'EEEE, dd MMM');
        isSpecial = 'thisWeek';
      }
      
      return { key, label, count, date, isSpecial };
    });

    // Sort by date
    result.sort((a, b) => a.date.getTime() - b.date.getTime());
    
    return result;
  }, [jobs]);

  const totalCount = jobs.filter(j => !!j.bookedDate).length;

  if (dateGroups.length === 0) {
    return (
      <div className="w-48 border-r border-border bg-muted/30 p-3">
        <div className="text-sm text-muted-foreground text-center py-4">
          No booked dates
        </div>
      </div>
    );
  }

  return (
    <div className="w-52 border-r border-border bg-muted/20 flex flex-col">
      <div className="p-3 border-b border-border">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Calendar className="w-4 h-4" />
          Booked Dates
        </h3>
        <p className="text-xs text-muted-foreground mt-1">{totalCount} jobs booked</p>
      </div>
      
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {/* All dates option */}
          <button
            onClick={() => onDateSelect(null)}
            className={cn(
              "w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center justify-between",
              selectedDate === null
                ? "bg-primary text-primary-foreground"
                : "hover:bg-muted"
            )}
          >
            <span className="font-medium">All Dates</span>
            <Badge variant={selectedDate === null ? "secondary" : "outline"} className="text-xs">
              {totalCount}
            </Badge>
          </button>
          
          <div className="h-px bg-border my-2" />
          
          {dateGroups.map((group) => (
            <button
              key={group.key}
              onClick={() => onDateSelect(group.key)}
              className={cn(
                "w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center justify-between group",
                selectedDate === group.key
                  ? "bg-amber-500 text-white"
                  : group.isSpecial === 'today'
                    ? "bg-green-100 dark:bg-green-900/30 hover:bg-green-200 dark:hover:bg-green-900/50"
                    : group.isSpecial === 'tomorrow'
                      ? "bg-blue-100 dark:bg-blue-900/30 hover:bg-blue-200 dark:hover:bg-blue-900/50"
                      : "hover:bg-muted"
              )}
            >
              <div className="flex items-center gap-2">
                <ChevronRight className={cn(
                  "w-3 h-3 transition-transform",
                  selectedDate === group.key && "rotate-90"
                )} />
                <span className={cn(
                  "truncate",
                  group.isSpecial === 'today' && selectedDate !== group.key && "font-semibold text-green-700 dark:text-green-400",
                  group.isSpecial === 'tomorrow' && selectedDate !== group.key && "font-medium text-blue-700 dark:text-blue-400"
                )}>
                  {group.label}
                </span>
              </div>
              <Badge 
                variant={selectedDate === group.key ? "secondary" : "outline"} 
                className={cn(
                  "text-xs",
                  selectedDate === group.key && "bg-white/20 text-white border-white/30"
                )}
              >
                {group.count}
              </Badge>
            </button>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
};
