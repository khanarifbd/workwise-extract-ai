import { useState } from 'react';
import { Job, WorkItem } from '@/types/job';
import { PDFDropZone } from '@/components/PDFDropZone';
import { JobTable } from '@/components/JobTable';
import { Header } from '@/components/Header';
import { StatsCards } from '@/components/StatsCards';
import { ExportPanel } from '@/components/ExportPanel';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LayoutGrid, Table2 } from 'lucide-react';

// Sample SOR codes for matching
const SOR_CODES = [
  { code: 'SOR001', keywords: ['radiator', 'heating', 'install'] },
  { code: 'SOR002', keywords: ['tap', 'leak', 'plumbing'] },
  { code: 'SOR003', keywords: ['window', 'glass', 'glazing'] },
  { code: 'SOR004', keywords: ['socket', 'electrical', 'power'] },
  { code: 'SOR005', keywords: ['light', 'fitting', 'lamp'] },
  { code: 'SOR006', keywords: ['door', 'lock', 'handle'] },
  { code: 'SOR007', keywords: ['roof', 'tiles', 'roofing'] },
  { code: 'SOR008', keywords: ['drain', 'blocked', 'clear'] },
  { code: 'SOR009', keywords: ['plaster', 'wall', 'repair'] },
  { code: 'SOR010', keywords: ['paint', 'decorate', 'walls'] },
];

const matchSORCode = (description: string): string => {
  const lowerDesc = description.toLowerCase();
  for (const sor of SOR_CODES) {
    if (sor.keywords.some(keyword => lowerDesc.includes(keyword))) {
      return sor.code;
    }
  }
  return 'SOR000';
};

const extractJobFromPDF = (file: File): Promise<Partial<Job>> => {
  // Simulate PDF extraction - in production, this would use a PDF parsing library
  return new Promise((resolve) => {
    setTimeout(() => {
      const mockDescriptions = [
        'Repair leaking tap in kitchen',
        'Replace broken window pane in bedroom',
        'Fix faulty electrical socket in living room',
        'Install new light fitting in hallway',
        'Clear blocked drain in bathroom'
      ];

      const workItems: WorkItem[] = mockDescriptions.map(desc => ({
        id: crypto.randomUUID(),
        description: desc,
        sorCode: matchSORCode(desc),
        qty: 1,
        cost: Math.floor(Math.random() * 200) + 50
      }));

      resolve({
        id: crypto.randomUUID(),
        jobNumber: `JOB-${Date.now().toString().slice(-6)}`,
        name: 'John Smith',
        address: '123 Example Street, London, SW1A 1AA',
        phoneNumber: '+44 7700 900123',
        summaryOfWorks: 'General repairs and maintenance required across multiple areas of the property',
        description: mockDescriptions.join('. '),
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

const Index = () => {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showExport, setShowExport] = useState(false);
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
      toast({
        title: "Job Extracted Successfully",
        description: `Job #${newJob.jobNumber} has been added with ${newJob.workItems.length} work items.`,
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

  return (
    <div className="min-h-screen bg-background">
      <Header onExport={() => setShowExport(true)} jobCount={jobs.length} />
      
      <main className="container mx-auto px-6 py-8 space-y-8">
        {/* Stats Overview */}
        <StatsCards jobs={jobs} />

        {/* PDF Upload Section */}
        <section className="bg-card border border-border rounded-2xl p-6">
          <h2 className="text-lg font-semibold mb-4">Upload Job PDF</h2>
          <PDFDropZone onFileUpload={handleFileUpload} isProcessing={isProcessing} />
        </section>

        {/* Jobs Database */}
        <section className="bg-card border border-border rounded-2xl p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-semibold">Jobs Database</h2>
              <p className="text-sm text-muted-foreground">
                Manage and track all your jobs
              </p>
            </div>
          </div>
          
          <JobTable 
            jobs={jobs} 
            onUpdateJob={handleUpdateJob}
            onDeleteJob={handleDeleteJob}
          />
        </section>
      </main>

      {showExport && (
        <ExportPanel jobs={jobs} onClose={() => setShowExport(false)} />
      )}
    </div>
  );
};

export default Index;
