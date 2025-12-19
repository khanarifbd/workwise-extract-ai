import { useState } from 'react';
import { Job, WorkItem } from '@/types/job';
import { PDFDropZone } from '@/components/PDFDropZone';
import { JobTable } from '@/components/JobTable';
import { Header } from '@/components/Header';
import { StatsCards } from '@/components/StatsCards';
import { ExportPanel } from '@/components/ExportPanel';
import { useToast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { isToday, isThisWeek, isThisMonth } from 'date-fns';
import { findMatchingSORCode } from '@/data/sorCodes';

// PDF extraction with SOR matching
const extractJobFromPDF = (file: File): Promise<Partial<Job>> => {
  return new Promise((resolve) => {
    setTimeout(() => {
      // Simulated extraction - would use real PDF parsing in production
      const mockDescriptions = [
        'Repair leaking tap in kitchen sink',
        'Replace broken window pane in bedroom',
        'Fix faulty electrical socket in living room',
        'Install new light fitting in hallway',
        'Clear blocked drain in bathroom',
        'Repair damaged plaster on living room wall',
        'Replace door handle on front door',
        'Fix radiator leak in bedroom'
      ];

      const workItems: WorkItem[] = mockDescriptions.map(desc => {
        const { code } = findMatchingSORCode(desc);
        return {
          id: crypto.randomUUID(),
          description: desc,
          sorCode: code,
          qty: 1,
          cost: Math.floor(Math.random() * 200) + 50
        };
      });

      resolve({
        id: crypto.randomUUID(),
        jobNumber: `JOB-${Date.now().toString().slice(-6)}`,
        name: 'John Smith',
        address: '123 Example Street, London, SW1A 1AA',
        phoneNumber: '+44 7700 900123',
        summaryOfWorks: 'General repairs and maintenance required across multiple areas of the property including plumbing, electrical, and general building works.',
        description: mockDescriptions.join('. ') + '. Additional works may be required upon inspection of the property. Please ensure access is available during working hours.',
        workItems,
        additionalWorks: [],
        team: null,
        progress: 0,
        progressNotes: '',
        isCompleted: false,
        dateIssued: new Date(),
        startDate: null,
        completionDate: null,
        attachments: []
      });
    }, 2000);
  });
};

type FilterType = 'all' | 'today' | 'week' | 'month';

const Index = () => {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [uploadExpanded, setUploadExpanded] = useState(false);
  const [filter, setFilter] = useState<FilterType>('all');
  const { toast } = useToast();

  const handleFileUpload = async (file: File) => {
    setIsProcessing(true);
    try {
      const extractedData = await extractJobFromPDF(file);
      const newJob: Job = {
        id: extractedData.id || crypto.randomUUID(),
        jobNumber: extractedData.jobNumber || '',
        name: extractedData.name || '',
        address: extractedData.address || '',
        phoneNumber: extractedData.phoneNumber || '',
        summaryOfWorks: extractedData.summaryOfWorks || '',
        description: extractedData.description || '',
        workItems: extractedData.workItems || [],
        additionalWorks: extractedData.additionalWorks || [],
        team: extractedData.team || null,
        progress: extractedData.progress || 0,
        progressNotes: extractedData.progressNotes || '',
        isCompleted: extractedData.isCompleted || false,
        dateIssued: extractedData.dateIssued || new Date(),
        startDate: extractedData.startDate || null,
        completionDate: extractedData.completionDate || null,
        attachments: extractedData.attachments || []
      };
      
      setJobs(prev => [...prev, newJob]);
      setUploadExpanded(false);
      toast({
        title: "Job Extracted Successfully",
        description: `Job #${newJob.jobNumber} added with ${newJob.workItems.length} work items matched to SOR codes.`,
      });
    } catch (error) {
      toast({
        title: "Extraction Failed",
        description: "Could not extract job details from the PDF.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUpdateJob = (updatedJob: Job) => {
    setJobs(prev => prev.map(job => 
      job.id === updatedJob.id ? updatedJob : job
    ));
    toast({
      title: "Job Updated",
      description: `Job #${updatedJob.jobNumber} has been updated.`,
    });
  };

  const handleDeleteJob = (jobId: string) => {
    const job = jobs.find(j => j.id === jobId);
    setJobs(prev => prev.filter(j => j.id !== jobId));
    toast({
      title: "Job Deleted",
      description: `Job #${job?.jobNumber} has been removed.`,
    });
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
