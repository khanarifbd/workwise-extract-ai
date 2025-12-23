import { useState, useMemo } from 'react';
import { Job, JobStatus, FanInfo, Team } from '@/types/job';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { format } from 'date-fns';
import { 
  Users, 
  Edit2, 
  Trash2, 
  Phone,
  MapPin,
  FileText,
  MoreVertical,
  Paperclip,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  X,
  Fan,
  Loader2,
  Wand2,
  CheckCircle,
  AlertTriangle,
  Copy,
  ArrowRightLeft
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { TeamSelector } from './TeamSelector';
import { ProgressEditor } from './ProgressEditor';
import { JobDetailsModal } from './JobDetailsModal';
import { StatusSelector } from './StatusSelector';
import { BookedDateCell } from './BookedDateCell';
import { InlineDescriptionEditor } from './InlineDescriptionEditor';
import { extractFansWithAI, createLinkedFanJob } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { useTeamSettings } from '@/hooks/useTeamSettings';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface JobTableProps {
  jobs: Job[];
  onUpdateJob: (job: Job) => void;
  onDeleteJob: (jobId: string) => void;
  onToggleComplete: (job: Job) => void;
  onBatchUpdateTeam?: (jobIds: string[], teamName: string | null) => void;
  onTransferJob?: (jobId: string, targetCategoryId: string) => void;
  onDuplicateToCategory?: (jobId: string, targetCategoryId: string, teamId: string) => void;
  fanCategoryId?: string;
  onFanJobCreated?: () => void;
  isFanCategory?: boolean;
  currentCategoryId?: string;
  categories?: { id: string; name: string; color: string }[];
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

export const JobTable = ({ jobs, onUpdateJob, onDeleteJob, onToggleComplete, onBatchUpdateTeam, onTransferJob, onDuplicateToCategory, fanCategoryId, onFanJobCreated, isFanCategory = false, currentCategoryId, categories = [] }: JobTableProps) => {
  const [showTeamSelector, setShowTeamSelector] = useState<string | null>(null);
  const [showTransferModal, setShowTransferModal] = useState<Job | null>(null);
  const [showProgressEditor, setShowProgressEditor] = useState<string | null>(null);
  const [showJobDetails, setShowJobDetails] = useState<Job | null>(null);
  const [expandedDescriptions, setExpandedDescriptions] = useState<Set<string>>(new Set());
  const [selectedJobs, setSelectedJobs] = useState<Set<string>>(new Set());
  const [showBatchTeamSelector, setShowBatchTeamSelector] = useState(false);
  const [scanningFanJobId, setScanningFanJobId] = useState<string | null>(null);
  const [isBulkScanning, setIsBulkScanning] = useState(false);
  const [duplicateActionJob, setDuplicateActionJob] = useState<Job | null>(null);
  const { toast } = useToast();
  const { settings: teamSettings } = useTeamSettings();
  
  // Build dynamic teams list from settings based on category type
  const teams: Team[] = useMemo(() => {
    return teamSettings
      .filter(s => isFanCategory ? s.type === 'fan' : s.type === 'dm' || !s.type)
      .map(s => ({
        id: s.teamId,
        name: s.teamName,
        color: s.color || '#3B82F6',
        whatsappGroup: s.whatsappGroup || undefined,
      }));
  }, [teamSettings, isFanCategory]);
  
  // Find all duplicate job numbers
  const duplicateJobIds = findDuplicates(jobs);

  const handleTeamSelect = (jobId: string, teamId: string | null) => {
    const job = jobs.find(j => j.id === jobId);
    if (job) {
      const team = teamId ? teams.find(t => t.id === teamId) : null;
      onUpdateJob({ ...job, team: team?.name || null });
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

  const handleProgressUpdate = (jobId: string, progress: number, notes: string) => {
    const job = jobs.find(j => j.id === jobId);
    if (job) {
      onUpdateJob({ ...job, progress, progressNotes: notes });
    }
    setShowProgressEditor(null);
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

  const handleBookedDateChange = (jobId: string, bookedDate: Date | null) => {
    const job = jobs.find(j => j.id === jobId);
    if (job) {
      onUpdateJob({ ...job, bookedDate });
    }
  };

  const handleScanForFans = async (jobId: string) => {
    const job = jobs.find(j => j.id === jobId);
    if (!job) return;

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
        if (forceRescan) return true; // Re-scan all selected
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
              <th className="w-10" onClick={(e) => e.stopPropagation()}>
                <Checkbox
                  checked={selectedJobs.size === jobs.length && jobs.length > 0}
                  onCheckedChange={toggleSelectAll}
                />
              </th>
              <th className="w-28">Issued</th>
              <th className="w-28">Booked</th>
              <th className="w-28">Job #</th>
              <th className="w-44">Name / Contact</th>
              <th className="min-w-[220px]">Description</th>
              <th className="w-24">Fan</th>
              <th className="w-36">SOR Codes</th>
              <th className="w-28">Status</th>
              <th className="w-32">Team</th>
              <th className="w-32">Progress</th>
              <th className="w-36">Start/End</th>
              <th className="w-20">Files</th>
              <th className="w-12"></th>
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
              
              return (
                <tr 
                  key={job.id} 
                  className={cn(
                    "transition-colors cursor-pointer relative",
                    isDuplicate 
                      ? "bg-red-500/30 dark:bg-red-900/50 border-l-8 border-l-red-600 hover:bg-red-500/40 dark:hover:bg-red-800/60 ring-2 ring-red-500 animate-pulse" 
                      : job.bookedDate
                        ? "bg-amber-400/50 dark:bg-amber-600/40 border-l-4 border-l-amber-500 hover:bg-amber-400/60 dark:hover:bg-amber-600/50 ring-1 ring-amber-400"
                        : isCompleted 
                          ? "bg-emerald-200/80 dark:bg-emerald-800/60 border-l-4 border-l-emerald-500 hover:bg-emerald-300/80 dark:hover:bg-emerald-700/60 ring-1 ring-emerald-300 dark:ring-emerald-600" 
                          : "hover:bg-muted/30",
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
                  {/* Checkbox Column */}
                  <td className="text-center relative z-20" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selectedJobs.has(job.id)}
                      onCheckedChange={() => toggleJobSelection(job.id)}
                    />
                  </td>
                  {/* Issued Column - When job was uploaded */}
                  <td className="font-mono text-muted-foreground relative z-20">
                    {format(job.dateIssued, 'dd/MM/yy')}
                  </td>
                  <td onClick={(e) => e.stopPropagation()} className="relative z-20">
                    <BookedDateCell
                      bookedDate={job.bookedDate}
                      bookingNotes={job.bookingNotes || ''}
                      onDateChange={(date) => handleBookedDateChange(job.id, date)}
                      onNotesChange={(notes) => onUpdateJob({ ...job, bookingNotes: notes })}
                    />
                  </td>
                  <td className="relative z-20">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-primary">
                        {job.jobNumber}
                      </span>
                      {isDuplicate && (
                        <Badge className="bg-red-600 text-white font-bold text-xs animate-pulse">
                          DUP
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="relative z-20">
                    <div className="space-y-1">
                      <p className="font-medium text-foreground">{job.name}</p>
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                        <span className="truncate max-w-[140px]">{job.address}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Phone className="w-3.5 h-3.5 flex-shrink-0" />
                        <span>{job.phoneNumber}</span>
                      </div>
                    </div>
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
                      {hasActualFans(job.fanInfo) ? (
                        <>
                          <Badge className="bg-cyan-500/20 text-cyan-700 dark:text-cyan-400 border-cyan-500/30">
                            <Fan className="w-3 h-3 mr-1" />
                            {getTotalFanCount(job.fanInfo)}
                          </Badge>
                          {job.linkedFanJobId && (
                            <Badge variant="outline" className="text-xs bg-green-500/10 text-green-700 dark:text-green-400">
                              Linked
                            </Badge>
                          )}
                        </>
                      ) : wasScannedNoFans(job.fanInfo) ? (
                        <div className="flex flex-col gap-1">
                          <Badge variant="outline" className="text-xs bg-muted text-muted-foreground">
                            NONE
                          </Badge>
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
                        </div>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs"
                          onClick={() => handleScanForFans(job.id)}
                          disabled={scanningFanJobId === job.id}
                        >
                          {scanningFanJobId === job.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <>
                              <Wand2 className="w-3 h-3 mr-1" />
                              Scan
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-1 max-w-[130px]">
                      {job.workItems.slice(0, 2).map((item, idx) => (
                        <Badge key={idx} variant="secondary" className="font-mono text-xs px-1.5">
                          {item.sorCode}
                        </Badge>
                      ))}
                      {job.workItems.length > 2 && (
                        <Badge variant="outline" className="text-xs px-1.5">
                          +{job.workItems.length - 2}
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <StatusSelector 
                      currentStatus={job.status || 'pending'} 
                      onSelect={(status, isComplete) => handleStatusChange(job.id, status, isComplete)}
                    />
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <div className="relative">
                      {job.team ? (
                        <Badge 
                          className="cursor-pointer text-xs"
                          style={{ backgroundColor: getTeamColor(job.team), color: 'white' }}
                          onClick={() => setShowTeamSelector(job.id)}
                        >
                          <Users className="w-3.5 h-3.5 mr-1" />
                          {job.team}
                        </Badge>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7"
                          onClick={() => setShowTeamSelector(job.id)}
                        >
                          <Users className="w-3.5 h-3.5 mr-1" />
                          Assign
                        </Button>
                      )}
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
                  <td onClick={(e) => e.stopPropagation()}>
                    <div className="relative min-w-[110px]">
                      {isCompleted ? (
                        <div className="flex items-center gap-2">
                          <span className="text-emerald-700 dark:text-emerald-300 font-black text-sm uppercase tracking-wide">
                            COMPLETED
                          </span>
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        </div>
                      ) : (
                        <div 
                          className="cursor-pointer"
                          onClick={() => setShowProgressEditor(job.id)}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium">{job.progress}%</span>
                          </div>
                          <Progress value={job.progress} className="h-2" />
                        </div>
                      )}
                      {showProgressEditor === job.id && !isCompleted && (
                        <ProgressEditor
                          currentProgress={job.progress}
                          currentNotes={job.progressNotes}
                          onSave={(progress, notes) => handleProgressUpdate(job.id, progress, notes)}
                          onClose={() => setShowProgressEditor(null)}
                        />
                      )}
                    </div>
                  </td>
                  <td>
                    <div className="text-xs text-muted-foreground space-y-0.5">
                      <div className="flex items-center gap-1">
                        <span className="text-muted-foreground/70">S:</span>
                        <span>{job.startDate ? format(job.startDate, 'dd/MM/yy') : '-'}</span>
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
                        </DropdownMenuContent>
                      </DropdownMenu>
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
                    </div>
                  </td>
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
};
