import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { compressImages, formatBytes, calculateSavings } from '@/lib/imageCompression';

interface UploadItem {
  id: string;
  file: File;
  status: 'pending' | 'compressing' | 'uploading' | 'complete' | 'error';
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
  enableCompression?: boolean;
  compressionQuality?: number;
  folderId?: string; // Optional folder ID for Before/After organization
  onProgress?: (progress: number, completed: number, total: number) => void;
  onCompressionComplete?: (savedBytes: number, savedPercent: number) => void;
  onComplete?: (urls: string[]) => void;
  onError?: (error: string) => void;
}

export const useBatchUpload = ({
  teamId,
  jobId,
  bucket = 'job-attachments',
  maxConcurrent = 3,
  enableCompression = true,
  compressionQuality = 0.8,
  folderId,
  onProgress,
  onCompressionComplete,
  onComplete,
  onError,
}: UseBatchUploadOptions) => {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);
  const [overallProgress, setOverallProgress] = useState(0);
  const [compressionStats, setCompressionStats] = useState<{ saved: number; percent: number } | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Generate thumbnail for image preview (small, fast)
  const generateThumbnail = useCallback(async (file: File): Promise<string> => {
    return new Promise((resolve) => {
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
    
    // Include folderId in path if provided (for Before/After organization)
    const folderPath = folderId ? `${subfolder}/${folderId}` : subfolder;
    const fileName = `${teamId}/${jobId}/${folderPath}/${timestamp}-${randomId}.${extension}`;

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
  }, [teamId, jobId, bucket, folderId]);

  // Process uploads in batches with compression and concurrency control
  const processUploads = useCallback(async (
    files: File[],
    subfolder: string = 'photos'
  ): Promise<string[]> => {
    if (files.length === 0) return [];
    
    setIsUploading(true);
    setCompressionStats(null);
    abortControllerRef.current = new AbortController();

    let filesToUpload = files;

    // Compress images if enabled
    if (enableCompression && subfolder === 'photos') {
      setIsCompressing(true);
      
      // Create initial items showing compression status
      const compressingItems: UploadItem[] = files.map((file, index) => ({
        id: `upload-${Date.now()}-${index}`,
        file,
        status: 'compressing' as const,
        progress: 0,
        thumbnailUrl: URL.createObjectURL(file),
      }));
      setItems(compressingItems);

      try {
        const originalFiles = [...files];
        filesToUpload = await compressImages(
          files,
          { quality: compressionQuality, maxWidth: 1920, maxHeight: 1920 },
          2, // Lower concurrency for compression on mobile
          (completed, total) => {
            const progress = Math.round((completed / total) * 30); // Compression is 0-30% of total
            setOverallProgress(progress);
          }
        );

        // Calculate and report savings
        const savings = calculateSavings(originalFiles, filesToUpload);
        setCompressionStats({ saved: savings.savedBytes, percent: savings.savedPercent });
        onCompressionComplete?.(savings.savedBytes, savings.savedPercent);
        
        console.log(`Compression complete: ${formatBytes(savings.savedBytes)} saved (${savings.savedPercent.toFixed(0)}%)`);
      } catch (error) {
        console.error('Compression error:', error);
        // Continue with original files if compression fails
        filesToUpload = files;
      }
      
      setIsCompressing(false);
    }

    // Create upload items with fast thumbnail previews
    const uploadItems: UploadItem[] = await Promise.all(
      filesToUpload.map(async (file, index) => {
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
              if (p.thumbnailUrl && p.thumbnailUrl.startsWith('blob:')) {
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

      // Update overall progress (30-100% for uploads, since 0-30% was compression)
      const uploadProgress = 30 + Math.round((completedCount / totalCount) * 70);
      setOverallProgress(enableCompression ? uploadProgress : Math.round((completedCount / totalCount) * 100));
      onProgress?.(uploadProgress, completedCount, totalCount);

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
  }, [maxConcurrent, uploadFile, generateThumbnail, enableCompression, compressionQuality, onProgress, onCompressionComplete, onComplete]);

  // Cancel all uploads
  const cancelUploads = useCallback(() => {
    abortControllerRef.current?.abort();
    setIsUploading(false);
    setIsCompressing(false);
    setItems([]);
    setOverallProgress(0);
    setCompressionStats(null);
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
    setIsCompressing(false);
    setCompressionStats(null);
  }, [items]);

  return {
    items,
    isUploading,
    isCompressing,
    overallProgress,
    compressionStats,
    processUploads,
    cancelUploads,
    reset,
  };
};
