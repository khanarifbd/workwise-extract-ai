import jsPDF from 'jspdf';

/**
 * Reliable PDF download that works in sandboxed/iframe environments
 * where doc.save() and link.click() can silently fail.
 *
 * Strategy:
 *  1. Open blob in a new browser tab (most reliable in sandboxed/iframe contexts)
 *  2. Fallback: hidden anchor link.click()
 *  3. Last resort: window.location.assign
 */
export function downloadPDF(doc: jsPDF, filename: string) {
  const blob = doc.output('blob');
  if (!blob || blob.size === 0) {
    throw new Error('Generated PDF is empty');
  }

  const url = URL.createObjectURL(blob);

  // Strategy 1: Open blob in a new tab — user sees the PDF and can save/download
  // This is the most reliable approach in sandboxed iframes where download attr is blocked
  const opened = window.open(url, '_blank');
  if (opened) {
    setTimeout(() => URL.revokeObjectURL(url), 120000);
    return;
  }

  // Strategy 2: Hidden anchor click (works on non-sandboxed desktop browsers)
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.style.position = 'fixed';
  link.style.left = '-9999px';
  document.body.appendChild(link);

  try {
    link.click();
  } catch {
    // Strategy 3: Navigate to the blob URL directly
    window.location.assign(url);
  } finally {
    setTimeout(() => {
      if (document.body.contains(link)) document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, 120000);
  }
}
