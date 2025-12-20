import { useState } from 'react';
import { Job, ALLSAINTS_TEAMS } from '@/types/job';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
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
  CheckCircle2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { TeamSelector } from './TeamSelector';
import { ProgressEditor } from './ProgressEditor';
import { JobDetailsModal } from './JobDetailsModal';
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
}

export const JobTable = ({ jobs, onUpdateJob, onDeleteJob, onToggleComplete }: JobTableProps) => {
  const [showTeamSelector, setShowTeamSelector] = useState<string | null>(null);
  const [showProgressEditor, setShowProgressEditor] = useState<string | null>(null);
  const [showJobDetails, setShowJobDetails] = useState<Job | null>(null);
  const [expandedDescriptions, setExpandedDescriptions] = useState<Set<string>>(new Set());

  const handleTeamSelect = (jobId: string, teamId: string | null) => {
    const job = jobs.find(j => j.id === jobId);
    if (job) {
      const team = teamId ? ALLSAINTS_TEAMS.find(t => t.id === teamId) : null;
      onUpdateJob({ ...job, team: team?.name || null });
    }
    setShowTeamSelector(null);
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

  const getTeamColor = (teamName: string | null) => {
    if (!teamName) return undefined;
    const team = ALLSAINTS_TEAMS.find(t => t.name === teamName);
    return team?.color;
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
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="data-table">
          <thead>
            <tr>
              <th className="w-12">Status</th>
              <th className="w-24">Date</th>
              <th className="w-28">Job #</th>
              <th className="w-44">Name / Contact</th>
              <th className="min-w-[220px]">Description</th>
              <th className="w-36">SOR Codes</th>
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
              const isCompleted = job.isCompleted || job.progress === 100;
              
              return (
                <tr 
                  key={job.id} 
                  className={cn(
                    "transition-colors cursor-pointer",
                    isCompleted 
                      ? "bg-success/10 border-l-4 border-l-success hover:bg-success/15" 
                      : "hover:bg-muted/30"
                  )}
                  onClick={() => setShowJobDetails(job)}
                >
                  {/* Status Column - Click to toggle */}
                  <td className="text-center" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => onToggleComplete(job)}
                      className="flex flex-col items-center gap-0.5 mx-auto hover:scale-110 transition-transform"
                      title={isCompleted ? "Mark as incomplete" : "Mark as complete"}
                    >
                      {isCompleted ? (
                        <>
                          <CheckCircle2 className="w-6 h-6 text-success fill-success/20" />
                          <span className="text-[10px] font-bold text-success uppercase tracking-wide">Complete</span>
                        </>
                      ) : (
                        <div className="w-6 h-6 rounded-full border-2 border-muted-foreground/30 hover:border-success hover:bg-success/10 transition-colors" />
                      )}
                    </button>
                  </td>
                  <td className="font-mono text-muted-foreground">
                    {format(job.dateIssued, 'dd/MM/yy')}
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
