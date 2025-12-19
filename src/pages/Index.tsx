import { useState, useEffect } from 'react';
import { Job, WorkItem } from '@/types/job';
import { PDFDropZone } from '@/components/PDFDropZone';
import { JobTable } from '@/components/JobTable';
import { Header } from '@/components/Header';
import { StatsCards } from '@/components/StatsCards';
import { ExportPanel } from '@/components/ExportPanel';
import { useToast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { isToday, isThisWeek, isThisMonth } from 'date-fns';
import { useJobs } from '@/hooks/useJobs';
import { extractPDFWithAI } from '@/lib/api';
import { fileToBase64 } from '@/lib/pdfUtils';

type FilterType = 'all' | 'today' | 'week' | 'month';

const Index = () => {
  const { jobs, isLoading, addJob, editJob, removeJob } = useJobs();
  const [isProcessing, setIsProcessing] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [uploadExpanded, setUploadExpanded] = useState(false);
  const [filter, setFilter] = useState<FilterType>('all');
  const { toast } = useToast();

  const handleFileUpload = async (file: File) => {
    setIsProcessing(true);
    try {
      // Convert PDF to base64 for DeepSeek AI vision
      const base64 = await fileToBase64(file);
      console.log('PDF converted to base64, sending to DeepSeek AI...');
      
      // Use DeepSeek AI to extract job data
      const extractedData = await extractPDFWithAI(base64);
      
      if (!extractedData) {
        throw new Error('No data extracted');
      }

      const newJob: Omit<Job, 'id'> = {
        jobNumber: extractedData.jobNumber || `JOB-${Date.now().toString().slice(-6)}`,
        name: extractedData.name || 'Unknown',
        address: extractedData.address || '',
        phoneNumber: extractedData.phoneNumber || '',
        summaryOfWorks: extractedData.summaryOfWorks || '',
        description: extractedData.description || '',
        workItems: (extractedData.workItems || []).map((item: any) => ({
          ...item,
          id: crypto.randomUUID()
        })),
        additionalWorks: [],
        team: null,
        progress: 0,
        progressNotes: '',
        isCompleted: false,
        dateIssued: new Date(),
        startDate: null,
        completionDate: null,
        attachments: []
      };
      
      await addJob(newJob);
      setUploadExpanded(false);
      toast({
        title: "Job Extracted Successfully",
        description: `Job #${newJob.jobNumber} added with ${newJob.workItems.length} work items matched to SOR codes.`,
      });
    } catch (error) {
      console.error('Extraction error:', error);
      toast({
        title: "Extraction Failed",
        description: error instanceof Error ? error.message : "Could not extract job details from the PDF.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUpdateJob = async (updatedJob: Job) => {
    try {
      await editJob(updatedJob.id, updatedJob);
      toast({
        title: "Job Updated",
        description: `Job #${updatedJob.jobNumber} has been updated.`,
      });
    } catch (error) {
      toast({
        title: "Update Failed",
        description: "Could not update the job.",
        variant: "destructive",
      });
    }
  };

  const handleDeleteJob = async (jobId: string) => {
    const job = jobs.find(j => j.id === jobId);
    try {
      await removeJob(jobId);
      toast({
        title: "Job Deleted",
        description: `Job #${job?.jobNumber} has been removed.`,
      });
    } catch (error) {
      toast({
        title: "Delete Failed",
        description: "Could not delete the job.",
        variant: "destructive",
      });
    }
  };

  // Filter jobs based on selected filter
  const filteredJobs = jobs.filter(job => {
    const date = job.dateIssued;
    switch (filter) {
      case 'today':
        return isToday(date);
      case 'week':
        return isThisWeek(date);
      case 'month':
        return isThisMonth(date);
      default:
        return true;
    }
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading jobs...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header onExport={() => setShowExport(true)} jobCount={jobs.length} />
      
      <main className="flex-1 container mx-auto px-4 py-4 flex flex-col gap-4">
        {/* Compact Stats Row */}
        <div className="flex items-center justify-between gap-4">
          <StatsCards jobs={filteredJobs} />
          
          <div className="flex items-center gap-2">
            <Select value={filter} onValueChange={(v) => setFilter(v as FilterType)}>
              <SelectTrigger className="w-32 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Jobs</SelectItem>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="week">This Week</SelectItem>
                <SelectItem value="month">This Month</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Collapsible Upload Section - 5% */}
        <section 
          className="bg-card border border-border rounded-lg overflow-hidden"
          style={{ maxHeight: uploadExpanded ? '200px' : '48px' }}
        >
          <button
            onClick={() => setUploadExpanded(!uploadExpanded)}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
          >
            <span className="text-sm font-medium">Upload Job PDF</span>
            {uploadExpanded ? (
              <ChevronUp className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            )}
          </button>
          {uploadExpanded && (
            <div className="px-4 pb-4">
              <PDFDropZone onFileUpload={handleFileUpload} isProcessing={isProcessing} />
            </div>
          )}
        </section>

        {/* Jobs Database - Takes remaining ~80% of screen */}
        <section className="flex-1 bg-card border border-border rounded-lg p-4 min-h-0 overflow-hidden flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-base font-semibold">Jobs Database</h2>
              <p className="text-xs text-muted-foreground">
                {filteredJobs.length} of {jobs.length} jobs
              </p>
            </div>
          </div>
          
          <div className="flex-1 overflow-auto">
            <JobTable 
              jobs={filteredJobs} 
              onUpdateJob={handleUpdateJob}
              onDeleteJob={handleDeleteJob}
            />
          </div>
        </section>
      </main>

      {showExport && (
        <ExportPanel jobs={jobs} onClose={() => setShowExport(false)} />
      )}
    </div>
  );
};

export default Index;
