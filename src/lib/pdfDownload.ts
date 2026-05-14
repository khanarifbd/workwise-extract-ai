import jsPDF from 'jspdf';

/**
 * Reliable PDF download that works across desktop, mobile, and sandboxed iframes.
 *
 * Strategy:
 *  1. Anchor `download` click — works in 95% of browsers, triggers a real download.
 *  2. Fallback: open blob in a new tab (sandboxed iframes where download is blocked).
 *  3. Last resort: navigate current window to the blob URL.
 */
export function downloadPDF(doc: jsPDF, filename: string) {
  const blob = doc.output('blob');
  if (!blob || blob.size === 0) {
    throw new Error('Generated PDF is empty');
  }

  const url = URL.createObjectURL(blob);
  const cleanup = () => setTimeout(() => URL.revokeObjectURL(url), 120000);

  // Strategy 1: Anchor click with download attribute (most reliable)
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.rel = 'noopener noreferrer';
    link.style.position = 'fixed';
    link.style.left = '-9999px';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    cleanup();
    return;
  } catch {
    // fall through
  }

  // Strategy 2: Open in new tab
  try {
    const opened = window.open(url, '_blank');
    if (opened) {
      cleanup();
      return;
    }
  } catch {
    // fall through
  }

  // Strategy 3: Navigate current window
  window.location.assign(url);
  cleanup();
}
