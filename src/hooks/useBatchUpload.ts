import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface UploadItem {
  id: string;
  file: File;
  status: 'pending' | 'uploading' | 'complete' | 'error';
  progress: number;
  url?: string;
  error?: string;
  thumbnailUrl?: string;
}

interface UseBatchUploadOptions {
  teamId: string;
  jobId: string;
  bucket?: string;
  maxConcurrent?: number;
  onProgress?: (progress: number, completed: number, total: number) => void;
  onComplete?: (urls: string[]) => void;
  onError?: (error: string) => void;
}

export const useBatchUpload = ({
  teamId,
  jobId,
  bucket = 'job-attachments',
  maxConcurrent = 3, // Reduced for mobile stability
  onProgress,
  onComplete,
  onError,
}: UseBatchUploadOptions) => {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [overallProgress, setOverallProgress] = useState(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Generate thumbnail for image preview (small, fast)
  const generateThumbnail = useCallback(async (file: File): Promise<string> => {
    return new Promise((resolve) => {
      // For very fast preview, use createObjectURL instead of base64
      const url = URL.createObjectURL(file);
      resolve(url);
    });
  }, []);

  // Upload a single file
  const uploadFile = useCallback(async (
    item: UploadItem,
    subfolder: string
  ): Promise<string | null> => {
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 8);
    const extension = item.file.name?.split('.').pop()?.toLowerCase() || 'jpg';
    const fileName = `${teamId}/${jobId}/${subfolder}/${timestamp}-${randomId}.${extension}`;

    try {
      const { data, error } = await supabase.storage
        .from(bucket)
        .upload(fileName, item.file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (error) throw error;

      const { data: urlData } = supabase.storage
        .from(bucket)
        .getPublicUrl(data.path);

      return urlData.publicUrl;
    } catch (error) {
      console.error('Upload error:', error);
      return null;
    }
  }, [teamId, jobId, bucket]);

  // Process uploads in batches with concurrency control
  const processUploads = useCallback(async (
    files: File[],
    subfolder: string = 'photos'
  ): Promise<string[]> => {
    if (files.length === 0) return [];
    
    setIsUploading(true);
    abortControllerRef.current = new AbortController();

    // Create upload items with fast thumbnail previews
    const uploadItems: UploadItem[] = await Promise.all(
      files.map(async (file, index) => {
        const id = `upload-${Date.now()}-${index}`;
        const thumbnailUrl = await generateThumbnail(file);
        return {
          id,
          file,
          status: 'pending' as const,
          progress: 0,
          thumbnailUrl,
        };
      })
    );

    setItems(uploadItems);

    const results: string[] = [];
    let completedCount = 0;
    const totalCount = uploadItems.length;

    // Process in chunks for better memory management
    const chunkSize = maxConcurrent;
    
    for (let i = 0; i < uploadItems.length; i += chunkSize) {
      if (abortControllerRef.current?.signal.aborted) break;

      const chunk = uploadItems.slice(i, i + chunkSize);
      
      // Update status to uploading for current chunk
      setItems(prev => prev.map(item => 
        chunk.find(c => c.id === item.id) 
          ? { ...item, status: 'uploading' as const, progress: 10 }
          : item
      ));

      // Upload chunk in parallel
      const chunkResults = await Promise.allSettled(
        chunk.map(async (item) => {
          // Update progress incrementally
          setItems(prev => prev.map(p => 
            p.id === item.id ? { ...p, progress: 30 } : p
          ));

          const url = await uploadFile(item, subfolder);

          // Update to complete or error
          setItems(prev => prev.map(p => {
            if (p.id === item.id) {
              // Revoke the thumbnail URL to free memory
              if (p.thumbnailUrl) {
                URL.revokeObjectURL(p.thumbnailUrl);
              }
              return url 
                ? { ...p, status: 'complete' as const, progress: 100, url, thumbnailUrl: url }
                : { ...p, status: 'error' as const, progress: 0, error: 'Upload failed' };
            }
            return p;
          }));

          return url;
        })
      );

      // Collect successful uploads
      chunkResults.forEach(result => {
        if (result.status === 'fulfilled' && result.value) {
          results.push(result.value);
        }
        completedCount++;
      });

      // Update overall progress
      const progress = Math.round((completedCount / totalCount) * 100);
      setOverallProgress(progress);
      onProgress?.(progress, completedCount, totalCount);

      // Small delay between chunks to prevent overwhelming the device
      if (i + chunkSize < uploadItems.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    setIsUploading(false);
    onComplete?.(results);

    // Clean up remaining object URLs
    uploadItems.forEach(item => {
      if (item.thumbnailUrl && item.thumbnailUrl.startsWith('blob:')) {
        URL.revokeObjectURL(item.thumbnailUrl);
      }
    });

    return results;
  }, [maxConcurrent, uploadFile, generateThumbnail, onProgress, onComplete]);

  // Cancel all uploads
  const cancelUploads = useCallback(() => {
    abortControllerRef.current?.abort();
    setIsUploading(false);
    setItems([]);
    setOverallProgress(0);
  }, []);

  // Reset state
  const reset = useCallback(() => {
    // Clean up object URLs
    items.forEach(item => {
      if (item.thumbnailUrl && item.thumbnailUrl.startsWith('blob:')) {
        URL.revokeObjectURL(item.thumbnailUrl);
      }
    });
    setItems([]);
    setOverallProgress(0);
    setIsUploading(false);
  }, [items]);

  return {
    items,
    isUploading,
    overallProgress,
    processUploads,
    cancelUploads,
    reset,
  };
};
