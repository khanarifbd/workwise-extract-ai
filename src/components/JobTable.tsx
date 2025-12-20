import { useState } from 'react';
import { Job, ALLSAINTS_TEAMS, JobStatus, FanInfo } from '@/types/job';
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
  Wand2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { TeamSelector } from './TeamSelector';
import { ProgressEditor } from './ProgressEditor';
import { JobDetailsModal } from './JobDetailsModal';
import { StatusSelector } from './StatusSelector';
import { BookedDateCell } from './BookedDateCell';
import { extractFansWithAI } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
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
}

export const JobTable = ({ jobs, onUpdateJob, onDeleteJob, onToggleComplete, onBatchUpdateTeam }: JobTableProps) => {
  const [showTeamSelector, setShowTeamSelector] = useState<string | null>(null);
  const [showProgressEditor, setShowProgressEditor] = useState<string | null>(null);
  const [showJobDetails, setShowJobDetails] = useState<Job | null>(null);
  const [expandedDescriptions, setExpandedDescriptions] = useState<Set<string>>(new Set());
  const [selectedJobs, setSelectedJobs] = useState<Set<string>>(new Set());
  const [showBatchTeamSelector, setShowBatchTeamSelector] = useState(false);
  const [scanningFanJobId, setScanningFanJobId] = useState<string | null>(null);
  const { toast } = useToast();

  const handleTeamSelect = (jobId: string, teamId: string | null) => {
    const job = jobs.find(j => j.id === jobId);
    if (job) {
      const team = teamId ? ALLSAINTS_TEAMS.find(t => t.id === teamId) : null;
      onUpdateJob({ ...job, team: team?.name || null });
    }
    setShowTeamSelector(null);
  };

  const handleBatchTeamSelect = (teamId: string | null) => {
    if (onBatchUpdateTeam && selectedJobs.size > 0) {
      const team = teamId ? ALLSAINTS_TEAMS.find(t => t.id === teamId) : null;
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
    const team = ALLSAINTS_TEAMS.find(t => t.name === teamName);
    return team?.color;
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
      if (result && result.hasFans) {
        onUpdateJob({ ...job, fanInfo: result.fans });
        toast({
          title: "Fans Detected",
          description: `Found ${result.totalFanCount} fan(s) requiring installation.`,
        });
      } else {
        onUpdateJob({ ...job, fanInfo: [] });
        toast({
          title: "No Fans Found",
          description: "No fan installations detected in this job.",
        });
      }
    } catch (error) {
      toast({
        title: "Scan Failed",
        description: "Could not scan for fans.",
        variant: "destructive",
      });
    } finally {
      setScanningFanJobId(null);
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
                <button
                  className="w-full text-left px-2 py-1.5 rounded hover:bg-muted text-sm flex items-center gap-2"
                  onClick={() => handleBatchTeamSelect(null)}
                >
                  <div className="w-3 h-3 rounded-full bg-muted-foreground/30" />
                  Unassign
                </button>
                {ALLSAINTS_TEAMS.map(team => (
                  <button
                    key={team.id}
                    className="w-full text-left px-2 py-1.5 rounded hover:bg-muted text-sm flex items-center gap-2"
                    onClick={() => handleBatchTeamSelect(team.id)}
                  >
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: team.color }} />
                    {team.name}
                  </button>
                ))}
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
            {jobs.map((job) => {
              const isExpanded = expandedDescriptions.has(job.id);
              const description = job.description || job.summaryOfWorks;
              const shouldTruncate = description.length > 100;
              const isCompleted = job.status === 'complete' || job.isCompleted || job.progress === 100;
              
              return (
                <tr 
                  key={job.id} 
                  className={cn(
                    "transition-colors cursor-pointer",
                    isCompleted 
                      ? "bg-emerald-200/80 dark:bg-emerald-800/60 border-l-4 border-l-emerald-500 hover:bg-emerald-300/80 dark:hover:bg-emerald-700/60 ring-1 ring-emerald-300 dark:ring-emerald-600" 
                      : "hover:bg-muted/30",
                    selectedJobs.has(job.id) && "bg-primary/5"
                  )}
                  onClick={() => setShowJobDetails(job)}
                >
                  {/* Checkbox Column */}
                  <td className="text-center" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selectedJobs.has(job.id)}
                      onCheckedChange={() => toggleJobSelection(job.id)}
                    />
                  </td>
                  {/* Issued Column - When job was uploaded */}
                  <td className="font-mono text-muted-foreground">
                    {format(job.dateIssued, 'dd/MM/yy')}
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <BookedDateCell
                      bookedDate={job.bookedDate}
                      onDateChange={(date) => handleBookedDateChange(job.id, date)}
                    />
                  </td>
                  <td>
                    <span className="font-mono font-semibold text-primary">
                      {job.jobNumber}
                    </span>
                  </td>
                  <td>
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
                  <td onClick={(e) => e.stopPropagation()}>
                    <div className="relative">
                      <p className={cn(
                        "text-foreground",
                        !isExpanded && shouldTruncate && "line-clamp-2"
                      )}>
                        {description}
                      </p>
                      {shouldTruncate && (
                        <button
                          onClick={() => toggleDescription(job.id)}
                          className="flex items-center gap-1 text-primary hover:underline mt-1"
                        >
                          {isExpanded ? (
                            <>Less <ChevronUp className="w-3.5 h-3.5" /></>
                          ) : (
                            <>More <ChevronDown className="w-3.5 h-3.5" /></>
                          )}
                        </button>
                      )}
                    </div>
                  </td>
                  {/* Fan Column */}
                  <td onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1">
                      {job.fanInfo && job.fanInfo.length > 0 ? (
                        <Badge className="bg-cyan-500/20 text-cyan-700 dark:text-cyan-400 border-cyan-500/30">
                          <Fan className="w-3 h-3 mr-1" />
                          {getTotalFanCount(job.fanInfo)}
                        </Badge>
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
                          onSelect={(teamId) => handleTeamSelect(job.id, teamId)}
                          onClose={() => setShowTeamSelector(null)}
                        />
                      )}
                    </div>
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <div className="relative min-w-[110px]">
                      <div 
                        className="cursor-pointer"
                        onClick={() => setShowProgressEditor(job.id)}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium">{job.progress}%</span>
                        </div>
                        <Progress value={job.progress} className="h-2" />
                      </div>
                      {showProgressEditor === job.id && (
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
    </>
  );
};
