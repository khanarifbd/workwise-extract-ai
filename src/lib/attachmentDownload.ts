import JSZip from 'jszip';
import { createJobAttachmentSignedUrl, type AttachmentLike, type AttachmentUrlContext } from '@/lib/attachmentUrls';

export type DownloadableAttachment = AttachmentLike & { name?: string | null };

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

const safeName = (name: string) => name.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'attachment';

export async function fetchAttachmentBlob(att: DownloadableAttachment, ctx: AttachmentUrlContext = {}): Promise<Blob> {
  const url = await createJobAttachmentSignedUrl(att, ctx);
  if (!url) throw new Error('No file address');
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  return res.blob();
}

export async function downloadAttachment(att: DownloadableAttachment, ctx: AttachmentUrlContext = {}) {
  const blob = await fetchAttachmentBlob(att, ctx);
  downloadBlob(blob, safeName(att.name || 'attachment'));
}

/** Fetches all attachments (4 at a time) and saves them as one ZIP. Returns number of failures. */
export async function downloadAttachmentsZip(
  atts: DownloadableAttachment[],
  zipName: string,
  ctx: AttachmentUrlContext = {},
  onProgress?: (done: number, total: number) => void,
): Promise<{ ok: number; failed: number }> {
  const zip = new JSZip();
  const used = new Set<string>();
  let done = 0, failed = 0, ok = 0, i = 0;
  const worker = async () => {
    while (i < atts.length) {
      const idx = i++;
      const att = atts[idx];
      try {
        const blob = await fetchAttachmentBlob(att, ctx);
        let name = safeName(att.name || `file-${idx + 1}`);
        if (used.has(name)) name = `${String(idx + 1).padStart(3, '0')}-${name}`;
        used.add(name);
        zip.file(name, blob);
        ok++;
      } catch { failed++; }
      onProgress?.(++done, atts.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, atts.length) }, worker));
  if (ok > 0) {
    const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
    downloadBlob(blob, safeName(zipName));
  }
  return { ok, failed };
}
