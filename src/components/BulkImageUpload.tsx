import { useCallback, useState, useEffect } from 'react';
import { Upload, Image, X, Loader2, Check, AlertCircle, FileText, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { Job } from '@/types/job';
import { extractImageWithAI, extractPDFWithAI } from '@/lib/api';
import { extractTextFromPDF } from '@/lib/pdfUtils';
import { useToast } from '@/hooks/use-toast';

type FileType = 'pdf' | 'image';

interface InitialFile {
  file: File;
  type: FileType;
}

interface BulkImageUploadProps {
  onJobsExtracted: (jobs: Omit<Job, 'id'>[]) => void;
  onClose: () => void;
  initialFiles?: InitialFile[];
}

interface FileStatus {
  file: File;
  status: 'pending' | 'processing' | 'success' | 'error';
  error?: string;
  jobData?: Partial<Job>;
  fileType: 'image' | 'pdf';
}

const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const ACCEPTED_PDF_TYPE = 'application/pdf';

export const BulkImageUpload = ({ onJobsExtracted, onClose, initialFiles }: BulkImageUploadProps) => {
  const [files, setFiles] = useState<FileStatus[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [rateLimitInfo, setRateLimitInfo] = useState<{ waitTime: number; isWaiting: boolean }>({ waitTime: 0, isWaiting: false });
  const { toast } = useToast();

  // Initialize with provided files
  useEffect(() => {
    if (initialFiles && initialFiles.length > 0) {
      const initialFileStatuses: FileStatus[] = initialFiles.map(f => ({
        file: f.file,
        status: 'pending' as const,
        fileType: f.type === 'pdf' ? 'pdf' as const : 'image' as const,
      }));
      setFiles(initialFileStatuses);
    }
  }, [initialFiles]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles) return;

    const validFiles: FileStatus[] = Array.from(selectedFiles)
      .filter(file => ACCEPTED_IMAGE_TYPES.includes(file.type) || file.type === ACCEPTED_PDF_TYPE)
      .map(file => ({ 
        file, 
        status: 'pending' as const,
        fileType: file.type === ACCEPTED_PDF_TYPE ? 'pdf' as const : 'image' as const
      }));

    if (validFiles.length < selectedFiles.length) {
      toast({
        title: "Some files skipped",
        description: "Only image files (JPG, PNG, WebP, GIF) and PDFs are supported.",
        variant: "destructive",
      });
    }

    setFiles(prev => [...prev, ...validFiles]);
  }, [toast]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const droppedFiles = e.dataTransfer.files;
    
    const validFiles: FileStatus[] = Array.from(droppedFiles)
      .filter(file => ACCEPTED_IMAGE_TYPES.includes(file.type) || file.type === ACCEPTED_PDF_TYPE)
      .map(file => ({ 
        file, 
        status: 'pending' as const,
        fileType: file.type === ACCEPTED_PDF_TYPE ? 'pdf' as const : 'image' as const
      }));

    setFiles(prev => [...prev, ...validFiles]);
  }, []);

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(',')[1]);
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  };

  // Process a single file with proper error handling
  const processSingleFile = async (fileStatus: FileStatus): Promise<{ jobData: Partial<Job> | null; error: string | null }> => {
    try {
      let extractedData: Partial<Job> | null = null;

      if (fileStatus.fileType === 'pdf') {
        console.log(`Processing PDF: ${fileStatus.file.name}`);
        const text = await extractTextFromPDF(fileStatus.file);
        if (!text || text.trim().length < 10) {
          return { jobData: null, error: 'PDF contains no readable text. Try uploading as an image.' };
        }
        extractedData = await extractPDFWithAI(text);
      } else {
        console.log(`Processing image: ${fileStatus.file.name}`);
        const base64 = await fileToBase64(fileStatus.file);
        extractedData = await extractImageWithAI(base64, fileStatus.file.type);
      }

      if (!extractedData) {
        return { jobData: null, error: 'No data could be extracted' };
      }

      return { jobData: extractedData, error: null };
    } catch (error: any) {
      console.error(`Error processing ${fileStatus.file.name}:`, error);
      
      const message = error instanceof Error ? error.message : 'Extraction failed';
      
      // Provide user-friendly error messages
      if (message.includes('Rate limit') || message.includes('429')) {
        return { jobData: null, error: 'Rate limited - please retry in a moment' };
      }
      if (message.includes('timed out')) {
        return { jobData: null, error: 'Processing timed out - file may be too large' };
      }
      if (message.includes('Unauthorized') || message.includes('401')) {
        return { jobData: null, error: 'Session expired - please refresh and log in again' };
      }
      if (message.includes('Forbidden') || message.includes('403')) {
        return { jobData: null, error: 'Admin access required' };
      }
      
      return { jobData: null, error: message };
    }
  };

  const processFiles = async (retryOnly = false) => {
    const filesToProcess = retryOnly 
      ? files.map((f, i) => ({ ...f, originalIndex: i })).filter(f => f.status === 'error')
      : files.map((f, i) => ({ ...f, originalIndex: i })).filter(f => f.status === 'pending' || f.status === 'error');
    
    if (filesToProcess.length === 0) return;

    setIsProcessing(true);
    setRateLimitInfo({ waitTime: 0, isWaiting: false });
    const extractedJobs: Omit<Job, 'id'>[] = [];
    
    // Reset statuses for files being processed
    setFiles(prev => prev.map((f, i) => {
      const isBeingProcessed = filesToProcess.some(fp => fp.originalIndex === i);
      return isBeingProcessed ? { ...f, status: 'pending' as const, error: undefined } : f;
    }));

    // Delay between files to prevent rate limiting
    const DELAY_BETWEEN_FILES = 3000;

    for (let i = 0; i < filesToProcess.length; i++) {
      const fileEntry = filesToProcess[i];
      const originalIndex = fileEntry.originalIndex;

      // Update status to processing
      setFiles(prev => prev.map((f, idx) => 
        idx === originalIndex ? { ...f, status: 'processing' as const } : f
      ));
      setProgress(Math.round((i / filesToProcess.length) * 100));

      const { jobData, error } = await processSingleFile(fileEntry);

      if (jobData && !error) {
        const newJob: Omit<Job, 'id'> = {
          jobNumber: jobData.jobNumber || `JOB-${Date.now().toString().slice(-6)}-${i}`,
          name: jobData.name || 'Unknown',
          address: jobData.address || '',
          phoneNumber: jobData.phoneNumber || '',
          summaryOfWorks: jobData.summaryOfWorks || '',
          description: jobData.description || '',
          workItems: (jobData.workItems || []).map((item: any) => ({
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
          bookedDate: jobData.bookedDate || null,
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
        };

        extractedJobs.push(newJob);
        setFiles(prev => prev.map((f, idx) => 
          idx === originalIndex ? { ...f, status: 'success' as const, jobData } : f
        ));
        console.log(`Successfully extracted job from ${fileEntry.file.name}`);
      } else {
        setFiles(prev => prev.map((f, idx) => 
          idx === originalIndex ? { ...f, status: 'error' as const, error: error || 'Unknown error' } : f
        ));
      }

      // Delay between API calls to prevent rate limiting
      if (i < filesToProcess.length - 1) {
        setRateLimitInfo({ waitTime: DELAY_BETWEEN_FILES / 1000, isWaiting: true });
        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_FILES));
        setRateLimitInfo({ waitTime: 0, isWaiting: false });
      }
    }

    setProgress(100);
    setIsProcessing(false);

    if (extractedJobs.length > 0) {
      onJobsExtracted(extractedJobs);
      toast({
        title: "Bulk extraction complete",
        description: `Successfully extracted ${extractedJobs.length} of ${filesToProcess.length} jobs.`,
      });
    } else {
      toast({
        title: "Extraction failed",
        description: "Could not extract any jobs from the uploaded files. Check errors for details.",
        variant: "destructive",
      });
    }
  };

  const successCount = files.filter(f => f.status === 'success').length;
  const errorCount = files.filter(f => f.status === 'error').length;
  const pendingCount = files.filter(f => f.status === 'pending').length;
  const hasRetryableFiles = errorCount > 0 && !isProcessing;
  const canProcess = (pendingCount > 0 || hasRetryableFiles) && !isProcessing;

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-muted/30">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Bulk Image Upload</h2>
            <p className="text-xs text-muted-foreground">Upload multiple job documents for batch processing</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-muted rounded-lg transition-colors"
            disabled={isProcessing}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 max-h-[calc(80vh-120px)] overflow-y-auto">
        {/* Drop Zone */}
          <div
            className={cn(
              "border-2 border-dashed rounded-xl p-6 transition-all duration-300 cursor-pointer text-center",
              "border-border hover:border-primary/50 hover:bg-muted/30",
              isProcessing && "pointer-events-none opacity-50"
            )}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => document.getElementById('bulk-file-input')?.click()}
          >
            <input
              id="bulk-file-input"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
              onChange={handleFileSelect}
              multiple
              className="hidden"
              disabled={isProcessing}
            />
            <Upload className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm font-medium">Drop images or PDFs here or click to browse</p>
            <p className="text-xs text-muted-foreground mt-1">
              Supports JPG, PNG, WebP, GIF, and PDF (up to 20 files)
            </p>
          </div>

          {/* Progress */}
          {isProcessing && (
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span>
                  {rateLimitInfo.isWaiting 
                    ? `Waiting ${rateLimitInfo.waitTime}s to avoid rate limits...` 
                    : 'Processing files...'}
                </span>
                <span>{progress}%</span>
              </div>
              <Progress value={progress} className={rateLimitInfo.isWaiting ? 'animate-pulse' : ''} />
              <p className="text-xs text-muted-foreground">
                Processing with 3s delay between files to avoid rate limits
              </p>
            </div>
          )}

          {/* File List */}
          {files.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{files.length} files selected</span>
                {!isProcessing && (
                  <Button variant="ghost" size="sm" onClick={() => setFiles([])}>
                    Clear all
                  </Button>
                )}
              </div>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {files.map((fileStatus, index) => (
                  <div
                    key={index}
                    className={cn(
                      "flex items-center gap-3 p-2 rounded-lg",
                      fileStatus.status === 'success' && "bg-success/10",
                      fileStatus.status === 'error' && "bg-destructive/10",
                      fileStatus.status === 'pending' && "bg-muted/30",
                      fileStatus.status === 'processing' && "bg-primary/10"
                    )}
                  >
                    <div className="w-8 h-8 rounded bg-muted flex items-center justify-center">
                      {fileStatus.status === 'processing' ? (
                        <Loader2 className="w-4 h-4 animate-spin text-primary" />
                      ) : fileStatus.status === 'success' ? (
                        <Check className="w-4 h-4 text-success" />
                      ) : fileStatus.status === 'error' ? (
                        <AlertCircle className="w-4 h-4 text-destructive" />
                      ) : fileStatus.fileType === 'pdf' ? (
                        <FileText className="w-4 h-4 text-muted-foreground" />
                      ) : (
                        <Image className="w-4 h-4 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{fileStatus.file.name}</p>
                      {fileStatus.error && (
                        <p className="text-xs text-destructive">{fileStatus.error}</p>
                      )}
                      {fileStatus.status === 'success' && fileStatus.jobData && (
                        <p className="text-xs text-success">
                          Job #{fileStatus.jobData.jobNumber}
                        </p>
                      )}
                    </div>
                    {!isProcessing && fileStatus.status === 'pending' && (
                      <button
                        onClick={() => removeFile(index)}
                        className="p-1 hover:bg-muted rounded"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Summary */}
          {(successCount > 0 || errorCount > 0) && (
            <div className="flex gap-4 text-sm">
              {successCount > 0 && (
                <span className="text-success">✓ {successCount} successful</span>
              )}
              {errorCount > 0 && (
                <span className="text-destructive">✗ {errorCount} failed</span>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border bg-muted/30">
          <Button variant="outline" onClick={onClose} disabled={isProcessing}>
            {successCount > 0 && !canProcess ? 'Done' : 'Cancel'}
          </Button>
          {hasRetryableFiles && (
            <Button
              variant="outline"
              onClick={() => processFiles(true)}
              disabled={isProcessing}
            >
              <RotateCcw className="w-4 h-4 mr-1" />
              Retry {errorCount} Failed
            </Button>
          )}
          <Button
            onClick={() => processFiles(false)}
            disabled={!canProcess}
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                Processing...
              </>
            ) : (
              <>Process {pendingCount > 0 ? pendingCount : errorCount} Files</>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};
