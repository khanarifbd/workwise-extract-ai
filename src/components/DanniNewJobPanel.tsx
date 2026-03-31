import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { AttachmentUpload } from '@/components/AttachmentUpload';
import { Attachment } from '@/types/job';
import {
  FilePlus2, ChevronDown, Save, Loader2, X, Users, Link2, MapPin, User, Phone,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface TeamSetting {
  teamId: string;
  teamName: string;
  type?: string;
}

interface DanniNewJobPanelProps {
  parentJobId: string;
  parentJobNumber: string;
  parentName: string;
  parentAddress: string;
  parentPhone: string;
  parentTeam: string | null;
  dmCategoryId: string;
  dmTeams: TeamSetting[];
  existingChildCount?: number;
  onJobCreated: () => void;
}

export const DanniNewJobPanel = ({
  parentJobId,
  parentJobNumber,
  parentName,
  parentAddress,
  parentPhone,
  parentTeam,
  dmCategoryId,
  dmTeams,
  existingChildCount = 0,
  onJobCreated,
}: DanniNewJobPanelProps) => {
  const nextNumber = existingChildCount + 1;
  const autoJobNumber = `${parentJobNumber}-NEW-${nextNumber}`;
  const [isOpen, setIsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [jobNumber, setJobNumber] = useState(autoJobNumber);
  const [description, setDescription] = useState('');
  const [team, setTeam] = useState<string>(parentTeam || 'none');
  const [team2, setTeam2] = useState<string>('none');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const { toast } = useToast();

  const handleSave = useCallback(async () => {
    if (!jobNumber.trim()) {
      toast({ title: 'Job number required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const newJobData: Record<string, any> = {
        job_number: jobNumber.trim(),
        name: parentName,
        address: parentAddress,
        phone_number: parentPhone,
        description: description.trim(),
        team: team === 'none' ? null : team,
        team2: team2 === 'none' ? null : team2,
        category_id: dmCategoryId,
        status: 'pending',
        progress: 0,
        is_completed: false,
        is_ongoing: false,
        refer_back: false,
        attachments: (attachments.length > 0 ? JSON.parse(JSON.stringify(attachments)) : []) as any,
        work_items: [],
        additional_works: [],
        private_notes: `Linked from parent job #${parentJobNumber} (${parentJobId})`,
        date_issued: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from('jobs')
        .insert(newJobData as any)
        .select('id, job_number')
        .single();

      if (error) throw error;

      toast({
        title: 'New linked job created',
        description: `Job #${data.job_number} created and linked to #${parentJobNumber}`,
      });

      // Reset form
      setJobNumber(`${parentJobNumber}-NEW-${nextNumber + 1}`);
      setDescription('');
      setTeam(parentTeam || 'none');
      setTeam2('none');
      setAttachments([]);
      setIsOpen(false);
      onJobCreated();
    } catch (err: any) {
      console.error('Failed to create linked job:', err);
      toast({ title: 'Error', description: err.message || 'Failed to create job', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }, [jobNumber, description, team, team2, attachments, parentName, parentAddress, parentPhone, parentJobNumber, parentJobId, dmCategoryId, toast, onJobCreated, parentTeam]);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <button
          className={cn(
            "w-full flex items-center gap-1.5 p-2 rounded-md border transition-all text-left",
            isOpen
              ? "border-amber-500/40 bg-amber-500/10"
              : "border-dashed border-muted-foreground/30 hover:border-amber-500/40 hover:bg-amber-500/5"
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <FilePlus2 className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
          <span className="text-[11px] font-semibold text-amber-500">New Linked Job</span>
          <Badge variant="outline" className="text-[9px] px-1 py-0 ml-1 border-amber-500/30 text-amber-500">
            <Link2 className="w-2.5 h-2.5 mr-0.5" />
            #{parentJobNumber}
          </Badge>
          <ChevronDown className={cn(
            "w-3 h-3 text-muted-foreground ml-auto transition-transform duration-200",
            isOpen && "rotate-180"
          )} />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div
          className="mt-1 p-3 rounded-md border-2 border-amber-500/50 bg-amber-500/10 dark:bg-amber-900/20 space-y-3 ring-1 ring-amber-400/30"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Inherited context */}
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1"><User className="w-2.5 h-2.5" />{parentName}</span>
            <span className="flex items-center gap-1"><MapPin className="w-2.5 h-2.5" />{parentAddress || 'No address'}</span>
            {parentPhone && <span className="flex items-center gap-1"><Phone className="w-2.5 h-2.5" />{parentPhone}</span>}
          </div>

          {/* Job number */}
          <div>
            <label className="text-[10px] font-medium text-foreground">New Job Number *</label>
            <Input
              value={jobNumber}
              onChange={(e) => setJobNumber(e.target.value)}
              placeholder="e.g. NPH-12345"
              className="h-8 text-xs mt-0.5"
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-[10px] font-medium text-foreground">Description / Works</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the additional works required..."
              className="h-20 text-xs mt-0.5"
            />
          </div>

          {/* Team assignment */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-medium text-foreground flex items-center gap-1">
                <Users className="w-2.5 h-2.5" /> Team 1
              </label>
              <Select value={team} onValueChange={setTeam}>
                <SelectTrigger className="h-8 text-xs mt-0.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {dmTeams.map(t => (
                    <SelectItem key={t.teamId} value={t.teamName}>{t.teamName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[10px] font-medium text-foreground flex items-center gap-1">
                <Users className="w-2.5 h-2.5" /> Team 2
              </label>
              <Select value={team2} onValueChange={setTeam2}>
                <SelectTrigger className="h-8 text-xs mt-0.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {dmTeams
                    .filter(t => t.teamName !== (team === 'none' ? '' : team))
                    .map(t => (
                      <SelectItem key={t.teamId} value={t.teamName}>{t.teamName}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Photo upload */}
          <div>
            <label className="text-[10px] font-medium text-foreground">Photos / Attachments</label>
            <div className="mt-1">
              <AttachmentUpload
                jobId={`new-linked-${parentJobId}`}
                attachments={attachments}
                onAttachmentsChange={setAttachments}
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 pt-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                setIsOpen(false);
                setJobNumber('');
                setDescription('');
                setAttachments([]);
              }}
            >
              <X className="w-3 h-3 mr-1" />
              Cancel
            </Button>
            <div className="flex-1" />
            <Button
              size="sm"
              className="h-7 text-xs gap-1"
              disabled={!jobNumber.trim() || saving}
              onClick={handleSave}
            >
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
              {saving ? 'Creating...' : 'Create Job'}
            </Button>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};
