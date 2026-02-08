import { useState, useEffect, useCallback, useRef } from 'react';
import { Job, JobStatus, JOB_STATUS_OPTIONS, WorkItem } from '@/types/job';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ArrowLeft, MapPin, Phone, Calendar, Save, Camera, Upload, Loader2, CheckCircle2, Clock, FileText, ChevronDown, CheckSquare, AlertCircle, File, X, Image, Video, Square, CheckSquare2, Edit3, Check, Languages, AlertTriangle, Ban } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useOfflineStorage } from '@/hooks/useOfflineStorage';
import { useToast } from '@/hooks/use-toast';
import { useTeamAuth } from '@/hooks/useTeamAuth';
import { SignOffConfirmationModal } from './SignOffConfirmationModal';
import { useTranslation, SUPPORTED_LANGUAGES } from '@/hooks/useTranslation';
import { useBatchUpload } from '@/hooks/useBatchUpload';
import { AIWritingAssistant } from './AIWritingAssistant';

interface TeamJobDetailProps {
  job: Job;
  teamId: string;
  teamName: string;
  languagePreference: string;
  onBack: () => void;
  onJobUpdate: (job: Job) => void;
  isOnline: boolean;
}

export const TeamJobDetail = ({
  job,
  teamId,
  teamName,
  languagePreference,
  onBack,
  onJobUpdate,
  isOnline,
}: TeamJobDetailProps) => {
  // Translation hook
  const { translateToUserLanguage, translateToEnglish, isTranslating } = useTranslation(languagePreference);
  const [translatedDescription, setTranslatedDescription] = useState<string | null>(null);
  const [translatedSummary, setTranslatedSummary] = useState<string | null>(null);
  const [translatedWorkItems, setTranslatedWorkItems] = useState<Record<string, string>>({});
  const [showOriginal, setShowOriginal] = useState(false);
  const [isTranslatingContent, setIsTranslatingContent] = useState(false);
  const [progress, setProgress] = useState(job.progress);
  const [notes, setNotes] = useState(job.progressNotes || '');
  const [status, setStatus] = useState<JobStatus>(job.status);
  const [isOngoing, setIsOngoing] = useState(job.isOngoing || false);
  const [ongoingReason, setOngoingReason] = useState(job.ongoingReason || '');
  const [isSaving, setIsSaving] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [showSignOffModal, setShowSignOffModal] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [uploadingVideos, setUploadingVideos] = useState(false);
  
  // Batch upload progress tracking
  const [batchUploadProgress, setBatchUploadProgress] = useState(0);
  const [batchUploadStats, setBatchUploadStats] = useState({ completed: 0, total: 0 });
  
  // Use refs for file input to clear them after upload
  const photoInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [photoUploadProgress, setPhotoUploadProgress] = useState<Record<string, number>>({});
  const [videoUploadProgress, setVideoUploadProgress] = useState<Record<string, number>>({});
  const [fileUploadProgress, setFileUploadProgress] = useState<Record<string, number>>({});
  const [newVideos, setVideos] = useState<string[]>([]);
  const [newPhotos, setPhotos] = useState<string[]>([]);
  const [newDocuments, setDocuments] = useState<{ name: string; url: string; type: string }[]>([]);
  const [workItemUpdates, setWorkItemUpdates] = useState<Record<string, { isConfirmed?: boolean; hasModification?: boolean; variation?: string }>>({});
  const [expandedSections, setExpandedSections] = useState({
    details: false,
    workItems: false,
    status: false,
    photos: false,
    videos: false,
    documents: false,
  });

  // Extract existing saved attachments from job
  const existingPhotos = (job.attachments || []).filter(a => a.type === 'image').map(a => a.url);
  const existingVideos = (job.attachments || []).filter(a => a.type === 'video').map(a => a.url);
  const existingDocuments = (job.attachments || []).filter(a => a.type === 'document').map(a => ({
    name: a.name,
    url: a.url,
    type: 'application/octet-stream'
  }));

  // Combined arrays for display
  const allPhotos = [...existingPhotos, ...newPhotos];
  const allVideos = [...existingVideos, ...newVideos];
  const allDocuments = [...existingDocuments, ...newDocuments];
  
  const { addToSyncQueue, saveDraft, getDraft, clearDraft } = useOfflineStorage();
  const { toast } = useToast();
  const { updateTeamJob } = useTeamAuth();
  
  // Batch upload hooks for photos and videos with compression
  const [compressionSaved, setCompressionSaved] = useState<string | null>(null);
  
  const photoBatchUpload = useBatchUpload({
    teamId,
    jobId: job.id,
    maxConcurrent: 3,
    enableCompression: true,
    compressionQuality: 0.8,
    onProgress: (progress, completed, total) => {
      setBatchUploadProgress(progress);
      setBatchUploadStats({ completed, total });
    },
    onCompressionComplete: (savedBytes, savedPercent) => {
      if (savedBytes > 0) {
        const savedMB = (savedBytes / 1024 / 1024).toFixed(1);
        setCompressionSaved(`${savedMB}MB saved (${savedPercent.toFixed(0)}% smaller)`);
      }
    },
    onComplete: (urls) => {
      setPhotos(prev => [...prev, ...urls]);
      setUploadingPhotos(false);
      setBatchUploadProgress(0);
      setBatchUploadStats({ completed: 0, total: 0 });
      setHasUnsavedChanges(true);
      
      const savedMsg = compressionSaved ? ` - ${compressionSaved}` : '';
      toast({
        title: 'Photos Uploaded',
        description: `${urls.length} photo(s) uploaded successfully${savedMsg}`,
      });
      setCompressionSaved(null);
    },
    onError: (error) => {
      toast({
        title: 'Upload Error',
        description: error,
        variant: 'destructive',
      });
      setUploadingPhotos(false);
      setCompressionSaved(null);
    },
  });
  
  const videoBatchUpload = useBatchUpload({
    teamId,
    jobId: job.id,
    maxConcurrent: 2,
    enableCompression: false, // Don't compress videos
    onProgress: (progress, completed, total) => {
      setBatchUploadProgress(progress);
      setBatchUploadStats({ completed, total });
    },
    onComplete: (urls) => {
      setVideos(prev => [...prev, ...urls]);
      setUploadingVideos(false);
      setBatchUploadProgress(0);
      setBatchUploadStats({ completed: 0, total: 0 });
      setHasUnsavedChanges(true);
      toast({
        title: 'Videos Uploaded',
        description: `${urls.length} video(s) uploaded successfully.`,
      });
    },
    onError: (error) => {
      toast({
        title: 'Upload Error',
        description: error,
        variant: 'destructive',
      });
      setUploadingVideos(false);
    },
  });
  
  const fileBatchUpload = useBatchUpload({
    teamId,
    jobId: job.id,
    maxConcurrent: 3,
    onProgress: (progress, completed, total) => {
      setBatchUploadProgress(progress);
      setBatchUploadStats({ completed, total });
    },
    onComplete: (urls) => {
      // For documents, we need to track names too
      setUploadingFiles(false);
      setBatchUploadProgress(0);
      setBatchUploadStats({ completed: 0, total: 0 });
      setHasUnsavedChanges(true);
    },
    onError: (error) => {
      toast({
        title: 'Upload Error',
        description: error,
        variant: 'destructive',
      });
      setUploadingFiles(false);
    },
  });

  // Check if job is not already complete
  const canSignOff = status !== 'complete' && !job.isCompleted;

  // Auto-save draft
  const autoSaveDraft = useCallback(async () => {
    if (hasUnsavedChanges) {
      await saveDraft(job.id, teamName, {
        progress,
        notes,
        status,
        photos: newPhotos,
        videos: newVideos,
        documents: newDocuments,
      });
    }
  }, [hasUnsavedChanges, progress, notes, status, newPhotos, newVideos, newDocuments, job.id, teamName, saveDraft]);

  // Load draft on mount
  useEffect(() => {
    const loadDraft = async () => {
      const draft = await getDraft(job.id, teamName);
      if (draft) {
        setProgress(draft.data.progress ?? job.progress);
        setNotes(draft.data.notes ?? job.progressNotes ?? '');
        setStatus(draft.data.status ?? job.status);
        setPhotos(draft.data.photos ?? []);
        setVideos(draft.data.videos ?? []);
        setDocuments(draft.data.documents ?? []);
        setHasUnsavedChanges(true);
        toast({
          title: 'Draft Restored',
          description: 'Your unsaved changes have been restored.',
        });
      }
    };
    loadDraft();
  }, [job.id, teamName]);

  // Translate job description, summary, and work items when language is not English
  useEffect(() => {
    const translateJobContent = async () => {
      if (languagePreference === 'en') {
        setTranslatedDescription(null);
        setTranslatedSummary(null);
        setTranslatedWorkItems({});
        setIsTranslatingContent(false);
        return;
      }

      setIsTranslatingContent(true);

      try {
        // Translate description
        if (job.description) {
          const translated = await translateToUserLanguage(job.description);
          setTranslatedDescription(translated);
        }

        // Translate summary
        if (job.summaryOfWorks) {
          const translated = await translateToUserLanguage(job.summaryOfWorks);
          setTranslatedSummary(translated);
        }

        // Translate work items descriptions
        if (job.workItems && job.workItems.length > 0) {
          const translations: Record<string, string> = {};
          
          // Translate in batches to avoid rate limiting
          for (const item of job.workItems) {
            if (item.description) {
              const translated = await translateToUserLanguage(item.description);
              translations[item.id] = translated;
            }
          }
          
          setTranslatedWorkItems(translations);
        }
      } catch (error) {
        console.error('Translation error:', error);
      } finally {
        setIsTranslatingContent(false);
      }
    };

    translateJobContent();
  }, [job.id, job.description, job.summaryOfWorks, job.workItems, languagePreference, translateToUserLanguage]);

  // Auto-save every 30 seconds
  useEffect(() => {
    const interval = setInterval(autoSaveDraft, 30000);
    return () => clearInterval(interval);
  }, [autoSaveDraft]);

  // Track changes
  useEffect(() => {
    const changed = 
      progress !== job.progress ||
      notes !== (job.progressNotes || '') ||
      status !== job.status ||
      isOngoing !== (job.isOngoing || false) ||
      ongoingReason !== (job.ongoingReason || '') ||
      newPhotos.length > 0 ||
      newVideos.length > 0 ||
      newDocuments.length > 0 ||
      Object.keys(workItemUpdates).length > 0;
    setHasUnsavedChanges(changed);
  }, [progress, notes, status, isOngoing, ongoingReason, newPhotos, newVideos, newDocuments, workItemUpdates, job]);

  // Get work item with team updates applied
  const getWorkItemWithUpdates = (item: WorkItem) => {
    const updates = workItemUpdates[item.id];
    if (!updates) return item;
    return {
      ...item,
      isConfirmed: updates.isConfirmed ?? item.isConfirmed ?? true,
      hasModification: updates.hasModification ?? item.hasModification ?? false,
      variation: updates.variation ?? item.variation ?? '',
    };
  };

  // Update work item
  const updateWorkItem = (itemId: string, field: 'isConfirmed' | 'hasModification' | 'variation', value: boolean | string) => {
    setWorkItemUpdates(prev => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        [field]: value,
      },
    }));
  };

  const handleSave = async () => {
    setIsSaving(true);

    // Filter out base64 data - only include actual uploaded URLs from NEW uploads
    const uploadedPhotos = newPhotos.filter(p => !p.startsWith('data:'));
    const uploadedVideos = newVideos.filter(v => !v.startsWith('data:'));
    const uploadedDocs = newDocuments.filter(d => !d.url.startsWith('data:'));

    const updates = {
      status,
      progress,
      notes,
      isOngoing,
      ongoingReason: isOngoing ? ongoingReason : '', // Only save reason if ongoing
      photos: uploadedPhotos.length > 0 ? uploadedPhotos : undefined,
      videos: uploadedVideos.length > 0 ? uploadedVideos : undefined,
      documents: uploadedDocs.length > 0 ? uploadedDocs : undefined,
      workItemUpdates: Object.keys(workItemUpdates).length > 0 ? workItemUpdates : undefined,
    };

    try {
      if (isOnline && (uploadingPhotos || uploadingFiles || uploadingVideos)) {
        toast({
          title: 'Please wait',
          description: 'Your uploads are still processing. Save will be available once uploads finish.',
        });
        return;
      }

      if (isOnline) {
        // Use secure edge function - transfers data to main job record
        await updateTeamJob(job.id, updates);

        await clearDraft(job.id, teamName);
        
        // Build updated job with work item modifications applied
        const updatedWorkItems = job.workItems.map(item => {
          const update = workItemUpdates[item.id];
          if (update) {
            return {
              ...item,
              isConfirmed: update.isConfirmed ?? item.isConfirmed,
              hasModification: update.hasModification ?? item.hasModification,
              variation: update.variation ?? item.variation,
            };
          }
          return item;
        });
        
        onJobUpdate({
          ...job,
          progress,
          progressNotes: notes,
          status,
          isOngoing,
          ongoingReason: isOngoing ? ongoingReason : '',
          isCompleted: status === 'complete',
          completionDate: status === 'complete' ? new Date() : null,
          workItems: updatedWorkItems,
        });

        toast({
          title: 'Saved',
          description: 'Job updated and data synced to database.',
        });
      } else {
        // Queue for sync
        await addToSyncQueue({
          teamId,
          actionType: 'progress_update',
          payload: {
            jobId: job.id,
            ...updates,
          },
        });

        await clearDraft(job.id, teamName);

        onJobUpdate({
          ...job,
          progress,
          progressNotes: notes,
          status,
          isCompleted: status === 'complete',
        });

        toast({
          title: 'Saved Offline',
          description: 'Changes will sync when you\'re back online.',
        });
      }

      setHasUnsavedChanges(false);
      // Only clear photos/videos/documents that were successfully uploaded
      setPhotos(prev => prev.filter(p => p.startsWith('data:')));
      setVideos(prev => prev.filter(v => v.startsWith('data:')));
      setDocuments(prev => prev.filter(d => d.url.startsWith('data:')));
      setWorkItemUpdates({});
    } catch (error) {
      console.error('Save error:', error);
      toast({
        title: 'Save Failed',
        description: 'Failed to save changes. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Handle job completion/sign-off with full data transfer
  const handleCompleteJob = async () => {
    if (!canSignOff) return;
    
    setIsCompleting(true);

    try {
      // Build complete sign-off data package
      const signOffData = {
        status: 'complete' as const,
        progress: 100,
        notes: notes,
        photos: newPhotos.filter(p => !p.startsWith('data:')), // Only include uploaded URLs, not base64
        videos: newVideos.filter(v => !v.startsWith('data:')),
        documents: newDocuments.filter(d => !d.url.startsWith('data:')),
        workItemUpdates: Object.keys(workItemUpdates).length > 0 ? workItemUpdates : undefined,
        isCompletion: true, // Flag to indicate this is a sign-off
      };

      if (isOnline) {
        // Use secure edge function for completion - transfers ALL data
        await updateTeamJob(job.id, signOffData);

        await clearDraft(job.id, teamName);
        
        // Build updated job with all work item modifications applied
        const updatedWorkItems = job.workItems.map(item => {
          const update = workItemUpdates[item.id];
          if (update) {
            return {
              ...item,
              isConfirmed: update.isConfirmed ?? item.isConfirmed,
              hasModification: update.hasModification ?? item.hasModification,
              variation: update.variation ?? item.variation,
            };
          }
          return item;
        });
        
        onJobUpdate({
          ...job,
          progress: 100,
          progressNotes: notes,
          status: 'complete',
          isCompleted: true,
          completionDate: new Date(),
          workItems: updatedWorkItems,
        });

        toast({
          title: '✓ Job Signed Off!',
          description: 'All job data, photos, videos, documents, and work item updates have been transferred to the database.',
        });
      } else {
        // Queue for sync when offline - include ALL data
        await addToSyncQueue({
          teamId,
          actionType: 'job_complete',
          payload: {
            id: job.id,
            ...signOffData,
          },
        });

        await clearDraft(job.id, teamName);

        onJobUpdate({
          ...job,
          progress: 100,
          progressNotes: notes,
          status: 'complete',
          isCompleted: true,
        });

        toast({
          title: 'Sign-Off Queued',
          description: 'Job completion and all data will sync when you\'re back online.',
        });
      }

      // Clear all local state after successful sign-off
      setPhotos([]);
      setVideos([]);
      setDocuments([]);
      setWorkItemUpdates({});
      setHasUnsavedChanges(false);
    } catch (error) {
      console.error('Sign-off error:', error);
      toast({
        title: 'Sign-Off Failed',
        description: 'Failed to complete job. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsCompleting(false);
    }
  };

  // Optimized batch photo upload - handles 60+ photos without freezing
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files);
    
    if (!isOnline) {
      // Offline mode - show message, don't try to upload
      toast({
        title: 'Offline Mode',
        description: 'Photos will be uploaded when you\'re back online. Please save to queue.',
        variant: 'destructive',
      });
      e.target.value = '';
      return;
    }

    setUploadingPhotos(true);
    
    toast({
      title: 'Uploading Photos',
      description: `Processing ${fileArray.length} photo(s)...`,
    });

    try {
      await photoBatchUpload.processUploads(fileArray, 'photos');
    } catch (error) {
      console.error('Batch upload error:', error);
      toast({
        title: 'Upload Failed',
        description: 'Some photos failed to upload. Please try again.',
        variant: 'destructive',
      });
      setUploadingPhotos(false);
    } finally {
      // Reset input to allow re-selecting same files
      e.target.value = '';
    }
  };

  // Optimized batch file/document upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files);
    
    if (!isOnline) {
      toast({
        title: 'Offline Mode',
        description: 'Files will be uploaded when you\'re back online.',
        variant: 'destructive',
      });
      e.target.value = '';
      return;
    }

    setUploadingFiles(true);
    
    toast({
      title: 'Uploading Files',
      description: `Processing ${fileArray.length} file(s)...`,
    });

    try {
      // For documents, we need to track file names
      const uploadPromises = fileArray.map(async (file) => {
        const timestamp = Date.now();
        const randomId = Math.random().toString(36).substring(2, 8);
        const fileName = `${teamId}/${job.id}/docs/${timestamp}-${randomId}-${file.name}`;

        const { data, error } = await supabase.storage
          .from('job-attachments')
          .upload(fileName, file);

        if (error) throw error;

        const { data: urlData } = supabase.storage
          .from('job-attachments')
          .getPublicUrl(data.path);

        return {
          name: file.name,
          url: urlData.publicUrl,
          type: file.type,
        };
      });

      // Process in smaller batches to avoid overwhelming mobile
      const batchSize = 3;
      const results: { name: string; url: string; type: string }[] = [];
      
      for (let i = 0; i < uploadPromises.length; i += batchSize) {
        const batch = uploadPromises.slice(i, i + batchSize);
        const batchResults = await Promise.all(batch);
        results.push(...batchResults);
        
        // Update progress
        const progress = Math.round(((i + batch.length) / uploadPromises.length) * 100);
        setBatchUploadProgress(progress);
        setBatchUploadStats({ completed: i + batch.length, total: uploadPromises.length });
      }

      setDocuments(prev => [...prev, ...results]);
      setHasUnsavedChanges(true);
      
      toast({
        title: 'Files Uploaded',
        description: `${results.length} file(s) uploaded successfully.`,
      });
    } catch (error) {
      console.error('File upload error:', error);
      toast({
        title: 'Upload Failed',
        description: 'Failed to upload files.',
        variant: 'destructive',
      });
    } finally {
      setUploadingFiles(false);
      setBatchUploadProgress(0);
      setBatchUploadStats({ completed: 0, total: 0 });
      e.target.value = '';
    }
  };

  const removeDocument = (index: number) => {
    setDocuments(prev => prev.filter((_, i) => i !== index));
    setHasUnsavedChanges(true);
  };

  const removePhoto = (index: number) => {
    setPhotos(prev => prev.filter((_, i) => i !== index));
    setHasUnsavedChanges(true);
  };

  const removeVideo = (index: number) => {
    setVideos(prev => prev.filter((_, i) => i !== index));
    setHasUnsavedChanges(true);
  };

  // Optimized batch video upload
  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files);
    
    if (!isOnline) {
      toast({
        title: 'Offline Mode',
        description: 'Videos will be uploaded when you\'re back online.',
        variant: 'destructive',
      });
      e.target.value = '';
      return;
    }

    setUploadingVideos(true);
    
    toast({
      title: 'Uploading Videos',
      description: `Processing ${fileArray.length} video(s)...`,
    });

    try {
      await videoBatchUpload.processUploads(fileArray, 'videos');
    } catch (error) {
      console.error('Video upload error:', error);
      toast({
        title: 'Upload Failed',
        description: 'Some videos failed to upload. Please try again.',
        variant: 'destructive',
      });
      setUploadingVideos(false);
    } finally {
      e.target.value = '';
    }
  };


  const getFileIcon = (type: string) => {
    if (type.startsWith('image/')) return <Image className="h-4 w-4" />;
    return <File className="h-4 w-4" />;
  };

  const getStatusColor = (s: string) => {
    const option = JOB_STATUS_OPTIONS.find(o => o.value === s);
    return option?.color || '#6B7280';
  };

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  return (
    <div className="pb-32 min-h-screen">
      {/* Header - Mobile optimized */}
      <div className="bg-primary text-primary-foreground sticky top-0 z-10 shadow-md safe-area-top">
        <div className="px-3 sm:px-4 py-3">
          <div className="flex items-center gap-2 sm:gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={onBack}
              className="text-primary-foreground hover:bg-primary-foreground/20 h-9 w-9"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                <Badge variant="secondary" className="text-xs font-mono">
                  {job.jobNumber}
                </Badge>
                {languagePreference !== 'en' && (
                  <Badge variant="secondary" className="text-xs flex items-center gap-1">
                    <Languages className="h-3 w-3" />
                    {SUPPORTED_LANGUAGES.find(l => l.code === languagePreference)?.flag || languagePreference.toUpperCase()}
                  </Badge>
                )}
                {isTranslatingContent && (
                  <Loader2 className="h-3 w-3 animate-spin text-primary-foreground/70" />
                )}
              </div>
              <h1 className="text-base sm:text-lg font-semibold truncate">{job.name}</h1>
            </div>
          </div>
        </div>
      </div>

      {/* Content - Mobile optimized */}
      <div className="p-3 sm:p-4 space-y-3 sm:space-y-4">
        {/* Job Info Card - Collapsible */}
        <Collapsible open={expandedSections.details}>
          <Card>
            <CollapsibleTrigger asChild>
              <CardHeader 
                className="pb-2 cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => toggleSection('details')}
              >
                <CardTitle className="text-sm sm:text-base flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Job Details
                  </span>
                  <ChevronDown className={`h-4 w-4 transition-transform ${expandedSections.details ? 'rotate-180' : ''}`} />
                </CardTitle>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="space-y-3 pt-0">
                {job.address && (
                  <a 
                    href={`https://maps.google.com/?q=${encodeURIComponent(job.address)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-start gap-2 text-xs sm:text-sm text-primary hover:underline"
                  >
                    <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <span>{job.address}</span>
                  </a>
                )}
                
                {job.phoneNumber && (
                  <a 
                    href={`tel:${job.phoneNumber}`}
                    className="flex items-center gap-2 text-xs sm:text-sm text-primary hover:underline"
                  >
                    <Phone className="h-4 w-4" />
                    <span>{job.phoneNumber}</span>
                  </a>
                )}

                {job.bookedDate && (
                  <div className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    <span>Booked: {format(new Date(job.bookedDate), 'EEE, MMM d, yyyy')}</span>
                  </div>
                )}

{job.summaryOfWorks && (
                  <div className="pt-2 border-t">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs text-muted-foreground">Summary</p>
                      {languagePreference !== 'en' && (
                        <div className="flex items-center gap-1">
                          {isTranslatingContent && (
                            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-5 px-1 text-xs"
                            onClick={() => setShowOriginal(!showOriginal)}
                          >
                            <Languages className="h-3 w-3 mr-1" />
                            {showOriginal ? 'Translated' : 'Original'}
                          </Button>
                        </div>
                      )}
                    </div>
                    <p className="text-xs sm:text-sm">
                      {showOriginal || !translatedSummary ? job.summaryOfWorks : translatedSummary}
                    </p>
                  </div>
                )}

                {/* Full Job Description from database */}
                {job.description && (
                  <div className="pt-2 border-t">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs text-muted-foreground font-medium">Job Description</p>
                      {languagePreference !== 'en' && (
                        <div className="flex items-center gap-1">
                          {isTranslatingContent && (
                            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                          )}
                        </div>
                      )}
                    </div>
                    <div className="bg-muted/30 p-2 rounded text-xs sm:text-sm whitespace-pre-wrap max-h-48 overflow-y-auto">
                      {showOriginal || !translatedDescription ? job.description : translatedDescription}
                    </div>
                  </div>
                )}
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        {/* Work Items - Collapsible */}
        {job.workItems && job.workItems.length > 0 && (
          <Collapsible open={expandedSections.workItems}>
            <Card>
              <CollapsibleTrigger asChild>
                <CardHeader 
                  className="pb-2 cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => toggleSection('workItems')}
                >
                  <CardTitle className="text-sm sm:text-base flex items-center justify-between">
                    <span>Work Items ({job.workItems.length})</span>
                    <ChevronDown className={`h-4 w-4 transition-transform ${expandedSections.workItems ? 'rotate-180' : ''}`} />
                  </CardTitle>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="pt-0">
                  <div className="space-y-3">
                    {isTranslatingContent && languagePreference !== 'en' && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground p-2 bg-muted/30 rounded">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        <span>Translating work items...</span>
                      </div>
                    )}
                    {job.workItems.map((item: WorkItem, index: number) => {
                      const updatedItem = getWorkItemWithUpdates(item);
                      const isConfirmed = updatedItem.isConfirmed ?? true;
                      const hasModification = updatedItem.hasModification ?? false;
                      
                      // Get translated description if available
                      const displayDescription = showOriginal || !translatedWorkItems[item.id]
                        ? item.description
                        : translatedWorkItems[item.id];
                      
                      return (
                        <div key={item.id || index} className={`p-3 rounded-lg border ${!isConfirmed ? 'bg-muted/30 border-dashed opacity-60' : 'bg-muted/50'}`}>
                          <div className="flex items-start gap-3">
                            {/* Confirmed checkbox */}
                            <div className="flex flex-col items-center gap-1 pt-0.5">
                              <Checkbox
                                checked={isConfirmed}
                                onCheckedChange={(checked) => updateWorkItem(item.id, 'isConfirmed', !!checked)}
                                className="h-5 w-5"
                              />
                              <span className="text-[10px] text-muted-foreground">Done</span>
                            </div>
                            
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm ${!isConfirmed ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                                {displayDescription}
                              </p>
                              {item.sorCode && (
                                <p className="text-xs text-muted-foreground font-mono mt-0.5">
                                  SOR: {item.sorCode} × {item.qty}
                                </p>
                              )}
                              
                              {/* Modification checkbox */}
                              <div className="flex items-center gap-2 mt-2">
                                <Checkbox
                                  checked={hasModification}
                                  onCheckedChange={(checked) => updateWorkItem(item.id, 'hasModification', !!checked)}
                                  id={`mod-${item.id}`}
                                  className="h-4 w-4"
                                />
                                <label htmlFor={`mod-${item.id}`} className="text-xs text-muted-foreground flex items-center gap-1 cursor-pointer">
                                  <Edit3 className="h-3 w-3" />
                                  Modification/Variation
                                </label>
                              </div>
                              
                              {/* Variation field */}
                              {hasModification && (
                                <div className="mt-2">
                                  <Input
                                    placeholder="Describe the modification or variation..."
                                    value={updatedItem.variation || ''}
                                    onChange={(e) => updateWorkItem(item.id, 'variation', e.target.value)}
                                    className="text-sm h-9"
                                  />
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        )}

        {/* Status Update - Collapsible */}
        <Collapsible open={expandedSections.status}>
          <Card>
            <CollapsibleTrigger asChild>
              <CardHeader 
                className="pb-2 cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => toggleSection('status')}
              >
                <CardTitle className="text-sm sm:text-base flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Update Status
                  </span>
                  <ChevronDown className={`h-4 w-4 transition-transform ${expandedSections.status ? 'rotate-180' : ''}`} />
                </CardTitle>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="space-y-4 pt-0">
                <div>
                  <label className="text-xs sm:text-sm text-muted-foreground mb-2 block">Status</label>
                  <Select value={status} onValueChange={(v) => setStatus(v as JobStatus)}>
                    <SelectTrigger className="h-10">
                      <SelectValue>
                        <div className="flex items-center gap-2">
                          <div 
                            className="w-3 h-3 rounded-full" 
                            style={{ backgroundColor: getStatusColor(status) }}
                          />
                          <span className="text-sm">{JOB_STATUS_OPTIONS.find(o => o.value === status)?.label}</span>
                        </div>
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {JOB_STATUS_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          <div className="flex items-center gap-2">
                            <div 
                              className="w-3 h-3 rounded-full" 
                              style={{ backgroundColor: option.color }}
                            />
                            {option.label}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Ongoing/Unfinished Job Toggle */}
                <div className={cn(
                  "p-3 rounded-lg border transition-all",
                  isOngoing 
                    ? "bg-amber-100 dark:bg-amber-900/40 border-amber-300 dark:border-amber-700"
                    : "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800"
                )}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className={cn(
                        "h-4 w-4",
                        isOngoing ? "text-amber-600 animate-pulse" : "text-amber-600"
                      )} />
                      <div>
                        <label className="text-xs sm:text-sm font-medium text-amber-800 dark:text-amber-200">Mark as Ongoing Job</label>
                        <p className="text-[10px] sm:text-xs text-amber-600 dark:text-amber-400">Track unfinished work that needs follow-up</p>
                      </div>
                    </div>
                    <Checkbox
                      checked={isOngoing}
                      onCheckedChange={(checked) => setIsOngoing(!!checked)}
                      className="h-5 w-5 border-amber-400 data-[state=checked]:bg-amber-500 data-[state=checked]:border-amber-500"
                    />
                  </div>
                  
                  {/* WHY JOB IS ONGOING - shown when toggle is on */}
                  {isOngoing && (
                    <div className="mt-3 pt-3 border-t border-amber-300 dark:border-amber-700">
                      <label className="text-xs font-bold text-amber-800 dark:text-amber-200 mb-1.5 block uppercase tracking-wide">
                        Why Job Is Ongoing
                      </label>
                      <Textarea
                        value={ongoingReason}
                        onChange={(e) => setOngoingReason(e.target.value)}
                        placeholder="Explain why this job is marked as ongoing..."
                        rows={2}
                        className="text-xs bg-white dark:bg-amber-900/30 border-amber-300 dark:border-amber-700 placeholder:text-amber-400"
                      />
                    </div>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs sm:text-sm text-muted-foreground">Progress</label>
                    <span className="text-sm font-medium">{progress}%</span>
                  </div>
                  <Slider
                    value={[progress]}
                    onValueChange={([v]) => setProgress(v)}
                    max={100}
                    step={5}
                    className="py-2"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs sm:text-sm text-muted-foreground">Notes</label>
                    <AIWritingAssistant
                      currentText={notes}
                      onAccept={(enhancedText) => setNotes(enhancedText)}
                      userLanguage={languagePreference}
                      jobContext={job.summaryOfWorks || job.name}
                      placeholder="Write your notes here in any language. The AI will help create a clear, professional English version..."
                    />
                  </div>
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Add progress notes, issues, or updates... Use AI Assist button above for help writing in any language"
                    rows={3}
                    className="text-sm"
                  />
                </div>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        {/* Photo Upload - Collapsible */}
        <Collapsible open={expandedSections.photos}>
          <Card>
            <CollapsibleTrigger asChild>
              <CardHeader 
                className="pb-2 cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => toggleSection('photos')}
              >
                <CardTitle className="text-sm sm:text-base flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Camera className="h-4 w-4" />
                    Photos {allPhotos.length > 0 && `(${allPhotos.length})`}
                  </span>
                  <ChevronDown className={`h-4 w-4 transition-transform ${expandedSections.photos ? 'rotate-180' : ''}`} />
                </CardTitle>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="pt-0">
                <div className="space-y-3">
                  {/* Batch upload progress indicator with compression status and cancel button */}
                  {uploadingPhotos && batchUploadStats.total > 0 && (
                    <div className="bg-primary/10 rounded-lg p-3 space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium text-primary">
                          {photoBatchUpload.isCancelled
                            ? 'Cancelling upload...'
                            : photoBatchUpload.isCompressing 
                              ? `Compressing ${batchUploadStats.total} photos...`
                              : `Uploading ${batchUploadStats.completed} of ${batchUploadStats.total} photos`
                          }
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-primary font-medium">{batchUploadProgress}%</span>
                          <Button
                            size="sm"
                            variant="destructive"
                            className="h-6 px-2 text-xs"
                            onClick={() => {
                              photoBatchUpload.cancelUploads();
                              setUploadingPhotos(false);
                            }}
                            disabled={photoBatchUpload.isCancelled}
                          >
                            <Ban className="w-3 h-3 mr-1" />
                            Cancel
                          </Button>
                        </div>
                      </div>
                      <Progress value={batchUploadProgress} className="h-2" />
                      {compressionSaved && (
                        <p className="text-xs text-success font-medium">
                          ✓ {compressionSaved}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {photoBatchUpload.isCancelled
                          ? 'Upload cancelled. Already uploaded photos will be kept.'
                          : photoBatchUpload.isCompressing 
                            ? 'Optimizing images to reduce upload size...'
                            : 'Please wait while photos are being uploaded...'
                        }
                      </p>
                    </div>
                  )}
                  
                  <div className="flex gap-2">
                    {/* Camera capture button */}
                    <label className="flex-1 flex flex-col items-center justify-center h-20 border-2 border-dashed rounded-lg cursor-pointer bg-muted/50 hover:bg-muted transition-colors">
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={handlePhotoUpload}
                        disabled={uploadingPhotos}
                      />
                      {uploadingPhotos ? (
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      ) : (
                        <>
                          <Camera className="h-5 w-5 text-muted-foreground mb-1" />
                          <span className="text-xs text-muted-foreground">
                            Take Photo
                          </span>
                        </>
                      )}
                    </label>
                    
                    {/* Gallery upload button - supports 60+ photos */}
                    <label className="flex-1 flex flex-col items-center justify-center h-20 border-2 border-dashed rounded-lg cursor-pointer bg-muted/50 hover:bg-muted transition-colors">
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={handlePhotoUpload}
                        disabled={uploadingPhotos}
                      />
                      {uploadingPhotos ? (
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      ) : (
                        <>
                          <Image className="h-5 w-5 text-muted-foreground mb-1" />
                          <span className="text-xs text-muted-foreground">
                            Gallery
                          </span>
                        </>
                      )}
                    </label>
                  </div>

                  {/* Show batch upload thumbnails during upload */}
                  {photoBatchUpload.items.length > 0 && (
                    <div className="grid grid-cols-4 gap-2 mb-2">
                      {photoBatchUpload.items.map((item) => (
                        <div key={item.id} className="relative aspect-square rounded-lg overflow-hidden bg-muted">
                          {item.thumbnailUrl && (
                            <img
                              src={item.thumbnailUrl}
                              alt="Uploading"
                              className={`w-full h-full object-cover ${item.status === 'uploading' ? 'opacity-60' : ''}`}
                            />
                          )}
                          {item.status === 'uploading' && (
                            <div className="absolute inset-0 bg-background/70 flex flex-col items-center justify-center p-2">
                              <Loader2 className="h-4 w-4 animate-spin text-primary mb-1" />
                              <Progress value={item.progress} className="w-full h-1.5" />
                              <span className="text-[10px] text-muted-foreground mt-1">{item.progress}%</span>
                            </div>
                          )}
                          {item.status === 'complete' && (
                            <div className="absolute inset-0 bg-success/20 flex items-center justify-center">
                              <Check className="h-6 w-6 text-success" />
                            </div>
                          )}
                          {item.status === 'error' && (
                            <div className="absolute inset-0 bg-destructive/20 flex items-center justify-center">
                              <AlertCircle className="h-6 w-6 text-destructive" />
                            </div>
                          )}
                          {item.status === 'pending' && (
                            <div className="absolute inset-0 bg-muted/50 flex items-center justify-center">
                              <Clock className="h-4 w-4 text-muted-foreground" />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {allPhotos.length > 0 && (
                    <div className="grid grid-cols-4 gap-2">
                      {allPhotos.map((photo, index) => {
                        const isExisting = index < existingPhotos.length;
                        const newIndex = index - existingPhotos.length;
                        
                        return (
                          <div key={index} className="relative aspect-square rounded-lg overflow-hidden bg-muted group">
                            <img
                              src={photo}
                              alt={`${isExisting ? 'Saved' : 'New'} photo ${index + 1}`}
                              className="w-full h-full object-cover"
                            />
                            {isExisting && (
                              <div className="absolute bottom-0 left-0 right-0 bg-success/80 text-success-foreground text-[10px] text-center py-0.5">
                                Saved
                              </div>
                            )}
                            {!isExisting && (
                              <button
                                type="button"
                                onClick={() => removePhoto(newIndex)}
                                className="absolute top-1 right-1 p-1 bg-destructive rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <X className="h-3 w-3 text-destructive-foreground" />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        {/* Video Upload - Collapsible */}
        <Collapsible open={expandedSections.videos}>
          <Card>
            <CollapsibleTrigger asChild>
              <CardHeader 
                className="pb-2 cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => toggleSection('videos')}
              >
                <CardTitle className="text-sm sm:text-base flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Video className="h-4 w-4" />
                    Videos {allVideos.length > 0 && `(${allVideos.length})`}
                  </span>
                  <ChevronDown className={`h-4 w-4 transition-transform ${expandedSections.videos ? 'rotate-180' : ''}`} />
                </CardTitle>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="pt-0">
                <div className="space-y-3">
                  {/* Batch upload progress indicator for videos with cancel button */}
                  {uploadingVideos && batchUploadStats.total > 0 && (
                    <div className="bg-primary/10 rounded-lg p-3 space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium text-primary">
                          {videoBatchUpload.isCancelled
                            ? 'Cancelling upload...'
                            : `Uploading ${batchUploadStats.completed} of ${batchUploadStats.total} videos`
                          }
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-primary font-medium">{batchUploadProgress}%</span>
                          <Button
                            size="sm"
                            variant="destructive"
                            className="h-6 px-2 text-xs"
                            onClick={() => {
                              videoBatchUpload.cancelUploads();
                              setUploadingVideos(false);
                            }}
                            disabled={videoBatchUpload.isCancelled}
                          >
                            <Ban className="w-3 h-3 mr-1" />
                            Cancel
                          </Button>
                        </div>
                      </div>
                      <Progress value={batchUploadProgress} className="h-2" />
                      <p className="text-xs text-muted-foreground">
                        {videoBatchUpload.isCancelled
                          ? 'Upload cancelled. Already uploaded videos will be kept.'
                          : 'Please wait while videos are being uploaded...'
                        }
                      </p>
                    </div>
                  )}
                  
                  <div className="flex gap-2">
                    {/* Record video button */}
                    <label className="flex-1 flex flex-col items-center justify-center h-20 border-2 border-dashed rounded-lg cursor-pointer bg-muted/50 hover:bg-muted transition-colors">
                      <input
                        type="file"
                        accept="video/*"
                        capture="environment"
                        className="hidden"
                        onChange={handleVideoUpload}
                        disabled={uploadingVideos}
                      />
                      {uploadingVideos ? (
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      ) : (
                        <>
                          <Video className="h-5 w-5 text-muted-foreground mb-1" />
                          <span className="text-xs text-muted-foreground">
                            Record Video
                          </span>
                        </>
                      )}
                    </label>
                    
                    {/* Upload video button */}
                    <label className="flex-1 flex flex-col items-center justify-center h-20 border-2 border-dashed rounded-lg cursor-pointer bg-muted/50 hover:bg-muted transition-colors">
                      <input
                        type="file"
                        accept="video/*"
                        multiple
                        className="hidden"
                        onChange={handleVideoUpload}
                        disabled={uploadingVideos}
                      />
                      {uploadingVideos ? (
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      ) : (
                        <>
                          <Upload className="h-5 w-5 text-muted-foreground mb-1" />
                          <span className="text-xs text-muted-foreground">
                            Upload Video
                          </span>
                        </>
                      )}
                    </label>
                  </div>

                  {/* Show batch upload items during upload */}
                  {videoBatchUpload.items.length > 0 && (
                    <div className="grid grid-cols-2 gap-2 mb-2">
                      {videoBatchUpload.items.map((item) => (
                        <div key={item.id} className="relative aspect-video rounded-lg overflow-hidden bg-muted flex items-center justify-center">
                          <Video className="h-8 w-8 text-muted-foreground" />
                          {item.status === 'uploading' && (
                            <div className="absolute inset-0 bg-background/70 flex flex-col items-center justify-center p-3">
                              <Loader2 className="h-5 w-5 animate-spin text-primary mb-2" />
                              <Progress value={item.progress} className="w-full h-2" />
                              <span className="text-xs text-muted-foreground mt-1">{item.progress}%</span>
                            </div>
                          )}
                          {item.status === 'complete' && (
                            <div className="absolute inset-0 bg-success/20 flex items-center justify-center">
                              <Check className="h-8 w-8 text-success" />
                            </div>
                          )}
                          {item.status === 'error' && (
                            <div className="absolute inset-0 bg-destructive/20 flex items-center justify-center">
                              <AlertCircle className="h-8 w-8 text-destructive" />
                            </div>
                          )}
                          {item.status === 'pending' && (
                            <div className="absolute inset-0 bg-muted/50 flex items-center justify-center">
                              <Clock className="h-5 w-5 text-muted-foreground" />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {allVideos.length > 0 && (
                    <div className="grid grid-cols-2 gap-2">
                      {allVideos.map((video, index) => {
                        const isExisting = index < existingVideos.length;
                        const newIndex = index - existingVideos.length;
                        
                        return (
                          <div key={index} className="relative aspect-video rounded-lg overflow-hidden bg-muted group">
                            <video
                              src={video}
                              className="w-full h-full object-cover"
                              controls
                            />
                            {isExisting && (
                              <div className="absolute bottom-0 left-0 right-0 bg-success/80 text-success-foreground text-[10px] text-center py-0.5">
                                Saved
                              </div>
                            )}
                            {!isExisting && (
                              <button
                                type="button"
                                onClick={() => removeVideo(newIndex)}
                                className="absolute top-1 right-1 p-1 bg-destructive rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <X className="h-3 w-3 text-destructive-foreground" />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        {/* Document Upload - Collapsible */}
        <Collapsible open={expandedSections.documents}>
          <Card>
            <CollapsibleTrigger asChild>
              <CardHeader 
                className="pb-2 cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => toggleSection('documents')}
              >
                <CardTitle className="text-sm sm:text-base flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Documents {allDocuments.length > 0 && `(${allDocuments.length})`}
                  </span>
                  <ChevronDown className={`h-4 w-4 transition-transform ${expandedSections.documents ? 'rotate-180' : ''}`} />
                </CardTitle>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="pt-0">
                <div className="space-y-3">
                  <label className="flex flex-col items-center justify-center w-full h-20 border-2 border-dashed rounded-lg cursor-pointer bg-muted/50 hover:bg-muted transition-colors">
                    <input
                      type="file"
                      accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.jpg,.jpeg,.png,.gif"
                      multiple
                      className="hidden"
                      onChange={handleFileUpload}
                      disabled={uploadingFiles}
                    />
                    {uploadingFiles ? (
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    ) : (
                      <>
                        <Upload className="h-5 w-5 text-muted-foreground mb-1" />
                        <span className="text-xs text-muted-foreground text-center px-2">
                          Upload PDF, Word, Excel or other files
                        </span>
                      </>
                    )}
                  </label>

                  {allDocuments.length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {allDocuments.map((doc, index) => {
                        const isExisting = index < existingDocuments.length;
                        const newIndex = index - existingDocuments.length;
                        const isPdf = doc.type?.includes('pdf') || doc.name?.toLowerCase().endsWith('.pdf');
                        const isWord = doc.type?.includes('word') || doc.name?.toLowerCase().match(/\.(doc|docx)$/);
                        const isExcel = doc.type?.includes('excel') || doc.type?.includes('spreadsheet') || doc.name?.toLowerCase().match(/\.(xls|xlsx)$/);
                        const isImage = doc.type?.startsWith('image/') || doc.name?.toLowerCase().match(/\.(jpg|jpeg|png|gif|webp)$/);
                        
                        const uploadProgress = fileUploadProgress[doc.url];
                        const isUploading = uploadProgress !== undefined && uploadProgress < 100;
                        const isComplete = uploadProgress === 100;
                        
                        return (
                          <div key={index} className="relative group">
                            <a 
                              href={!isUploading ? doc.url : undefined} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className={`block p-3 bg-muted/50 rounded-lg border border-border hover:border-primary/50 hover:bg-muted transition-all ${isUploading ? 'pointer-events-none' : ''}`}
                            >
                              {/* Thumbnail preview */}
                              <div className={`flex items-center justify-center h-16 mb-2 rounded bg-background/50 ${isUploading ? 'opacity-60' : ''}`}>
                                {isImage && !doc.url.startsWith('data:') ? (
                                  <img 
                                    src={doc.url} 
                                    alt={doc.name} 
                                    className="h-full w-full object-contain rounded"
                                  />
                                ) : isPdf ? (
                                  <div className="flex flex-col items-center">
                                    <FileText className="h-8 w-8 text-red-500" />
                                    <span className="text-[10px] text-red-500 font-medium mt-1">PDF</span>
                                  </div>
                                ) : isWord ? (
                                  <div className="flex flex-col items-center">
                                    <FileText className="h-8 w-8 text-blue-500" />
                                    <span className="text-[10px] text-blue-500 font-medium mt-1">WORD</span>
                                  </div>
                                ) : isExcel ? (
                                  <div className="flex flex-col items-center">
                                    <FileText className="h-8 w-8 text-green-500" />
                                    <span className="text-[10px] text-green-500 font-medium mt-1">EXCEL</span>
                                  </div>
                                ) : (
                                  <div className="flex flex-col items-center">
                                    <File className="h-8 w-8 text-muted-foreground" />
                                    <span className="text-[10px] text-muted-foreground font-medium mt-1">FILE</span>
                                  </div>
                                )}
                              </div>
                              
                              {/* Upload progress */}
                              {isUploading && (
                                <div className="absolute inset-0 bg-background/80 rounded-lg flex flex-col items-center justify-center p-3">
                                  <Loader2 className="h-5 w-5 animate-spin text-primary mb-2" />
                                  <Progress value={uploadProgress} className="w-full h-2" />
                                  <span className="text-xs text-muted-foreground mt-1">{uploadProgress}%</span>
                                </div>
                              )}
                              
                              {/* Complete checkmark overlay */}
                              {isComplete && (
                                <div className="absolute inset-0 bg-success/20 rounded-lg flex items-center justify-center pointer-events-none">
                                  <Check className="h-8 w-8 text-success" />
                                </div>
                              )}
                              
                              {/* File name */}
                              <p className="text-xs truncate text-center text-foreground">{doc.name}</p>
                              
                              {/* Saved badge */}
                              {isExisting && (
                                <div className="absolute top-1 left-1">
                                  <Badge variant="secondary" className="text-[8px] px-1 py-0">Saved</Badge>
                                </div>
                              )}
                            </a>
                            
                            {/* Remove button for new uploads */}
                            {!isExisting && !isUploading && (
                              <button
                                type="button"
                                onClick={() => removeDocument(newIndex)}
                                className="absolute top-1 right-1 p-1 bg-destructive rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <X className="h-3 w-3 text-destructive-foreground" />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        {/* Complete Job Button - Always visible when job not complete */}
        {canSignOff && (
          <Card className="border-2 border-success bg-success/10">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <CheckSquare className="h-6 w-6 text-success flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h3 className="font-semibold text-sm sm:text-base text-success">Sign Off Job</h3>
                  <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                    Mark this job as complete to transfer all notes, photos, and documentation to admin.
                  </p>
                  <Button 
                    onClick={() => setShowSignOffModal(true)}
                    disabled={isCompleting}
                    className="w-full mt-3 bg-success hover:bg-success/90 text-success-foreground"
                  >
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    Complete & Sign Off Job
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Fixed Save Button */}
      {hasUnsavedChanges && (
        <div className="fixed bottom-0 left-0 right-0 p-3 sm:p-4 bg-background border-t shadow-lg safe-area-bottom">
          <Button
            onClick={handleSave}
            disabled={isSaving || uploadingPhotos || uploadingFiles || uploadingVideos}
            className="w-full h-11 sm:h-12 text-base sm:text-lg"
          >
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Saving...
              </>
            ) : uploadingPhotos || uploadingFiles || uploadingVideos ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Save className="mr-2 h-5 w-5" />
                Save Changes
              </>
            )}
          </Button>
        </div>
      )}

      {/* Sign-Off Confirmation Modal */}
      <SignOffConfirmationModal
        isOpen={showSignOffModal}
        onClose={() => setShowSignOffModal(false)}
        onConfirm={() => {
          setShowSignOffModal(false);
          handleCompleteJob();
        }}
        isSubmitting={isCompleting}
        summary={{
          jobNumber: job.jobNumber,
          jobName: job.name,
          photosCount: newPhotos.filter(p => !p.startsWith('data:')).length + existingPhotos.length,
          videosCount: newVideos.filter(v => !v.startsWith('data:')).length + existingVideos.length,
          documentsCount: newDocuments.filter(d => !d.url.startsWith('data:')).length + existingDocuments.length,
          workItemsTotal: job.workItems.length,
          workItemsCompleted: job.workItems.filter(item => {
            const update = workItemUpdates[item.id];
            return (update?.isConfirmed ?? item.isConfirmed) !== false;
          }).length,
          workItemsModified: Object.values(workItemUpdates).filter(u => u.hasModification).length + 
            job.workItems.filter(item => !workItemUpdates[item.id] && item.hasModification).length,
          progressNotes: notes,
        }}
      />
    </div>
  );
};