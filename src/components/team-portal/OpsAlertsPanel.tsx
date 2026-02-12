import { useState, useEffect, useMemo, useCallback } from 'react';
import { Job } from '@/types/job';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { 
  AlertTriangle, 
  Clock, 
  Camera, 
  ChevronDown, 
  ChevronRight, 
  Users,
  AlertCircle,
  Scale,
  Phone,
  CalendarClock,
} from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { getGMTNow, getHoursDifferenceGMT } from '@/lib/dateUtils';
import { getAwabsCompliance, formatTimeRemaining, getContactBreaches, getCompletionBreaches } from '@/lib/awabsCompliance';
import { cn } from '@/lib/utils';

interface IncompleteSignOff {
  jobId: string;
  jobNumber: string;
  jobName: string;
  teamName: string;
  signedOffAt: string;
  photosCount: number;
  hasNotes: boolean;
}

interface OpsAlertsPanelProps {
  jobs: Job[];
  onJobClick: (job: Job) => void;
}

export const OpsAlertsPanel = ({ jobs, onJobClick }: OpsAlertsPanelProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [incompleteSignOffs, setIncompleteSignOffs] = useState<IncompleteSignOff[]>([]);
  const [contactHistoryMap, setContactHistoryMap] = useState<Map<string, boolean>>(new Map());

  // Fetch contact history to check which jobs have been contacted
  const fetchContactHistory = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('contact_history')
        .select('job_id')
        .order('contact_date', { ascending: false });
      
      if (error) throw error;
      
      const map = new Map<string, boolean>();
      (data || []).forEach(row => map.set(row.job_id, true));
      setContactHistoryMap(map);
    } catch (err) {
      console.error('Error fetching contact history:', err);
    }
  }, []);

  // Fetch sign-offs missing photos or notes
  const fetchIncompleteSignOffs = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('team_sign_offs')
        .select('job_id, team_name, photos_count, progress_notes, signed_off_at')
        .or('photos_count.eq.0,progress_notes.is.null')
        .order('signed_off_at', { ascending: false })
        .limit(100);

      if (error) throw error;

      const incomplete: IncompleteSignOff[] = (data || [])
        .filter(row => row.photos_count === 0 || !row.progress_notes || row.progress_notes.trim() === '')
        .map(row => {
          const job = jobs.find(j => j.id === row.job_id);
          return {
            jobId: row.job_id,
            jobNumber: job?.jobNumber || 'Unknown',
            jobName: job?.name || 'Unknown',
            teamName: row.team_name,
            signedOffAt: row.signed_off_at,
            photosCount: row.photos_count,
            hasNotes: !!(row.progress_notes && row.progress_notes.trim()),
          };
        });

      setIncompleteSignOffs(incomplete);
    } catch (err) {
      console.error('Error fetching incomplete sign-offs:', err);
    }
  }, [jobs]);

  useEffect(() => {
    if (isExpanded) {
      fetchIncompleteSignOffs();
      fetchContactHistory();
    }
  }, [isExpanded, fetchIncompleteSignOffs, fetchContactHistory]);

  // Subscribe to realtime updates
  useEffect(() => {
    const channel = supabase
      .channel('ops-alerts-signoffs')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'team_sign_offs' }, () => {
        if (isExpanded) fetchIncompleteSignOffs();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contact_history' }, () => {
        if (isExpanded) fetchContactHistory();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [isExpanded, fetchIncompleteSignOffs, fetchContactHistory]);

  // Overdue jobs (24+ hours past booked date)
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

  // Ongoing jobs
  const ongoingJobs = useMemo(() => {
    return jobs.filter(job => job.isOngoing && !job.isCompleted && job.progress !== 100);
  }, [jobs]);

  // AWABS LAW: Jobs not contacted within 24h of upload
  const awabsContactBreaches = useMemo(() => {
    return getContactBreaches(jobs, contactHistoryMap);
  }, [jobs, contactHistoryMap]);

  // AWABS LAW: Jobs not completed within 5 days of upload
  const awabsCompletionBreaches = useMemo(() => {
    return getCompletionBreaches(jobs);
  }, [jobs]);

  const totalAlerts = overdueJobs.length + ongoingJobs.length + incompleteSignOffs.length 
    + awabsContactBreaches.length + awabsCompletionBreaches.length;
  const hasUrgent = overdueJobs.length > 0 || awabsContactBreaches.length > 0 || awabsCompletionBreaches.length > 0;

  const toggleSection = (section: string) => {
    setExpandedSection(prev => prev === section ? null : section);
  };

  if (overdueJobs.length === 0 && ongoingJobs.length === 0 && !isExpanded) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsExpanded(true)}
        className="h-8 px-3 gap-2 text-xs"
      >
        <AlertTriangle className="h-3.5 w-3.5" />
        Alerts
      </Button>
    );
  }

  const renderAlertSection = (
    id: string,
    icon: React.ReactNode,
    label: string,
    count: number,
    colorClass: string,
    badgeClass: string,
    children: React.ReactNode
  ) => (
    <Collapsible open={expandedSection === id} onOpenChange={() => toggleSection(id)}>
      <CollapsibleTrigger asChild>
        <div className={cn(
          "flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors",
          count > 0 ? `${colorClass} hover:opacity-80` : "bg-muted/50 hover:bg-muted"
        )}>
          <div className="flex items-center gap-2">
            {icon}
            <span className="font-semibold text-xs">{label}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Badge className={cn("text-xs", count > 0 ? badgeClass : "bg-muted text-muted-foreground")}>
              {count}
            </Badge>
            {expandedSection === id ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </div>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-1 space-y-1">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );

  const renderJobItem = (job: Job, borderColor: string, bgColor: string, extraBadges?: React.ReactNode) => (
    <div 
      key={job.id}
      className={cn(`border-l-3 ${borderColor} ${bgColor} rounded p-2 cursor-pointer hover:opacity-80 transition-colors`)}
      onClick={() => onJobClick(job)}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-mono text-[10px] font-bold">#{job.jobNumber}</span>
          {extraBadges}
        </div>
        <p className="text-xs font-medium truncate mt-0.5">{job.name}</p>
        {job.team && (
          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5 mt-0.5">
            <Users className="h-2.5 w-2.5" />{job.team}
            {job.team2 && ` + ${job.team2}`}
          </span>
        )}
      </div>
    </div>
  );

  return (
    <div className="w-full">
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CollapsibleTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              "h-8 px-3 gap-2 text-xs font-medium",
              hasUrgent && "border-red-400 bg-red-50 dark:bg-red-900/20 animate-pulse"
            )}
          >
            <AlertTriangle className={cn("h-3.5 w-3.5", hasUrgent ? "text-red-600" : "text-amber-600")} />
            Alerts
            {totalAlerts > 0 && (
              <Badge className={cn("ml-1 h-5 px-1.5 text-xs", hasUrgent ? "bg-red-600 text-white" : "bg-amber-500 text-white")}>
                {totalAlerts}
              </Badge>
            )}
            {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </Button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <Card className="mt-2">
            <CardContent className="p-2 space-y-1.5 max-h-[500px] overflow-y-auto">

              {/* AWABS LAW: 24h Contact Breach */}
              {renderAlertSection(
                'awabs-contact',
                <Scale className={cn("h-4 w-4", awabsContactBreaches.length > 0 ? "text-purple-600" : "text-muted-foreground")} />,
                'AWABS: NO CONTACT (24h)',
                awabsContactBreaches.length,
                "bg-purple-50 dark:bg-purple-900/20",
                "bg-purple-600 text-white",
                awabsContactBreaches.length === 0 ? (
                  <p className="text-xs text-muted-foreground px-2 py-1">All jobs contacted within 24h ✓</p>
                ) : (
                  awabsContactBreaches.slice(0, 30).map(job => {
                    const compliance = getAwabsCompliance(job, false);
                    return renderJobItem(
                      job,
                      'border-l-purple-500',
                      'bg-purple-50/80 dark:bg-purple-950/30',
                      <>
                        <Badge className="text-[9px] px-1 py-0 bg-purple-600 text-white h-4">
                          <Phone className="h-2 w-2 mr-0.5" />
                          {formatTimeRemaining(compliance.contactHoursRemaining)}
                        </Badge>
                      </>
                    );
                  })
                )
              )}

              {/* AWABS LAW: 5-Day Completion Breach */}
              {renderAlertSection(
                'awabs-completion',
                <CalendarClock className={cn("h-4 w-4", awabsCompletionBreaches.length > 0 ? "text-rose-600" : "text-muted-foreground")} />,
                'AWABS: NOT COMPLETE (5 DAYS)',
                awabsCompletionBreaches.length,
                "bg-rose-50 dark:bg-rose-900/20",
                "bg-rose-600 text-white",
                awabsCompletionBreaches.length === 0 ? (
                  <p className="text-xs text-muted-foreground px-2 py-1">All jobs within 5-day window ✓</p>
                ) : (
                  awabsCompletionBreaches.slice(0, 30).map(job => {
                    const compliance = getAwabsCompliance(job, true);
                    return renderJobItem(
                      job,
                      'border-l-rose-500',
                      'bg-rose-50/80 dark:bg-rose-950/30',
                      <>
                        <Badge className="text-[9px] px-1 py-0 bg-rose-600 text-white h-4">
                          <CalendarClock className="h-2 w-2 mr-0.5" />
                          {formatTimeRemaining(compliance.completionHoursRemaining)}
                        </Badge>
                        <Badge className="text-[9px] px-1 py-0 bg-rose-500/80 text-white h-4">
                          Day {Math.floor(compliance.daysSinceUpload)}
                        </Badge>
                      </>
                    );
                  })
                )
              )}

              {/* OVERDUE Section */}
              {renderAlertSection(
                'overdue',
                <AlertCircle className={cn("h-4 w-4", overdueJobs.length > 0 ? "text-red-600" : "text-muted-foreground")} />,
                'OVERDUE JOBS',
                overdueJobs.length,
                "bg-red-50 dark:bg-red-900/20",
                "bg-red-600 text-white",
                overdueJobs.length === 0 ? (
                  <p className="text-xs text-muted-foreground px-2 py-1">No overdue jobs ✓</p>
                ) : (
                  overdueJobs.map(job => {
                    const bookedDate = job.bookedDate instanceof Date ? job.bookedDate : new Date(String(job.bookedDate));
                    const hoursOverdue = getHoursDifferenceGMT(getGMTNow(), bookedDate) - 24;
                    const overdueText = hoursOverdue > 48 
                      ? `${Math.floor(hoursOverdue / 24)}d overdue` 
                      : `${Math.round(hoursOverdue)}h overdue`;
                    return renderJobItem(
                      job,
                      'border-l-red-500',
                      'bg-red-50/80 dark:bg-red-950/30',
                      <Badge className="text-[9px] px-1 py-0 bg-red-600 text-white h-4">{overdueText}</Badge>
                    );
                  })
                )
              )}

              {/* ONGOING Section */}
              {renderAlertSection(
                'ongoing',
                <Clock className={cn("h-4 w-4", ongoingJobs.length > 0 ? "text-amber-600" : "text-muted-foreground")} />,
                'ONGOING JOBS',
                ongoingJobs.length,
                "bg-amber-50 dark:bg-amber-900/20",
                "bg-amber-500 text-white",
                ongoingJobs.length === 0 ? (
                  <p className="text-xs text-muted-foreground px-2 py-1">No ongoing jobs ✓</p>
                ) : (
                  ongoingJobs.map(job => renderJobItem(
                    job,
                    'border-l-amber-500',
                    'bg-amber-50/80 dark:bg-amber-950/30',
                    <>
                      <Badge className="text-[9px] px-1 py-0 bg-amber-500 text-white h-4">ONGOING</Badge>
                      {job.ongoingReason && (
                        <span className="text-[10px] text-amber-700 dark:text-amber-400 line-clamp-1">
                          {job.ongoingReason}
                        </span>
                      )}
                    </>
                  ))
                )
              )}

              {/* INCOMPLETE SIGN-OFFS Section */}
              {renderAlertSection(
                'incomplete',
                <Camera className={cn("h-4 w-4", incompleteSignOffs.length > 0 ? "text-orange-600" : "text-muted-foreground")} />,
                'SIGN-OFFS MISSING DATA',
                incompleteSignOffs.length,
                "bg-orange-50 dark:bg-orange-900/20",
                "bg-orange-500 text-white",
                incompleteSignOffs.length === 0 ? (
                  <p className="text-xs text-muted-foreground px-2 py-1">All sign-offs complete ✓</p>
                ) : (
                  incompleteSignOffs.slice(0, 30).map((signOff, idx) => {
                    const job = jobs.find(j => j.id === signOff.jobId);
                    const missingItems: string[] = [];
                    if (signOff.photosCount === 0) missingItems.push('No photos');
                    if (!signOff.hasNotes) missingItems.push('No description');

                    return (
                      <div 
                        key={`${signOff.jobId}-${signOff.teamName}-${idx}`}
                        className="border-l-3 border-l-orange-500 bg-orange-50/80 dark:bg-orange-950/30 rounded p-2 cursor-pointer hover:opacity-80 transition-colors"
                        onClick={() => job && onJobClick(job)}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono text-[10px] font-bold">#{signOff.jobNumber}</span>
                            <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-orange-400 text-orange-700">
                              {signOff.teamName}
                            </Badge>
                            {missingItems.map(item => (
                              <Badge key={item} className="text-[9px] px-1 py-0 bg-orange-500 text-white h-4">
                                {item}
                              </Badge>
                            ))}
                          </div>
                          <p className="text-xs font-medium truncate mt-0.5">{signOff.jobName}</p>
                          <span className="text-[10px] text-muted-foreground">
                            Signed off: {format(new Date(signOff.signedOffAt), 'dd MMM HH:mm')}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )
              )}

              {incompleteSignOffs.length > 30 && (
                <p className="text-[10px] text-muted-foreground px-2">
                  + {incompleteSignOffs.length - 30} more
                </p>
              )}
            </CardContent>
          </Card>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};
