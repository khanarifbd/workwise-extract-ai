import { useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Camera, Video, Loader2, X, CheckCircle2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { compressImage } from '@/lib/imageCompression';

interface UploadItem {
  id: string;
  file: File;
  preview: string;
  status: 'pending' | 'uploading' | 'complete' | 'error';
  url?: string;
  type: 'image' | 'video';
}

interface ProgressorMediaUploadProps {
  jobId: string;
  jobNumber: string;
  onUploaded?: () => void;
}

export const ProgressorMediaUpload = ({ jobId, jobNumber, onUploaded }: ProgressorMediaUploadProps) => {
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const newUploads: UploadItem[] = files.map(file => ({
      id: crypto.randomUUID(),
      file,
      preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : '',
      status: 'pending' as const,
      type: file.type.startsWith('video/') ? 'video' as const : 'image' as const,
    }));
    setUploads(prev => [...prev, ...newUploads]);
    if (e.target) e.target.value = '';
  };

  const removeUpload = (id: string) => {
    setUploads(prev => {
      const item = prev.find(u => u.id === id);
      if (item?.preview) URL.revokeObjectURL(item.preview);
      return prev.filter(u => u.id !== id);
    });
  };

  const uploadAll = async () => {
    const pending = uploads.filter(u => u.status === 'pending' || u.status === 'error');
    if (pending.length === 0) return;

    setIsUploading(true);

    for (const item of pending) {
      setUploads(prev => prev.map(u => u.id === item.id ? { ...u, status: 'uploading' } : u));

      try {
        let fileToUpload = item.file;

        // Compress images
        if (item.type === 'image') {
          try {
            const compressed = await compressImage(item.file);
            fileToUpload = compressed;
          } catch {
            // Use original if compression fails
          }
        }

        const ext = fileToUpload.name.split('.').pop() || 'jpg';
        const path = `${jobId}/progressor_${Date.now()}_${item.id.slice(0, 8)}.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from('job-attachments')
          .upload(path, fileToUpload, { contentType: fileToUpload.type });

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from('job-attachments')
          .getPublicUrl(path);

        // Add to job attachments
        const { data: jobData } = await supabase
          .from('jobs')
          .select('attachments')
          .eq('id', jobId)
          .single();

        const existingAttachments = (jobData?.attachments as any[]) || [];
        const newAttachment = {
          id: item.id,
          name: item.file.name,
          type: item.type,
          url: urlData.publicUrl,
          path,
          uploadedAt: new Date().toISOString(),
        };

        await supabase
          .from('jobs')
          .update({ attachments: [...existingAttachments, newAttachment] } as any)
          .eq('id', jobId);

        setUploads(prev => prev.map(u => u.id === item.id
          ? { ...u, status: 'complete', url: urlData.publicUrl }
          : u
        ));
      } catch (err) {
        console.error('Upload error:', err);
        setUploads(prev => prev.map(u => u.id === item.id ? { ...u, status: 'error' } : u));
      }
    }

    setIsUploading(false);
    onUploaded?.();
  };

  const pendingCount = uploads.filter(u => u.status === 'pending' || u.status === 'error').length;
  const completeCount = uploads.filter(u => u.status === 'complete').length;

  return (
    <div className="bg-background border rounded-lg p-3 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
          <Camera className="h-3.5 w-3.5 text-primary" />
          Upload Photos & Videos
        </span>
        {completeCount > 0 && (
          <Badge variant="secondary" className="text-[10px]">
            <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" /> {completeCount} uploaded
          </Badge>
        )}
      </div>

      {/* File input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,video/*"
        onChange={handleFileSelect}
        className="hidden"
      />

      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="text-xs h-8 flex-1"
          onClick={() => fileInputRef.current?.click()}
        >
          <Camera className="h-3.5 w-3.5 mr-1" /> Select Photos
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="text-xs h-8 flex-1"
          onClick={() => {
            if (fileInputRef.current) {
              fileInputRef.current.accept = 'video/*';
              fileInputRef.current.click();
              // Reset accept after click
              setTimeout(() => {
                if (fileInputRef.current) fileInputRef.current.accept = 'image/*,video/*';
              }, 1000);
            }
          }}
        >
          <Video className="h-3.5 w-3.5 mr-1" /> Select Videos
        </Button>
      </div>

      {/* Preview grid */}
      {uploads.length > 0 && (
        <div className="grid grid-cols-4 gap-2">
          {uploads.map(item => (
            <div key={item.id} className="relative group">
              {item.type === 'image' && item.preview ? (
                <img
                  src={item.preview}
                  alt=""
                  className={cn(
                    "w-full h-16 object-cover rounded-md border",
                    item.status === 'complete' && "border-emerald-500",
                    item.status === 'error' && "border-red-500",
                    item.status === 'uploading' && "opacity-60",
                  )}
                />
              ) : (
                <div className={cn(
                  "w-full h-16 rounded-md border flex items-center justify-center bg-muted",
                  item.status === 'complete' && "border-emerald-500",
                  item.status === 'error' && "border-red-500",
                )}>
                  <Video className="h-5 w-5 text-muted-foreground" />
                </div>
              )}
              {item.status === 'uploading' && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-md">
                  <Loader2 className="h-4 w-4 text-white animate-spin" />
                </div>
              )}
              {item.status === 'complete' && (
                <div className="absolute top-0.5 right-0.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                </div>
              )}
              {item.status === 'error' && (
                <div className="absolute top-0.5 right-0.5">
                  <AlertCircle className="h-3.5 w-3.5 text-red-500" />
                </div>
              )}
              {(item.status === 'pending' || item.status === 'error') && (
                <button
                  onClick={() => removeUpload(item.id)}
                  className="absolute top-0.5 left-0.5 opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 rounded-full p-0.5"
                >
                  <X className="h-2.5 w-2.5 text-white" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Upload button */}
      {pendingCount > 0 && (
        <Button
          size="sm"
          className="w-full text-xs h-8"
          onClick={uploadAll}
          disabled={isUploading}
        >
          {isUploading ? (
            <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Uploading...</>
          ) : (
            `Upload ${pendingCount} file${pendingCount !== 1 ? 's' : ''}`
          )}
        </Button>
      )}
    </div>
  );
};
