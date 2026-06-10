import { useState, useCallback, useRef } from 'react';
import { compressImages, formatBytes, calculateSavings } from '@/lib/imageCompression';
import { uploadFileToStorage, DEFAULT_STORAGE_UPLOAD_TIMEOUT_MS } from '@/lib/storageUpload';

interface UploadItem {
  id: string;
  file: File;
  status: 'pending' | 'compressing' | 'uploading' | 'complete' | 'error' | 'cancelled' | 'retrying';
  progress: number;
  url?: string;
  error?: string;
  thumbnailUrl?: string;
  retryCount: number;
}

interface UseBatchUploadOptions {
  teamId: string;
  jobId: string;
  bucket?: string;
  maxConcurrent?: number;
  enableCompression?: boolean;
  compressionQuality?: number;
  folderId?: string;
  maxRetries?: number;
  onProgress?: (progress: number, completed: number, total: number) => void;
  onCompressionComplete?: (savedBytes: number, savedPercent: number) => void;
  onComplete?: (urls: string[]) => void;
  onError?: (error: string) => void;
  onCancel?: () => void;
}

const MAX_RETRIES_DEFAULT = 3;
const RETRY_BASE_DELAY_MS = 1000;
const UPLOAD_TIMEOUT_MS = DEFAULT_STORAGE_UPLOAD_TIMEOUT_MS;

/** Sleep helper with exponential backoff */
function backoffDelay(attempt: number, baseMs: number = RETRY_BASE_DELAY_MS): Promise<void> {
  const delay = baseMs * Math.pow(2, attempt) + Math.random() * 500;
  return new Promise(resolve => setTimeout(resolve, delay));
}

export const useBatchUpload = ({
  teamId,
  jobId,
  bucket = 'job-attachments',
  maxConcurrent = 3,
  enableCompression = true,
  compressionQuality = 0.8,
  folderId,
  maxRetries = MAX_RETRIES_DEFAULT,
  onProgress,
  onCompressionComplete,
  onComplete,
  onError,
  onCancel,
}: UseBatchUploadOptions) => {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);
  const [isCancelled, setIsCancelled] = useState(false);
  const [overallProgress, setOverallProgress] = useState(0);
  const [compressionStats, setCompressionStats] = useState<{ saved: number; percent: number } | null>(null);
  const cancelledRef = useRef(false);

  /** Upload a single file with retries */
  const uploadFileWithRetry = useCallback(async (
    item: UploadItem,
    subfolder: string,
    updateItem: (id: string, patch: Partial<UploadItem>) => void,
  ): Promise<string | null> => {
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 8);
    const extension = item.file.name?.split('.').pop()?.toLowerCase() || 'jpg';
    const folderPath = folderId ? `${subfolder}/${folderId}` : subfolder;
    const filePath = `${teamId}/${jobId}/${folderPath}/${timestamp}-${randomId}.${extension}`;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (cancelledRef.current) return null;

      try {
        if (attempt > 0) {
          updateItem(item.id, { status: 'retrying', progress: 10, retryCount: attempt, error: `Retry ${attempt}/${maxRetries}...` });
          await backoffDelay(attempt - 1);
        } else {
          updateItem(item.id, { status: 'uploading', progress: 10 });
        }

        if (cancelledRef.current) return null;

        updateItem(item.id, { progress: 30 });

        const url = await uploadFileToStorage({
          file: item.file,
          bucket,
          filePath,
          timeoutMs: UPLOAD_TIMEOUT_MS,
        });

        // Revoke thumbnail blob URL to free memory
        if (item.thumbnailUrl?.startsWith('blob:')) {
          URL.revokeObjectURL(item.thumbnailUrl);
        }

        updateItem(item.id, { status: 'complete', progress: 100, url, thumbnailUrl: url, error: undefined });
        return url;
      } catch (err: any) {
        const errorMsg = err?.message || 'Upload failed';
        console.error(`Upload attempt ${attempt + 1}/${maxRetries + 1} failed for ${item.file.name}:`, errorMsg);

        if (attempt === maxRetries) {
          updateItem(item.id, { status: 'error', progress: 0, error: errorMsg, retryCount: attempt });
          return null;
        }
      }
    }

    return null;
  }, [teamId, jobId, bucket, folderId, maxRetries]);

  /** Process uploads in batches with compression and concurrency control */
  const processUploads = useCallback(async (
    files: File[],
    subfolder: string = 'photos'
  ): Promise<string[]> => {
    if (files.length === 0) return [];

    setIsUploading(true);
    setIsCancelled(false);
    cancelledRef.current = false;
    setCompressionStats(null);

    let filesToUpload = files;

    // Compress images if enabled
    if (enableCompression && subfolder === 'photos') {
      setIsCompressing(true);

      const compressingItems: UploadItem[] = files.map((file, index) => ({
        id: `upload-${Date.now()}-${index}`,
        file,
        status: 'compressing' as const,
        progress: 0,
        thumbnailUrl: URL.createObjectURL(file),
        retryCount: 0,
      }));
      setItems(compressingItems);

      try {
        const originalFiles = [...files];
        filesToUpload = await compressImages(
          files,
          { quality: compressionQuality, maxWidth: 1920, maxHeight: 1920 },
          2,
          (completed, total) => {
            const progress = Math.round((completed / total) * 30);
            setOverallProgress(progress);
          }
        );

        const savings = calculateSavings(originalFiles, filesToUpload);
        setCompressionStats({ saved: savings.savedBytes, percent: savings.savedPercent });
        onCompressionComplete?.(savings.savedBytes, savings.savedPercent);
        console.log(`Compression complete: ${formatBytes(savings.savedBytes)} saved (${savings.savedPercent.toFixed(0)}%)`);
      } catch (error) {
        console.error('Compression error, continuing with originals:', error);
        filesToUpload = files;
      }

      setIsCompressing(false);
    }

    // Create upload items
    const uploadItems: UploadItem[] = filesToUpload.map((file, index) => ({
      id: `upload-${Date.now()}-${index}`,
      file,
      status: 'pending' as const,
      progress: 0,
      thumbnailUrl: URL.createObjectURL(file),
      retryCount: 0,
    }));

    setItems(uploadItems);

    // Mutable state tracker for item updates (avoids stale closures)
    const itemStateMap = new Map<string, Partial<UploadItem>>();
    const updateItem = (id: string, patch: Partial<UploadItem>) => {
      itemStateMap.set(id, { ...itemStateMap.get(id), ...patch });
      setItems(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p));
    };

    const results: string[] = [];
    const failedItems: UploadItem[] = [];
    let completedCount = 0;
    const totalCount = uploadItems.length;

    // Process in chunks
    const chunkSize = maxConcurrent;

    for (let i = 0; i < uploadItems.length; i += chunkSize) {
      if (cancelledRef.current) break;

      const chunk = uploadItems.slice(i, i + chunkSize);

      const chunkResults = await Promise.allSettled(
        chunk.map(item => uploadFileWithRetry(item, subfolder, updateItem))
      );

      chunkResults.forEach((result, idx) => {
        if (result.status === 'fulfilled' && result.value) {
          results.push(result.value);
        } else {
          failedItems.push(chunk[idx]);
        }
        completedCount++;
      });

      const uploadProgress = enableCompression
        ? 30 + Math.round((completedCount / totalCount) * 70)
        : Math.round((completedCount / totalCount) * 100);
      setOverallProgress(uploadProgress);
      onProgress?.(uploadProgress, completedCount, totalCount);

      // Small delay between chunks to prevent overwhelming mobile
      if (i + chunkSize < uploadItems.length) {
        await new Promise(resolve => setTimeout(resolve, 150));
      }
    }

    setIsUploading(false);

    if (failedItems.length > 0) {
      const errorMsg = `${failedItems.length} of ${totalCount} photo(s) failed to upload after ${maxRetries + 1} attempts.`;
      console.error(errorMsg);
      onError?.(errorMsg);
    }

    if (results.length > 0) {
      onComplete?.(results);
    }

    // Clean up remaining blob URLs
    uploadItems.forEach(item => {
      if (item.thumbnailUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(item.thumbnailUrl);
      }
    });

    return results;
  }, [maxConcurrent, uploadFileWithRetry, enableCompression, compressionQuality, maxRetries, onProgress, onCompressionComplete, onComplete, onError]);

  /** Cancel all uploads */
  const cancelUploads = useCallback(() => {
    cancelledRef.current = true;
    setIsCancelled(true);
    setItems(prev => prev.map(item =>
      item.status === 'pending' || item.status === 'uploading' || item.status === 'compressing' || item.status === 'retrying'
        ? { ...item, status: 'cancelled' as const }
        : item
    ));

    setTimeout(() => {
      setIsUploading(false);
      setIsCompressing(false);
      setItems([]);
      setOverallProgress(0);
      setCompressionStats(null);
      setIsCancelled(false);
      onCancel?.();
    }, 500);
  }, [onCancel]);

  /** Retry only failed items */
  const retryFailed = useCallback(async (subfolder: string = 'photos'): Promise<string[]> => {
    const failedItems = items.filter(item => item.status === 'error');
    if (failedItems.length === 0) return [];

    setIsUploading(true);
    setIsCancelled(false);
    cancelledRef.current = false;

    const updateItem = (id: string, patch: Partial<UploadItem>) => {
      setItems(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p));
    };

    const results: string[] = [];
    let completedCount = 0;
    const totalCount = failedItems.length;

    for (let i = 0; i < failedItems.length; i += maxConcurrent) {
      if (cancelledRef.current) break;
      const chunk = failedItems.slice(i, i + maxConcurrent);

      const chunkResults = await Promise.allSettled(
        chunk.map(item => {
          // Reset retry count for this new attempt
          updateItem(item.id, { retryCount: 0, error: undefined });
          return uploadFileWithRetry(item, subfolder, updateItem);
        })
      );

      chunkResults.forEach((result) => {
        if (result.status === 'fulfilled' && result.value) {
          results.push(result.value);
        }
        completedCount++;
      });

      const uploadProgress = Math.round((completedCount / totalCount) * 100);
      setOverallProgress(uploadProgress);
      onProgress?.(uploadProgress, completedCount, totalCount);

      if (i + maxConcurrent < failedItems.length) {
        await new Promise(resolve => setTimeout(resolve, 150));
      }
    }

    setIsUploading(false);

    if (results.length > 0) {
      onComplete?.(results);
    }

    const stillFailed = totalCount - results.length;
    if (stillFailed > 0) {
      onError?.(`${stillFailed} photo(s) still failed after retry.`);
    }

    return results;
  }, [items, maxConcurrent, uploadFileWithRetry, onProgress, onComplete, onError]);

  /** Reset state */
  const reset = useCallback(() => {
    items.forEach(item => {
      if (item.thumbnailUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(item.thumbnailUrl);
      }
    });
    setItems([]);
    setOverallProgress(0);
    setIsUploading(false);
    setIsCompressing(false);
    setCompressionStats(null);
  }, [items]);

  const failedCount = items.filter(i => i.status === 'error').length;

  return {
    items,
    isUploading,
    isCompressing,
    isCancelled,
    overallProgress,
    compressionStats,
    failedCount,
    processUploads,
    cancelUploads,
    retryFailed,
    reset,
  };
};
