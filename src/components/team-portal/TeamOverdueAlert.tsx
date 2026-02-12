import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Job } from '@/types/job';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { 
  AlertTriangle, 
  ChevronDown, 
  ChevronUp, 
  MapPin,
  Clock,
  X,
} from 'lucide-react';
import { format } from 'date-fns';
import { getGMTNow, getHoursDifferenceGMT } from '@/lib/dateUtils';
import { cn } from '@/lib/utils';

interface TeamOverdueAlertProps {
  jobs: Job[];
  teamName: string;
  onJobClick: (job: Job) => void;
}

export const TeamOverdueAlert = ({ jobs, teamName, onJobClick }: TeamOverdueAlertProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const audioPlayedRef = useRef(false);

  // Calculate overdue jobs for THIS team
  const overdueJobs = useMemo(() => {
    const now = getGMTNow();
    return jobs.filter(job => {
      if (job.isCompleted || job.progress === 100) return false;
      if (job.status === 'pause' || job.status === 'jan2026') return false;
      if (!job.bookedDate) return false;
      
      const bookedDate = job.bookedDate instanceof Date ? job.bookedDate : new Date(String(job.bookedDate));
      if (isNaN(bookedDate.getTime())) return false;
      
      const hoursPast = getHoursDifferenceGMT(now, bookedDate);
      return bookedDate.getTime() < now.getTime() && hoursPast > 24;
    }).sort((a, b) => {
      const aDate = a.bookedDate instanceof Date ? a.bookedDate : new Date(String(a.bookedDate));
      const bDate = b.bookedDate instanceof Date ? b.bookedDate : new Date(String(b.bookedDate));
      return aDate.getTime() - bDate.getTime();
    });
  }, [jobs]);

  // Play alert sound when overdue jobs first appear
  const playAlertSound = useCallback(() => {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      // Urgent triple-beep
      oscillator.frequency.setValueAtTime(880, audioContext.currentTime);
      oscillator.frequency.setValueAtTime(660, audioContext.currentTime + 0.12);
      oscillator.frequency.setValueAtTime(880, audioContext.currentTime + 0.24);
      
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.36);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.36);
    } catch (error) {
      console.warn('Could not play alert sound:', error);
    }
  }, []);

  useEffect(() => {
    if (overdueJobs.length > 0 && !audioPlayedRef.current && !isDismissed) {
      audioPlayedRef.current = true;
      // Small delay to avoid playing on initial mount before user interacts
      const timer = setTimeout(() => playAlertSound(), 1000);
      return () => clearTimeout(timer);
    }
    if (overdueJobs.length === 0) {
      audioPlayedRef.current = false;
    }
  }, [overdueJobs.length, isDismissed, playAlertSound]);

  // Re-check every minute
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(interval);
  }, []);

  if (overdueJobs.length === 0 || isDismissed) return null;

  return (
    <div className="mx-3 mt-2">
      <Card className={cn(
        "border-2 border-red-500 bg-red-50 dark:bg-red-950/40 shadow-lg",
        "animate-pulse-slow"
      )}>
        <CardContent className="p-3">
          {/* Alert Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-full bg-red-600 animate-bounce">
                <AlertTriangle className="h-4 w-4 text-white" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-red-800 dark:text-red-300">
                  ⚠️ {overdueJobs.length} OVERDUE JOB{overdueJobs.length !== 1 ? 'S' : ''}
                </h3>
                <p className="text-[10px] text-red-600 dark:text-red-400">
                  These jobs need immediate attention
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-red-600"
                onClick={() => setIsExpanded(!isExpanded)}
              >
                {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-red-400"
                onClick={() => setIsDismissed(true)}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* Quick Action Button */}
          {!isExpanded && (
            <Button
              size="sm"
              className="w-full mt-2 h-8 text-xs bg-red-600 hover:bg-red-700 text-white"
              onClick={() => setIsExpanded(true)}
            >
              View {overdueJobs.length} Overdue Job{overdueJobs.length !== 1 ? 's' : ''}
            </Button>
          )}

          {/* Expanded Job List */}
          {isExpanded && (
            <div className="mt-2 space-y-1.5 max-h-[300px] overflow-y-auto">
              {overdueJobs.map(job => {
                const bookedDate = job.bookedDate instanceof Date ? job.bookedDate : new Date(String(job.bookedDate));
                const hoursOverdue = getHoursDifferenceGMT(getGMTNow(), bookedDate) - 24;
                const overdueText = hoursOverdue > 48 
                  ? `${Math.floor(hoursOverdue / 24)} days overdue` 
                  : `${Math.round(hoursOverdue)}h overdue`;

                return (
                  <div 
                    key={job.id}
                    className="bg-white dark:bg-red-950/60 rounded-lg p-2.5 border border-red-200 dark:border-red-800 cursor-pointer hover:bg-red-50 dark:hover:bg-red-900/50 transition-colors"
                    onClick={() => onJobClick(job)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-mono text-xs font-bold text-red-800 dark:text-red-300">
                            #{job.jobNumber}
                          </span>
                          <Badge className="text-[9px] px-1 py-0 bg-red-600 text-white h-4 animate-pulse">
                            <Clock className="h-2.5 w-2.5 mr-0.5" />
                            {overdueText}
                          </Badge>
                        </div>
                        <p className="text-xs font-semibold mt-0.5 text-foreground truncate">{job.name}</p>
                        {job.address && (
                          <p className="text-[10px] text-muted-foreground flex items-center gap-0.5 mt-0.5 truncate">
                            <MapPin className="h-2.5 w-2.5 flex-shrink-0" />
                            {job.address}
                          </p>
                        )}
                        <p className="text-[10px] text-red-600 dark:text-red-400 mt-0.5">
                          Booked: {format(bookedDate, 'EEE d MMM')}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        className="h-7 text-[10px] px-2 bg-red-600 hover:bg-red-700 text-white flex-shrink-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          onJobClick(job);
                        }}
                      >
                        Action
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* CSS for slow pulse */}
      <style>{`
        @keyframes pulse-slow {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.92; }
        }
        .animate-pulse-slow {
          animation: pulse-slow 3s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
};
