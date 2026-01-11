import { useState, useRef, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Edit2, Check, X, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface InlineDescriptionEditorProps {
  description: string;
  onSave: (description: string) => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
  shouldTruncate: boolean;
}

// Priority keywords to detect in descriptions
const PRIORITY_KEYWORDS = ['emergency', 'urgent', 'priority', 'critical', 'asap', 'immediate'];

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

  // Detect if description contains priority keywords
  const priorityInfo = useMemo(() => {
    if (!description) return null;
    
    const lowerDesc = description.toLowerCase();
    const foundKeywords = PRIORITY_KEYWORDS.filter(keyword => lowerDesc.includes(keyword));
    
    if (foundKeywords.length === 0) return null;
    
    // Determine the priority level based on keywords found
    if (foundKeywords.includes('emergency') || foundKeywords.includes('critical')) {
      return { level: 'critical', keywords: foundKeywords, color: 'bg-red-500' };
    } else if (foundKeywords.includes('urgent') || foundKeywords.includes('asap') || foundKeywords.includes('immediate')) {
      return { level: 'urgent', keywords: foundKeywords, color: 'bg-orange-500' };
    } else {
      return { level: 'priority', keywords: foundKeywords, color: 'bg-amber-500' };
    }
  }, [description]);

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
      {/* Priority Badge */}
      {priorityInfo && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge 
                className={cn(
                  "mb-1 text-white text-xs font-bold animate-pulse cursor-help",
                  priorityInfo.color
                )}
              >
                <AlertTriangle className="w-3 h-3 mr-1" />
                {priorityInfo.level === 'critical' ? 'EMERGENCY' : 
                 priorityInfo.level === 'urgent' ? 'URGENT' : 'PRIORITY'}
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">
                Detected keywords: {priorityInfo.keywords.join(', ')}
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
      
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