import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type AttachmentLike = {
  id?: string;
  url?: string | null;
  path?: string | null;
};

const JOB_ATTACHMENTS_BUCKET = 'job-attachments';

export const extractJobAttachmentPath = (url?: string | null): string | null => {
  if (!url) return null;

  if (!url.startsWith('http') && !url.startsWith('data:') && !url.startsWith('blob:')) {
    return url.replace(/^job-attachments\//, '');
  }

  const match = url.match(/\/job-attachments\/(.+?)(?:\?|$)/);
  if (!match?.[1]) return null;

  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
};

export const createJobAttachmentSignedUrl = async (attachment: AttachmentLike): Promise<string | null> => {
  const fallbackUrl = attachment.url || null;
  if (fallbackUrl?.startsWith('data:') || fallbackUrl?.startsWith('blob:')) return fallbackUrl;

  const path = attachment.path || extractJobAttachmentPath(fallbackUrl);
  if (!path) return fallbackUrl;

  const { data, error } = await supabase.storage
    .from(JOB_ATTACHMENTS_BUCKET)
    .createSignedUrl(path, 3600);

  if (!error && data?.signedUrl) return data.signedUrl;

  const { data: functionData, error: functionError } = await supabase.functions.invoke('sign-job-attachment-url', {
    body: { path },
  });

  if (!functionError && functionData?.signedUrl) return functionData.signedUrl;

  return fallbackUrl;
};

export const getJobAttachmentPublicUrl = (path: string): string => {
  const { data } = supabase.storage.from(JOB_ATTACHMENTS_BUCKET).getPublicUrl(path);
  return data.publicUrl;
};

export const useJobAttachmentDisplayUrls = <T extends AttachmentLike>(attachments: T[]) => {
  const [displayUrls, setDisplayUrls] = useState<Record<string, string>>({});
  const signature = useMemo(
    () => attachments.map((attachment, index) => [
      attachment.id || String(index),
      attachment.path || '',
      attachment.url || '',
    ].join('|')).join('::'),
    [attachments],
  );

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const entries = await Promise.all(
        attachments.map(async (attachment, index) => {
          const key = attachment.id || attachment.url || String(index);
          const signedUrl = await createJobAttachmentSignedUrl(attachment);
          return [key, signedUrl || attachment.url || ''] as const;
        }),
      );

      if (cancelled) return;

      const next: Record<string, string> = {};
      for (const [key, url] of entries) next[key] = url;
      setDisplayUrls(next);
    })();

    return () => {
      cancelled = true;
    };
  }, [signature]);

  return displayUrls;
};

export const getAttachmentDisplayUrl = <T extends AttachmentLike>(
  attachment: T,
  displayUrls: Record<string, string>,
  index?: number,
): string => {
  const key = attachment.id || attachment.url || (index !== undefined ? String(index) : '');
  return displayUrls[key] || attachment.url || '';
};