import { useState, useMemo, useEffect, forwardRef } from 'react';
import { Job, JobStatus, FanInfo, Team } from '@/types/job';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { format } from 'date-fns';
import { 
  Users, 
  Edit2, 
  Trash2, 
  MapPin,
  FileText,
  MoreVertical,
  Paperclip,
  X,
  Fan,
  Loader2,
  Wand2,
  AlertTriangle,
  Copy,
  ArrowRightLeft,
  Clock
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { TeamSelector } from './TeamSelector';
import { JobDetailsModal } from './JobDetailsModal';
import { InlineDescriptionEditor } from './InlineDescriptionEditor';
import { FanEditor } from './FanEditor';
import { PrivateNotesEditor } from './PrivateNotesEditor';
import { ContactCell } from './ContactCell';
import { BookedDateCell } from './BookedDateCell';
import { SignOffStatusIndicator } from './SignOffStatusIndicator';
import { SignOffHistoryModal } from './SignOffHistoryModal';
import { extractFansWithAI, createLinkedFanJob } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { useTeamSettings } from '@/hooks/useTeamSettings';
import { useTeamAvailability } from '@/hooks/useTeamAvailability';
import { useAllContactHistory } from '@/hooks/useContactHistory';
import { useSignOffStatus } from '@/hooks/useSignOffStatus';
import { shouldShowOngoingAlert } from '@/hooks/useJobAlerts';
import { CONTACT_OUTCOMES, determineNextAction, NextAction } from '@/types/contactHistory';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface JobTableProps {
  jobs: Job[];
  onUpdateJob?: (job: Job) => void;
  onDeleteJob?: (jobId: string) => void;
  onToggleComplete?: (job: Job) => void;
  onBatchUpdateTeam?: (jobIds: string[], teamName: string | null) => void;
  onTransferJob?: (jobId: string, targetCategoryId: string) => void;
  onDuplicateToCategory?: (jobId: string, targetCategoryId: string, teamId: string) => void;
  fanCategoryId?: string;
  onFanJobCreated?: () => void;
  isFanCategory?: boolean;
  currentCategoryId?: string;
  categories?: { id: string; name: string; color: string }[];
  readOnly?: boolean;
}

// Helper to find duplicate job numbers
const findDuplicates = (jobs: Job[]): Set<string> => {
  const jobNumberCounts = new Map<string, number>();
  jobs.forEach(job => {
    const key = job.jobNumber.toLowerCase();
    jobNumberCounts.set(key, (jobNumberCounts.get(key) || 0) + 1);
  });
  const duplicates = new Set<string>();
  jobs.forEach(job => {
    if ((jobNumberCounts.get(job.jobNumber.toLowerCase()) || 0) > 1) {
      duplicates.add(job.id);
    }
  });
  return duplicates;
};

export const JobTable = forwardRef<HTMLDivElement, JobTableProps>(({ jobs, onUpdateJob, onDeleteJob, onToggleComplete, onBatchUpdateTeam, onTransferJob, onDuplicateToCategory, fanCategoryId, onFanJobCreated, isFanCategory = false, currentCategoryId, categories = [], readOnly = false }, ref) => {
  const [showTeamSelector, setShowTeamSelector] = useState<string | null>(null);
  const [showTransferModal, setShowTransferModal] = useState<Job | null>(null);
  const [showJobDetails, setShowJobDetails] = useState<Job | null>(null);
  const [expandedDescriptions, setExpandedDescriptions] = useState<Set<string>>(new Set());
  const [selectedJobs, setSelectedJobs] = useState<Set<string>>(new Set());
  const [showBatchTeamSelector, setShowBatchTeamSelector] = useState(false);
  const [scanningFanJobId, setScanningFanJobId] = useState<string | null>(null);
  const [isBulkScanning, setIsBulkScanning] = useState(false);
  const [duplicateActionJob, setDuplicateActionJob] = useState<Job | null>(null);
  const [signOffHistoryJob, setSignOffHistoryJob] = useState<Job | null>(null);
  const { toast } = useToast();
  const { settings: teamSettings } = useTeamSettings();
  const { hasAvailabilityConflict } = useTeamAvailability();
  
  // Load contact history for all jobs
  const jobIds = useMemo(() => jobs.map(j => j.id), [jobs]);
  const { historyMap: contactHistoryMap, refreshAllHistory } = useAllContactHistory(jobIds);
  
  // Get sign-off status for all jobs (for 24hr ongoing alert logic)
  const { getSignOffStatus } = useSignOffStatus(jobIds);
  
  // Build dynamic teams list from settings - include ALL teams for bulk assign
  // All teams should be available for assignment regardless of category
  const teams: Team[] = useMemo(() => {
    // Include all teams from team settings for bulk assignment
    // This ensures every team is available in the dropdown
    return teamSettings.map(s => ({
      id: s.teamId,
      name: s.teamName,
      color: s.color || '#3B82F6',
      whatsappGroup: s.whatsappGroup || undefined,
    }));
  }, [teamSettings]);
  
  // Find all duplicate job numbers
  const duplicateJobIds = findDuplicates(jobs);

  // Keep action badges in sync when a contact attempt is logged in the modal
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ jobId?: string }>).detail;
      if (!detail?.jobId || jobIds.includes(detail.jobId)) {
        refreshAllHistory();
      }
    };
    window.addEventListener('contact-history-updated', handler as EventListener);
    return () => window.removeEventListener('contact-history-updated', handler as EventListener);
  }, [jobIds.join(','), refreshAllHistory]);

  const handleTeamSelect = (jobId: string, teamSelection: string | null) => {
    const job = jobs.find(j => j.id === jobId);
    if (job) {
      // Handle dual team selection (format: "Team1|Team2" or single team name)
      if (teamSelection && teamSelection.includes('|')) {
        const [team1, team2] = teamSelection.split('|');
        onUpdateJob({ ...job, team: team1 || null, team2: team2 || null });
      } else {
        // Single team or unassign
        const team = teamSelection ? teams.find(t => t.id === teamSelection || t.name === teamSelection) : null;
        onUpdateJob({ ...job, team: team?.name || teamSelection || null, team2: null });
      }
    }
    setShowTeamSelector(null);
  };

  const handleBatchTeamSelect = (teamId: string | null) => {
    if (onBatchUpdateTeam && selectedJobs.size > 0) {
      const team = teamId ? teams.find(t => t.id === teamId) : null;
      onBatchUpdateTeam(Array.from(selectedJobs), team?.name || null);
      setSelectedJobs(new Set());
    }
    setShowBatchTeamSelector(false);
  };

  const handleStatusProgressUpdate = (jobId: string, updates: { status?: JobStatus; progress?: number; progressNotes?: string; isCompleted?: boolean }) => {
    const job = jobs.find(j => j.id === jobId);
    if (job) {
      onUpdateJob({ ...job, ...updates });
    }
  };

  const toggleDescription = (jobId: string) => {
    setExpandedDescriptions(prev => {
      const next = new Set(prev);
      if (next.has(jobId)) {
        next.delete(jobId);
      } else {
        next.add(jobId);
      }
      return next;
    });
  };

  const toggleJobSelection = (jobId: string) => {
    setSelectedJobs(prev => {
      const next = new Set(prev);
      if (next.has(jobId)) {
        next.delete(jobId);
      } else {
        next.add(jobId);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedJobs.size === jobs.length) {
      setSelectedJobs(new Set());
    } else {
      setSelectedJobs(new Set(jobs.map(j => j.id)));
    }
  };

  const getTeamColor = (teamName: string | null) => {
    if (!teamName) return undefined;
    const team = teams.find(t => t.name === teamName);
    return team?.color;
  };

  // Check if job was scanned but no fans were found
  const wasScannedNoFans = (fanInfo: FanInfo[] | null): boolean => {
    if (!fanInfo || fanInfo.length === 0) return false;
    return fanInfo.length === 1 && fanInfo[0].type === '__SCANNED_NO_FANS__';
  };

  // Check if job has actual fans (not just the "no fans" marker)
  const hasActualFans = (fanInfo: FanInfo[] | null): boolean => {
    if (!fanInfo || fanInfo.length === 0) return false;
    return !wasScannedNoFans(fanInfo);
  };

  const handleStatusChange = (jobId: string, status: JobStatus, isComplete: boolean) => {
    const job = jobs.find(j => j.id === jobId);
    if (job) {
      const updates: Partial<Job> = { 
        status,
        isCompleted: isComplete,
        progress: isComplete ? 100 : (job.progress === 100 ? 50 : job.progress),
        completionDate: isComplete ? new Date() : (job.completionDate && !isComplete ? null : job.completionDate)
      };
      onUpdateJob({ ...job, ...updates });
    }
  };

  const handleBookedDateChange = (jobId: string, bookedDate: Date | null, isFlexible: boolean = false) => {
    const job = jobs.find(j => j.id === jobId);
    if (job) {
      onUpdateJob({ ...job, bookedDate, isFlexibleBooking: isFlexible });
    }
  };

  const handleScanForFans = async (jobId: string, forceOverride: boolean = false) => {
    const job = jobs.find(j => j.id === jobId);
    if (!job) return;

    // Check if manual override is set (unless force override is requested)
    const hasManualOverride = job.fanInfo?.some(f => f.manualOverride);
    if (hasManualOverride && !forceOverride) {
      toast({
        title: "Manual Override Active",
        description: "This job has a manually set fan count. Use the editor to change it.",
      });
      return;
    }

    setScanningFanJobId(jobId);
    try {
      const result = await extractFansWithAI(job.description || job.summaryOfWorks || '', job.workItems);
      
      if (result) {
        // Always update fanInfo - if no fans found, set to empty array with a marker
        const fanInfoToSave: FanInfo[] = result.hasFans && result.fans.length > 0 
          ? result.fans 
          : [{ type: '__SCANNED_NO_FANS__', quantity: 0, location: '' }]; // Marker for "scanned but no fans"
        
        onUpdateJob({ ...job, fanInfo: fanInfoToSave });
        
        if (result.hasFans && result.fans.length > 0) {
          // Auto-create linked fan job if category exists and not already linked
          if (fanCategoryId && !job.linkedFanJobId) {
            try {
              await createLinkedFanJob(job, result.fans, fanCategoryId);
              onFanJobCreated?.();
              toast({
                title: "Fans Found & Job Created!",
                description: `Found ${result.totalFanCount} fan(s) - linked fan job created.`,
              });
            } catch (createError) {
              console.error('Failed to create linked fan job:', createError);
              toast({
                title: "Fans Found!",
                description: `Found ${result.totalFanCount} fan(s) in ${result.fans.length} type(s).`,
              });
            }
          } else {
            toast({
              title: "Fans Found!",
              description: `Found ${result.totalFanCount} fan(s) in ${result.fans.length} type(s).`,
            });
          }
        } else {
          toast({
            title: "No Fans Found",
            description: "Scan complete - no fans detected in this job.",
          });
        }
      } else {
        // API returned null - mark as scanned with no fans
        onUpdateJob({ ...job, fanInfo: [{ type: '__SCANNED_NO_FANS__', quantity: 0, location: '' }] });
        toast({
          title: "No Fans Found",
          description: "Scan complete - no fans detected in this job.",
        });
      }
    } catch (error) {
      console.error('Error scanning for fans:', error);
      toast({
        title: "Scan Failed",
        description: "Could not scan for fans.",
        variant: "destructive",
      });
    } finally {
      setScanningFanJobId(null);
    }
  };

  // Bulk fan scanning for selected jobs (includes re-scanning jobs with NONE)
  const handleBulkFanScan = async (forceRescan: boolean = false) => {
    if (selectedJobs.size === 0) return;
    
    setIsBulkScanning(true);
    let scannedCount = 0;
    let fansFoundCount = 0;
    
    try {
      const jobsToScan = jobs.filter(j => {
        if (!selectedJobs.has(j.id)) return false;
        // Skip jobs with manual override unless force rescan
        const hasManualOverride = j.fanInfo?.some(f => f.manualOverride);
        if (hasManualOverride && !forceRescan) return false;
        if (forceRescan) return true; // Re-scan all selected (including overridden if forced)
        // Only scan jobs without results or with NONE marker
        return !j.fanInfo || j.fanInfo.length === 0 || wasScannedNoFans(j.fanInfo);
      });
      
      for (const job of jobsToScan) {
        try {
          const result = await extractFansWithAI(job.description || job.summaryOfWorks || '', job.workItems);
          if (result && result.hasFans) {
            onUpdateJob({ ...job, fanInfo: result.fans });
            fansFoundCount += result.totalFanCount;
            
            // Auto-create linked fan job if category exists and not already linked
            if (fanCategoryId && !job.linkedFanJobId) {
              try {
                await createLinkedFanJob(job, result.fans, fanCategoryId);
                onFanJobCreated?.();
              } catch (createError) {
                console.error('Failed to create linked fan job:', createError);
              }
            }
          } else {
            // Mark as scanned with no fans
            onUpdateJob({ ...job, fanInfo: [{ type: '__SCANNED_NO_FANS__', quantity: 0, location: '' }] });
          }
          scannedCount++;
        } catch (error) {
          console.error(`Failed to scan job ${job.jobNumber}:`, error);
        }
      }
      
      toast({
        title: "Bulk Scan Complete",
        description: `Scanned ${scannedCount} jobs. Found ${fansFoundCount} fans total.`,
      });
      setSelectedJobs(new Set());
    } catch (error) {
      toast({
        title: "Bulk Scan Failed",
        description: "Some jobs could not be scanned.",
        variant: "destructive",
      });
    } finally {
      setIsBulkScanning(false);
    }
  };

  // Clear fan scan results for selected jobs
  const handleClearFanResults = () => {
    const jobsToClear = jobs.filter(j => selectedJobs.has(j.id) && j.fanInfo && j.fanInfo.length > 0);
    
    for (const job of jobsToClear) {
      onUpdateJob({ ...job, fanInfo: [] });
    }
    
    toast({
      title: "Fan Results Cleared",
      description: `Cleared fan scan results from ${jobsToClear.length} jobs.`,
    });
    setSelectedJobs(new Set());
  };

  const handleDescriptionSave = (jobId: string, newDescription: string) => {
    const job = jobs.find(j => j.id === jobId);
    if (job) {
      onUpdateJob({ ...job, description: newDescription });
      toast({
        title: "Description Updated",
        description: "Job description has been saved.",
      });
    }
  };

  const getTotalFanCount = (fanInfo: FanInfo[] | null): number => {
    if (!fanInfo || fanInfo.length === 0) return 0;
    return fanInfo.reduce((sum, fan) => sum + fan.quantity, 0);
  };

  if (jobs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-3">
          <FileText className="w-8 h-8 text-muted-foreground" />
        </div>
        <h3 className="text-base font-semibold text-foreground">No jobs yet</h3>
        <p className="text-sm text-muted-foreground mt-1">Upload a PDF to extract job details</p>
      </div>
    );
  }

  return (
    <>
      {/* Batch Action Bar */}
      {selectedJobs.size > 0 && (
        <div className="mb-3 p-3 bg-primary/10 border border-primary/30 rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium">{selectedJobs.size} jobs selected</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedJobs(new Set())}
            >
              <X className="w-3.5 h-3.5 mr-1" />
              Clear
            </Button>
          </div>
          <div className="flex items-center gap-2 relative">
            {/* Clear Fan Results Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearFanResults}
              disabled={isBulkScanning}
            >
              <X className="w-3.5 h-3.5 mr-1" />
              Clear Fans
            </Button>
            {/* Bulk Fan Scan Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleBulkFanScan(false)}
              disabled={isBulkScanning}
            >
              {isBulkScanning ? (
                <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
              ) : (
                <Fan className="w-3.5 h-3.5 mr-1" />
              )}
              Scan Fans
            </Button>
            {/* Re-scan All Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleBulkFanScan(true)}
              disabled={isBulkScanning}
            >
              {isBulkScanning ? (
                <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
              ) : (
                <Wand2 className="w-3.5 h-3.5 mr-1" />
              )}
              Re-scan All
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={() => setShowBatchTeamSelector(!showBatchTeamSelector)}
            >
              <Users className="w-3.5 h-3.5 mr-1" />
              Assign Team
            </Button>
            {showBatchTeamSelector && (
              <div className="absolute top-full right-0 mt-2 z-50 bg-card border border-border rounded-lg shadow-xl p-2 min-w-[180px]">
                <div className="text-xs font-medium text-muted-foreground px-2 py-1 mb-1">Select Team</div>
                <ScrollArea className="max-h-64">
                  <div className="space-y-0.5 pr-2">
                    <button
                      className="w-full text-left px-2 py-1.5 rounded hover:bg-muted text-sm flex items-center gap-2"
                      onClick={() => handleBatchTeamSelect(null)}
                    >
                      <div className="w-3 h-3 rounded-full bg-muted-foreground/30" />
                      Unassign
                    </button>
                    {teams.map(team => (
                      <button
                        key={team.id}
                        className="w-full text-left px-2 py-1.5 rounded hover:bg-muted text-sm flex items-center gap-2"
                        onClick={() => handleBatchTeamSelect(team.id)}
                      >
                        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: team.color }} />
                        <span className="truncate">{team.name}</span>
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="data-table">
          <thead>
            <tr>
              {!readOnly && (
                <th className="w-10" onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={selectedJobs.size === jobs.length && jobs.length > 0}
                    onCheckedChange={toggleSelectAll}
                  />
                </th>
              )}
              <th className="w-28">Issued</th>
              <th className="w-28">Job #</th>
              <th className="w-40">Name / Address</th>
              <th className="w-32">Action</th>
              <th className="w-28">Assigned</th>
              <th className="w-28">Status</th>
              <th className="min-w-[200px]">Description</th>
              <th className="w-24">Fan</th>
              <th className="w-40">Private Notes</th>
              <th className="w-36">Booked/End</th>
              <th className="w-20">Files</th>
              <th className="w-20">Sign-Off</th>
              {!readOnly && <th className="w-12"></th>}
            </tr>
          </thead>
          <tbody>
            {/* Sort jobs: completed at the bottom */}
            {[...jobs].sort((a, b) => {
              const aCompleted = a.status === 'complete' || a.isCompleted || a.progress === 100;
              const bCompleted = b.status === 'complete' || b.isCompleted || b.progress === 100;
              if (aCompleted && !bCompleted) return 1;
              if (!aCompleted && bCompleted) return -1;
              return 0;
            }).map((job) => {
              const isExpanded = expandedDescriptions.has(job.id);
              const description = job.description || job.summaryOfWorks;
              const shouldTruncate = description.length > 100;
              const isCompleted = job.status === 'complete' || job.isCompleted || job.progress === 100;
              const isDuplicate = duplicateJobIds.has(job.id);
              
              // Determine next action for row coloring
              const jobContactHistory = contactHistoryMap[job.id] || [];
              const nextAction: NextAction = determineNextAction(jobContactHistory, { bookedDate: job.bookedDate, status: job.status });
              
              // Get row background class based on action urgency
              const getActionRowClass = (): string => {
                if (isDuplicate) return "bg-red-500/30 dark:bg-red-900/50 border-l-8 border-l-red-600 hover:bg-red-500/40 dark:hover:bg-red-800/60 ring-2 ring-red-500 animate-pulse";
                if (isCompleted) return "bg-emerald-200/80 dark:bg-emerald-800/60 border-l-4 border-l-emerald-500 hover:bg-emerald-300/80 dark:hover:bg-emerald-700/60 ring-1 ring-emerald-300 dark:ring-emerald-600";
                
                switch (nextAction) {
                  case 'call_now':
                    return "bg-red-100/80 dark:bg-red-900/40 border-l-4 border-l-red-500 hover:bg-red-200/80 dark:hover:bg-red-900/50";
                  case 'call_back':
                    return "bg-orange-100/80 dark:bg-orange-900/40 border-l-4 border-l-orange-500 hover:bg-orange-200/80 dark:hover:bg-orange-900/50";
                  case 'follow_up':
                    return "bg-purple-100/80 dark:bg-purple-900/40 border-l-4 border-l-purple-500 hover:bg-purple-200/80 dark:hover:bg-purple-900/50";
                  case 'await_callback':
                    return "bg-yellow-100/80 dark:bg-yellow-900/40 border-l-4 border-l-yellow-500 hover:bg-yellow-200/80 dark:hover:bg-yellow-900/50";
                  case 'booked':
                    return "bg-emerald-100/80 dark:bg-emerald-900/40 border-l-4 border-l-emerald-500 hover:bg-emerald-200/80 dark:hover:bg-emerald-900/50";
                  case 'escalate_nph':
                    return "bg-pink-100/80 dark:bg-pink-900/40 border-l-4 border-l-pink-500 hover:bg-pink-200/80 dark:hover:bg-pink-900/50";
                  default:
                    return "hover:bg-muted/30";
                }
              };
              
              return (
                <tr 
                  key={job.id} 
                  className={cn(
                    "transition-colors cursor-pointer relative",
                    getActionRowClass(),
                    selectedJobs.has(job.id) && "bg-primary/5"
                  )}
                  onClick={() => isDuplicate ? setDuplicateActionJob(job) : setShowJobDetails(job)}
                >
                  {/* Duplicate Overlay */}
                  {isDuplicate && (
                    <td colSpan={1} className="absolute inset-0 pointer-events-none flex items-center justify-center z-10">
                      <div className="absolute inset-0 flex items-center">
                        <span className="text-red-700 dark:text-red-300 font-black text-4xl tracking-widest opacity-40 rotate-[-5deg] whitespace-nowrap ml-[200px]">
                          DUPLICATE
                        </span>
                      </div>
                    </td>
                  )}
                  {/* Checkbox Column - only for non-readonly */}
                  {!readOnly && (
                    <td className="text-center relative z-20" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selectedJobs.has(job.id)}
                        onCheckedChange={() => toggleJobSelection(job.id)}
                      />
                    </td>
                  )}
                  {/* Issued Column - When job was uploaded */}
                  <td className="font-mono text-muted-foreground relative z-20">
                    {format(job.dateIssued, 'dd/MM/yy')}
                  </td>
                  <td className="relative z-20">
                    {(() => {
                      // Check if job should show ongoing alert (manual OR 24hr auto-trigger)
                      const signOffData = getSignOffStatus(job.id, job.team, job.team2);
                      const alertInfo = shouldShowOngoingAlert(job, signOffData.allSignedOff);
                      const showOngoingBadge = alertInfo.showAlert;
                      
                      return (
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono font-semibold text-primary">
                            {job.jobNumber}
                          </span>
                          {isDuplicate && (
                            <Badge className="bg-red-600 text-white font-bold text-xs animate-pulse">
                              DUP
                            </Badge>
                          )}
                          {showOngoingBadge && (
                            <Badge 
                              className={cn(
                                "text-white font-bold text-xs animate-pulse shadow-md flex items-center gap-1",
                                alertInfo.isAutoTriggered 
                                  ? "bg-orange-600" // Auto-triggered (overdue)
                                  : "bg-amber-500"  // Manual ongoing
                              )}
                              title={alertInfo.isAutoTriggered 
                                ? `Overdue: ${alertInfo.hoursOverdue}h past 24hr threshold` 
                                : 'Manually marked as ongoing'
                              }
                            >
                              <Clock className="w-3 h-3" />
                              {alertInfo.isAutoTriggered ? 'OVERDUE' : 'ONGOING'}
                            </Badge>
                          )}
                        </div>
                      );
                    })()}
                  </td>
                  <td className="relative z-20">
                    <div className="space-y-0.5">
                      <p className="font-medium text-foreground text-sm">{job.name}</p>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate max-w-[120px]">{job.address}</span>
                      </div>
                    </div>
                  </td>
                  {/* Action Column */}
                  <td onClick={(e) => e.stopPropagation()} className="relative z-20">
                    <ContactCell
                      jobId={job.id}
                      jobNumber={job.jobNumber}
                      tenantName={job.name}
                      phoneNumber={job.phoneNumber}
                      description={job.description}
                      bookedDate={job.bookedDate}
                      status={job.status}
                      contactHistory={contactHistoryMap[job.id] || []}
                      onBookJob={(bookedDate, isFlexible) => handleBookedDateChange(job.id, bookedDate, isFlexible)}
                      onDescriptionChange={(newDesc) => handleDescriptionSave(job.id, newDesc)}
                    />
                  </td>
                  {/* Assigned Column */}
                  <td onClick={(e) => e.stopPropagation()} className="relative z-20">
                    <div className="relative">
                      {(() => {
                        const bookedDateStr = job.bookedDate instanceof Date 
                          ? job.bookedDate.toISOString() 
                          : job.bookedDate;
                        // Check conflicts for both teams
                        const hasConflict = hasAvailabilityConflict(job.team, bookedDateStr) || 
                                           (job.team2 && hasAvailabilityConflict(job.team2, bookedDateStr));
                        
                        return (
                          <>
                            {job.team ? (
                              <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-1">
                                  {hasConflict && (
                                    <AlertTriangle className="w-4 h-4 text-red-500 animate-pulse flex-shrink-0" />
                                  )}
                                  <Badge 
                                    className={cn(
                                      "cursor-pointer text-xs",
                                      hasAvailabilityConflict(job.team, bookedDateStr) && "animate-pulse ring-2 ring-red-500"
                                    )}
                                    style={{ backgroundColor: getTeamColor(job.team), color: 'white' }}
                                    onClick={() => setShowTeamSelector(job.id)}
                                    title={hasAvailabilityConflict(job.team, bookedDateStr) ? 'Team unavailable on booked date!' : undefined}
                                  >
                                    <Users className="w-3.5 h-3.5 mr-1" />
                                    {job.team}
                                  </Badge>
                                </div>
                                {/* Show second team if assigned */}
                                {job.team2 && (
                                  <div className="flex items-center gap-1">
                                    <Badge 
                                      className={cn(
                                        "cursor-pointer text-xs",
                                        hasAvailabilityConflict(job.team2, bookedDateStr) && "animate-pulse ring-2 ring-red-500"
                                      )}
                                      style={{ backgroundColor: getTeamColor(job.team2), color: 'white' }}
                                      onClick={() => setShowTeamSelector(job.id)}
                                      title={hasAvailabilityConflict(job.team2, bookedDateStr) ? 'Team unavailable on booked date!' : undefined}
                                    >
                                      <Users className="w-3.5 h-3.5 mr-1" />
                                      {job.team2}
                                    </Badge>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-6 text-xs px-2"
                                onClick={() => setShowTeamSelector(job.id)}
                              >
                                <Users className="w-3 h-3 mr-1" />
                                Assign
                              </Button>
                            )}
                          </>
                        );
                      })()}
                      {showTeamSelector === job.id && (
                        <TeamSelector
                          job={job}
                          currentCategoryId={currentCategoryId}
                          onSelect={(teamId) => handleTeamSelect(job.id, teamId)}
                          onClose={() => setShowTeamSelector(null)}
                          onDuplicateToCategory={(jobId, targetCategoryId, teamId) => {
                            if (onDuplicateToCategory) {
                              onDuplicateToCategory(jobId, targetCategoryId, teamId);
                            }
                          }}
                        />
                      )}
                    </div>
                  </td>
                  {/* Status Column - Booked date or UnBooked */}
                  <td onClick={(e) => e.stopPropagation()} className="relative z-20">
                    <BookedDateCell
                      bookedDate={job.bookedDate}
                      bookingNotes={job.bookingNotes || ''}
                      teamName={job.team}
                      isFlexible={job.isFlexibleBooking}
                      onDateChange={(date) => handleBookedDateChange(job.id, date)}
                      onNotesChange={(notes) => onUpdateJob({ ...job, bookingNotes: notes })}
                    />
                  </td>
                  <td onClick={(e) => e.stopPropagation()} className="relative z-20">
                    <InlineDescriptionEditor
                      description={description}
                      onSave={(newDesc) => handleDescriptionSave(job.id, newDesc)}
                      isExpanded={isExpanded}
                      onToggleExpand={() => toggleDescription(job.id)}
                      shouldTruncate={shouldTruncate}
                    />
                  </td>
                  {/* Fan Column */}
                  <td onClick={(e) => e.stopPropagation()}>
                    <div className="flex flex-col gap-1">
                      <FanEditor
                        fanInfo={job.fanInfo}
                        onUpdate={(fanInfo) => onUpdateJob({ ...job, fanInfo })}
                        job={job}
                        fanCategoryId={fanCategoryId}
                        onJobUpdated={(updates) => {
                          onUpdateJob({ ...job, ...updates });
                          // Trigger fan category refresh when fan job is created/updated
                          if (updates.linkedFanJobId) {
                            onFanJobCreated?.();
                          }
                        }}
                      />
                      {job.linkedFanJobId && (
                        <Badge variant="outline" className="text-xs bg-green-500/10 text-green-700 dark:text-green-400">
                          Linked
                        </Badge>
                      )}
                      {!hasActualFans(job.fanInfo) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 px-1.5 text-xs text-muted-foreground hover:text-primary"
                          onClick={() => handleScanForFans(job.id)}
                          disabled={scanningFanJobId === job.id}
                        >
                          {scanningFanJobId === job.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <>
                              <Wand2 className="w-3 h-3 mr-0.5" />
                              AI Scan
                            </>
                          )}
                        </Button>
                      )}
                      {hasActualFans(job.fanInfo) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 px-1.5 text-xs text-muted-foreground hover:text-primary"
                          onClick={() => handleScanForFans(job.id)}
                          disabled={scanningFanJobId === job.id}
                        >
                          {scanningFanJobId === job.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <>
                              <Wand2 className="w-3 h-3 mr-0.5" />
                              Re-scan
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  </td>
                  {/* Private Notes Column - Admin only */}
                  <td onClick={(e) => e.stopPropagation()}>
                    <PrivateNotesEditor
                      notes={job.privateNotes || ''}
                      onUpdate={(notes) => onUpdateJob({ ...job, privateNotes: notes })}
                    />
                  </td>
                  <td>
                    <div className="text-xs text-muted-foreground space-y-0.5">
                      <div className="flex items-center gap-1">
                        <span className="text-muted-foreground/70">B:</span>
                        <span>{job.bookedDate ? format(job.bookedDate, 'dd/MM/yy') : '-'}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-muted-foreground/70">E:</span>
                        <span>{job.completionDate ? format(job.completionDate, 'dd/MM/yy') : '-'}</span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className="flex items-center gap-1">
                      <Paperclip className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">
                        {job.attachments.length}
                      </span>
                    </div>
                  </td>
                  {/* Sign-Off Status Column */}
                  <td onClick={(e) => e.stopPropagation()} className="relative z-20">
                    <SignOffStatusIndicator
                      jobId={job.id}
                      team1={job.team}
                      team2={job.team2}
                      onClick={() => setSignOffHistoryJob(job)}
                    />
                  </td>
                  {!readOnly && (
                    <td onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7">
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setShowJobDetails(job)}>
                              <Edit2 className="w-4 h-4 mr-2" />
                              Edit Details
                            </DropdownMenuItem>
                            {onTransferJob && categories.length > 1 && (
                              <DropdownMenuItem onClick={() => setShowTransferModal(job)}>
                                <ArrowRightLeft className="w-4 h-4 mr-2" />
                                Transfer to...
                              </DropdownMenuItem>
                            )}
                            {onDeleteJob && (
                              <DropdownMenuItem 
                                className="text-destructive"
                                onClick={() => {
                                  if (window.confirm(`Delete job #${job.jobNumber}?`)) {
                                    onDeleteJob(job.id);
                                  }
                                }}
                              >
                                <Trash2 className="w-4 h-4 mr-2" />
                                Delete Job
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                        {onDeleteJob && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => {
                              if (window.confirm(`Delete job #${job.jobNumber}?`)) {
                                onDeleteJob(job.id);
                              }
                            }}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showJobDetails && (
        <JobDetailsModal
          job={showJobDetails}
          onClose={() => setShowJobDetails(null)}
          onUpdate={onUpdateJob}
        />
      )}

      {/* Sign-Off History Modal */}
      {signOffHistoryJob && (
        <SignOffHistoryModal
          isOpen={true}
          onClose={() => setSignOffHistoryJob(null)}
          jobId={signOffHistoryJob.id}
          jobNumber={signOffHistoryJob.jobNumber}
          jobName={signOffHistoryJob.name}
          team1={signOffHistoryJob.team}
          team2={signOffHistoryJob.team2}
        />
      )}

      {/* Duplicate Action Modal */}
      {duplicateActionJob && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border-4 border-red-500 rounded-xl shadow-2xl w-full max-w-md animate-scale-in">
            {/* Header */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-red-500 bg-red-500/20">
              <div className="p-2 rounded-full bg-red-500/30">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-red-700 dark:text-red-400">DUPLICATE JOB</h2>
                <p className="text-sm text-muted-foreground">
                  Job <span className="font-mono font-bold">{duplicateActionJob.jobNumber}</span> appears multiple times
                </p>
              </div>
              <button 
                onClick={() => setDuplicateActionJob(null)} 
                className="ml-auto p-2 hover:bg-muted rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Job Details */}
            <div className="p-5 space-y-3">
              <div className="border border-border rounded-lg p-3 bg-muted/20">
                <p className="font-semibold">{duplicateActionJob.name}</p>
                <p className="text-sm text-muted-foreground truncate">{duplicateActionJob.address}</p>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-xs bg-muted px-2 py-0.5 rounded">
                    {duplicateActionJob.workItems.length} work items
                  </span>
                  <span className="text-xs bg-muted px-2 py-0.5 rounded">
                    {duplicateActionJob.progress}% complete
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Added {format(duplicateActionJob.dateIssued, 'dd MMM yyyy')}
                  </span>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                Choose an action for this duplicate job:
              </p>
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-2 px-5 pb-5">
              <Button
                variant="outline"
                className="w-full justify-start gap-2"
                onClick={() => {
                  setShowJobDetails(duplicateActionJob);
                  setDuplicateActionJob(null);
                }}
              >
                <Edit2 className="w-4 h-4" />
                Edit / Modify This Job
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start gap-2"
                onClick={() => {
                  const newJobNumber = `${duplicateActionJob.jobNumber}-${Date.now().toString().slice(-4)}`;
                  onUpdateJob({ ...duplicateActionJob, jobNumber: newJobNumber });
                  toast({
                    title: "Job Number Updated",
                    description: `Changed to ${newJobNumber} to resolve duplicate.`,
                  });
                  setDuplicateActionJob(null);
                }}
              >
                <Copy className="w-4 h-4" />
                Keep with New Job Number
              </Button>
              <Button
                variant="destructive"
                className="w-full justify-start gap-2"
                onClick={() => {
                  onDeleteJob(duplicateActionJob.id);
                  toast({
                    title: "Duplicate Deleted",
                    description: `Job #${duplicateActionJob.jobNumber} has been removed.`,
                  });
                  setDuplicateActionJob(null);
                }}
              >
                <Trash2 className="w-4 h-4" />
                Delete This Job
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Transfer Job Modal */}
      {showTransferModal && onTransferJob && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-sm animate-scale-in">
            <div className="flex items-center gap-3 px-5 py-4 border-b border-border bg-muted/30">
              <div className="p-2 rounded-full bg-primary/20">
                <ArrowRightLeft className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Transfer Job</h2>
                <p className="text-sm text-muted-foreground">
                  Move <span className="font-mono font-medium">#{showTransferModal.jobNumber}</span> to another database
                </p>
              </div>
              <button 
                onClick={() => setShowTransferModal(null)} 
                className="ml-auto p-2 hover:bg-muted rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5">
              <p className="text-sm text-muted-foreground mb-3">Select destination:</p>
              <ScrollArea className="max-h-64">
                <div className="space-y-2 pr-2">
                  {categories.map(cat => (
                    <button
                      key={cat.id}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border hover:bg-muted transition-colors text-left"
                      onClick={() => {
                        onTransferJob(showTransferModal.id, cat.id);
                        toast({
                          title: "Job Transferred",
                          description: `Job #${showTransferModal.jobNumber} moved to ${cat.name}.`,
                        });
                        setShowTransferModal(null);
                      }}
                    >
                      <div 
                        className="w-3 h-3 rounded-full flex-shrink-0" 
                        style={{ backgroundColor: cat.color }} 
                      />
                      <span className="font-medium text-sm">{cat.name}</span>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </div>

            <div className="flex justify-end gap-2 px-5 pb-5">
              <Button variant="outline" onClick={() => setShowTransferModal(null)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
});

JobTable.displayName = 'JobTable';
