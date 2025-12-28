import { useState, useEffect, useCallback } from 'react';
import { Job, JobStatus, JOB_STATUS_OPTIONS, WorkItem } from '@/types/job';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ArrowLeft, MapPin, Phone, Calendar, Save, Camera, Upload, Loader2, CheckCircle2, Clock, FileText, ChevronDown, CheckSquare, AlertCircle, File, X, Image } from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useOfflineStorage } from '@/hooks/useOfflineStorage';
import { useToast } from '@/hooks/use-toast';
import { useTeamAuth } from '@/hooks/useTeamAuth';
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
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [photos, setPhotos] = useState<string[]>([]);
  const [documents, setDocuments] = useState<{ name: string; url: string; type: string }[]>([]);
  const [expandedSections, setExpandedSections] = useState({
    details: true,
    workItems: false,
    status: true,
    photos: false,
    documents: false,
  });
  
  const { addToSyncQueue, saveDraft, getDraft, clearDraft } = useOfflineStorage();
  const { toast } = useToast();
  const { updateTeamJob } = useTeamAuth();

  // Check if job can be marked complete (progress at 100%)
  const canComplete = progress === 100 && status !== 'complete';

  // Auto-save draft
  const autoSaveDraft = useCallback(async () => {
    if (hasUnsavedChanges) {
      await saveDraft(job.id, teamName, {
        progress,
        notes,
        status,
        photos,
        documents,
      });
    }
  }, [hasUnsavedChanges, progress, notes, status, photos, documents, job.id, teamName, saveDraft]);

  // Load draft on mount
  useEffect(() => {
    const loadDraft = async () => {
      const draft = await getDraft(job.id, teamName);
      if (draft) {
        setProgress(draft.data.progress ?? job.progress);
        setNotes(draft.data.notes ?? job.progressNotes ?? '');
        setStatus(draft.data.status ?? job.status);
        setPhotos(draft.data.photos ?? []);
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
      photos.length > 0 ||
      documents.length > 0;
    setHasUnsavedChanges(changed);
  }, [progress, notes, status, photos, documents, job]);

  const handleSave = async () => {
    setIsSaving(true);

    const updates = {
      status,
      progress,
      notes,
      photos: photos.length > 0 ? photos : undefined,
      documents: documents.length > 0 ? documents : undefined,
    };

    try {
      if (isOnline) {
        // Use secure edge function instead of direct database access
        await updateTeamJob(job.id, updates);

        await clearDraft(job.id, teamName);
        
        onJobUpdate({
          ...job,
          progress,
          progressNotes: notes,
          status,
          isCompleted: status === 'complete',
          completionDate: status === 'complete' ? new Date() : null,
        });

        toast({
          title: 'Saved',
          description: 'Job updated successfully.',
        });
      } else {
        // Queue for sync
        await addToSyncQueue({
          teamId,
          actionType: 'progress_update',
          payload: updates,
        });

        if (photos.length > 0 || documents.length > 0) {
          await addToSyncQueue({
            teamId,
            actionType: 'file_upload',
            payload: {
              jobId: job.id,
              photos,
              documents,
              notes,
            },
          });
        }

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
      setPhotos([]);
      setDocuments([]);
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

  // Handle job completion with data transfer
  const handleCompleteJob = async () => {
    if (!canComplete) return;
    
    setIsCompleting(true);

    try {
      // First save any pending changes
      if (hasUnsavedChanges) {
        await handleSave();
      }

      if (isOnline) {
        // Use secure edge function for completion
        await updateTeamJob(job.id, {
          status: 'complete',
          progress: 100,
          notes: notes + '\n\n[JOB COMPLETED BY TEAM]',
          photos: photos.length > 0 ? photos : undefined,
        });

        await clearDraft(job.id, teamName);
        
        onJobUpdate({
          ...job,
          progress: 100,
          progressNotes: notes,
          status: 'complete',
          isCompleted: true,
          completionDate: new Date(),
        });

        toast({
          title: 'Job Completed!',
          description: 'Job has been marked as complete and data transferred to admin.',
        });
      } else {
        // Queue for sync when offline
        await addToSyncQueue({
          teamId,
          actionType: 'job_complete',
          payload: {
            id: job.id,
            status: 'complete',
            progress: 100,
            notes: notes + '\n\n[JOB COMPLETED BY TEAM]',
            photos,
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
          title: 'Completion Queued',
          description: 'Job completion will sync when you\'re back online.',
        });
      }

      setPhotos([]);
      setHasUnsavedChanges(false);
    } catch (error) {
      console.error('Completion error:', error);
      toast({
        title: 'Completion Failed',
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
      const uploadedUrls: string[] = [];

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
        
        // Add to preview immediately
        uploadedUrls.push(base64);
        
        // If online, also upload to storage in background
        if (isOnline) {
          try {
            const { data, error } = await supabase.storage
              .from('job-attachments')
              .upload(fileName, file);

            if (!error && data) {
              const { data: urlData } = supabase.storage
                .from('job-attachments')
                .getPublicUrl(data.path);
              
              // Replace base64 with actual URL in the array
              const index = uploadedUrls.indexOf(base64);
              if (index > -1) {
                uploadedUrls[index] = urlData.publicUrl;
              }
            }
          } catch (uploadError) {
            console.error('Storage upload error, keeping base64:', uploadError);
            // Keep base64 if upload fails
          }
        }
      }

      setPhotos(prev => [...prev, ...uploadedUrls]);
      setHasUnsavedChanges(true);

      toast({
        title: 'Photos Added',
        description: `${uploadedUrls.length} photo(s) ready to upload.`,
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
        title: 'ফাইল যোগ হয়েছে',
        description: `${uploadedDocs.length} টি ফাইল আপলোডের জন্য প্রস্তুত`,
      });
    } catch (error) {
      console.error('File upload error:', error);
      toast({
        title: 'আপলোড ব্যর্থ',
        description: 'ফাইল প্রসেস করতে সমস্যা হয়েছে',
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
                  <div className="space-y-2">
                    {job.workItems.map((item: WorkItem, index: number) => (
                      <div key={item.id || index} className="flex items-start gap-2 text-xs sm:text-sm p-2 bg-muted/50 rounded">
                        <CheckCircle2 className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-foreground">{item.description}</p>
                          {item.sorCode && (
                            <p className="text-xs text-muted-foreground font-mono mt-0.5">
                              SOR: {item.sorCode} × {item.qty}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
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
                    Photos {photos.length > 0 && `(${photos.length})`}
                  </span>
                  <ChevronDown className={`h-4 w-4 transition-transform ${expandedSections.photos ? 'rotate-180' : ''}`} />
                </CardTitle>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="pt-0">
                <div className="space-y-3">
                  <label className="flex flex-col items-center justify-center w-full h-20 border-2 border-dashed rounded-lg cursor-pointer bg-muted/50 hover:bg-muted transition-colors">
                    <input
                      type="file"
                      accept="image/*"
                      multiple
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
                          Take or upload photos
                        </span>
                      </>
                    )}
                  </label>

                  {photos.length > 0 && (
                    <div className="grid grid-cols-4 gap-2">
                      {photos.map((photo, index) => (
                        <div key={index} className="relative aspect-square rounded-lg overflow-hidden bg-muted group">
                          <img
                            src={photo}
                            alt={`Upload ${index + 1}`}
                            className="w-full h-full object-cover"
                          />
                          <button
                            type="button"
                            onClick={() => removePhoto(index)}
                            className="absolute top-1 right-1 p-1 bg-destructive rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X className="h-3 w-3 text-destructive-foreground" />
                          </button>
                        </div>
                      ))}
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
                    Documents {documents.length > 0 && `(${documents.length})`}
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
                          PDF, Word, Excel বা অন্য ফাইল আপলোড করুন
                        </span>
                      </>
                    )}
                  </label>

                  {documents.length > 0 && (
                    <div className="space-y-2">
                      {documents.map((doc, index) => (
                        <div key={index} className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg group">
                          {getFileIcon(doc.type)}
                          <span className="flex-1 text-xs sm:text-sm truncate">{doc.name}</span>
                          <button
                            type="button"
                            onClick={() => removeDocument(index)}
                            className="p-1 hover:bg-destructive/20 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X className="h-4 w-4 text-destructive" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        {/* Complete Job Button - Shows when progress is 100% */}
        {canComplete && (
          <Card className="border-2 border-success bg-success/10">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <CheckSquare className="h-6 w-6 text-success flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h3 className="font-semibold text-sm sm:text-base text-success">Ready to Complete</h3>
                  <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                    All tasks are done. Mark this job as complete to transfer all notes, photos, and documentation to admin.
                  </p>
                  <Button 
                    onClick={handleCompleteJob}
                    disabled={isCompleting}
                    className="w-full mt-3 bg-success hover:bg-success/90 text-success-foreground"
                  >
                    {isCompleting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Completing...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                        Complete & Sign Off Job
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Hint for completing */}
        {progress < 100 && !job.isCompleted && (
          <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
            <AlertCircle className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <p className="text-xs text-muted-foreground">
              Set progress to 100% to complete this job and transfer data to admin.
            </p>
          </div>
        )}
      </div>

      {/* Fixed Save Button */}
      {hasUnsavedChanges && (
        <div className="fixed bottom-0 left-0 right-0 p-3 sm:p-4 bg-background border-t shadow-lg safe-area-bottom">
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="w-full h-11 sm:h-12 text-base sm:text-lg"
          >
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Saving...
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
    </div>
  );
};