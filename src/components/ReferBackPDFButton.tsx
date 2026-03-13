import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { FileDown, Loader2 } from 'lucide-react';
import { Job } from '@/types/job';
import { ContactHistory } from '@/types/contactHistory';
import { useToast } from '@/hooks/use-toast';
import { generateReferBackJobPDF } from './ReferBackJobPDF';
import { format } from 'date-fns';
import { downloadPDF } from '@/lib/pdfDownload';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';

interface ReferBackPDFButtonProps {
  jobs: Job[];
  categoryName?: string;
}

export function ReferBackPDFButton({ jobs, categoryName = 'Jobs' }: ReferBackPDFButtonProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [selectedJobIds, setSelectedJobIds] = useState<Set<string>>(new Set());
  const [isGenerating, setIsGenerating] = useState(false);

  const handleOpen = () => {
    if (jobs.length === 0) {
      toast({
        title: 'No Jobs',
        description: 'There are no refer back jobs to generate a report for.',
        variant: 'destructive',
      });
      return;
    }
    setSelectedJobIds(new Set(jobs.map(j => j.id)));
    setOpen(true);
  };

  const toggleJob = (jobId: string) => {
    setSelectedJobIds(prev => {
      const next = new Set(prev);
      if (next.has(jobId)) {
        next.delete(jobId);
      } else {
        next.add(jobId);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedJobIds.size === jobs.length) {
      setSelectedJobIds(new Set());
    } else {
      setSelectedJobIds(new Set(jobs.map(j => j.id)));
    }
  };

  const handleGenerate = async () => {
    const selected = jobs.filter(j => selectedJobIds.has(j.id));
    if (selected.length === 0) {
      toast({
        title: 'No Jobs Selected',
        description: 'Please select at least one job.',
        variant: 'destructive',
      });
      return;
    }

    setIsGenerating(true);
    try {
      // Fetch contact history on-demand for selected jobs only
      const { data: historyData } = await supabase
        .from('contact_history')
        .select('*')
        .in('job_id', selected.map(j => j.id))
        .order('contact_date', { ascending: false });

      const contactHistoryMap: Record<string, ContactHistory[]> = {};
      (historyData || []).forEach((row: any) => {
        const entry: ContactHistory = {
          id: row.id,
          jobId: row.job_id,
          contactDate: new Date(row.contact_date),
          outcome: row.outcome,
          notes: row.notes,
          nextAction: row.next_action,
          nextActionDate: row.next_action_date ? new Date(row.next_action_date) : null,
          createdBy: row.created_by,
          createdAt: new Date(row.created_at),
        };
        if (!contactHistoryMap[row.job_id]) contactHistoryMap[row.job_id] = [];
        contactHistoryMap[row.job_id].push(entry);
      });

      // Generate individual PDF per selected job
      selected.forEach(job => {
        const history = contactHistoryMap[job.id] || [];
        const doc = generateReferBackJobPDF(job, history);
        doc.save(`refer-back-${job.jobNumber}-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
      });

      toast({
        title: 'PDF(s) Downloaded',
        description: `Generated ${selected.length} refer back report${selected.length > 1 ? 's' : ''}.`,
      });
      setOpen(false);
    } catch (error) {
      console.error('PDF generation failed:', error);
      toast({
        title: 'Error',
        description: 'Failed to generate PDF reports.',
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const allSelected = selectedJobIds.size === jobs.length && jobs.length > 0;

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={handleOpen}
        className="gap-1.5 border-red-300 text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-950"
      >
        <FileDown className="w-3.5 h-3.5" />
        Generate PDF
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Generate Refer Back PDF</DialogTitle>
            <DialogDescription>
              Select the jobs to include in the report. Each selected job will generate its own PDF.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <label className="flex items-center gap-2 p-2 rounded-md bg-muted/50 cursor-pointer hover:bg-muted transition-colors">
              <Checkbox
                checked={allSelected}
                onCheckedChange={toggleAll}
              />
              <span className="text-sm font-semibold">
                Select All ({jobs.length} job{jobs.length !== 1 ? 's' : ''})
              </span>
            </label>

            <ScrollArea className="max-h-64">
              <div className="space-y-1">
                {jobs.map(job => (
                  <label
                    key={job.id}
                    className="flex items-center gap-2 p-2 rounded-md cursor-pointer hover:bg-muted/50 transition-colors"
                  >
                    <Checkbox
                      checked={selectedJobIds.has(job.id)}
                      onCheckedChange={() => toggleJob(job.id)}
                    />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium">#{job.jobNumber}</span>
                      <span className="text-sm text-muted-foreground ml-2 truncate">
                        {job.name}
                      </span>
                    </div>
                  </label>
                ))}
              </div>
            </ScrollArea>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleGenerate}
              disabled={selectedJobIds.size === 0 || isGenerating}
              className="gap-1.5 bg-red-600 hover:bg-red-700 text-white"
            >
              {isGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
              Generate {selectedJobIds.size > 0 ? `(${selectedJobIds.size})` : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
