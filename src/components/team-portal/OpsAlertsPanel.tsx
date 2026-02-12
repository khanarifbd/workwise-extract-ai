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
  FileText,
  AlertCircle,
} from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { getGMTNow, getHoursDifferenceGMT } from '@/lib/dateUtils';
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

      // Filter to only include truly incomplete ones (no photos AND no notes)
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
    }
  }, [isExpanded, fetchIncompleteSignOffs]);

  // Subscribe to realtime updates on sign-offs
  useEffect(() => {
    const channel = supabase
      .channel('ops-alerts-signoffs')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'team_sign_offs',
      }, () => {
        if (isExpanded) fetchIncompleteSignOffs();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [isExpanded, fetchIncompleteSignOffs]);

  // Calculate overdue jobs (24+ hours past booked date, not complete, not signed off)
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
      return aDate.getTime() - bDate.getTime(); // oldest first
    });
  }, [jobs]);

  // Ongoing jobs
  const ongoingJobs = useMemo(() => {
    return jobs.filter(job => job.isOngoing && !job.isCompleted && job.progress !== 100);
  }, [jobs]);

  const totalAlerts = overdueJobs.length + ongoingJobs.length + incompleteSignOffs.length;
  const hasUrgent = overdueJobs.length > 0;

  const toggleSection = (section: string) => {
    setExpandedSection(prev => prev === section ? null : section);
  };

  if (overdueJobs.length === 0 && ongoingJobs.length === 0 && !isExpanded) {
    // Still show button but without urgency
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
            {(overdueJobs.length + ongoingJobs.length) > 0 && (
              <Badge 
                className={cn(
                  "ml-1 h-5 px-1.5 text-xs",
                  hasUrgent ? "bg-red-600 text-white" : "bg-amber-500 text-white"
                )}
              >
                {overdueJobs.length + ongoingJobs.length}
              </Badge>
            )}
            {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </Button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <Card className="mt-2">
            <CardContent className="p-2 space-y-1.5 max-h-[450px] overflow-y-auto">
              {/* OVERDUE Section */}
              <Collapsible open={expandedSection === 'overdue'} onOpenChange={() => toggleSection('overdue')}>
                <CollapsibleTrigger asChild>
                  <div className={cn(
                    "flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors",
                    overdueJobs.length > 0 ? "bg-red-50 dark:bg-red-900/20 hover:bg-red-100" : "bg-muted/50 hover:bg-muted"
                  )}>
                    <div className="flex items-center gap-2">
                      <AlertCircle className={cn("h-4 w-4", overdueJobs.length > 0 ? "text-red-600" : "text-muted-foreground")} />
                      <span className="font-semibold text-xs">OVERDUE JOBS</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Badge className={cn(
                        "text-xs",
                        overdueJobs.length > 0 ? "bg-red-600 text-white" : "bg-muted text-muted-foreground"
                      )}>
                        {overdueJobs.length}
                      </Badge>
                      {expandedSection === 'overdue' ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    </div>
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-1 space-y-1">
                  {overdueJobs.length === 0 ? (
                    <p className="text-xs text-muted-foreground px-2 py-1">No overdue jobs ✓</p>
                  ) : (
                    overdueJobs.map(job => {
                      const bookedDate = job.bookedDate instanceof Date ? job.bookedDate : new Date(String(job.bookedDate));
                      const hoursOverdue = getHoursDifferenceGMT(getGMTNow(), bookedDate) - 24;
                      const overdueText = hoursOverdue > 48 
                        ? `${Math.floor(hoursOverdue / 24)}d overdue` 
                        : `${Math.round(hoursOverdue)}h overdue`;

                      return (
                        <div 
                          key={job.id}
                          className="border-l-3 border-l-red-500 bg-red-50/80 dark:bg-red-950/30 rounded p-2 cursor-pointer hover:bg-red-100 dark:hover:bg-red-950/50 transition-colors"
                          onClick={() => onJobClick(job)}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-mono text-[10px] font-bold">#{job.jobNumber}</span>
                                <Badge className="text-[9px] px-1 py-0 bg-red-600 text-white h-4">
                                  {overdueText}
                                </Badge>
                              </div>
                              <p className="text-xs font-medium truncate mt-0.5">{job.name}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                {job.team && (
                                  <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                                    <Users className="h-2.5 w-2.5" />{job.team}
                                    {job.team2 && ` + ${job.team2}`}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </CollapsibleContent>
              </Collapsible>

              {/* ONGOING Section */}
              <Collapsible open={expandedSection === 'ongoing'} onOpenChange={() => toggleSection('ongoing')}>
                <CollapsibleTrigger asChild>
                  <div className={cn(
                    "flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors",
                    ongoingJobs.length > 0 ? "bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100" : "bg-muted/50 hover:bg-muted"
                  )}>
                    <div className="flex items-center gap-2">
                      <Clock className={cn("h-4 w-4", ongoingJobs.length > 0 ? "text-amber-600" : "text-muted-foreground")} />
                      <span className="font-semibold text-xs">ONGOING JOBS</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Badge className={cn(
                        "text-xs",
                        ongoingJobs.length > 0 ? "bg-amber-500 text-white" : "bg-muted text-muted-foreground"
                      )}>
                        {ongoingJobs.length}
                      </Badge>
                      {expandedSection === 'ongoing' ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    </div>
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-1 space-y-1">
                  {ongoingJobs.length === 0 ? (
                    <p className="text-xs text-muted-foreground px-2 py-1">No ongoing jobs ✓</p>
                  ) : (
                    ongoingJobs.map(job => (
                      <div 
                        key={job.id}
                        className="border-l-3 border-l-amber-500 bg-amber-50/80 dark:bg-amber-950/30 rounded p-2 cursor-pointer hover:bg-amber-100 dark:hover:bg-amber-950/50 transition-colors"
                        onClick={() => onJobClick(job)}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono text-[10px] font-bold">#{job.jobNumber}</span>
                            <Badge className="text-[9px] px-1 py-0 bg-amber-500 text-white h-4">ONGOING</Badge>
                          </div>
                          <p className="text-xs font-medium truncate mt-0.5">{job.name}</p>
                          {job.ongoingReason && (
                            <p className="text-[10px] text-amber-700 dark:text-amber-400 mt-0.5 line-clamp-1">
                              Reason: {job.ongoingReason}
                            </p>
                          )}
                          <div className="flex items-center gap-2 mt-0.5">
                            {job.team && (
                              <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                                <Users className="h-2.5 w-2.5" />{job.team}
                                {job.team2 && ` + ${job.team2}`}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </CollapsibleContent>
              </Collapsible>

              {/* INCOMPLETE SIGN-OFFS Section */}
              <Collapsible open={expandedSection === 'incomplete'} onOpenChange={() => toggleSection('incomplete')}>
                <CollapsibleTrigger asChild>
                  <div className={cn(
                    "flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors",
                    incompleteSignOffs.length > 0 ? "bg-orange-50 dark:bg-orange-900/20 hover:bg-orange-100" : "bg-muted/50 hover:bg-muted"
                  )}>
                    <div className="flex items-center gap-2">
                      <Camera className={cn("h-4 w-4", incompleteSignOffs.length > 0 ? "text-orange-600" : "text-muted-foreground")} />
                      <span className="font-semibold text-xs">SIGN-OFFS MISSING DATA</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Badge className={cn(
                        "text-xs",
                        incompleteSignOffs.length > 0 ? "bg-orange-500 text-white" : "bg-muted text-muted-foreground"
                      )}>
                        {incompleteSignOffs.length}
                      </Badge>
                      {expandedSection === 'incomplete' ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    </div>
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-1 space-y-1">
                  {incompleteSignOffs.length === 0 ? (
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
                          className="border-l-3 border-l-orange-500 bg-orange-50/80 dark:bg-orange-950/30 rounded p-2 cursor-pointer hover:bg-orange-100 dark:hover:bg-orange-950/50 transition-colors"
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
                  )}
                  {incompleteSignOffs.length > 30 && (
                    <p className="text-[10px] text-muted-foreground px-2">
                      + {incompleteSignOffs.length - 30} more
                    </p>
                  )}
                </CollapsibleContent>
              </Collapsible>
            </CardContent>
          </Card>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};
