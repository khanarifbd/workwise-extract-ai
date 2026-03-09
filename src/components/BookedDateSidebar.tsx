import { useMemo, forwardRef, useState } from 'react';
import { Job } from '@/types/job';
import { format, isToday, isTomorrow, parseISO, isValid, startOfDay } from 'date-fns';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Calendar, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DailyBookingReportButton } from './DailyBookingReportButton';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

interface TradeBookingInfo {
  jobId: string;
  effectiveBookedDate: Date;
  totalTrades: number;
  completedTrades: number;
  pendingTrades: { trade: string; bookedDate: Date }[];
  isTradeBooked: true;
}

interface BookedDateSidebarProps {
  jobs: Job[];
  selectedDate: string | null;
  onDateSelect: (dateKey: string | null) => void;
  isFanCategory?: boolean;
  tradeBookings?: Map<string, TradeBookingInfo>;
}

interface DateGroup {
  key: string;
  label: string;
  count: number;
  date: Date;
  isSpecial?: 'today' | 'tomorrow';
}

interface MonthGroup {
  monthKey: string;
  monthLabel: string;
  dates: DateGroup[];
  totalCount: number;
  hasToday: boolean;
  hasTomorrow: boolean;
}

export const BookedDateSidebar = forwardRef<HTMLDivElement, BookedDateSidebarProps>(
  ({ jobs, selectedDate, onDateSelect, isFanCategory = false, tradeBookings = new Map() }, ref) => {
  
  // Track which months are expanded - current month expanded by default
  const currentMonthKey = format(new Date(), 'yyyy-MM');
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set([currentMonthKey]));

  const { monthGroups, totalCount } = useMemo(() => {
    const dateMap = new Map<string, { date: Date; count: number }>();
    
    // Count jobs with regular booked dates
    jobs.forEach(job => {
      if (!job.bookedDate) return;
      
      const date = job.bookedDate instanceof Date ? job.bookedDate : parseISO(job.bookedDate as any);
      if (!isValid(date)) return;
      
      const dateKey = format(date, 'yyyy-MM-dd');
      const existing = dateMap.get(dateKey);
      
      if (existing) {
        existing.count++;
      } else {
        dateMap.set(dateKey, { date: startOfDay(date), count: 1 });
      }
    });

    // Also count trade-booked jobs (jobs without bookedDate but with trade bookings)
    tradeBookings.forEach((info, jobId) => {
      // Only count if this job isn't already counted via its own bookedDate
      const job = jobs.find(j => j.id === jobId);
      if (job && !job.bookedDate) {
        const dateKey = format(info.effectiveBookedDate, 'yyyy-MM-dd');
        const existing = dateMap.get(dateKey);
        if (existing) {
          existing.count++;
        } else {
          dateMap.set(dateKey, { date: startOfDay(info.effectiveBookedDate), count: 1 });
        }
      }
    });

    // Convert to date groups with labels
    const allDates: DateGroup[] = Array.from(dateMap.entries()).map(([key, { date, count }]) => {
      let label = format(date, 'EEE dd');
      let isSpecial: DateGroup['isSpecial'] = undefined;
      
      if (isToday(date)) {
        label = 'Today';
        isSpecial = 'today';
      } else if (isTomorrow(date)) {
        label = 'Tomorrow';
        isSpecial = 'tomorrow';
      }
      
      return { key, label, count, date, isSpecial };
    });

    // Sort by date
    allDates.sort((a, b) => a.date.getTime() - b.date.getTime());

    // Group by month
    const monthMap = new Map<string, MonthGroup>();
    
    allDates.forEach(dateGroup => {
      const monthKey = format(dateGroup.date, 'yyyy-MM');
      const monthLabel = format(dateGroup.date, 'MMMM yyyy');
      
      if (!monthMap.has(monthKey)) {
        monthMap.set(monthKey, {
          monthKey,
          monthLabel,
          dates: [],
          totalCount: 0,
          hasToday: false,
          hasTomorrow: false,
        });
      }
      
      const month = monthMap.get(monthKey)!;
      month.dates.push(dateGroup);
      month.totalCount += dateGroup.count;
      if (dateGroup.isSpecial === 'today') month.hasToday = true;
      if (dateGroup.isSpecial === 'tomorrow') month.hasTomorrow = true;
    });

    // Convert to array and sort by date (earliest first)
    const sortedMonths = Array.from(monthMap.values()).sort((a, b) => {
      return a.dates[0].date.getTime() - b.dates[0].date.getTime();
    });

    return {
      monthGroups: sortedMonths,
      totalCount: jobs.filter(j => !!j.bookedDate).length,
    };
  }, [jobs]);

  const toggleMonth = (monthKey: string) => {
    setExpandedMonths(prev => {
      const next = new Set(prev);
      if (next.has(monthKey)) {
        next.delete(monthKey);
      } else {
        next.add(monthKey);
      }
      return next;
    });
  };

  if (monthGroups.length === 0) {
    return (
      <div ref={ref} className="w-48 border-r border-border bg-muted/30 p-3">
        <div className="text-sm text-muted-foreground text-center py-4">
          No booked dates
        </div>
      </div>
    );
  }

  return (
    <div ref={ref} className="w-48 border-r border-border bg-muted/20 flex flex-col">
      <div className="p-3 border-b border-border">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Calendar className="w-4 h-4" />
          Booked Dates
        </h3>
      </div>
      
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {/* All dates option */}
          <button
            onClick={() => onDateSelect(null)}
            className={cn(
              "w-full text-left px-2 py-1.5 rounded-md text-sm transition-colors flex items-center justify-between",
              selectedDate === null
                ? "bg-primary text-primary-foreground"
                : "hover:bg-muted"
            )}
          >
            <span className="font-medium">All Dates</span>
            <Badge variant={selectedDate === null ? "secondary" : "outline"} className="text-[10px] h-5 px-1.5">
              {totalCount}
            </Badge>
          </button>
          
          <div className="h-px bg-border my-2" />
          
          {/* Month groups */}
          {monthGroups.map((month) => (
            <Collapsible
              key={month.monthKey}
              open={expandedMonths.has(month.monthKey)}
              onOpenChange={() => toggleMonth(month.monthKey)}
            >
              <CollapsibleTrigger className="w-full">
                <div className={cn(
                  "flex items-center justify-between px-2 py-1.5 rounded-md text-sm hover:bg-muted transition-colors",
                  (month.hasToday || month.hasTomorrow) && "bg-muted/50"
                )}>
                  <div className="flex items-center gap-1.5">
                    <ChevronDown className={cn(
                      "w-3 h-3 transition-transform",
                      !expandedMonths.has(month.monthKey) && "-rotate-90"
                    )} />
                    <span className="font-medium text-xs">{month.monthLabel}</span>
                  </div>
                  <Badge variant="outline" className="text-[10px] h-4 px-1">
                    {month.totalCount}
                  </Badge>
                </div>
              </CollapsibleTrigger>
              
              <CollapsibleContent>
                <div className="ml-3 mt-1 space-y-0.5 border-l border-border pl-2">
                  {month.dates.map((group) => (
                    <button
                      key={group.key}
                      onClick={() => onDateSelect(group.key)}
                      className={cn(
                        "w-full text-left px-2 py-1 rounded text-xs transition-colors flex items-center justify-between",
                        selectedDate === group.key
                          ? "bg-amber-500 text-white"
                          : group.isSpecial === 'today'
                            ? "bg-green-100 dark:bg-green-900/30 hover:bg-green-200 dark:hover:bg-green-900/50 font-semibold text-green-700 dark:text-green-400"
                            : group.isSpecial === 'tomorrow'
                              ? "bg-blue-100 dark:bg-blue-900/30 hover:bg-blue-200 dark:hover:bg-blue-900/50 font-medium text-blue-700 dark:text-blue-400"
                              : "hover:bg-muted text-muted-foreground"
                      )}
                    >
                      <span className="truncate">{group.label}</span>
                      <Badge 
                        variant={selectedDate === group.key ? "secondary" : "outline"} 
                        className={cn(
                          "text-[10px] h-4 px-1",
                          selectedDate === group.key && "bg-white/20 text-white border-white/30"
                        )}
                      >
                        {group.count}
                      </Badge>
                    </button>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          ))}
          
          {/* Daily Report Button - only show when a specific date is selected */}
          {selectedDate && (
            <div className="mt-3 pt-3 border-t border-border">
              <DailyBookingReportButton 
                jobs={jobs} 
                selectedDate={selectedDate} 
                isFanCategory={isFanCategory} 
              />
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
});

BookedDateSidebar.displayName = 'BookedDateSidebar';
