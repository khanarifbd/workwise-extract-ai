import { useState } from 'react';
import { Job, ALLSAINTS_TEAMS } from '@/types/job';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  Users, 
  Edit2, 
  Trash2, 
  CheckCircle2, 
  Circle,
  Phone,
  MapPin,
  FileText,
  MoreVertical,
  Paperclip,
  MessageSquare
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
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [showTeamSelector, setShowTeamSelector] = useState<string | null>(null);
  const [showProgressEditor, setShowProgressEditor] = useState<string | null>(null);
  const [showJobDetails, setShowJobDetails] = useState<Job | null>(null);

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

  const toggleCompletion = (job: Job) => {
    onUpdateJob({ 
      ...job, 
      isCompleted: !job.isCompleted,
      progress: !job.isCompleted ? 100 : job.progress,
      completionDate: !job.isCompleted ? new Date() : null
    });
  };

  const getTeamColor = (teamName: string | null) => {
    if (!teamName) return undefined;
    const team = ALLSAINTS_TEAMS.find(t => t.name === teamName);
    return team?.color;
  };

  if (jobs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mb-4">
          <FileText className="w-10 h-10 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold text-foreground">No jobs yet</h3>
        <p className="text-muted-foreground mt-1">Upload a PDF to extract job details</p>
      </div>
    );
  }

  return (
    <>
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="data-table">
          <thead>
            <tr>
              <th className="w-12"></th>
              <th>Job #</th>
              <th>Name / Contact</th>
              <th>Summary</th>
              <th>SOR Codes</th>
              <th>Team</th>
              <th>Progress</th>
              <th>Files</th>
              <th className="w-12"></th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <tr 
                key={job.id} 
                className={cn(
                  "transition-colors cursor-pointer",
                  job.isCompleted && "bg-success/5"
                )}
                onClick={() => setShowJobDetails(job)}
              >
                <td onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => toggleCompletion(job)}
                    className="p-1 hover:bg-muted rounded-md transition-colors"
                  >
                    {job.isCompleted ? (
                      <CheckCircle2 className="w-5 h-5 text-success" />
                    ) : (
                      <Circle className="w-5 h-5 text-muted-foreground" />
                    )}
                  </button>
                </td>
                <td>
                  <span className="font-mono font-semibold text-primary">
                    {job.jobNumber}
                  </span>
                </td>
                <td>
                  <div className="space-y-1">
                    <p className="font-medium text-foreground">{job.name}</p>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="w-3 h-3" />
                      <span className="truncate max-w-[150px]">{job.address}</span>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Phone className="w-3 h-3" />
                      <span>{job.phoneNumber}</span>
                    </div>
                  </div>
                </td>
                <td>
                  <p className="text-sm text-foreground line-clamp-2 max-w-[200px]">
                    {job.summaryOfWorks}
                  </p>
                </td>
                <td>
                  <div className="flex flex-wrap gap-1 max-w-[150px]">
                    {job.workItems.slice(0, 3).map((item, idx) => (
                      <Badge key={idx} variant="secondary" className="font-mono text-xs">
                        {item.sorCode}
                      </Badge>
                    ))}
                    {job.workItems.length > 3 && (
                      <Badge variant="outline" className="text-xs">
                        +{job.workItems.length - 3}
                      </Badge>
                    )}
                  </div>
                </td>
                <td onClick={(e) => e.stopPropagation()}>
                  <div className="relative">
                    {job.team ? (
                      <Badge 
                        className="cursor-pointer"
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
                        onClick={() => setShowTeamSelector(job.id)}
                      >
                        <Users className="w-3 h-3 mr-1" />
                        Assign
                      </Button>
                    )}
                    {showTeamSelector === job.id && (
                      <TeamSelector
                        onSelect={(teamId) => handleTeamSelect(job.id, teamId)}
                        onClose={() => setShowTeamSelector(null)}
                      />
                    )}
                  </div>
                </td>
                <td onClick={(e) => e.stopPropagation()}>
                  <div className="relative min-w-[120px]">
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
                  <div className="flex items-center gap-1">
                    <Paperclip className="w-3 h-3 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">
                      {job.attachments.length}
                    </span>
                  </div>
                </td>
                <td onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
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
                        onClick={() => onDeleteJob(job.id)}
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete Job
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
              </tr>
            ))}
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
