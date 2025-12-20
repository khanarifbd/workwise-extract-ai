import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Edit2, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface InlineDescriptionEditorProps {
  description: string;
  onSave: (description: string) => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
  shouldTruncate: boolean;
}

export const InlineDescriptionEditor = ({
  description,
  onSave,
  isExpanded,
  onToggleExpand,
  shouldTruncate,
}: InlineDescriptionEditorProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(description);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(editValue.length, editValue.length);
    }
  }, [isEditing]);

  const handleSave = () => {
    onSave(editValue);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditValue(description);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleCancel();
    }
    if (e.key === 'Enter' && e.metaKey) {
      handleSave();
    }
  };

  if (isEditing) {
    return (
      <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
        <Textarea
          ref={textareaRef}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          className="min-h-[80px] text-sm resize-none"
          placeholder="Enter job description..."
        />
        <div className="flex items-center gap-1">
          <Button size="sm" variant="default" onClick={handleSave} className="h-6 px-2 text-xs">
            <Check className="w-3 h-3 mr-1" />
            Save
          </Button>
          <Button size="sm" variant="ghost" onClick={handleCancel} className="h-6 px-2 text-xs">
            <X className="w-3 h-3 mr-1" />
            Cancel
          </Button>
          <span className="text-xs text-muted-foreground ml-2">⌘+Enter to save</span>
        </div>
      </div>
    );
  }

  return (
    <div className="relative group">
      <p className={cn(
        "text-foreground",
        !isExpanded && shouldTruncate && "line-clamp-2"
      )}>
        {description || <span className="text-muted-foreground italic">No description</span>}
      </p>
      <div className="flex items-center gap-1 mt-1">
        {shouldTruncate && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand();
            }}
            className="text-primary hover:underline text-sm"
          >
            {isExpanded ? 'Less' : 'More'}
          </button>
        )}
        <Button
          size="sm"
          variant="ghost"
          onClick={(e) => {
            e.stopPropagation();
            setIsEditing(true);
          }}
          className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <Edit2 className="w-3 h-3" />
        </Button>
      </div>
    </div>
  );
};