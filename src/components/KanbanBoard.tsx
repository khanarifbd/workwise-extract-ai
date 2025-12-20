import { useMemo, useState } from 'react';
import { Job, ALLSAINTS_TEAMS } from '@/types/job';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { format } from 'date-fns';
import { CheckCircle2, Phone, MapPin, Users, GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  useSensor,
  useSensors,
  PointerSensor,
  useDroppable,
  closestCorners
} from '@dnd-kit/core';
import { useDraggable } from '@dnd-kit/core';

interface KanbanBoardProps {
  jobs: Job[];
  groupBy: 'team' | 'status';
  onJobClick: (job: Job) => void;
  onToggleComplete: (job: Job) => void;
  onMoveJob?: (jobId: string, newTeam: string | null, newStatus?: string) => void;
}

interface DraggableJobCardProps {
  job: Job;
  groupBy: 'team' | 'status';
  onJobClick: (job: Job) => void;
  onToggleComplete: (job: Job) => void;
}

const DraggableJobCard = ({ job, groupBy, onJobClick, onToggleComplete }: DraggableJobCardProps) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: job.id,
    data: { job }
  });

  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
    zIndex: isDragging ? 999 : undefined,
    opacity: isDragging ? 0.5 : 1
  } : undefined;

  const isCompleted = job.isCompleted || job.progress === 100;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "bg-card border rounded-lg p-3 cursor-pointer transition-all hover:shadow-md",
        isCompleted
          ? "border-l-4 border-l-success bg-success/5"
          : "border-border hover:border-primary/50",
        isDragging && "shadow-lg"
      )}
    >
      {/* Drag Handle */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <button
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing p-1 -ml-1 text-muted-foreground hover:text-foreground"
          >
            <GripVertical className="w-4 h-4" />
          </button>
          <div onClick={() => onJobClick(job)}>
            <span className="font-mono text-sm font-semibold text-primary">
              {job.jobNumber}
            </span>
            <p className="font-medium text-foreground mt-0.5">{job.name}</p>
          </div>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleComplete(job);
          }}
          className={cn(
            "p-1 rounded-full transition-colors",
            isCompleted
              ? "text-success hover:bg-success/20"
              : "text-muted-foreground hover:bg-muted"
          )}
        >
          <CheckCircle2 className={cn("w-5 h-5", isCompleted && "fill-success")} />
        </button>
      </div>

      {/* Contact Info */}
      <div className="space-y-1 text-xs text-muted-foreground mb-2" onClick={() => onJobClick(job)}>
        <div className="flex items-center gap-1.5">
          <MapPin className="w-3 h-3" />
          <span className="truncate">{job.address}</span>
        </div>
        {job.phoneNumber && (
          <div className="flex items-center gap-1.5">
            <Phone className="w-3 h-3" />
            <span>{job.phoneNumber}</span>
          </div>
        )}
      </div>

      {/* Team Badge */}
      {groupBy === 'status' && job.team && (
        <div className="mb-2">
          <Badge
            className="text-xs"
            style={{
              backgroundColor: ALLSAINTS_TEAMS.find(t => t.name === job.team)?.color,
              color: 'white'
            }}
          >
            <Users className="w-3 h-3 mr-1" />
            {job.team}
          </Badge>
        </div>
      )}

      {/* Progress */}
      <div className="space-y-1" onClick={() => onJobClick(job)}>
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Progress</span>
          <span className="font-medium">{job.progress}%</span>
        </div>
        <Progress value={job.progress} className="h-1.5" />
      </div>

      {/* SOR Codes */}
      {job.workItems.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2" onClick={() => onJobClick(job)}>
          {job.workItems.slice(0, 3).map((item, idx) => (
            <Badge key={idx} variant="outline" className="text-xs px-1.5 py-0">
              {item.sorCode}
            </Badge>
          ))}
          {job.workItems.length > 3 && (
            <Badge variant="outline" className="text-xs px-1.5 py-0">
              +{job.workItems.length - 3}
            </Badge>
          )}
        </div>
      )}

      {/* Date */}
      <p className="text-xs text-muted-foreground mt-2" onClick={() => onJobClick(job)}>
        {format(job.dateIssued, 'dd MMM yyyy')}
      </p>
    </div>
  );
};

interface DroppableColumnProps {
  id: string;
  title: string;
  color: string;
  jobs: Job[];
  groupBy: 'team' | 'status';
  onJobClick: (job: Job) => void;
  onToggleComplete: (job: Job) => void;
}

const DroppableColumn = ({ id, title, color, jobs, groupBy, onJobClick, onToggleComplete }: DroppableColumnProps) => {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex-shrink-0 w-80 bg-muted/30 rounded-lg border border-border flex flex-col transition-colors",
        isOver && "border-primary bg-primary/5"
      )}
    >
      {/* Column Header */}
      <div
        className="p-3 border-b border-border rounded-t-lg"
        style={{ borderTopColor: color, borderTopWidth: 3 }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: color }}
            />
            <h3 className="font-semibold">{title}</h3>
          </div>
          <Badge variant="secondary">{jobs.length}</Badge>
        </div>
      </div>

      {/* Column Content */}
      <div className="flex-1 p-2 space-y-2 overflow-y-auto max-h-[calc(100vh-340px)]">
        {jobs.map((job) => (
          <DraggableJobCard
            key={job.id}
            job={job}
            groupBy={groupBy}
            onJobClick={onJobClick}
            onToggleComplete={onToggleComplete}
          />
        ))}

        {jobs.length === 0 && (
          <div className={cn(
            "text-center py-8 text-muted-foreground text-sm border-2 border-dashed rounded-lg",
            isOver && "border-primary bg-primary/10"
          )}>
            {isOver ? "Drop here" : "No jobs"}
          </div>
        )}
      </div>
    </div>
  );
};

export const KanbanBoard = ({ jobs, groupBy, onJobClick, onToggleComplete, onMoveJob }: KanbanBoardProps) => {
  const [activeId, setActiveId] = useState<string | null>(null);
  
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8
      }
    })
  );

  const columns = useMemo(() => {
    if (groupBy === 'team') {
      const teamColumns: { id: string; title: string; color: string; jobs: Job[] }[] = [
        { id: 'unassigned', title: 'Unassigned', color: '#6B7280', jobs: [] },
        ...ALLSAINTS_TEAMS.map(team => ({
          id: team.id,
          title: team.name,
          color: team.color,
          jobs: [] as Job[]
        }))
      ];

      jobs.forEach(job => {
        const team = ALLSAINTS_TEAMS.find(t => t.name === job.team);
        if (team) {
          const col = teamColumns.find(c => c.id === team.id);
          col?.jobs.push(job);
        } else {
          teamColumns[0].jobs.push(job);
        }
      });

      return teamColumns.filter(col => col.jobs.length > 0 || col.id === 'unassigned');
    } else {
      const statusColumns = [
        { id: 'not-started', title: 'Not Started', color: '#6B7280', jobs: [] as Job[] },
        { id: 'in-progress', title: 'In Progress', color: '#F59E0B', jobs: [] as Job[] },
        { id: 'completed', title: 'Completed', color: '#10B981', jobs: [] as Job[] }
      ];

      jobs.forEach(job => {
        if (job.isCompleted || job.progress === 100) {
          statusColumns[2].jobs.push(job);
        } else if (job.progress > 0) {
          statusColumns[1].jobs.push(job);
        } else {
          statusColumns[0].jobs.push(job);
        }
      });

      return statusColumns;
    }
  }, [jobs, groupBy]);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over || !onMoveJob) return;

    const jobId = active.id as string;
    const columnId = over.id as string;

    // Find what we're dropping into
    const targetColumn = columns.find(col => col.id === columnId);
    if (!targetColumn) return;

    if (groupBy === 'team') {
      const newTeam = columnId === 'unassigned' ? null : targetColumn.title;
      onMoveJob(jobId, newTeam);
    } else {
      onMoveJob(jobId, null, columnId);
    }
  };

  const activeJob = activeId ? jobs.find(j => j.id === activeId) : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 overflow-x-auto pb-4 h-full">
        {columns.map((column) => (
          <DroppableColumn
            key={column.id}
            id={column.id}
            title={column.title}
            color={column.color}
            jobs={column.jobs}
            groupBy={groupBy}
            onJobClick={onJobClick}
            onToggleComplete={onToggleComplete}
          />
        ))}
      </div>

      <DragOverlay>
        {activeJob && (
          <div className="bg-card border border-primary rounded-lg p-3 shadow-xl w-80 opacity-90">
            <div className="flex items-center gap-2">
              <GripVertical className="w-4 h-4 text-muted-foreground" />
              <div>
                <span className="font-mono text-sm font-semibold text-primary">
                  {activeJob.jobNumber}
                </span>
                <p className="font-medium text-foreground">{activeJob.name}</p>
              </div>
            </div>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
};
