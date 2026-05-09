import { useState, useCallback, useEffect } from 'react';
import { ClipboardPaste, Loader2, Plus, Trash2, Sparkles, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Job } from '@/types/job';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface ExtractedJob {
  jobNumber: string;
  name: string;
  phoneNumber: string;
  address: string;
  description: string;
}

interface PasteJobEntryProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Receives the extracted jobs as Omit<Job,'id'>[] — caller is expected to
   * pipe through the existing duplicate-detection / bulk-create flow.
   */
  onJobsReady: (jobs: Omit<Job, 'id'>[]) => Promise<void> | void;
}

const buildJob = (e: ExtractedJob): Omit<Job, 'id'> => ({
  jobNumber: e.jobNumber.trim(),
  name: e.name.trim(),
  address: e.address.trim(),
  phoneNumber: e.phoneNumber.trim(),
  description: e.description.trim(),
  summaryOfWorks: '',
  workItems: [],
  additionalWorks: [],
  team: null,
  team2: null,
  progress: 0,
  progressNotes: '',
  isCompleted: false,
  isOngoing: false,
  ongoingReason: '',
  scheduledTrades: [],
  createdAt: new Date(),
  dateIssued: new Date(),
  bookedDate: null,
  isFlexibleBooking: false,
  bookingNotes: '',
  completionDate: null,
  attachments: [],
  status: 'pending',
  fanInfo: null,
  linkedFanJobId: null,
  insulationInfo: null,
  linkedInsulationJobId: null,
  roofingInfo: null,
  linkedRoofingJobId: null,
  flooringInfo: null,
  linkedFlooringJobId: null,
  fireDoorInfo: null,
  linkedFireDoorJobId: null,
  costs: null,
  privateNotes: '',
  referBack: false,
  referBackReason: '',
  referBackDate: null,
  expectedCompletionDate: null,
  blockerType: null,
  blockerNotes: '',
  blockerSetAt: null,
  blockerChaseDate: null,
});

const TEXT_KEY = 'pasteJobEntry_text';
const EXTRACTED_KEY = 'pasteJobEntry_extracted';

export const PasteJobEntry = ({ isOpen, onOpenChange, onJobsReady }: PasteJobEntryProps) => {
  const { toast } = useToast();
  const [pastedText, setPastedText] = useState<string>(() => {
    try { return sessionStorage.getItem(TEXT_KEY) || ''; } catch { return ''; }
  });
  const [parsing, setParsing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [extracted, setExtracted] = useState<ExtractedJob[] | null>(() => {
    try {
      const raw = sessionStorage.getItem(EXTRACTED_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  });
  const [error, setError] = useState<string | null>(null);

  // Persist on change so a tab-bounce / remount doesn't lose work
  useEffect(() => {
    try {
      if (pastedText) sessionStorage.setItem(TEXT_KEY, pastedText);
      else sessionStorage.removeItem(TEXT_KEY);
    } catch {}
  }, [pastedText]);
  useEffect(() => {
    try {
      if (extracted) sessionStorage.setItem(EXTRACTED_KEY, JSON.stringify(extracted));
      else sessionStorage.removeItem(EXTRACTED_KEY);
    } catch {}
  }, [extracted]);

  const reset = () => {
    setPastedText('');
    setExtracted(null);
    setError(null);
    setParsing(false);
    setCreating(false);
    try {
      sessionStorage.removeItem(TEXT_KEY);
      sessionStorage.removeItem(EXTRACTED_KEY);
    } catch {}
  };

  const handleClose = (open: boolean) => {
    // Keep pasted content when user just closes the dialog — only reset on
    // explicit "Clear" or after successful creation.
    onOpenChange(open);
  };

  const handleParse = useCallback(async () => {
    if (!pastedText.trim()) return;
    setParsing(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('parse-pasted-jobs', {
        body: { text: pastedText.trim() },
      });
      if (fnError) throw fnError;
      const jobs: ExtractedJob[] = data?.jobs ?? [];
      if (jobs.length === 0) {
        setError('Could not extract any jobs from that text. Try adjusting it and parse again.');
        return;
      }
      setExtracted(jobs);
    } catch (e: any) {
      console.error('Parse error', e);
      setError(e?.message || 'Failed to parse pasted text');
    } finally {
      setParsing(false);
    }
  }, [pastedText]);

  const updateField = (idx: number, field: keyof ExtractedJob, value: string) => {
    setExtracted(prev => prev ? prev.map((j, i) => i === idx ? { ...j, [field]: value } : j) : prev);
  };

  const removeJob = (idx: number) => {
    setExtracted(prev => prev ? prev.filter((_, i) => i !== idx) : prev);
  };

  const handleCreateAll = useCallback(async () => {
    if (!extracted || extracted.length === 0) return;
    const invalid = extracted.find(j => !j.jobNumber.trim() || !j.name.trim());
    if (invalid) {
      toast({
        title: 'Missing required fields',
        description: 'Every job needs a Job Number and Tenant Name.',
        variant: 'destructive',
      });
      return;
    }
    setCreating(true);
    try {
      const jobs = extracted.map(buildJob);
      await onJobsReady(jobs);
      toast({
        title: `${jobs.length} job${jobs.length === 1 ? '' : 's'} queued`,
        description: 'Duplicates (if any) will prompt you to confirm.',
      });
      reset();
      onOpenChange(false);
    } catch (e: any) {
      console.error('Create error', e);
      toast({ title: 'Failed to create jobs', description: e?.message, variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  }, [extracted, onJobsReady, onOpenChange, toast]);

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[820px] max-h-[92vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardPaste className="w-5 h-5 text-primary" />
            Paste Job Details
          </DialogTitle>
          <DialogDescription>
            Paste one or many jobs (free-form). AI will extract job number, tenant, phone, address (A&A prefix stripped), and description.
          </DialogDescription>
        </DialogHeader>

        {!extracted ? (
          <div className="flex-1 flex flex-col gap-3 py-2 min-h-0">
            <Label htmlFor="paste-input" className="text-sm font-medium">Pasted text</Label>
            <Textarea
              id="paste-input"
              value={pastedText}
              onChange={(e) => setPastedText(e.target.value)}
              placeholder={`e.g.\n1. Please redesign the rear steps...\nN2644074\nMr Dickinson.\n\n2. Please rehang Chloe's bedroom door...\nMiss McGuire - 07495413969\nA&A 1 Hunters Close NN2 8TH\nN2644072`}
              className="flex-1 min-h-[260px] resize-none font-mono text-xs"
            />
            {error && (
              <div className="flex items-start gap-2 text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded p-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}
            <div className="flex justify-end gap-3 pt-3 border-t">
              <Button variant="outline" onClick={() => handleClose(false)} disabled={parsing}>Cancel</Button>
              <Button onClick={handleParse} disabled={parsing || !pastedText.trim()} className="gap-2">
                {parsing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {parsing ? 'Parsing…' : 'Parse with AI'}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between py-2">
              <p className="text-sm">
                Extracted <span className="font-semibold text-primary">{extracted.length}</span> job{extracted.length === 1 ? '' : 's'} — review &amp; edit before creating.
              </p>
              <Button variant="ghost" size="sm" onClick={() => setExtracted(null)}>Re-paste</Button>
            </div>
            <ScrollArea className="flex-1 pr-3">
              <div className="space-y-4 pb-2">
                {extracted.map((job, idx) => (
                  <div key={idx} className="border rounded-lg p-3 bg-muted/30 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-muted-foreground">Job {idx + 1}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeJob(idx)}
                        className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Job Number *</Label>
                        <Input value={job.jobNumber} onChange={(e) => updateField(idx, 'jobNumber', e.target.value)} className="h-8 text-xs" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Tenant Name *</Label>
                        <Input value={job.name} onChange={(e) => updateField(idx, 'name', e.target.value)} className="h-8 text-xs" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Phone</Label>
                        <Input value={job.phoneNumber} onChange={(e) => updateField(idx, 'phoneNumber', e.target.value)} className="h-8 text-xs" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Address (A&amp;A stripped)</Label>
                        <Input value={job.address} onChange={(e) => updateField(idx, 'address', e.target.value)} className="h-8 text-xs" />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Description</Label>
                      <Textarea
                        value={job.description}
                        onChange={(e) => updateField(idx, 'description', e.target.value)}
                        className="min-h-[80px] text-xs resize-y"
                      />
                    </div>
                  </div>
                ))}
                {extracted.length === 0 && (
                  <p className="text-center text-xs text-muted-foreground py-6">All jobs removed. Re-paste to start over.</p>
                )}
              </div>
            </ScrollArea>
            <div className="flex justify-end gap-3 pt-3 border-t">
              <Button variant="outline" onClick={() => handleClose(false)} disabled={creating}>Cancel</Button>
              <Button onClick={handleCreateAll} disabled={creating || extracted.length === 0} className="gap-2">
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {creating ? 'Creating…' : `Create ${extracted.length} Job${extracted.length === 1 ? '' : 's'}`}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
