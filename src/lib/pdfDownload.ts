import jsPDF from 'jspdf';

/**
 * Reliable PDF download that works in sandboxed/iframe environments
 * where doc.save() silently fails.
 */
export function downloadPDF(doc: jsPDF, filename: string) {
  const blob = doc.output('blob');
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
