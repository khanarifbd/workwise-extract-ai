import { useMemo } from 'react';
import { Job } from '@/types/job';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Scale, Phone, CalendarClock } from 'lucide-react';
import { getAwabsCompliance, formatTimeRemaining } from '@/lib/awabsCompliance';
import { cn } from '@/lib/utils';

interface AwabsComplianceBadgeProps {
  job: Job;
  hasContactHistory: boolean;
  compact?: boolean;
}

/**
 * Displays AWABS LAW compliance status badges on job cards.
 * Shows contact deadline (24h) and completion deadline (5 days).
 */
export const AwabsComplianceBadge = ({ job, hasContactHistory, compact = false }: AwabsComplianceBadgeProps) => {
  const compliance = useMemo(() => getAwabsCompliance(job, hasContactHistory), [job, hasContactHistory]);

  // Don't show anything for completed jobs
  if (compliance.isCompleted) return null;

  // Don't show for paused/deferred jobs
  if (job.status === 'pause' || job.status === 'jan2026') return null;

  const showContactWarning = compliance.contactDeadlinePassed && !hasContactHistory;
  const showContactRisk = !showContactWarning && compliance.contactHoursRemaining < 6 && !hasContactHistory;
  const showCompletionWarning = compliance.completionDeadlinePassed;
  const showCompletionRisk = !showCompletionWarning && compliance.completionHoursRemaining < 24;

  if (!showContactWarning && !showContactRisk && !showCompletionWarning && !showCompletionRisk) return null;

  if (compact) {
    return (
      <div className="flex items-center gap-0.5">
        {(showContactWarning || showContactRisk) && (
          <Badge className={cn(
            "text-[8px] px-1 py-0 h-3.5 flex items-center gap-0.5",
            showContactWarning ? "bg-purple-600 text-white" : "bg-purple-400 text-white"
          )}>
            <Phone className="h-2 w-2" />
            {showContactWarning ? '!' : '⏳'}
          </Badge>
        )}
        {(showCompletionWarning || showCompletionRisk) && (
          <Badge className={cn(
            "text-[8px] px-1 py-0 h-3.5 flex items-center gap-0.5",
            showCompletionWarning ? "bg-rose-600 text-white" : "bg-rose-400 text-white"
          )}>
            <CalendarClock className="h-2 w-2" />
            D{Math.floor(compliance.daysSinceUpload)}
          </Badge>
        )}
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="flex items-center gap-1 flex-wrap">
        {showContactWarning && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge className="text-[9px] px-1 py-0 bg-purple-600 text-white h-4 flex items-center gap-0.5 cursor-help">
                <Phone className="h-2.5 w-2.5" />
                CONTACT {formatTimeRemaining(compliance.contactHoursRemaining)}
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">AWABS LAW: Must contact tenant within 24h of upload</p>
            </TooltipContent>
          </Tooltip>
        )}
        {showContactRisk && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge className="text-[9px] px-1 py-0 bg-purple-400 text-white h-4 flex items-center gap-0.5 cursor-help">
                <Phone className="h-2.5 w-2.5" />
                {formatTimeRemaining(compliance.contactHoursRemaining)}
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">AWABS LAW: Contact deadline approaching</p>
            </TooltipContent>
          </Tooltip>
        )}
        {showCompletionWarning && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge className="text-[9px] px-1 py-0 bg-rose-600 text-white h-4 flex items-center gap-0.5 cursor-help animate-pulse">
                <Scale className="h-2.5 w-2.5" />
                DAY {Math.floor(compliance.daysSinceUpload)} — {formatTimeRemaining(compliance.completionHoursRemaining)}
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">AWABS LAW: Must complete within 5 days of upload</p>
            </TooltipContent>
          </Tooltip>
        )}
        {showCompletionRisk && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge className="text-[9px] px-1 py-0 bg-rose-400 text-white h-4 flex items-center gap-0.5 cursor-help">
                <CalendarClock className="h-2.5 w-2.5" />
                Day {Math.floor(compliance.daysSinceUpload)} — {formatTimeRemaining(compliance.completionHoursRemaining)}
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">AWABS LAW: Completion deadline approaching</p>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  );
};
