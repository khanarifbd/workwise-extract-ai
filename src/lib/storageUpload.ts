import { supabase } from '@/integrations/supabase/client';
import { getJobAttachmentPublicUrl } from '@/lib/attachmentUrls';

interface UploadToStorageOptions {
  bucket: string;
  file: File;
  filePath: string;
  cacheControl?: string;
  timeoutMs?: number;
}

export const DEFAULT_STORAGE_UPLOAD_TIMEOUT_MS = 120000;

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error && typeof (error as { message?: unknown }).message === 'string') {
    return (error as { message: string }).message;
  }
  return 'Upload failed';
}

function isLikelyDuplicateUploadError(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes('already exists')
    || normalized.includes('resource already exists')
    || normalized.includes('duplicate');
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timeoutId: number | undefined;

  try {
    return await new Promise<T>((resolve, reject) => {
      timeoutId = window.setTimeout(() => {
        reject(new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)}s`));
      }, timeoutMs);

      promise.then(resolve).catch(reject);
    });
  } finally {
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
    }
  }
}

export async function uploadFileToStorage({
  bucket,
  file,
  filePath,
  cacheControl = '3600',
  timeoutMs = DEFAULT_STORAGE_UPLOAD_TIMEOUT_MS,
}: UploadToStorageOptions): Promise<string> {
  try {
    const { data, error } = await withTimeout(
      supabase.storage.from(bucket).upload(filePath, file, {
        cacheControl,
        upsert: false,
      }),
      timeoutMs,
      'Upload'
    );

    if (error) {
      throw error;
    }

    return bucket === 'job-attachments'
      ? getJobAttachmentPublicUrl(data.path)
      : supabase.storage.from(bucket).getPublicUrl(data.path).data.publicUrl;
  } catch (error) {
    const message = getErrorMessage(error);

    if (isLikelyDuplicateUploadError(message)) {
      return bucket === 'job-attachments'
        ? getJobAttachmentPublicUrl(filePath)
        : supabase.storage.from(bucket).getPublicUrl(filePath).data.publicUrl;
    }

    throw new Error(message);
  }
}