import { useState, useMemo, useEffect, useCallback } from 'react';
import { Job } from '@/types/job';
import { FileDropZone } from '@/components/FileDropZone';
import { BulkImageUpload } from '@/components/BulkImageUpload';
import { JobTable } from '@/components/JobTable';
import { Header } from '@/components/Header';
import { StatsCards } from '@/components/StatsCards';
import { ExportPanel } from '@/components/ExportPanel';
import { JobFilters, FilterState } from '@/components/JobFilters';
import { CategoryTabs } from '@/components/CategoryTabs';
import { KanbanBoard } from '@/components/KanbanBoard';
import { CalendarView } from '@/components/CalendarView';
import { ViewToggle } from '@/components/ViewToggle';
import { JobDetailsModal } from '@/components/JobDetailsModal';
import { DuplicateJobAlert } from '@/components/DuplicateJobAlert';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronDown, ChevronUp, Loader2, Images } from 'lucide-react';
import { isAfter, isBefore, startOfDay, endOfDay, format } from 'date-fns';
import { useJobs } from '@/hooks/useJobs';
import { useCategories } from '@/hooks/useCategories';
import { extractPDFWithAI, extractImageWithAI } from '@/lib/api';
import { extractTextFromPDF } from '@/lib/pdfUtils';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

type FileType = 'pdf' | 'image';
type ViewType = 'table' | 'kanban' | 'calendar';
type KanbanGroupBy = 'team' | 'status';

const Index = () => {
  const { categories, isLoading: categoriesLoading, addCategory, updateCategory, deleteCategory } = useCategories();
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const { jobs, isLoading: jobsLoading, addJob, editJob, removeJob, toggleComplete } = useJobs(activeCategory || undefined);
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [uploadExpanded, setUploadExpanded] = useState(false);
  const [viewType, setViewType] = useState<ViewType>('table');
  const [kanbanGroupBy, setKanbanGroupBy] = useState<KanbanGroupBy>('team');
  const [selectedJobForModal, setSelectedJobForModal] = useState<Job | null>(null);
  const [filters, setFilters] = useState<FilterState>({
    search: '',
    team: '',
    status: '',
    sorCode: '',
    dateFrom: undefined,
    dateTo: undefined,
  });
  const [duplicateCheck, setDuplicateCheck] = useState<{
    newJob: Omit<Job, 'id'>;
    existingJob: Job;
    pendingJobs: Omit<Job, 'id'>[];
  } | null>(null);
  const { toast } = useToast();

  // Set first category as active when loaded
  useEffect(() => {
    if (categories.length > 0 && !activeCategory) {
      setActiveCategory(categories[0].id);
    }
  }, [categories, activeCategory]);

  const handleFileUpload = async (file: File, type: FileType) => {
    setIsProcessing(true);
    try {
      let extractedData: Partial<Job> | null = null;

      if (type === 'pdf') {
        const text = await extractTextFromPDF(file);
        console.log('Extracted PDF text:', text.substring(0, 500));
        extractedData = await extractPDFWithAI(text);
      } else if (type === 'image') {
        const base64 = await fileToBase64(file);
        console.log('Processing image for OCR, size:', file.size);
        extractedData = await extractImageWithAI(base64, file.type);
      }
      
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
        bookedDate: extractedData.bookedDate || null,
        startDate: null,
        completionDate: null,
        attachments: [],
        status: 'pending'
      };
      
      // Check for duplicates before adding
      const existing = findDuplicateJob(newJob.jobNumber);
      if (existing) {
        setDuplicateCheck({
          newJob,
          existingJob: existing,
          pendingJobs: []
        });
        setIsProcessing(false);
        return;
      }
      
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
        description: error instanceof Error ? error.message : "Could not extract job details from the file.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleMultipleFilesUpload = async (files: Array<{ file: File; type: FileType }>) => {
    // Use bulk upload modal for multiple files
    setShowBulkUpload(true);
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
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

  const handleToggleComplete = async (job: Job) => {
    try {
      await toggleComplete(job);
      const newStatus = !(job.isCompleted || job.progress === 100);
      toast({
        title: newStatus ? "Job Completed" : "Job Reopened",
        description: `Job #${job.jobNumber} marked as ${newStatus ? 'complete' : 'in progress'}.`,
      });
    } catch (error) {
      toast({
        title: "Update Failed",
        description: "Could not update job status.",
        variant: "destructive",
      });
    }
  };

  const handleBatchUpdateTeam = async (jobIds: string[], teamName: string | null) => {
    try {
      for (const jobId of jobIds) {
        await editJob(jobId, { team: teamName });
      }
      toast({
        title: "Jobs Updated",
        description: `${jobIds.length} jobs assigned to ${teamName || 'Unassigned'}.`,
      });
    } catch (error) {
      toast({
        title: "Update Failed",
        description: "Could not update job assignments.",
        variant: "destructive",
      });
    }
  };

  const handleKanbanMoveJob = useCallback(async (jobId: string, newTeam: string | null, newStatus?: string) => {
    const job = jobs.find(j => j.id === jobId);
    if (!job) return;

    try {
      if (newStatus) {
        // Moving by status
        let updates: Partial<Job> = {};
        if (newStatus === 'completed') {
          updates = { isCompleted: true, progress: 100, completionDate: new Date() };
        } else if (newStatus === 'in-progress') {
          updates = { isCompleted: false, progress: job.progress === 0 ? 25 : job.progress, completionDate: null };
        } else {
          updates = { isCompleted: false, progress: 0, completionDate: null };
        }
        await editJob(jobId, updates);
      } else {
        // Moving by team
        await editJob(jobId, { team: newTeam });
      }
      toast({
        title: "Job Moved",
        description: `Job #${job.jobNumber} has been updated.`,
      });
    } catch (error) {
      toast({
        title: "Move Failed",
        description: "Could not move the job.",
        variant: "destructive",
      });
    }
  }, [jobs, editJob, toast]);

  // Duplicate check helper
  const findDuplicateJob = useCallback((jobNumber: string) => {
    return jobs.find(j => j.jobNumber.toLowerCase() === jobNumber.toLowerCase());
  }, [jobs]);

  const handleBulkJobsExtracted = useCallback(async (newJobs: Omit<Job, 'id'>[]) => {
    const remaining = [...newJobs];
    
    const processNext = async () => {
      if (remaining.length === 0) {
        setShowBulkUpload(false);
        return;
      }

      const currentJob = remaining[0];
      const existing = findDuplicateJob(currentJob.jobNumber);
      
      if (existing) {
        setDuplicateCheck({
          newJob: currentJob,
          existingJob: existing,
          pendingJobs: remaining.slice(1)
        });
      } else {
        await addJob(currentJob);
        remaining.shift();
        await processNext();
      }
    };

    await processNext();
  }, [findDuplicateJob, addJob]);

  const handleDuplicateKeepBoth = async () => {
    if (!duplicateCheck) return;
    const modifiedJob = {
      ...duplicateCheck.newJob,
      jobNumber: `${duplicateCheck.newJob.jobNumber}-DUP-${Date.now().toString().slice(-4)}`
    };
    await addJob(modifiedJob);
    const remaining = duplicateCheck.pendingJobs;
    setDuplicateCheck(null);
    if (remaining.length > 0) {
      await handleBulkJobsExtracted(remaining);
    } else {
      setShowBulkUpload(false);
    }
  };

  const handleDuplicateReplace = async () => {
    if (!duplicateCheck) return;
    await removeJob(duplicateCheck.existingJob.id);
    await addJob(duplicateCheck.newJob);
    const remaining = duplicateCheck.pendingJobs;
    setDuplicateCheck(null);
    if (remaining.length > 0) {
      await handleBulkJobsExtracted(remaining);
    } else {
      setShowBulkUpload(false);
    }
  };

  const handleDuplicateSkip = async () => {
    if (!duplicateCheck) return;
    const remaining = duplicateCheck.pendingJobs;
    setDuplicateCheck(null);
    if (remaining.length > 0) {
      await handleBulkJobsExtracted(remaining);
    } else {
      setShowBulkUpload(false);
    }
  };

  const handleDuplicateDeleteExisting = async () => {
    if (!duplicateCheck) return;
    await removeJob(duplicateCheck.existingJob.id);
    await addJob(duplicateCheck.newJob);
    const remaining = duplicateCheck.pendingJobs;
    setDuplicateCheck(null);
    if (remaining.length > 0) {
      await handleBulkJobsExtracted(remaining);
    } else {
      setShowBulkUpload(false);
    }
  };

  const availableSorCodes = useMemo(() => {
    const codes = new Set<string>();
    jobs.forEach(job => {
      job.workItems.forEach(item => codes.add(item.sorCode));
      job.additionalWorks.forEach(item => codes.add(item.sorCode));
    });
    return Array.from(codes).sort();
  }, [jobs]);

  const handleExportPDF = () => {
    const doc = new jsPDF();
    const activeCat = categories.find(c => c.id === activeCategory);
    
    doc.setFontSize(18);
    doc.text(`${activeCat?.name || 'ALLSAINTS'} JOB REPORT`, 14, 20);
    doc.setFontSize(10);
    doc.text(`Generated: ${format(new Date(), 'dd/MM/yyyy')}`, 14, 28);
    doc.text(`Total Jobs: ${filteredJobs.length}`, 14, 34);

    const tableData = filteredJobs.map(job => [
      job.jobNumber,
      job.name,
      job.address || '-',
      job.team || 'Unassigned',
      `${job.progress}%`,
      job.isCompleted ? 'Complete' : 'In Progress',
      job.startDate ? format(job.startDate, 'dd/MM/yy') : '-',
      job.workItems.map(w => w.sorCode).join(', ') || '-'
    ]);

    autoTable(doc, {
      head: [['Job #', 'Name', 'Address', 'Team', 'Progress', 'Status', 'Start', 'SOR Codes']],
      body: tableData,
      startY: 42,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [59, 130, 246] },
    });

    doc.save(`${activeCat?.slug || 'jobs'}-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
    toast({ title: 'PDF downloaded!' });
  };

  const handleExportExcel = () => {
    const activeCat = categories.find(c => c.id === activeCategory);
    
    const excelData = filteredJobs.map(job => ({
      'Job Number': job.jobNumber,
      'Name': job.name,
      'Address': job.address || '',
      'Phone': job.phoneNumber || '',
      'Team': job.team || 'Unassigned',
      'Progress': `${job.progress}%`,
      'Status': job.isCompleted ? 'Completed' : 'In Progress',
      'Date Issued': format(job.dateIssued, 'dd/MM/yyyy'),
      'Start Date': job.startDate ? format(job.startDate, 'dd/MM/yyyy') : '',
      'Completion Date': job.completionDate ? format(job.completionDate, 'dd/MM/yyyy') : '',
      'Summary': job.summaryOfWorks || '',
      'SOR Codes': job.workItems.map(w => w.sorCode).join(', '),
      'Total Cost': `£${job.workItems.reduce((sum, w) => sum + w.cost, 0).toFixed(2)}`
    }));

    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Jobs');

    XLSX.writeFile(workbook, `${activeCat?.slug || 'jobs'}-${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
    toast({ title: 'Excel downloaded!' });
  };

  const filteredJobs = useMemo(() => {
    return jobs.filter(job => {
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        const matchesSearch = 
          job.jobNumber.toLowerCase().includes(searchLower) ||
          job.name.toLowerCase().includes(searchLower) ||
          job.address.toLowerCase().includes(searchLower) ||
          job.description?.toLowerCase().includes(searchLower) ||
          job.summaryOfWorks?.toLowerCase().includes(searchLower);
        if (!matchesSearch) return false;
      }

      if (filters.team && filters.team !== 'all') {
        if (filters.team === 'unassigned') {
          if (job.team) return false;
        } else {
          if (job.team !== filters.team) return false;
        }
      }

      if (filters.status && filters.status !== 'all') {
        switch (filters.status) {
          case 'not-started':
            if (job.progress > 0) return false;
            break;
          case 'in-progress':
            if (job.progress === 0 || job.isCompleted) return false;
            break;
          case 'completed':
            if (!job.isCompleted) return false;
            break;
        }
      }

      if (filters.sorCode && filters.sorCode !== 'all') {
        const hasSorCode = 
          job.workItems.some(item => item.sorCode === filters.sorCode) ||
          job.additionalWorks.some(item => item.sorCode === filters.sorCode);
        if (!hasSorCode) return false;
      }

      if (filters.dateFrom) {
        if (isBefore(job.dateIssued, startOfDay(filters.dateFrom))) return false;
      }
      if (filters.dateTo) {
        if (isAfter(job.dateIssued, endOfDay(filters.dateTo))) return false;
      }

      return true;
    });
  }, [jobs, filters]);

  const isLoading = categoriesLoading || jobsLoading;

  if (isLoading && categories.length === 0) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header onExport={() => setShowExport(true)} jobCount={jobs.length} />
      
      <main className="flex-1 container mx-auto px-4 py-4 flex flex-col gap-4">
        {/* Category Tabs */}
        <CategoryTabs
          categories={categories}
          activeCategory={activeCategory}
          onCategoryChange={setActiveCategory}
          onAddCategory={addCategory}
          onUpdateCategory={updateCategory}
          onDeleteCategory={deleteCategory}
        />

        {/* Compact Stats Row */}
        <div className="flex items-center justify-between gap-4">
          <StatsCards jobs={filteredJobs} />
        </div>

        {/* Search and Filters */}
        <JobFilters
          filters={filters}
          onFiltersChange={setFilters}
          availableSorCodes={availableSorCodes}
          onExportPDF={handleExportPDF}
          onExportExcel={handleExportExcel}
        />

        {/* Collapsible Upload Section */}
        <section 
          className="bg-card border border-border rounded-lg overflow-hidden"
          style={{ maxHeight: uploadExpanded ? '220px' : '48px' }}
        >
          <button
            onClick={() => setUploadExpanded(!uploadExpanded)}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
          >
            <span className="text-sm font-medium">Upload Job (PDF or Image)</span>
            {uploadExpanded ? (
              <ChevronUp className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            )}
          </button>
          {uploadExpanded && (
            <div className="px-4 pb-4 space-y-3">
              <FileDropZone 
                onFileUpload={handleFileUpload} 
                onMultipleFilesUpload={handleMultipleFilesUpload}
                isProcessing={isProcessing} 
                allowMultiple={true}
              />
              <div className="flex justify-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowBulkUpload(true)}
                  className="text-xs"
                >
                  <Images className="w-3 h-3 mr-1" />
                  Bulk Image Upload
                </Button>
              </div>
            </div>
          )}
        </section>

        {/* Jobs Database */}
        <section className="flex-1 bg-card border border-border rounded-lg p-4 min-h-0 overflow-hidden flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-base font-semibold">Jobs Database</h2>
              <p className="text-xs text-muted-foreground">
                {filteredJobs.length} of {jobs.length} jobs
              </p>
            </div>
            <div className="flex items-center gap-3">
              {viewType === 'kanban' && (
                <Select value={kanbanGroupBy} onValueChange={(v) => setKanbanGroupBy(v as KanbanGroupBy)}>
                  <SelectTrigger className="w-32 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="team">By Team</SelectItem>
                    <SelectItem value="status">By Status</SelectItem>
                  </SelectContent>
                </Select>
              )}
              <ViewToggle view={viewType} onViewChange={setViewType} />
            </div>
          </div>
          
          <div className="flex-1 overflow-auto">
            {viewType === 'table' ? (
              <JobTable 
                jobs={filteredJobs} 
                onUpdateJob={handleUpdateJob}
                onDeleteJob={handleDeleteJob}
                onToggleComplete={handleToggleComplete}
                onBatchUpdateTeam={handleBatchUpdateTeam}
              />
            ) : viewType === 'kanban' ? (
              <KanbanBoard
                jobs={filteredJobs}
                groupBy={kanbanGroupBy}
                onJobClick={setSelectedJobForModal}
                onToggleComplete={handleToggleComplete}
                onMoveJob={handleKanbanMoveJob}
              />
            ) : (
              <CalendarView
                jobs={filteredJobs}
                onJobClick={setSelectedJobForModal}
                onToggleComplete={handleToggleComplete}
              />
            )}
          </div>
        </section>
      </main>

      {showExport && (
        <ExportPanel jobs={jobs} onClose={() => setShowExport(false)} />
      )}

      {showBulkUpload && (
        <BulkImageUpload
          onJobsExtracted={handleBulkJobsExtracted}
          onClose={() => setShowBulkUpload(false)}
        />
      )}

      {duplicateCheck && (
        <DuplicateJobAlert
          newJob={duplicateCheck.newJob}
          existingJob={duplicateCheck.existingJob}
          onKeepBoth={handleDuplicateKeepBoth}
          onReplace={handleDuplicateReplace}
          onSkip={handleDuplicateSkip}
          onDeleteExisting={handleDuplicateDeleteExisting}
        />
      )}

      {selectedJobForModal && (
        <JobDetailsModal
          job={selectedJobForModal}
          onClose={() => setSelectedJobForModal(null)}
          onUpdate={handleUpdateJob}
        />
      )}
    </div>
  );
};

export default Index;
