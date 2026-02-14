import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Job } from '@/types/job';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
    <div className="mb-2">
      {/* V2: Thin collapsible alert strip */}
      <div className={cn(
        "rounded-xl overflow-hidden border-2 transition-all",
        "border-destructive/50 bg-destructive/5"
      )}>
        {/* Compact header strip */}
        <div 
          className="flex items-center justify-between px-3 py-2 cursor-pointer bg-destructive/10 hover:bg-destructive/15 transition-colors"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-full bg-destructive flex items-center justify-center flex-shrink-0 animate-pulse">
              <AlertTriangle className="h-3.5 w-3.5 text-destructive-foreground" />
            </div>
            <span className="font-bold text-sm text-destructive">
              {overdueJobs.length} OVERDUE
            </span>
          </div>
          <div className="flex items-center gap-1">
            {isExpanded ? <ChevronUp className="h-4 w-4 text-destructive" /> : <ChevronDown className="h-4 w-4 text-destructive" />}
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-destructive"
              onClick={(e) => { e.stopPropagation(); setIsDismissed(true); }}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        </div>

        {/* Expanded Job List */}
        {isExpanded && (
          <div className="p-2 space-y-1.5 max-h-[280px] overflow-y-auto">
            {overdueJobs.map(job => {
              const bookedDate = job.bookedDate instanceof Date ? job.bookedDate : new Date(String(job.bookedDate));
              const hoursOverdue = getHoursDifferenceGMT(getGMTNow(), bookedDate) - 24;
              const overdueText = hoursOverdue > 48 
                ? `${Math.floor(hoursOverdue / 24)}d overdue` 
                : `${Math.round(hoursOverdue)}h overdue`;

              return (
                <div 
                  key={job.id}
                  className="bg-card rounded-lg p-2.5 border border-border cursor-pointer hover:border-destructive/50 transition-all active:scale-[0.98]"
                  onClick={() => onJobClick(job)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="font-mono text-[11px] font-bold text-muted-foreground">
                          #{job.jobNumber}
                        </span>
                        <Badge className="text-[9px] px-1.5 py-0 bg-destructive text-destructive-foreground h-4">
                          <Clock className="h-2.5 w-2.5 mr-0.5" />
                          {overdueText}
                        </Badge>
                      </div>
                      <p className="text-xs font-semibold truncate">{job.name}</p>
                      {job.address && (
                        <p className="text-[10px] text-muted-foreground flex items-center gap-0.5 mt-0.5 truncate">
                          <MapPin className="h-2.5 w-2.5 flex-shrink-0" />
                          {job.address}
                        </p>
                      )}
                    </div>
                    <ChevronDown className="h-4 w-4 text-muted-foreground rotate-[-90deg] flex-shrink-0" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
