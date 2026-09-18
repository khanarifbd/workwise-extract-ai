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
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.65);z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:16px;font-family:system-ui,-apple-system,sans-serif;';

  const card = document.createElement('div');
  card.style.cssText = 'background:#fff;border-radius:12px;width:min(900px,100%);height:min(85vh,100%);display:flex;flex-direction:column;overflow:hidden;box-shadow:0 24px 64px rgba(0,0,0,.35);';

  const bar = document.createElement('div');
  bar.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px;border-bottom:1px solid #e2e8f0;';
  const title = document.createElement('div');
  title.textContent = filename;
  title.style.cssText = 'font-size:14px;font-weight:600;color:#0f172a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';

  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex;gap:8px;flex:none';

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.textContent = 'Download';
  link.style.cssText = 'background:#2563eb;color:#fff;text-decoration:none;padding:8px 14px;border-radius:8px;font-size:13px;font-weight:600';

  const closeBtn = document.createElement('button');
  closeBtn.textContent = 'Close';
  closeBtn.style.cssText = 'background:transparent;border:1px solid #cbd5e1;color:#334155;padding:8px 14px;border-radius:8px;font-size:13px;cursor:pointer';
  closeBtn.onclick = () => overlay.remove();

  const frame = document.createElement('iframe');
  frame.src = url;
  frame.style.cssText = 'border:0;flex:1;width:100%;background:#f1f5f9';

  actions.appendChild(link);
  actions.appendChild(closeBtn);
  bar.appendChild(title);
  bar.appendChild(actions);
  card.appendChild(bar);
  card.appendChild(frame);
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

  // 2. Pre-opened window path (works inside Lovable's sandboxed iframe).
  // Render a real HTML page with a visible download link AND an inline viewer,
  // so the tab is never blank even if the browser refuses to render the blob.
  if (preOpenedWindow && !preOpenedWindow.closed) {
    try {
      const safeName = filename.replace(/[<>"&]/g, '');
      preOpenedWindow.document.open();
      preOpenedWindow.document.write(
        `<!doctype html><html><head><meta charset="utf-8"><title>${safeName}</title></head>` +
        `<body style="margin:0;font-family:system-ui,-apple-system,sans-serif;background:#0f172a;color:#e2e8f0">` +
        `<div style="padding:12px 16px;display:flex;gap:12px;align-items:center;justify-content:space-between">` +
        `<span style="font-size:14px">${safeName}</span>` +
        `<a href="${url}" download="${safeName}" style="background:#2563eb;color:#fff;text-decoration:none;padding:8px 14px;border-radius:8px;font-size:13px;font-weight:600">Download PDF</a>` +
        `</div>` +
        `<iframe src="${url}" style="border:0;width:100%;height:calc(100vh - 56px);background:#fff"></iframe>` +
        `</body></html>`
      );
      preOpenedWindow.document.close();
      revoke();
      return;
    } catch (err) {
      console.warn('[downloadPDF] pre-opened window failed', err);
      try { preOpenedWindow.close(); } catch { /* noop */ }
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
