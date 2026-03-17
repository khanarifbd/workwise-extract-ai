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
  link.rel = 'noopener noreferrer';
  link.style.position = 'fixed';
  link.style.left = '-9999px';
  link.style.top = '0';

  const isIOSLike =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  document.body.appendChild(link);

  try {
    // Primary path: direct download to Downloads on desktop/Android browsers.
    link.click();

    // Fallback for iOS/WebKit where `download` is commonly ignored.
    if (isIOSLike) {
      const opened = window.open(url, '_blank', 'noopener,noreferrer');
      if (!opened) {
        window.location.assign(url);
      }
    }
  } finally {
    // Keep the URL alive briefly for slower browsers/webviews before cleanup.
    window.setTimeout(() => {
      if (document.body.contains(link)) {
        document.body.removeChild(link);
      }
      URL.revokeObjectURL(url);
    }, 30000);
  }
}
