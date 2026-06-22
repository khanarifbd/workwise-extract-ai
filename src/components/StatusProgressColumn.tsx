import { useState } from 'react';
import { JobStatus, JOB_STATUS_OPTIONS } from '@/types/job';
import { ChevronDown, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';

interface StatusProgressColumnProps {
  currentStatus: JobStatus;
  progress: number;
  progressNotes: string;
  isCompleted: boolean;
  onUpdate: (updates: { status?: JobStatus; progress?: number; progressNotes?: string; isCompleted?: boolean }) => void;
}

export const StatusProgressColumn = ({ 
  currentStatus, 
  progress, 
  progressNotes, 
  isCompleted,
  onUpdate 
}: StatusProgressColumnProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [localProgress, setLocalProgress] = useState(progress);
  const [localNotes, setLocalNotes] = useState(progressNotes);
  
  const currentOption = JOB_STATUS_OPTIONS.find(o => o.value === currentStatus) || JOB_STATUS_OPTIONS[0];

  const handleStatusSelect = (status: JobStatus) => {
    const isComplete = status === 'complete';
    const newProgress = isComplete ? 100 : (progress === 100 ? 50 : progress);
    onUpdate({ 
      status, 
      isCompleted: isComplete,
      progress: newProgress
    });
    if (!isComplete) {
      setLocalProgress(newProgress);
    }
  };

  const handleProgressSave = () => {
    onUpdate({ 
      progress: localProgress, 
      progressNotes: localNotes,
      isCompleted: localProgress === 100,
      status: localProgress === 100 ? 'complete' : currentStatus
    });
    setIsOpen(false);
  };

  const handleOpenEditor = () => {
    setLocalProgress(progress);
    setLocalNotes(progressNotes);
    setIsOpen(true);
  };

  if (isCompleted) {
    const handleReopen = () => {
      if (confirm('Reverse completion? This job will be moved back to Booked/Pending status.')) {
        onUpdate({ isCompleted: false });
      }
    };
    return (
      <div className="flex flex-col items-start gap-1">
        <div className="flex items-center gap-2">
          <span className="text-emerald-700 dark:text-emerald-300 font-black text-sm uppercase tracking-wide">
            COMPLETED
          </span>
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleReopen}
            className="text-xs font-medium text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/50 border border-amber-300 dark:border-amber-700 rounded px-2 py-0.5 transition-colors"
            title="Reverse completion - move back to Booked"
          >
            ↩ Mark Incomplete
          </button>
          <button
            onClick={handleOpenEditor}
            className="text-xs text-muted-foreground hover:text-foreground underline"
          >
            Edit
          </button>
        </div>
        
        {isOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
            <div className="absolute top-full left-0 mt-1 z-50 bg-card border border-border rounded-xl shadow-xl p-4 min-w-[280px]">
              <StatusProgressEditor
                currentStatus={currentStatus}
                localProgress={localProgress}
                localNotes={localNotes}
                setLocalProgress={setLocalProgress}
                setLocalNotes={setLocalNotes}
                onStatusSelect={handleStatusSelect}
                onSave={handleProgressSave}
                onClose={() => setIsOpen(false)}
              />
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="relative min-w-[140px]">
      <div 
        className="cursor-pointer space-y-1.5"
        onClick={handleOpenEditor}
      >
        {/* Status Badge */}
        <div
          className={cn(
            "flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium w-fit",
            "hover:opacity-80 border border-transparent hover:border-border"
          )}
          style={{ 
            backgroundColor: `${currentOption.color}20`,
            color: currentOption.color 
          }}
        >
          <div 
            className="w-2 h-2 rounded-full" 
            style={{ backgroundColor: currentOption.color }}
          />
          {currentOption.label}
          <ChevronDown className="w-3 h-3" />
        </div>
        
        {/* Progress Bar */}
        <div className="flex items-center gap-2">
          <Progress value={progress} className="h-2 flex-1" />
          <span className="text-xs font-mono font-medium text-muted-foreground w-8">{progress}%</span>
        </div>
      </div>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute top-full left-0 mt-1 z-50 bg-card border border-border rounded-xl shadow-xl p-4 min-w-[280px]">
            <StatusProgressEditor
              currentStatus={currentStatus}
              localProgress={localProgress}
              localNotes={localNotes}
              setLocalProgress={setLocalProgress}
              setLocalNotes={setLocalNotes}
              onStatusSelect={handleStatusSelect}
              onSave={handleProgressSave}
              onClose={() => setIsOpen(false)}
            />
          </div>
        </>
      )}
    </div>
  );
};

// Separate editor component
interface StatusProgressEditorProps {
  currentStatus: JobStatus;
  localProgress: number;
  localNotes: string;
  setLocalProgress: (val: number) => void;
  setLocalNotes: (val: string) => void;
  onStatusSelect: (status: JobStatus) => void;
  onSave: () => void;
  onClose: () => void;
}

const StatusProgressEditor = ({
  currentStatus,
  localProgress,
  localNotes,
  setLocalProgress,
  setLocalNotes,
  onStatusSelect,
  onSave,
  onClose
}: StatusProgressEditorProps) => (
  <div className="space-y-4">
    {/* Status Options */}
    <div>
      <label className="text-xs font-medium text-muted-foreground mb-2 block">Status</label>
      <div className="grid grid-cols-2 gap-1 max-h-[180px] overflow-y-auto">
        {JOB_STATUS_OPTIONS.map((option) => (
          <button
            key={option.value}
            className={cn(
              "text-left px-2 py-1.5 rounded text-xs flex items-center gap-2 transition-colors",
              "hover:bg-muted",
              currentStatus === option.value && "bg-muted ring-1 ring-primary"
            )}
            onClick={() => onStatusSelect(option.value)}
          >
            <div 
              className="w-2.5 h-2.5 rounded-full flex-shrink-0" 
              style={{ backgroundColor: option.color }}
            />
            <span className="truncate">{option.label}</span>
          </button>
        ))}
      </div>
    </div>

    {/* Progress Slider */}
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-xs font-medium text-muted-foreground">Progress</label>
        <span className="text-sm font-mono font-semibold text-primary">{localProgress}%</span>
      </div>
      <Slider
        value={[localProgress]}
        onValueChange={(value) => setLocalProgress(value[0])}
        max={100}
        step={5}
        className="w-full"
      />
    </div>
    
    {/* Progress Notes */}
    <div>
      <label className="text-xs font-medium text-muted-foreground mb-2 block">Progress Notes</label>
      <Textarea
        value={localNotes}
        onChange={(e) => setLocalNotes(e.target.value)}
        placeholder="Describe current progress..."
        className="min-h-[60px] resize-none text-sm"
      />
    </div>

    {/* Action Buttons */}
    <div className="flex gap-2">
      <Button variant="outline" size="sm" onClick={onClose} className="flex-1">
        Cancel
      </Button>
      <Button size="sm" onClick={onSave} className="flex-1">
        Save
      </Button>
    </div>
  </div>
);
