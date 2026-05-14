import jsPDF from 'jspdf';
import { downloadPDF, preparePDFWindow } from './src/lib/pdfDownload';

const calls: string[] = [];
const openedWindow = {
  closed: false,
  location: {
    replace(value: string) {
      calls.push(value.startsWith('data:application/pdf') ? 'dataurl' : value.startsWith('blob:') ? 'bloburl' : 'other');
    }
  },
  close() {
    this.closed = true;
    calls.push('closed');
  }
};

(globalThis as any).navigator = {
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
  platform: 'iPhone',
  maxTouchPoints: 5,
};

(globalThis as any).window = {
  open: () => openedWindow,
  top: null,
  self: null,
  location: { assign: (_v: string) => calls.push('assign') },
  URL: URL,
};
(globalThis as any).window.top = (globalThis as any).window;
(globalThis as any).window.self = (globalThis as any).window;
(globalThis as any).document = {
  body: {
    appendChild: () => {},
    removeChild: () => {},
  },
  createElement: () => ({
    click: () => calls.push('anchor-click')
  }),
};
(globalThis as any).URL.createObjectURL = () => 'blob:test';
(globalThis as any).URL.revokeObjectURL = () => {};

const prepped = preparePDFWindow();
if (prepped !== openedWindow) throw new Error('preparePDFWindow did not pre-open iOS window');

const doc = new jsPDF();
doc.text('Fan PDF test', 10, 10);
downloadPDF(doc, 'fan-test.pdf', { targetWindow: prepped as any });

if (!calls.includes('dataurl')) {
  throw new Error(`Expected iOS data URL delivery, got: ${calls.join(', ')}`);
}

console.log('verified', calls.join(','));
