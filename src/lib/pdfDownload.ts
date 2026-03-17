import jsPDF from 'jspdf';

/**
 * Reliable PDF download that works in sandboxed/iframe environments
 * where doc.save() can silently fail.
 */
export function downloadPDF(doc: jsPDF, filename: string) {
  const blob = doc.output('blob');
  if (!blob || blob.size === 0) {
    throw new Error('Generated PDF is empty');
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = filename;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.style.display = 'none';

  document.body.appendChild(link);
  link.click();

  // Keep the URL alive briefly for slower browsers/webviews before cleanup.
  window.setTimeout(() => {
    if (document.body.contains(link)) {
      document.body.removeChild(link);
    }
    URL.revokeObjectURL(url);
  }, 30000);
}
