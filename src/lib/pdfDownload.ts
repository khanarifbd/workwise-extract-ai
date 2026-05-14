import jsPDF from 'jspdf';

/**
 * Reliable PDF delivery across desktop, mobile, and sandboxed iframes (Lovable preview).
 *
 * We try BOTH an anchor `download` click AND opening the blob in a new tab.
 * Sandboxed iframes without `allow-downloads` silently swallow the anchor click,
 * and some mobile browsers block `window.open`. Doing both guarantees the user
 * sees the PDF one way or the other.
 */
export function downloadPDF(doc: jsPDF, filename: string) {
  const blob = doc.output('blob');
  if (!blob || blob.size === 0) {
    throw new Error('Generated PDF is empty');
  }

  const url = URL.createObjectURL(blob);

  // Path A: anchor download (works on most desktop browsers, native apps)
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
  } catch (err) {
    console.warn('[downloadPDF] anchor download failed', err);
  }

  // Path B: open in new tab (visible fallback inside sandboxed iframes)
  try {
    const win = window.open(url, '_blank', 'noopener,noreferrer');
    if (!win) {
      // Popup blocked — last resort: navigate top window
      try {
        if (window.top && window.top !== window.self) {
          (window.top as Window).location.href = url;
        } else {
          window.location.assign(url);
        }
      } catch {
        window.location.assign(url);
      }
    }
  } catch (err) {
    console.warn('[downloadPDF] window.open failed', err);
  }

  // Revoke after a long delay so the new tab has time to load
  setTimeout(() => URL.revokeObjectURL(url), 180000);
}
