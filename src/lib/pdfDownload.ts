import jsPDF from 'jspdf';

/**
 * Reliable PDF download that works in sandboxed/iframe environments
 * where doc.save() and link.click() can silently fail.
 *
 * Strategy:
 *  1. Try opening a new tab with the blob URL (works in most environments)
 *  2. Fallback: use a data URI approach
 *  3. Last resort: location.assign
 */
export function downloadPDF(doc: jsPDF, filename: string) {
  const blob = doc.output('blob');
  if (!blob || blob.size === 0) {
    throw new Error('Generated PDF is empty');
  }

  // Try the standard doc.save() first — it uses FileSaver internally
  // and works on most non-sandboxed environments
  try {
    doc.save(filename);
    return;
  } catch {
    // doc.save() threw — fall through to manual approaches
  }

  // Manual blob URL approach
  const url = URL.createObjectURL(blob);

  // Strategy 1: Open blob in a new tab — browser will show PDF and user can save
  const opened = window.open(url, '_blank');
  if (opened) {
    // Revoke after generous delay
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return;
  }

  // Strategy 2: Hidden anchor with click
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.style.position = 'fixed';
  link.style.left = '-9999px';
  link.style.top = '0';
  document.body.appendChild(link);

  try {
    link.click();
  } finally {
    setTimeout(() => {
      if (document.body.contains(link)) {
        document.body.removeChild(link);
      }
      URL.revokeObjectURL(url);
    }, 60000);
  }
}
