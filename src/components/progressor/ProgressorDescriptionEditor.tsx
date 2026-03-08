import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Info, Save, Edit3, X, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface ProgressorDescriptionEditorProps {
  jobId: string;
  description: string;
  onSaved?: (newDescription: string) => void;
  readOnly?: boolean;
}

export const ProgressorDescriptionEditor = ({
  jobId,
  description,
  onSaved,
  readOnly = false,
}: ProgressorDescriptionEditorProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(description);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  const startEditing = () => {
    setDraft(description);
    setIsEditing(true);
  };

  const cancel = () => {
    setIsEditing(false);
    setDraft(description);
  };

  const save = async () => {
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('jobs')
        .update({ description: draft })
        .eq('id', jobId);

      if (error) throw error;

      onSaved?.(draft);
      setIsEditing(false);
      toast({ title: 'Saved', description: 'Description updated successfully' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to save description', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="bg-background border rounded-lg p-2.5">
      <div className="flex items-center justify-between mb-1">
        <span className="text-muted-foreground font-semibold flex items-center gap-1 text-xs">
          <Info className="h-3 w-3" /> Description
        </span>
        {!readOnly && !isEditing && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-[10px] px-2"
            onClick={startEditing}
          >
            <Edit3 className="h-3 w-3 mr-0.5" /> Edit
          </Button>
        )}
        {isEditing && (
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={cancel} disabled={isSaving}>
              <X className="h-3 w-3 mr-0.5" /> Cancel
            </Button>
            <Button size="sm" className="h-6 text-[10px] px-2" onClick={save} disabled={isSaving}>
              {isSaving ? <Loader2 className="h-3 w-3 animate-spin mr-0.5" /> : <Save className="h-3 w-3 mr-0.5" />}
              Save
            </Button>
          </div>
        )}
      </div>

      {isEditing ? (
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Enter or edit job description..."
          className="min-h-[80px] text-xs resize-y"
        />
      ) : (
        <p className="text-xs whitespace-pre-wrap line-clamp-6">
          {description || <span className="text-muted-foreground italic">No description — click Edit to add one</span>}
        </p>
      )}
    </div>
  );
};
