import { useState, useMemo, useEffect, useCallback } from 'react';
import { useSessionPersistence } from '@/hooks/useSessionPersistence';
import { Job } from '@/types/job';
import { FileDropZone } from '@/components/FileDropZone';
import { InsulationFileDropZone, InsulationFileType } from '@/components/InsulationFileDropZone';
import { BulkImageUpload } from '@/components/BulkImageUpload';
import { JobTable } from '@/components/JobTable';
import { Header } from '@/components/Header';
import { StatsCards } from '@/components/StatsCards';
import { FanStatsCards } from '@/components/FanStatsCards';
import { InsulationStatsCards } from '@/components/InsulationStatsCards';
import { InsulationAnalyticsReport } from '@/components/InsulationAnalyticsReport';
import { ExportPanel } from '@/components/ExportPanel';
import { DMJobFilters, FanJobFilters, InsulationJobFilters, FilterState, getDefaultFilterState } from '@/components/filters';
import { CategoryTabs } from '@/components/CategoryTabs';
import { KanbanBoard } from '@/components/KanbanBoard';
import { CalendarView } from '@/components/CalendarView';
import { MonthlyFolderTabs } from '@/components/MonthlyFolderTabs';
import { BookedDateSidebar } from '@/components/BookedDateSidebar';
import { ViewToggle } from '@/components/ViewToggle';
import { JobDetailsModal } from '@/components/JobDetailsModal';
import { DuplicateJobAlert } from '@/components/DuplicateJobAlert';
import { CompletedJobsPDFButton } from '@/components/CompletedJobsPDFButton';
import { ManualJobEntry } from '@/components/ManualJobEntry';
import { OverdueJobsDashboard } from '@/components/OverdueJobsDashboard';
import { ReferBackPDFButton } from '@/components/ReferBackPDFButton';
import { downloadReferBackJobPDF } from '@/components/ReferBackJobPDF';
import { useJobAlerts } from '@/hooks/useJobAlerts';
import { useOverdueNotifications } from '@/hooks/useOverdueNotifications';
import { useUrlState } from '@/hooks/useUrlState';

import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronDown, ChevronUp, Loader2, Images, PenLine } from 'lucide-react';
import { isAfter, isBefore, startOfDay, endOfDay, format, parseISO, isValid } from 'date-fns';
import { useJobs } from '@/hooks/useJobs';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { useCategories } from '@/hooks/useCategories';
import { useSignOffStatus } from '@/hooks/useSignOffStatus';
import { useFuzzySearch } from '@/hooks/useFuzzySearch';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useTradeBookedJobs, TradeBookingInfo } from '@/hooks/useTradeBookedJobs';

import { extractPDFWithAI, extractImageWithAI, checkDuplicateJobNumber, extractInsulationJobsFromDocument, findExistingJobByAddressOrNumber, mergeJobData, validateAndFixInsulationJob, checkInsulationDuplicates } from '@/lib/api';
import { extractTextFromPDF } from '@/lib/pdfUtils';
import { supabase } from '@/integrations/supabase/client';
// Lazy-loaded: jsPDF, autoTable, ExcelJS - imported dynamically when needed

type FileType = 'pdf' | 'image';
type KanbanGroupBy = 'team' | 'status';
type BookedSortOrder = 'newest' | 'oldest';
type CompletedSortOrder = 'newest' | 'oldest';

const Index = () => {
  const { canEdit } = useAdminAuth();
  useSessionPersistence('genie');
  const { categories, isLoading: categoriesLoading, addCategory, updateCategory, deleteCategory } = useCategories();
  
  // URL-persisted state for navigation that survives tab switches
  const {
    activeDatabaseTab,
    setActiveDatabaseTab,
    selectedBookedDate,
    setSelectedBookedDate,
    viewType,
    setViewType,
    activeCategory: urlCategory,
    setActiveCategory: setUrlCategory,
    selectedJobId,
    setSelectedJobId,
  } = useUrlState();
  
  // Use URL category or fall back to first category
  const activeCategory = urlCategory;
  const setActiveCategory = setUrlCategory;
  
  const { jobs, isLoading: jobsLoading, addJob, editJob, removeJob, toggleComplete, refreshJobs } = useJobs(activeCategory ?? undefined);
  
  // Get trade-booked jobs (sub-tasks with booked dates)
  const { tradeBookings } = useTradeBookedJobs();
  
  // Get job IDs for sign-off status
  const jobIds = useMemo(() => jobs.map(j => j.id), [jobs]);
  const { getSignOffStatus } = useSignOffStatus(jobIds);
  
  // Contact history for refer back PDF is now fetched on-demand inside ReferBackPDFButton

  const [isProcessing, setIsProcessing] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showOverdueDashboard, setShowOverdueDashboard] = useState(false);
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [bulkUploadInitialFiles, setBulkUploadInitialFiles] = useState<Array<{ file: File; type: FileType }>>([]);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [uploadExpanded, setUploadExpanded] = useState(false);
  const [kanbanGroupBy, setKanbanGroupBy] = useState<KanbanGroupBy>('team');
  const selectedJobForModal = useMemo(() => {
    if (!selectedJobId) return null;
    return jobs.find(j => j.id === selectedJobId) || null;
  }, [selectedJobId, jobs]);
  const setSelectedJobForModal = useCallback((job: Job | null) => {
    setSelectedJobId(job?.id || null);
  }, [setSelectedJobId]);
  const [filters, setFilters] = useState<FilterState>(getDefaultFilterState());
  const [activeMonthFolder, setActiveMonthFolder] = useState<string | null>(null);
  const [bookedSortOrder, setBookedSortOrder] = useState<BookedSortOrder>('newest');
  const [completedSortOrder, setCompletedSortOrder] = useState<CompletedSortOrder>('newest');
  const [showAnalyticsReport, setShowAnalyticsReport] = useState(false);
  const [duplicateCheck, setDuplicateCheck] = useState<{
    newJob: Omit<Job, 'id'>;
    existingJob: Job;
    pendingJobs: Omit<Job, 'id'>[];
  } | null>(null);
  const { toast } = useToast();

  // Set first category as active when loaded (only if no URL category)
  useEffect(() => {
    if (categories.length > 0 && !activeCategory) {
      setActiveCategory(categories[0].id);
    }
  }, [categories, activeCategory, setActiveCategory]);

  const handleFileUpload = async (file: File, type: FileType) => {
    setIsProcessing(true);
    try {
      // For Insulation category, use the multi-job extractor
      if (isInsulationCategory) {
        let documentText = '';
        let documentType: 'pdf' | 'excel' | 'text' = 'pdf';
        
        if (type === 'pdf') {
          documentText = await extractTextFromPDF(file);
          documentType = 'pdf';
        } else if (type === 'image') {
          // For images, convert to base64 and use regular extraction
          const base64 = await fileToBase64(file);
          const extractedData = await extractImageWithAI(base64, file.type);
          if (extractedData) {
            documentText = JSON.stringify(extractedData);
            documentType = 'text';
          }
        }
        
        console.log('Extracting insulation jobs from document, length:', documentText.length);
        
        const result = await extractInsulationJobsFromDocument(documentText, documentType);
        console.log(`Extracted ${result.jobCount} insulation jobs`);
        
        if (result.jobCount === 0 || result.jobs.length === 0) {
          throw new Error('No jobs found in document');
        }
        
        // Convert extracted jobs to our Job format and apply hardwired validation
        const newJobs: Omit<Job, 'id'>[] = result.jobs.map(extractedJob => {
          const rawJob: Partial<Job> = {
            jobNumber: extractedJob.jobNumber || `INS-${Date.now().toString().slice(-6)}`,
            name: extractedJob.name || 'Unknown',
            address: extractedJob.address || '',
            phoneNumber: extractedJob.phoneNumber || '',
            summaryOfWorks: '',
            description: extractedJob.description || '',
            workItems: (extractedJob.workItems || []).map((item: any) => ({
              ...item,
              id: crypto.randomUUID(),
            })),
            additionalWorks: [],
            team: extractedJob.team || null, // From Team column -> Assigned
            team2: null,
            progress: 0,
            progressNotes: extractedJob.status || '', // Action/Contact data goes to progress notes for visibility
            isCompleted: false,
            isOngoing: false,
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
            insulationInfo: extractedJob.insulationInfo || null,
            linkedInsulationJobId: null,
            costs: null,
            privateNotes: extractedJob.privateNotes || '', // EPC bookings and sensitive data
          };
          
          // HARDWIRED VALIDATION: Extract missing data from description
          return validateAndFixInsulationJob(rawJob) as Omit<Job, 'id'>;
        });
        
        // Process jobs with duplicate checking
        if (newJobs.length === 1) {
          const existing = await findDuplicateJobAsync(newJobs[0].jobNumber);
          if (existing) {
            setDuplicateCheck({
              newJob: newJobs[0],
              existingJob: existing,
              pendingJobs: []
            });
            setIsProcessing(false);
            return;
          }
          await addJob(newJobs[0]);
          toast({
            title: "Insulation Job Added",
            description: `Job #${newJobs[0].jobNumber} with ${newJobs[0].insulationInfo?.length || 0} insulation units.`,
          });
        } else {
          // Multiple jobs - use batch processing
          await handleBulkJobsExtracted(newJobs);
          toast({
            title: "Jobs Extracted Successfully",
            description: `${result.jobCount} insulation jobs extracted from document.`,
          });
        }
        
        setUploadExpanded(false);
        setIsProcessing(false);
        return;
      }
      
      // Standard extraction for other categories
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
          id: crypto.randomUUID(),
        })),
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
        bookedDate: extractedData.bookedDate || null,
        isFlexibleBooking: false,
        bookingNotes: '',
        completionDate: null,
        attachments: [],
        status: 'pending',
        fanInfo: null,
        linkedFanJobId: null,
        insulationInfo: null,
        linkedInsulationJobId: null,
        costs: null,
        privateNotes: '',
        referBack: false,
        referBackReason: '',
        referBackDate: null,
        expectedCompletionDate: null,
      };
      
      // Check for duplicates before adding
      const existing = await findDuplicateJobAsync(newJob.jobNumber);
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
    // Pass files directly to bulk upload modal (pre-populated)
    setBulkUploadInitialFiles(files);
    setShowBulkUpload(true);
  };

  // Handler for Insulation category file uploads (supports Excel, CSV, PDF) - INTELLIGENT MERGE
  const handleInsulationFileUpload = async (file: File, type: InsulationFileType, textContent?: string) => {
    setIsProcessing(true);
    try {
      let documentText = textContent || '';
      let documentType: 'pdf' | 'excel' | 'text' = 'pdf';
      
      if (type === 'excel') {
        documentType = 'excel';
        // textContent is already parsed from Excel by the component
      } else if (type === 'pdf') {
        documentText = await extractTextFromPDF(file);
        documentType = 'pdf';
      } else if (type === 'image') {
        // For images, convert to base64 and use regular extraction
        const base64 = await fileToBase64(file);
        const extractedData = await extractImageWithAI(base64, file.type);
        if (extractedData) {
          documentText = JSON.stringify(extractedData);
          documentType = 'text';
        }
      }
      
      console.log('Extracting insulation jobs, document length:', documentText.length);
      
      const result = await extractInsulationJobsFromDocument(documentText, documentType);
      console.log(`Extracted ${result.jobCount} insulation jobs from document`);
      
      if (result.jobCount === 0 || result.jobs.length === 0) {
        throw new Error('No jobs found in document');
      }

      // Process with intelligent merge logic
      let addedCount = 0;
      let mergedCount = 0;
      let skippedCount = 0;
      const errors: string[] = [];

      for (const extractedJob of result.jobs) {
        try {
          const jobNumber = extractedJob.jobNumber || `INS-${Date.now().toString().slice(-6)}-${addedCount}`;
          const address = extractedJob.address || '';
          
          // Check for existing job by address OR job number
          const existingJob = activeCategory 
            ? await findExistingJobByAddressOrNumber(jobNumber, address, activeCategory)
            : null;

          if (existingJob) {
            // Merge data into existing job - include new extraction fields
            console.log(`Merging data into existing job: ${existingJob.jobNumber} (matched by ${existingJob.address})`);
            
            await mergeJobData(existingJob, {
              workItems: (extractedJob.workItems || []).map((item: any) => ({
                ...item,
                id: crypto.randomUUID(),
              })),
              insulationInfo: extractedJob.insulationInfo || [],
              description: extractedJob.description || '',
              phoneNumber: extractedJob.phoneNumber || '',
              name: extractedJob.name || '',
              team: extractedJob.team || '', // From Team column
              progressNotes: extractedJob.status || '', // Action/Contact data
              privateNotes: extractedJob.privateNotes || '', // EPC bookings
            });
            
            mergedCount++;
          } else {
            // Create new job - apply hardwired validation before saving
            const rawJob: Partial<Job> = {
              jobNumber,
              name: extractedJob.name || 'Unknown',
              address,
              phoneNumber: extractedJob.phoneNumber || '',
              summaryOfWorks: '',
              description: extractedJob.description || '',
              workItems: (extractedJob.workItems || []).map((item: any) => ({
                ...item,
                id: crypto.randomUUID(),
              })),
              additionalWorks: [],
              team: extractedJob.team || null, // From Team column -> Assigned
              team2: null,
              progress: 0,
              progressNotes: extractedJob.status || '', // Action/Contact data for visibility
              isCompleted: false,
              isOngoing: false,
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
              insulationInfo: extractedJob.insulationInfo || null,
              linkedInsulationJobId: null,
              costs: null,
              privateNotes: extractedJob.privateNotes || '', // EPC bookings
            };
            
            // HARDWIRED VALIDATION: Ensure data integrity
            const validatedJob = validateAndFixInsulationJob(rawJob) as Omit<Job, 'id'>;
            
            await addJob(validatedJob);
            addedCount++;
          }
        } catch (jobError) {
          console.error('Error processing job:', jobError);
          errors.push(extractedJob.jobNumber || extractedJob.address || 'Unknown');
          skippedCount++;
        }
      }

      // Refresh to show updates
      await refreshJobs();
      
      // Build summary message
      const summaryParts: string[] = [];
      if (addedCount > 0) summaryParts.push(`${addedCount} new job${addedCount > 1 ? 's' : ''} created`);
      if (mergedCount > 0) summaryParts.push(`${mergedCount} existing job${mergedCount > 1 ? 's' : ''} updated`);
      if (skippedCount > 0) summaryParts.push(`${skippedCount} skipped due to errors`);
      
      toast({
        title: "Import Complete",
        description: summaryParts.join(', ') + '.',
      });
      
      if (errors.length > 0) {
        console.warn('Jobs with errors:', errors);
      }
      
      setUploadExpanded(false);
    } catch (error) {
      console.error('Insulation extraction error:', error);
      toast({
        title: "Extraction Failed",
        description: error instanceof Error ? error.message : "Could not extract insulation jobs from the file.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
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
    } catch (error: any) {
      console.error('Job update failed:', error);
      const errorMessage = error?.message || error?.details || 'Could not update the job.';
      toast({
        title: "Update Failed",
        description: errorMessage,
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

  const handleTransferJob = async (jobId: string, targetCategoryId: string) => {
    try {
      await editJob(jobId, { categoryId: targetCategoryId } as any);
      refreshJobs();
      toast({
        title: "Job Transferred",
        description: `Job has been moved to the new category.`,
      });
    } catch (error) {
      toast({
        title: "Transfer Failed",
        description: "Could not transfer the job.",
        variant: "destructive",
      });
    }
  };

  const handleReferBack = async (job: Job, reason?: string) => {
    try {
      const updatedJob = {
        ...job,
        referBack: true,
        referBackReason: reason || 'Manual refer back',
        referBackDate: new Date(),
      };
      await editJob(job.id, {
        referBack: true,
        referBackReason: reason || 'Manual refer back',
        referBackDate: new Date(),
      });

      // Auto-generate PDF report on refer back
      try {
        // Fetch contact history for this job
        const { data: historyData } = await supabase
          .from('contact_history')
          .select('*')
          .eq('job_id', job.id)
          .order('contact_date', { ascending: false });

        const contactHistory = (historyData || []).map((row: any) => ({
          id: row.id,
          jobId: row.job_id,
          contactDate: new Date(row.contact_date),
          outcome: row.outcome,
          notes: row.notes,
          nextAction: row.next_action,
          nextActionDate: row.next_action_date ? new Date(row.next_action_date) : null,
          createdBy: row.created_by,
          createdAt: new Date(row.created_at),
        }));

        downloadReferBackJobPDF(updatedJob, contactHistory);
      } catch (pdfError) {
        console.error('Auto PDF generation failed:', pdfError);
        // Don't block the refer back if PDF fails
      }

      toast({
        title: "Referred Back",
        description: `Job #${job.jobNumber} has been moved to Refer Back. PDF report downloaded.`,
      });
    } catch (error) {
      toast({
        title: "Refer Back Failed",
        description: "Could not refer back the job.",
        variant: "destructive",
      });
    }
  };

  const handleDuplicateToCategory = async (jobId: string, targetCategoryId: string, teamName: string) => {
    const job = jobs.find(j => j.id === jobId);
    if (!job) return;

    try {
      // Create a duplicate of the job in the target category with team name
      const duplicatedJob: Omit<Job, 'id'> = {
        ...job,
        team: teamName, // Assign the team name (not ID)
        categoryId: targetCategoryId,
      } as any;
      
      // Remove the id field to create a new job
      await addJob(duplicatedJob);
      
      const targetCategory = categories.find(c => c.id === targetCategoryId);
      toast({
        title: "Job Assigned to Category",
        description: `Job #${job.jobNumber} assigned to ${teamName} in ${targetCategory?.name || 'category'}.`,
      });
    } catch (error) {
      toast({
        title: "Assignment Failed",
        description: "Could not assign the job to category.",
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

  // Duplicate check helper - checks ALL categories in database
  const findDuplicateJobAsync = useCallback(async (jobNumber: string): Promise<Job | null> => {
    // First check local jobs for quick response
    const localMatch = jobs.find(j => j.jobNumber.toLowerCase() === jobNumber.toLowerCase());
    if (localMatch) return localMatch;
    
    // Then check database for jobs in other categories
    return await checkDuplicateJobNumber(jobNumber);
  }, [jobs]);

  const handleBulkJobsExtracted = useCallback(async (newJobs: Omit<Job, 'id'>[]) => {
    const remaining = [...newJobs];
    
    const processNext = async () => {
      if (remaining.length === 0) {
        setShowBulkUpload(false);
        return;
      }

      const currentJob = remaining[0];
      const existing = await findDuplicateJobAsync(currentJob.jobNumber);
      
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
  }, [findDuplicateJobAsync, addJob]);

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

  // Check if current category is "Fan"
  const isFanCategory = useMemo(() => {
    const activeCat = categories.find(c => c.id === activeCategory);
    return activeCat?.name.toLowerCase().includes('fan') || false;
  }, [categories, activeCategory]);

  // Check if current category is "Insulation"
  const isInsulationCategory = useMemo(() => {
    const activeCat = categories.find(c => c.id === activeCategory);
    return activeCat?.name.toLowerCase().includes('insulation') || false;
  }, [categories, activeCategory]);

  // Check if search is active (for global search across all tabs)
  const hasActiveSearch = filters.search && filters.search.trim().length > 0;
  
  // Debounce the search term to prevent re-filtering on every keystroke
  const debouncedSearch = useDebouncedValue(filters.search, 300);

  const filteredJobs = useMemo(() => {
    let result = jobs.filter(job => {
      // When search is active, search across ALL jobs (booked, unbooked, completed)
      // This enables global search functionality
      if (!hasActiveSearch) {
        // Database tab filter (booked/completed/all) - only applied when NOT searching
        // UNIFIED COMPLETED DEFINITION: status === 'complete' OR isCompleted === true
        // When status is set to 'complete', isCompleted is automatically set to true
        const isJobCompleted = job.status === 'complete' || job.isCompleted;
        
        if (activeDatabaseTab === 'booked') {
          // Show jobs with a booked date OR jobs with trade-booked sub-tasks
          const hasTradeBooking = tradeBookings.has(job.id);
          if (!job.bookedDate && !hasTradeBooking) return false;
          
          // Filter by selected booked date if any
          if (selectedBookedDate) {
            // Check main booked date
            let matchesDate = false;
            if (job.bookedDate) {
              const bookedDate = job.bookedDate instanceof Date ? job.bookedDate : parseISO(job.bookedDate as any);
              if (isValid(bookedDate)) {
                matchesDate = format(bookedDate, 'yyyy-MM-dd') === selectedBookedDate;
              }
            }
            // Check trade effective booked date
            if (!matchesDate && hasTradeBooking) {
              const tradeInfo = tradeBookings.get(job.id)!;
              matchesDate = format(tradeInfo.effectiveBookedDate, 'yyyy-MM-dd') === selectedBookedDate;
            }
            if (!matchesDate) return false;
          }
        } else if (activeDatabaseTab === 'completed') {
          // Show completed jobs, but NOT if they have a booked date (booked overrides)
          if (!isJobCompleted || job.bookedDate) return false;
        } else if (activeDatabaseTab === 'refer_back') {
          // Show only refer back jobs
          if (!job.referBack) return false;
        } else {
          // In main "all" tab, exclude booked, completed, and refer back jobs
          if (job.bookedDate) return false;
          if (tradeBookings.has(job.id)) return false;
          if (isJobCompleted) return false;
          if (job.referBack) return false;
        }
      }

      // Monthly folder filter
      if (activeMonthFolder) {
        const date = job.dateIssued;
        if (!date || !isValid(date)) return false;
        const jobMonthKey = format(date, 'yyyy-MM');
        if (jobMonthKey !== activeMonthFolder) return false;
      }

      // Search filtering is now handled by fuzzy search below
      // Only filter here if no search term (fuzzy search handles the rest)

      // Phone number filter
      if (filters.phoneNumber) {
        const phoneLower = filters.phoneNumber.toLowerCase();
        if (!job.phoneNumber?.toLowerCase().includes(phoneLower)) return false;
      }

      if (filters.team && filters.team !== 'all') {
        if (filters.team === 'unassigned') {
          if (job.team) return false;
        } else {
          if (job.team !== filters.team) return false;
        }
      }

      if (filters.status && filters.status !== 'all') {
        // For fan category, use direct status match
        if (isFanCategory) {
          if (job.status !== filters.status) return false;
        } else {
          // For DM category, use progress-based status
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

      // Fan filter (only for DM categories)
      if (!isFanCategory && filters.hasFans && filters.hasFans !== 'all') {
        const hasFans = job.fanInfo && job.fanInfo.length > 0;
        if (filters.hasFans === 'with-fans' && !hasFans) return false;
        if (filters.hasFans === 'no-fans' && hasFans) return false;
      }

      // Booked date filter
      if (filters.hasBookedDate && filters.hasBookedDate !== 'all') {
        const hasBookedDate = !!job.bookedDate;
        if (filters.hasBookedDate === 'booked' && !hasBookedDate) return false;
        if (filters.hasBookedDate === 'unbooked' && hasBookedDate) return false;
      }

      // Sign-off status filter
      if (filters.signOffStatus && filters.signOffStatus !== 'all') {
        const signOffData = getSignOffStatus(job.id, job.team, job.team2);
        if (filters.signOffStatus === 'pending' && signOffData.allSignedOff) return false;
        if (filters.signOffStatus === 'complete' && !signOffData.allSignedOff) return false;
      }

      return true;
    });
    
    // Sort by booked date if in booked tab (use trade effective date as fallback)
    if (activeDatabaseTab === 'booked') {
      result.sort((a, b) => {
        const getEffectiveDate = (j: Job) => {
          if (j.bookedDate) return new Date(j.bookedDate).getTime();
          const tradeInfo = tradeBookings.get(j.id);
          if (tradeInfo) return tradeInfo.effectiveBookedDate.getTime();
          return 0;
        };
        const dateA = getEffectiveDate(a);
        const dateB = getEffectiveDate(b);
        return bookedSortOrder === 'newest' ? dateB - dateA : dateA - dateB;
      });
    }
    
    // Sort by completion date if in completed tab
    if (activeDatabaseTab === 'completed') {
      result.sort((a, b) => {
        const dateA = a.completionDate ? new Date(a.completionDate).getTime() : new Date(a.dateIssued).getTime();
        const dateB = b.completionDate ? new Date(b.completionDate).getTime() : new Date(b.dateIssued).getTime();
        return completedSortOrder === 'newest' ? dateB - dateA : dateA - dateB;
      });
    }
    
    return result;
  }, [jobs, filters, isFanCategory, activeMonthFolder, activeDatabaseTab, bookedSortOrder, completedSortOrder, selectedBookedDate, getSignOffStatus, tradeBookings]);

  // Apply fuzzy search on pre-filtered jobs using debounced search term
  const { matches: fuzzyFilteredJobs, hasSearch } = useFuzzySearch(
    filteredJobs,
    debouncedSearch,
    { threshold: 0.35 }
  );

  // Use fuzzy results if search is active, otherwise use filtered jobs
  const displayedJobs = hasSearch ? fuzzyFilteredJobs : filteredJobs;

  // UNIFIED COMPLETED DEFINITION: status === 'complete' OR isCompleted === true
  // Count booked jobs for badge (exclude completed)
  const bookedJobsCount = useMemo(() => {
    return jobs.filter(j => {
      if (j.status === 'complete' || j.isCompleted) return false;
      return !!j.bookedDate || tradeBookings.has(j.id);
    }).length;
  }, [jobs, tradeBookings]);

  // Count completed jobs for badge - consistent with StatsCards and CompletedJobsPDFButton
  const completedJobsCount = useMemo(() => {
    return jobs.filter(j => j.status === 'complete' || j.isCompleted).length;
  }, [jobs]);

  // Count refer back jobs for badge
  const referBackJobsCount = useMemo(() => {
    return jobs.filter(j => j.referBack).length;
  }, [jobs]);

  // Build sign-off statuses map for overdue calculation
  const signOffStatusesMap = useMemo(() => {
    const map: Record<string, { allSignedOff: boolean }> = {};
    for (const job of jobs) {
      const status = getSignOffStatus(job.id);
      map[job.id] = { allSignedOff: status?.allSignedOff || false };
    }
    return map;
  }, [jobs, getSignOffStatus]);

  // Use job alerts hook for overdue jobs count
  const { getAlertJobs } = useJobAlerts(jobs, signOffStatusesMap);
  const overdueJobs = getAlertJobs();
  const overdueCount = overdueJobs.length;

  // Real-time overdue notifications with toast and sound alerts
  useOverdueNotifications({
    jobs,
    signOffStatuses: signOffStatusesMap,
  });

  // Helper function to extract phone number from description or name column
  const extractPhoneNumber = (job: Job): string => {
    // First check job.phoneNumber
    if (job.phoneNumber) return job.phoneNumber;
    
    // Try to extract from name or description
    const textToSearch = `${job.name} ${job.description || ''} ${job.summaryOfWorks || ''}`;
    const phonePatterns = [
      /(?:tel|phone|mob|mobile|contact)?[:\s]*(\+44[\s.-]?\d{4}[\s.-]?\d{6})/gi,
      /(?:tel|phone|mob|mobile|contact)?[:\s]*(07\d{3}[\s.-]?\d{6})/gi,
      /(?:tel|phone|mob|mobile|contact)?[:\s]*(0\d{3,4}[\s.-]?\d{6,7})/gi,
      /(\d{5}[\s.-]?\d{6})/g,
    ];
    for (const pattern of phonePatterns) {
      const match = textToSearch.match(pattern);
      if (match) return match[0].replace(/^(tel|phone|mob|mobile|contact)[:\s]*/i, '').trim();
    }
    return '';
  };

  // Helper function to extract fan quantity
  const extractFanQuantity = (job: Job): string => {
    const fanInfo = job.fanInfo || [];
    if (fanInfo.length > 0) {
      return fanInfo.map((f: any) => `${f.quantity || 1}x ${f.fanType || 'Fan'}`).join(', ');
    }
    // Try to extract from description/summary
    const desc = `${job.description || ''} ${job.summaryOfWorks || ''}`;
    const fanPatterns = [
      /(\d+)\s*x?\s*(?:fan|extractor|extract)/gi,
      /(?:install|fit|supply)\s+(\d+)\s*(?:fan|extractor)/gi,
    ];
    for (const pattern of fanPatterns) {
      const match = desc.match(pattern);
      if (match) return match[0];
    }
    return '1x Fan';
  };

  const handleExportPDF = async () => {
    const { default: jsPDF } = await import('jspdf');
    const { default: autoTable } = await import('jspdf-autotable');
    const doc = new jsPDF();
    const activeCat = categories.find(c => c.id === activeCategory);
    
    doc.setFontSize(18);
    doc.text(isFanCategory ? 'Fans JOB REPORT' : `${activeCat?.name || 'ALLSAINTS'} JOB REPORT`, 14, 20);
    doc.setFontSize(10);
    doc.text(`Generated: ${format(new Date(), 'dd/MM/yyyy')}`, 14, 28);
    doc.text(`Total Jobs: ${displayedJobs.length}`, 14, 34);

    if (isFanCategory) {
      const tableData = displayedJobs.map(job => [
        job.jobNumber,
        job.name,
        extractPhoneNumber(job) || '-',
        job.address || '-',
        extractFanQuantity(job),
        job.team || 'Unassigned',
        `${job.progress}%`,
        job.isCompleted ? 'Complete' : 'In Progress',
        job.bookedDate ? format(job.bookedDate, 'dd/MM/yy') : '-',
        job.workItems.map(w => w.sorCode).join(', ') || '-'
      ]);

      autoTable(doc, {
        head: [['Job #', 'Name', 'Phone', 'Address', 'Fan Qty', 'Team', 'Progress', 'Status', 'Booked', 'SOR Codes']],
        body: tableData,
        startY: 42,
        styles: { fontSize: 7 },
        headStyles: { fillColor: [59, 130, 246] },
        columnStyles: {
          2: { cellWidth: 24 },
          4: { cellWidth: 18 },
        }
      });
    } else {
      const tableData = displayedJobs.map(job => [
        job.jobNumber,
        job.name,
        job.address || '-',
        job.team || 'Unassigned',
        `${job.progress}%`,
        job.isCompleted ? 'Complete' : 'In Progress',
        job.bookedDate ? format(job.bookedDate, 'dd/MM/yy') : '-',
        job.workItems.map(w => w.sorCode).join(', ') || '-'
      ]);

      autoTable(doc, {
        head: [['Job #', 'Name', 'Address', 'Team', 'Progress', 'Status', 'Booked', 'SOR Codes']],
        body: tableData,
        startY: 42,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [59, 130, 246] },
      });
    }

    doc.save(`${activeCat?.slug || 'jobs'}-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
    toast({ title: 'PDF downloaded!' });
  };

  const handleExportExcel = async () => {
    const activeCat = categories.find(c => c.id === activeCategory);
    
    let excelData;
    
    if (isFanCategory) {
      excelData = displayedJobs.map(job => ({
        'Job Number': job.jobNumber,
        'Name': job.name,
        'Phone': extractPhoneNumber(job),
        'Address': job.address || '',
        'Fan Qty': extractFanQuantity(job),
        'Team': job.team || 'Unassigned',
        'Progress': `${job.progress}%`,
        'Status': job.isCompleted ? 'Completed' : 'In Progress',
        'Date Issued': format(job.dateIssued, 'dd/MM/yyyy'),
        'Booked Date': job.bookedDate ? format(job.bookedDate, 'dd/MM/yyyy') : '',
        'Description': job.summaryOfWorks || job.description || '',
        'SOR Codes': job.workItems.map(w => w.sorCode).join(', '),
        'Total Cost': `£${job.workItems.reduce((sum, w) => sum + w.cost, 0).toFixed(2)}`
      }));
    } else {
      excelData = displayedJobs.map(job => ({
        'Job Number': job.jobNumber,
        'Name': job.name,
        'Address': job.address || '',
        'Phone': job.phoneNumber || '',
        'Team': job.team || 'Unassigned',
        'Progress': `${job.progress}%`,
        'Status': job.isCompleted ? 'Completed' : 'In Progress',
        'Date Issued': format(job.dateIssued, 'dd/MM/yyyy'),
        'Booked Date': job.bookedDate ? format(job.bookedDate, 'dd/MM/yyyy') : '',
        'Completion Date': job.completionDate ? format(job.completionDate, 'dd/MM/yyyy') : '',
        'Summary': job.summaryOfWorks || '',
        'SOR Codes': job.workItems.map(w => w.sorCode).join(', '),
        'Total Cost': `£${job.workItems.reduce((sum, w) => sum + w.cost, 0).toFixed(2)}`
      }));
    }

    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(isFanCategory ? 'Fan Jobs' : 'Jobs');
    
    // Add headers
    const headers = Object.keys(excelData[0] || {});
    worksheet.addRow(headers);
    
    // Add data
    excelData.forEach(row => {
      worksheet.addRow(Object.values(row));
    });
    
    // Auto-size columns
    worksheet.columns.forEach(column => {
      column.width = 15;
    });
    
    // Generate and download
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${activeCat?.slug || 'jobs'}-${format(new Date(), 'yyyy-MM-dd')}.xlsx`;
    link.click();
    URL.revokeObjectURL(url);
    toast({ title: 'Excel downloaded!' });
  };

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
      <Header 
        onExport={() => setShowExport(true)} 
        jobCount={jobs.length}
        onJobClick={(jobId) => {
          const job = jobs.find(j => j.id === jobId);
          if (job) {
            setSelectedJobForModal(job);
          }
        }}
        onRefresh={refreshJobs}
        overdueCount={overdueCount}
        onShowOverdue={() => setShowOverdueDashboard(true)}
      />
      
      {/* Overdue Jobs Dashboard Modal */}
      {showOverdueDashboard && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <OverdueJobsDashboard
            jobs={jobs}
            signOffStatuses={signOffStatusesMap}
            onClose={() => setShowOverdueDashboard(false)}
            onJobClick={(job) => {
              setShowOverdueDashboard(false);
              setSelectedJobForModal(job);
            }}
          />
        </div>
      )}
      
      <main className="flex-1 container mx-auto px-4 py-4 flex flex-col gap-4">
        {/* Category Tabs - hide add/edit for viewers */}
        <CategoryTabs
          categories={categories}
          activeCategory={activeCategory}
          onCategoryChange={setActiveCategory}
          onAddCategory={canEdit ? addCategory : undefined}
          onUpdateCategory={canEdit ? updateCategory : undefined}
          onDeleteCategory={canEdit ? deleteCategory : undefined}
        />

        {/* Compact Stats Row */}
        <div className="flex items-center justify-between gap-4 bg-section-stats rounded-lg p-3">
          {isInsulationCategory ? (
            <InsulationStatsCards jobs={displayedJobs} />
          ) : isFanCategory ? (
            <FanStatsCards jobs={displayedJobs} />
          ) : (
            <StatsCards jobs={displayedJobs} allJobs={jobs} />
          )}
        </div>

        {/* Search and Filters - Category Specific */}
        <div className="bg-section-filters rounded-lg p-3">
          {isInsulationCategory ? (
            <InsulationJobFilters
              filters={filters}
              onFiltersChange={setFilters}
              availableSorCodes={availableSorCodes}
              onExportPDF={handleExportPDF}
              onExportExcel={handleExportExcel}
              jobs={jobs}
              onOpenAnalyticsReport={() => setShowAnalyticsReport(true)}
            />
          ) : isFanCategory ? (
            <FanJobFilters
              filters={filters}
              onFiltersChange={setFilters}
              availableSorCodes={availableSorCodes}
              onExportPDF={handleExportPDF}
              onExportExcel={handleExportExcel}
            />
          ) : (
            <DMJobFilters
              filters={filters}
              onFiltersChange={setFilters}
              availableSorCodes={availableSorCodes}
              onExportPDF={handleExportPDF}
              onExportExcel={handleExportExcel}
            />
          )}
        </div>
        
        {/* Analytics Report Modal for Insulation */}
        {isInsulationCategory && showAnalyticsReport && (
          <InsulationAnalyticsReport 
            jobs={jobs} 
            isOpen={showAnalyticsReport}
            onClose={() => setShowAnalyticsReport(false)}
          />
        )}

        {/* Collapsible Upload Section - only show for admins */}
        {canEdit && (
          <section 
            className="bg-section-upload border border-border rounded-lg overflow-hidden"
            style={{ maxHeight: uploadExpanded ? '380px' : '48px' }}
          >
            <button
              onClick={() => setUploadExpanded(!uploadExpanded)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
            >
              <span className="text-sm font-medium">Add New Job</span>
              {uploadExpanded ? (
                <ChevronUp className="w-4 h-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              )}
            </button>
            {uploadExpanded && (
              <div className="px-4 pb-4 space-y-4">
                {/* Prominent Manual Entry Button */}
                <Button
                  variant="default"
                  size="lg"
                  onClick={() => setShowManualEntry(true)}
                  className="w-full gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-medium"
                >
                  <PenLine className="w-4 h-4" />
                  Enter Job Manually
                </Button>
                
                {/* Divider */}
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-section-upload px-2 text-muted-foreground">or upload files</span>
                  </div>
                </div>
                
                {isInsulationCategory ? (
                  <>
                    <InsulationFileDropZone 
                      onFileUpload={handleInsulationFileUpload}
                      isProcessing={isProcessing} 
                    />
                    <p className="text-xs text-center text-muted-foreground">
                      Upload PDFs, Excel sheets, or CSV files containing job lists. Each job will be created separately.
                    </p>
                  </>
                ) : (
                  <FileDropZone 
                    onFileUpload={handleFileUpload} 
                    onMultipleFilesUpload={handleMultipleFilesUpload}
                    isProcessing={isProcessing} 
                    allowMultiple={true}
                  />
                )}
              </div>
            )}
          </section>
        )}


        {/* Monthly Folder Tabs */}
        <MonthlyFolderTabs
          jobs={jobs}
          activeFolder={activeMonthFolder}
          onFolderChange={setActiveMonthFolder}
        />

        {/* Jobs Database */}
        <section className="flex-1 bg-section-database border border-border rounded-lg p-4 min-h-0 overflow-hidden flex flex-col">
          {/* Database Tabs - Job Database / BOOKED / COMPLETED */}
          <div className="flex items-center gap-2 mb-3 border-b border-border pb-2">
            <button
              onClick={() => setActiveDatabaseTab('all')}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                activeDatabaseTab === 'all'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {isFanCategory ? 'Fan Installations' : 'Job Database'}
            </button>
            <button
              onClick={() => setActiveDatabaseTab('booked')}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors flex items-center gap-2 ${
                activeDatabaseTab === 'booked'
                  ? 'bg-amber-500 text-white'
                  : 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-900/60'
              }`}
            >
              BOOKED
              {bookedJobsCount > 0 && (
                <span className={`px-1.5 py-0.5 text-xs font-bold rounded-full ${
                  activeDatabaseTab === 'booked'
                    ? 'bg-white/20 text-white'
                    : 'bg-amber-500 text-white'
                }`}>
                  {bookedJobsCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveDatabaseTab('completed')}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors flex items-center gap-2 ${
                activeDatabaseTab === 'completed'
                  ? 'bg-emerald-500 text-white'
                  : 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-200 dark:hover:bg-emerald-900/60'
              }`}
            >
              COMPLETED
              {completedJobsCount > 0 && (
                <span className={`px-1.5 py-0.5 text-xs font-bold rounded-full ${
                  activeDatabaseTab === 'completed'
                    ? 'bg-white/20 text-white'
                    : 'bg-emerald-500 text-white'
                }`}>
                  {completedJobsCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveDatabaseTab('refer_back')}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors flex items-center gap-2 ${
                activeDatabaseTab === 'refer_back'
                  ? 'bg-red-500 text-white'
                  : 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/60'
              }`}
            >
              REFER BACK
              {referBackJobsCount > 0 && (
                <span className={`px-1.5 py-0.5 text-xs font-bold rounded-full ${
                  activeDatabaseTab === 'refer_back'
                    ? 'bg-white/20 text-white'
                    : 'bg-red-500 text-white'
                }`}>
                  {referBackJobsCount}
                </span>
              )}
            </button>
          </div>

          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-base font-semibold">
                {activeDatabaseTab === 'booked' 
                  ? 'Booked Jobs' 
                  : activeDatabaseTab === 'completed'
                    ? 'Completed Jobs'
                    : activeDatabaseTab === 'refer_back'
                      ? 'Refer Back to NPH'
                      : isFanCategory 
                        ? 'Fan Installations' 
                        : 'Jobs Database'}
              </h2>
              <p className="text-xs text-muted-foreground">
                {displayedJobs.length} of {activeDatabaseTab === 'booked' ? bookedJobsCount : activeDatabaseTab === 'completed' ? completedJobsCount : activeDatabaseTab === 'refer_back' ? referBackJobsCount : jobs.length} jobs
                {activeMonthFolder && (
                  <span className="ml-1">
                    • Showing {format(new Date(activeMonthFolder + '-01'), 'MMMM yyyy')}
                  </span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {/* Sort by booked date when in BOOKED tab */}
              {activeDatabaseTab === 'booked' && (
                <Select value={bookedSortOrder} onValueChange={(v) => setBookedSortOrder(v as BookedSortOrder)}>
                  <SelectTrigger className="w-40 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="newest">Newest Booked First</SelectItem>
                    <SelectItem value="oldest">Oldest Booked First</SelectItem>
                  </SelectContent>
                </Select>
              )}
              {/* Sort by completion date when in COMPLETED tab */}
              {activeDatabaseTab === 'completed' && (
                <>
                  <CompletedJobsPDFButton 
                    jobs={jobs} 
                    categoryName={categories.find(c => c.id === activeCategory)?.name || 'Damp & Mold'} 
                  />
                  <Select value={completedSortOrder} onValueChange={(v) => setCompletedSortOrder(v as CompletedSortOrder)}>
                    <SelectTrigger className="w-44 h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="newest">Newest Completed First</SelectItem>
                      <SelectItem value="oldest">Oldest Completed First</SelectItem>
                    </SelectContent>
                  </Select>
                </>
              )}
              {/* Refer Back PDF button */}
              {activeDatabaseTab === 'refer_back' && (
                <ReferBackPDFButton 
                  jobs={displayedJobs}
                  categoryName={categories.find(c => c.id === activeCategory)?.name || 'Jobs'}
                />
              )}
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
          
          <div className="flex-1 overflow-hidden flex">
            {/* Booked Date Sidebar - only show in booked tab */}
            {activeDatabaseTab === 'booked' && (
              <BookedDateSidebar
                jobs={jobs.filter(j => (!!j.bookedDate || tradeBookings.has(j.id)) && !j.isCompleted && j.progress !== 100)}
                selectedDate={selectedBookedDate}
                onDateSelect={setSelectedBookedDate}
                isFanCategory={isFanCategory}
                tradeBookings={tradeBookings}
              />
            )}
            
            <div className="flex-1 overflow-auto">
              {viewType === 'table' ? (
                <JobTable 
                  jobs={displayedJobs} 
                  onUpdateJob={canEdit ? handleUpdateJob : undefined}
                  onDeleteJob={canEdit ? handleDeleteJob : undefined}
                  onToggleComplete={canEdit ? handleToggleComplete : undefined}
                  onBatchUpdateTeam={canEdit ? handleBatchUpdateTeam : undefined}
                  onTransferJob={canEdit ? handleTransferJob : undefined}
                  onDuplicateToCategory={canEdit ? handleDuplicateToCategory : undefined}
                  onReferBack={canEdit ? handleReferBack : undefined}
                  fanCategoryId={categories.find(c => c.name.toLowerCase().includes('fan'))?.id}
                  onFanJobCreated={canEdit ? refreshJobs : undefined}
                  isFanCategory={isFanCategory}
                  currentCategoryId={activeCategory || undefined}
                  categories={categories.map(c => ({ id: c.id, name: c.name, color: c.color }))}
                  readOnly={!canEdit}
                  searchTerm={debouncedSearch}
                  getSignOffStatus={getSignOffStatus}
                />
              ) : viewType === 'kanban' ? (
                <KanbanBoard
                  jobs={displayedJobs}
                  groupBy={kanbanGroupBy}
                  onJobClick={setSelectedJobForModal}
                  onToggleComplete={handleToggleComplete}
                  onMoveJob={handleKanbanMoveJob}
                />
              ) : (
                <CalendarView
                  jobs={displayedJobs}
                  onJobClick={setSelectedJobForModal}
                  onToggleComplete={handleToggleComplete}
                />
              )}
            </div>
          </div>
        </section>
      </main>

      {showExport && (
        <ExportPanel jobs={jobs} onClose={() => setShowExport(false)} isFanCategory={isFanCategory} />
      )}

      {showBulkUpload && (
        <BulkImageUpload
          onJobsExtracted={handleBulkJobsExtracted}
          onClose={() => {
            setShowBulkUpload(false);
            setBulkUploadInitialFiles([]);
          }}
          initialFiles={bulkUploadInitialFiles}
        />
      )}

      <ManualJobEntry
        isOpen={showManualEntry}
        onOpenChange={setShowManualEntry}
        onJobCreate={async (newJob) => {
          // Check for duplicates before adding
          const existing = await findDuplicateJobAsync(newJob.jobNumber);
          if (existing) {
            setDuplicateCheck({
              newJob,
              existingJob: existing,
              pendingJobs: []
            });
            return existing; // Return existing to satisfy type, duplicate modal will handle it
          }
          
          const created = await addJob(newJob);
          toast({
            title: "Job Created Successfully",
            description: `Job #${newJob.jobNumber} has been added.`,
          });
          return created;
        }}
      />

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
