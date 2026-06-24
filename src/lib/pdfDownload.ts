import jsPDF from 'jspdf';

const isIOSLikeDevice = () => {
  if (typeof navigator === 'undefined') return false;
  const userAgent = navigator.userAgent || '';
  const platform = navigator.platform || '';
  const maxTouchPoints = navigator.maxTouchPoints || 0;
  return /iPad|iPhone|iPod/i.test(userAgent)
    || (platform === 'MacIntel' && maxTouchPoints > 1);
};

const isInIframe = () => {
  try { return typeof window !== 'undefined' && window.self !== window.top; } catch { return true; }
};

/**
 * Pre-open a blank tab synchronously during the user gesture. Required on iOS
 * Safari, and useful inside sandboxed iframes (Lovable preview) where a later
 * async window.open() will be blocked. Returns null if blocked.
 */
export const preparePDFWindow = (_options?: { force?: boolean }): Window | null => {
  if (typeof window === 'undefined') return null;
  try {
    const w = window.open('', '_blank');
    if (w) {
      try {
        w.document.write('<!doctype html><title>Preparing PDF…</title><body style="font-family:system-ui;padding:24px;color:#475569">Preparing PDF…</body>');
      } catch { /* cross-origin write may fail, fine */ }
    }
    return w;
  } catch {
    return null;
  }
};

/**
 * Visible fallback when every automatic delivery path is blocked (sandboxed
 * iframes without allow-downloads / allow-popups). We render a fixed-position
 * overlay with a user-clickable link — the click happens from a fresh user
 * gesture so the browser allows it.
 */
function showManualDownloadOverlay(url: string, filename: string) {
  if (typeof document === 'undefined') return;
  const existing = document.getElementById('lov-pdf-manual-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'lov-pdf-manual-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.55);z-index:2147483647;display:flex;align-items:center;justify-content:center;font-family:system-ui,-apple-system,sans-serif;';

  const card = document.createElement('div');
  card.style.cssText = 'background:#fff;border-radius:12px;padding:24px;max-width:420px;box-shadow:0 24px 64px rgba(0,0,0,.25);text-align:left;';
  card.innerHTML = `
    <div style="font-weight:600;font-size:16px;margin-bottom:8px;color:#0f172a">Your PDF is ready</div>
    <div style="font-size:13px;color:#475569;margin-bottom:16px">Click the button below to download or open it. (Your browser blocked the automatic download.)</div>
  `;
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = `⬇ Download ${filename}`;
  link.style.cssText = 'display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-size:14px;font-weight:600;margin-right:8px';

  const closeBtn = document.createElement('button');
  closeBtn.textContent = 'Close';
  closeBtn.style.cssText = 'background:transparent;border:1px solid #cbd5e1;color:#334155;padding:10px 16px;border-radius:8px;font-size:14px;cursor:pointer';
  closeBtn.onclick = () => overlay.remove();

  card.appendChild(link);
  card.appendChild(closeBtn);
  overlay.appendChild(card);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

/**
 * Reliable PDF delivery across desktop, iOS, native apps, and sandboxed iframes.
 *
 * Order:
 *  1. iOS: use the pre-opened tab + data URL (Safari requirement)
 *  2. doc.save() — jsPDF's own anchor-download path (best on real browsers/native)
 *  3. Pre-opened window with blob URL (sandboxed iframes)
 *  4. Manual overlay with a clickable link (last-resort visible fallback)
 */
export function downloadPDF(doc: jsPDF, filename: string, options?: { targetWindow?: Window | null }) {
  const blob = doc.output('blob');
  if (!blob || blob.size === 0) throw new Error('Generated PDF is empty');

  const preOpenedWindow = options?.targetWindow ?? null;
  const iOS = isIOSLikeDevice();

  // 1. iOS path — pre-opened tab + data URL
  if (iOS) {
    const iosWindow = preOpenedWindow ?? window.open('', '_blank');
    if (iosWindow) {
      try {
        const dataUrl = doc.output('dataurlstring', { filename });
        iosWindow.location.replace(dataUrl);
        return;
      } catch (err) {
        console.warn('[downloadPDF] iOS data URL failed, falling back', err);
      }
    }
  }

  const url = URL.createObjectURL(blob);
  const revoke = () => setTimeout(() => URL.revokeObjectURL(url), 180000);

  // 2. Pre-opened window path (works inside Lovable's sandboxed iframe)
  if (preOpenedWindow && !preOpenedWindow.closed) {
    try {
      preOpenedWindow.location.replace(url);
      revoke();
      return;
    } catch (err) {
      console.warn('[downloadPDF] pre-opened window failed', err);
    }
  }

  // 3. jsPDF's native save (most reliable on standalone pages and native apps)
  let nativeSaveWorked = false;
  if (!isInIframe()) {
    try {
      doc.save(filename);
      nativeSaveWorked = true;
    } catch (err) {
      console.warn('[downloadPDF] doc.save failed', err);
    }
  }
  if (nativeSaveWorked) { revoke(); return; }

  // 4. Manual anchor click
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

  // 5. Try popping a new tab
  let popupOpened = false;
  try {
    const win = window.open(url, '_blank', 'noopener,noreferrer');
    if (win) popupOpened = true;
  } catch (err) {
    console.warn('[downloadPDF] window.open failed', err);
  }

  // 6. Final visible fallback for sandboxed iframes / blocked popups
  if (!popupOpened && isInIframe()) {
    showManualDownloadOverlay(url, filename);
  }

  revoke();
}
