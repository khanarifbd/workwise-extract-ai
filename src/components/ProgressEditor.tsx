import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';

interface ProgressEditorProps {
  currentProgress: number;
  currentNotes: string;
  onSave: (progress: number, notes: string) => void;
  onClose: () => void;
}

export const ProgressEditor = ({ 
  currentProgress, 
  currentNotes, 
  onSave, 
  onClose 
}: ProgressEditorProps) => {
  const [progress, setProgress] = useState(currentProgress);
  const [notes, setNotes] = useState(currentNotes);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const handleSave = () => {
    onSave(progress, notes);
  };

  return (
    <div 
      ref={ref}
      className="absolute top-full left-0 mt-2 z-50 bg-popover border border-border rounded-xl shadow-lg p-4 min-w-[280px] animate-scale-in"
    >
      <div className="space-y-4">
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium">Progress</label>
            <span className="text-sm font-mono font-semibold text-primary">{progress}%</span>
          </div>
          <Slider
            value={[progress]}
            onValueChange={(value) => setProgress(value[0])}
            max={100}
            step={5}
            className="w-full"
          />
        </div>
        
        <div>
          <label className="text-sm font-medium mb-2 block">Progress Notes</label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Describe the current progress..."
            className="min-h-[80px] resize-none"
          />
        </div>

        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} className="flex-1">
            Save
          </Button>
        </div>
      </div>
    </div>
  );
};
