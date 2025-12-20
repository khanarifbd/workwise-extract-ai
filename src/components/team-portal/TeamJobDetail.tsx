import { useState, useEffect, useCallback } from 'react';
import { Job, JobStatus, JOB_STATUS_OPTIONS, WorkItem } from '@/types/job';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, MapPin, Phone, Calendar, Save, Camera, Upload, Loader2, CheckCircle2, Clock, FileText } from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useOfflineStorage } from '@/hooks/useOfflineStorage';
import { useToast } from '@/hooks/use-toast';
import { mapJobToDatabase } from '@/lib/api';

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
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [photos, setPhotos] = useState<string[]>([]);
  
  const { addToSyncQueue, saveDraft, getDraft, clearDraft } = useOfflineStorage();
  const { toast } = useToast();

  // Auto-save draft
  const autoSaveDraft = useCallback(async () => {
    if (hasUnsavedChanges) {
      await saveDraft(job.id, teamName, {
        progress,
        notes,
        status,
        photos,
      });
    }
  }, [hasUnsavedChanges, progress, notes, status, photos, job.id, teamName, saveDraft]);

  // Load draft on mount
  useEffect(() => {
    const loadDraft = async () => {
      const draft = await getDraft(job.id, teamName);
      if (draft) {
        setProgress(draft.data.progress ?? job.progress);
        setNotes(draft.data.notes ?? job.progressNotes ?? '');
        setStatus(draft.data.status ?? job.status);
        setPhotos(draft.data.photos ?? []);
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
      photos.length > 0;
    setHasUnsavedChanges(changed);
  }, [progress, notes, status, photos, job]);

  const handleSave = async () => {
    setIsSaving(true);

    const updates: Partial<Job> = {
      id: job.id,
      progress,
      progressNotes: notes,
      status,
      isCompleted: status === 'complete',
      completionDate: status === 'complete' ? new Date() : null,
    };

    try {
      if (isOnline) {
        const dbUpdates = mapJobToDatabase(updates);
        const { error } = await supabase
          .from('jobs')
          .update(dbUpdates)
          .eq('id', job.id);

        if (error) throw error;

        // Save photos if any
        if (photos.length > 0) {
          await supabase.from('team_job_updates').insert({
            job_id: job.id,
            team_id: teamId,
            progress,
            notes,
            photos,
            status,
            updated_by: teamName,
            synced_at: new Date().toISOString(),
          });
        }

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

        if (photos.length > 0) {
          await addToSyncQueue({
            teamId,
            actionType: 'photo_upload',
            payload: {
              jobId: job.id,
              photos,
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

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploadingPhotos(true);

    try {
      const uploadedUrls: string[] = [];

      for (const file of Array.from(files)) {
        const fileName = `${teamId}/${job.id}/${Date.now()}-${file.name}`;
        
        if (isOnline) {
          const { data, error } = await supabase.storage
            .from('job-attachments')
            .upload(fileName, file);

          if (error) throw error;

          const { data: urlData } = supabase.storage
            .from('job-attachments')
            .getPublicUrl(data.path);

          uploadedUrls.push(urlData.publicUrl);
        } else {
          // Store as base64 for offline
          const reader = new FileReader();
          const base64 = await new Promise<string>((resolve) => {
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(file);
          });
          uploadedUrls.push(base64);
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
    }
  };

  const getStatusColor = (s: string) => {
    const option = JOB_STATUS_OPTIONS.find(o => o.value === s);
    return option?.color || '#6B7280';
  };

  return (
    <div className="pb-24">
      {/* Header */}
      <div className="bg-primary text-primary-foreground sticky top-0 z-10 shadow-md">
        <div className="px-4 py-3">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={onBack}
              className="text-primary-foreground hover:bg-primary-foreground/20"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex-1 min-w-0">
              <Badge variant="secondary" className="text-xs font-mono mb-0.5">
                {job.jobNumber}
              </Badge>
              <h1 className="text-lg font-semibold truncate">{job.name}</h1>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {/* Job Info Card */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Job Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {job.address && (
              <a 
                href={`https://maps.google.com/?q=${encodeURIComponent(job.address)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-2 text-sm text-primary hover:underline"
              >
                <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>{job.address}</span>
              </a>
            )}
            
            {job.phoneNumber && (
              <a 
                href={`tel:${job.phoneNumber}`}
                className="flex items-center gap-2 text-sm text-primary hover:underline"
              >
                <Phone className="h-4 w-4" />
                <span>{job.phoneNumber}</span>
              </a>
            )}

            {job.bookedDate && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="h-4 w-4" />
                <span>Booked: {format(new Date(job.bookedDate), 'EEEE, MMMM d, yyyy')}</span>
              </div>
            )}

            {job.summaryOfWorks && (
              <div className="pt-2 border-t">
                <p className="text-sm text-muted-foreground mb-1">Summary</p>
                <p className="text-sm">{job.summaryOfWorks}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Work Items */}
        {job.workItems && job.workItems.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Work Items ({job.workItems.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {job.workItems.map((item: WorkItem, index: number) => (
                  <div key={item.id || index} className="flex items-start gap-2 text-sm p-2 bg-muted/50 rounded">
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
          </Card>
        )}

        {/* Status Update */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Update Status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm text-muted-foreground mb-2 block">Status</label>
              <Select value={status} onValueChange={(v) => setStatus(v as JobStatus)}>
                <SelectTrigger>
                  <SelectValue>
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-3 h-3 rounded-full" 
                        style={{ backgroundColor: getStatusColor(status) }}
                      />
                      {JOB_STATUS_OPTIONS.find(o => o.value === status)?.label}
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
                <label className="text-sm text-muted-foreground">Progress</label>
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
              <label className="text-sm text-muted-foreground mb-2 block">Notes</label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add progress notes, issues, or updates..."
                rows={4}
              />
            </div>
          </CardContent>
        </Card>

        {/* Photo Upload */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Camera className="h-4 w-4" />
              Photos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed rounded-lg cursor-pointer bg-muted/50 hover:bg-muted transition-colors">
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
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                ) : (
                  <>
                    <Upload className="h-6 w-6 text-muted-foreground mb-1" />
                    <span className="text-sm text-muted-foreground">
                      Tap to take or upload photos
                    </span>
                  </>
                )}
              </label>

              {photos.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {photos.map((photo, index) => (
                    <div key={index} className="aspect-square rounded-lg overflow-hidden bg-muted">
                      <img
                        src={photo}
                        alt={`Upload ${index + 1}`}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Fixed Save Button */}
      {hasUnsavedChanges && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-background border-t shadow-lg">
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="w-full h-12 text-lg"
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
