import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { StickyNote, Save } from 'lucide-react';

interface PrivateNotesEditorProps {
  notes: string;
  onUpdate: (notes: string) => void;
}

export const PrivateNotesEditor = ({ notes, onUpdate }: PrivateNotesEditorProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [editedNotes, setEditedNotes] = useState(notes);

  const handleSave = () => {
    onUpdate(editedNotes);
    setIsOpen(false);
  };

  const handleOpen = (open: boolean) => {
    if (open) {
      setEditedNotes(notes);
    }
    setIsOpen(open);
  };

  return (
    <Popover open={isOpen} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={`h-7 px-2 text-xs ${notes ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}`}
        >
          <StickyNote className="w-3.5 h-3.5 mr-1" />
          {notes ? (
            <span className="max-w-[80px] truncate">{notes}</span>
          ) : (
            'Add Note'
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3" align="start">
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              Private Notes (Admin Only)
            </label>
            <Textarea
              value={editedNotes}
              onChange={(e) => setEditedNotes(e.target.value)}
              placeholder="Add private notes about this job..."
              className="min-h-[80px] text-sm"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setIsOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave}>
              <Save className="w-3 h-3 mr-1" />
              Save
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};
