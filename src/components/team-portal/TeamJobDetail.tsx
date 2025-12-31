import { useState, useEffect, useCallback } from 'react';
import { Job, JobStatus, JOB_STATUS_OPTIONS, WorkItem } from '@/types/job';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ArrowLeft, MapPin, Phone, Calendar, Save, Camera, Upload, Loader2, CheckCircle2, Clock, FileText, ChevronDown, CheckSquare, AlertCircle, File, X, Image, Video, Square, CheckSquare2, Edit3 } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useOfflineStorage } from '@/hooks/useOfflineStorage';
import { useToast } from '@/hooks/use-toast';
import { useTeamAuth } from '@/hooks/useTeamAuth';
import { SignOffConfirmationModal } from './SignOffConfirmationModal';
interface TeamJobDetailProps {
  job: Job;
  teamId: string;
  teamName: string;
  onBack: () => void;
  onJobUpdate: (job: Job) => void;
  isOnline: boolean;
}

export const TeamJobDetail = ({
  job,
  teamId,
  teamName,
  onBack,
  onJobUpdate,
  isOnline,
}: TeamJobDetailProps) => {
  const [progress, setProgress] = useState(job.progress);
  const [notes, setNotes] = useState(job.progressNotes || '');
  const [status, setStatus] = useState<JobStatus>(job.status);
  const [isSaving, setIsSaving] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [showSignOffModal, setShowSignOffModal] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [uploadingVideos, setUploadingVideos] = useState(false);
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
      newPhotos.length > 0 ||
      newVideos.length > 0 ||
      newDocuments.length > 0 ||
      Object.keys(workItemUpdates).length > 0;
    setHasUnsavedChanges(changed);
  }, [progress, notes, status, newPhotos, newVideos, newDocuments, workItemUpdates, job]);

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

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploadingPhotos(true);

    try {
      for (const file of Array.from(files)) {
        // Generate unique filename - handle camera files that may have generic names
        const timestamp = Date.now();
        const randomId = Math.random().toString(36).substring(2, 8);
        const extension = file.name?.split('.').pop() || 'jpg';
        const fileName = `${teamId}/${job.id}/${timestamp}-${randomId}.${extension}`;
        
        // First convert to base64 for immediate preview
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        
        // Add base64 to preview immediately
        setPhotos(prev => [...prev, base64]);
        
        // If online, upload to storage and replace base64 with URL
        if (isOnline) {
          try {
            const { data, error } = await supabase.storage
              .from('job-attachments')
              .upload(fileName, file);

            if (!error && data) {
              const { data: urlData } = supabase.storage
                .from('job-attachments')
                .getPublicUrl(data.path);
              
              // Replace base64 with actual URL
              setPhotos(prev => prev.map(p => p === base64 ? urlData.publicUrl : p));
            }
          } catch (uploadError) {
            console.error('Storage upload error, keeping base64:', uploadError);
          }
        }
      }

      setHasUnsavedChanges(true);

      toast({
        title: 'Photos Added',
        description: `${Array.from(files).length} photo(s) uploaded.`,
      });
    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: 'Upload Failed',
        description: 'Failed to process photos.',
        variant: 'destructive',
      });
    } finally {
      setUploadingPhotos(false);
      // Reset input to allow re-selecting same file
      e.target.value = '';
    }
  };

  // Handle file/document upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploadingFiles(true);

    try {
      const uploadedDocs: { name: string; url: string; type: string }[] = [];

      for (const file of Array.from(files)) {
        const fileName = `${teamId}/${job.id}/docs/${Date.now()}-${file.name}`;
        
        if (isOnline) {
          const { data, error } = await supabase.storage
            .from('job-attachments')
            .upload(fileName, file);

          if (error) throw error;

          const { data: urlData } = supabase.storage
            .from('job-attachments')
            .getPublicUrl(data.path);

          uploadedDocs.push({
            name: file.name,
            url: urlData.publicUrl,
            type: file.type,
          });
        } else {
          // Store as base64 for offline
          const reader = new FileReader();
          const base64 = await new Promise<string>((resolve) => {
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(file);
          });
          uploadedDocs.push({
            name: file.name,
            url: base64,
            type: file.type,
          });
        }
      }

      setDocuments(prev => [...prev, ...uploadedDocs]);
      setHasUnsavedChanges(true);

      toast({
        title: 'Files Added',
        description: `${uploadedDocs.length} file(s) ready to upload.`,
      });
    } catch (error) {
      console.error('File upload error:', error);
      toast({
        title: 'Upload Failed',
        description: 'Failed to process files.',
        variant: 'destructive',
      });
    } finally {
      setUploadingFiles(false);
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

  // Handle video upload
  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploadingVideos(true);

    try {
      for (const file of Array.from(files)) {
        const timestamp = Date.now();
        const randomId = Math.random().toString(36).substring(2, 8);
        const extension = file.name?.split('.').pop() || 'mp4';
        const fileName = `${teamId}/${job.id}/videos/${timestamp}-${randomId}.${extension}`;

        // Convert to base64 for immediate preview
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        // Add preview immediately
        setVideos(prev => [...prev, base64]);

        // If online, upload and replace base64 with URL
        if (isOnline) {
          try {
            const { data, error } = await supabase.storage
              .from('job-attachments')
              .upload(fileName, file);

            if (!error && data) {
              const { data: urlData } = supabase.storage
                .from('job-attachments')
                .getPublicUrl(data.path);

              setVideos(prev => prev.map(v => v === base64 ? urlData.publicUrl : v));
            }
          } catch (uploadError) {
            console.error('Storage upload error, keeping base64:', uploadError);
          }
        }
      }

      setHasUnsavedChanges(true);

      toast({
        title: 'Videos Added',
        description: `${Array.from(files).length} video(s) uploaded.`,
      });
    } catch (error) {
      console.error('Video upload error:', error);
      toast({
        title: 'Upload Failed',
        description: 'Failed to process videos.',
        variant: 'destructive',
      });
    } finally {
      setUploadingVideos(false);
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
              <Badge variant="secondary" className="text-xs font-mono mb-0.5">
                {job.jobNumber}
              </Badge>
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
                    <p className="text-xs text-muted-foreground mb-1">Summary</p>
                    <p className="text-xs sm:text-sm">{job.summaryOfWorks}</p>
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
                    {job.workItems.map((item: WorkItem, index: number) => {
                      const updatedItem = getWorkItemWithUpdates(item);
                      const isConfirmed = updatedItem.isConfirmed ?? true;
                      const hasModification = updatedItem.hasModification ?? false;
                      
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
                                {item.description}
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
                  <label className="text-xs sm:text-sm text-muted-foreground mb-2 block">Notes</label>
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Add progress notes, issues, or updates..."
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
                    
                    {/* Gallery upload button */}
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
                        
                        return (
                          <div key={index} className="relative group">
                            <a 
                              href={doc.url} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="block p-3 bg-muted/50 rounded-lg border border-border hover:border-primary/50 hover:bg-muted transition-all"
                            >
                              {/* Thumbnail preview */}
                              <div className="flex items-center justify-center h-16 mb-2 rounded bg-background/50">
                                {isImage ? (
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
                            {!isExisting && (
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