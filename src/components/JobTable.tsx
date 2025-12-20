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
  ChevronUp
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
}

export const JobTable = ({ jobs, onUpdateJob, onDeleteJob }: JobTableProps) => {
  const [showTeamSelector, setShowTeamSelector] = useState<string | null>(null);
  const [showProgressEditor, setShowProgressEditor] = useState<string | null>(null);
  const [showJobDetails, setShowJobDetails] = useState<Job | null>(null);
  const [expandedDescriptions, setExpandedDescriptions] = useState<Set<string>>(new Set());

  const handleTeamSelect = (jobId: string, teamId: string) => {
    const job = jobs.find(j => j.id === jobId);
    if (job) {
      const team = ALLSAINTS_TEAMS.find(t => t.id === teamId);
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
        <table className="data-table text-sm">
          <thead>
            <tr>
              <th className="w-20">Date</th>
              <th className="w-24">Job #</th>
              <th className="w-40">Name / Contact</th>
              <th className="min-w-[200px]">Description</th>
              <th className="w-32">SOR Codes</th>
              <th className="w-28">Team</th>
              <th className="w-28">Progress</th>
              <th className="w-32">Start/End</th>
              <th className="w-16">Files</th>
              <th className="w-10"></th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => {
              const isExpanded = expandedDescriptions.has(job.id);
              const description = job.description || job.summaryOfWorks;
              const shouldTruncate = description.length > 100;
              
              return (
                <tr 
                  key={job.id} 
                  className={cn(
                    "transition-colors cursor-pointer hover:bg-muted/30",
                    job.isCompleted && "bg-success/5"
                  )}
                  onClick={() => setShowJobDetails(job)}
                >
                  <td className="font-mono text-xs text-muted-foreground">
                    {format(job.dateIssued, 'dd/MM/yy')}
                  </td>
                  <td>
                    <span className="font-mono font-semibold text-primary text-xs">
                      {job.jobNumber}
                    </span>
                  </td>
                  <td>
                    <div className="space-y-0.5">
                      <p className="font-medium text-foreground text-xs">{job.name}</p>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate max-w-[120px]">{job.address}</span>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Phone className="w-3 h-3 flex-shrink-0" />
                        <span>{job.phoneNumber}</span>
                      </div>
                    </div>
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <div className="relative">
                      <p className={cn(
                        "text-xs text-foreground",
                        !isExpanded && shouldTruncate && "line-clamp-2"
                      )}>
                        {description}
                      </p>
                      {shouldTruncate && (
                        <button
                          onClick={() => toggleDescription(job.id)}
                          className="flex items-center gap-1 text-xs text-primary hover:underline mt-1"
                        >
                          {isExpanded ? (
                            <>Less <ChevronUp className="w-3 h-3" /></>
                          ) : (
                            <>More <ChevronDown className="w-3 h-3" /></>
                          )}
                        </button>
                      )}
                    </div>
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-1 max-w-[120px]">
                      {job.workItems.slice(0, 2).map((item, idx) => (
                        <Badge key={idx} variant="secondary" className="font-mono text-[10px] px-1">
                          {item.sorCode}
                        </Badge>
                      ))}
                      {job.workItems.length > 2 && (
                        <Badge variant="outline" className="text-[10px] px-1">
                          +{job.workItems.length - 2}
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <div className="relative">
                      {job.team ? (
                        <Badge 
                          className="cursor-pointer text-[10px]"
                          style={{ backgroundColor: getTeamColor(job.team), color: 'white' }}
                          onClick={() => setShowTeamSelector(job.id)}
                        >
                          <Users className="w-3 h-3 mr-1" />
                          {job.team}
                        </Badge>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 text-xs"
                          onClick={() => setShowTeamSelector(job.id)}
                        >
                          <Users className="w-3 h-3 mr-1" />
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
                    <div className="relative min-w-[100px]">
                      <div 
                        className="cursor-pointer"
                        onClick={() => setShowProgressEditor(job.id)}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] font-medium">{job.progress}%</span>
                        </div>
                        <Progress value={job.progress} className="h-1.5" />
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
                    <div className="text-[10px] text-muted-foreground space-y-0.5">
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
                      <Paperclip className="w-3 h-3 text-muted-foreground" />
                      <span className="text-[10px] text-muted-foreground">
                        {job.attachments.length}
                      </span>
                    </div>
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-6 w-6">
                          <MoreVertical className="w-3 h-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setShowJobDetails(job)}>
                          <Edit2 className="w-3 h-3 mr-2" />
                          Edit Details
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          className="text-destructive"
                          onClick={() => onDeleteJob(job.id)}
                        >
                          <Trash2 className="w-3 h-3 mr-2" />
                          Delete Job
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
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
