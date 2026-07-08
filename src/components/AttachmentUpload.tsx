import { useCallback, useState, useRef, useEffect } from 'react';
import { Upload, Image as ImageIcon, Video, FileText, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Attachment } from '@/types/job';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { createJobAttachmentSignedUrl, extractJobAttachmentPath, getJobAttachmentPublicUrl } from '@/lib/attachmentUrls';

interface AttachmentUploadProps {
  jobId: string;
  attachments: Attachment[];
  onAttachmentsChange: (attachments: Attachment[]) => void;
}

type MediaCategory = 'images' | 'videos' | 'documents';

const ACCEPTED_TYPES = {
  images: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic'],
  videos: ['video/mp4', 'video/webm', 'video/quicktime', 'video/avi'],
  documents: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain']
};

const getFileCategory = (mimeType: string): MediaCategory | null => {
  if (ACCEPTED_TYPES.images.includes(mimeType)) return 'images';
  if (ACCEPTED_TYPES.videos.includes(mimeType)) return 'videos';
  if (ACCEPTED_TYPES.documents.includes(mimeType)) return 'documents';
  return null;
};

const getAttachmentType = (category: MediaCategory): 'image' | 'video' | 'document' => {
  if (category === 'images') return 'image';
  if (category === 'videos') return 'video';
  return 'document';
};

export const AttachmentUpload = ({ jobId, attachments, onAttachmentsChange }: AttachmentUploadProps) => {
  const [isUploading, setIsUploading] = useState(false);
  const [activeCategory, setActiveCategory] = useState<MediaCategory>('images');
  const [displayUrls, setDisplayUrls] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const categorizedAttachments = {
    images: attachments.filter(a => a.type === 'image'),
    videos: attachments.filter(a => a.type === 'video'),
    documents: attachments.filter(a => a.type === 'document'),
  };

  // Generate signed URLs for all attachments because the bucket is private
  useEffect(() => {
    let cancelled = false;

    const loadDisplayUrls = async () => {
      const urlMap: Record<string, string> = {};
      await Promise.all(attachments.map(async (attachment) => {
        const signedUrl = await createJobAttachmentSignedUrl(attachment, { jobId });
        urlMap[attachment.id] = signedUrl || attachment.url;
      }));
      if (cancelled) return;
      setDisplayUrls(urlMap);
    };

    if (attachments.length > 0) {
      void loadDisplayUrls();
    } else {
      setDisplayUrls({});
    }

    return () => { cancelled = true; };
  }, [attachments, jobId]);

  const uploadToStorage = async (file: File, category: MediaCategory): Promise<{ path: string; publicUrl: string; errorMessage?: string } | { error: string }> => {
    const fileExt = (file.name.split('.').pop() || 'bin').toLowerCase();
    const filePath = `${jobId}/${category}/${crypto.randomUUID()}.${fileExt}`;

    // Ensure we have an authenticated session — the job-attachments bucket
    // requires is_admin(auth.uid()). If the session isn't present the request
    // goes anon and the RLS INSERT policy rejects it with a generic message.
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return { error: 'You are signed out. Please sign in again to upload.' };
    }

    const { data, error } = await supabase.storage
      .from('job-attachments')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
        // iOS Safari camera captures sometimes report an empty MIME type.
        contentType: file.type || 'application/octet-stream',
      });

    if (error) {
      console.error('Storage upload error:', error);
      return { error: error.message || 'Storage rejected the upload.' };
    }

    const publicUrl = getJobAttachmentPublicUrl(data.path);
    return { path: data.path, publicUrl };
  };

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    const newAttachments: Attachment[] = [];

    try {
      for (const file of Array.from(files)) {
        const category = getFileCategory(file.type);
        if (!category) {
          toast({
            title: "Unsupported file type",
            description: `${file.name} is not a supported file type.`,
            variant: "destructive",
          });
          continue;
        }

        const result = await uploadToStorage(file, category);

        if ('error' in result) {
          toast({
            title: "Upload failed",
            description: `${file.name}: ${result.error}`,
            variant: "destructive",
          });
          continue;
        }
        
        const attachment: Attachment = {
          id: crypto.randomUUID(),
          name: file.name,
          type: getAttachmentType(category),
          url: result.publicUrl, // Store public URL
          path: result.path, // Store path for future use
          uploadedAt: new Date(),
        };
        
        newAttachments.push(attachment);
        
        const displayUrl = await createJobAttachmentSignedUrl({ path: result.path }, { jobId });
        setDisplayUrls(prev => ({ ...prev, [attachment.id]: displayUrl || result.publicUrl }));
      }

      if (newAttachments.length > 0) {
        onAttachmentsChange([...attachments, ...newAttachments]);
        toast({
          title: "Files uploaded",
          description: `${newAttachments.length} file(s) uploaded successfully.`,
        });
      }
    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: "Upload failed",
        description: "Could not upload the files.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [attachments, onAttachmentsChange, toast, jobId]);

  const removeAttachment = async (attachment: Attachment) => {
    try {
      // Use path if available, otherwise extract from URL
      const path = attachment.path || extractJobAttachmentPath(attachment.url);
      if (path) {
        await supabase.storage.from('job-attachments').remove([path]);
      }
    } catch (error) {
      console.error('Error deleting from storage:', error);
    }
    
    onAttachmentsChange(attachments.filter(a => a.id !== attachment.id));
  };

  const getAcceptString = (category: MediaCategory) => {
    return ACCEPTED_TYPES[category].join(',');
  };

  const CategoryIcon = ({ category }: { category: MediaCategory }) => {
    if (category === 'images') return <ImageIcon className="w-4 h-4" />;
    if (category === 'videos') return <Video className="w-4 h-4" />;
    return <FileText className="w-4 h-4" />;
  };

  // Get display URL for an attachment
  const getDisplayUrl = (attachment: Attachment): string => {
    return displayUrls[attachment.id] || attachment.url;
  };

  return (
    <div className="space-y-4">
      {/* Category Tabs */}
      <div className="flex gap-2">
        {(['images', 'videos', 'documents'] as MediaCategory[]).map((category) => (
          <button
            key={category}
            onClick={() => setActiveCategory(category)}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
              activeCategory === category
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            )}
          >
            <CategoryIcon category={category} />
            <span className="capitalize">{category}</span>
            {categorizedAttachments[category].length > 0 && (
              <Badge variant="secondary" className="ml-1 text-xs">
                {categorizedAttachments[category].length}
              </Badge>
            )}
          </button>
        ))}
      </div>

      {/* Upload Button */}
      <div className="flex items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept={getAcceptString(activeCategory)}
          onChange={handleFileSelect}
          multiple
          className="hidden"
        />
        <Button
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
        >
          {isUploading ? (
            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
          ) : (
            <Upload className="w-3 h-3 mr-1" />
          )}
          Upload {activeCategory}
        </Button>
      </div>

      {/* Attachments Grid */}
      {categorizedAttachments[activeCategory].length === 0 ? (
        <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
          <CategoryIcon category={activeCategory} />
          <p className="text-sm text-muted-foreground mt-2">
            No {activeCategory} uploaded yet
          </p>
          <p className="text-xs text-muted-foreground">
            Click upload to add {activeCategory}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          {categorizedAttachments[activeCategory].map((attachment) => (
            <div
              key={attachment.id}
              className="relative group p-3 border border-border rounded-lg hover:bg-muted/30 transition-colors"
            >
              <div className="w-full aspect-video bg-muted rounded flex items-center justify-center mb-2 overflow-hidden">
                {attachment.type === 'image' ? (
                  <img
                    src={getDisplayUrl(attachment)}
                    alt={attachment.name}
                    className="w-full h-full object-cover"
                  />
                ) : attachment.type === 'video' ? (
                  <video
                    src={getDisplayUrl(attachment)}
                    className="w-full h-full object-cover"
                    controls
                    preload="metadata"
                  />
                ) : (
                  <CategoryIcon category={activeCategory} />
                )}
              </div>
              <p className="text-xs font-medium truncate">{attachment.name}</p>
              <p className="text-[10px] text-muted-foreground">
                {new Date(attachment.uploadedAt).toLocaleDateString()}
              </p>
              <button
                onClick={() => removeAttachment(attachment)}
                className="absolute top-1 right-1 p-1 rounded-full bg-destructive text-destructive-foreground opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
