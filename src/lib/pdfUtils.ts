import * as pdfjsLib from 'pdfjs-dist';

// Configure pdf.js worker - use CDN for reliable worker loading
// This avoids the "fake worker" fallback that can freeze the main thread
const PDFJS_VERSION = '5.4.449';
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.mjs`;

export const extractTextFromPDF = async (file: File): Promise<string> => {
  // Add a timeout to prevent hanging indefinitely
  const timeoutMs = 30000; // 30 seconds
  
  const extractionPromise = (async () => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      
      const textParts: string[] = [];
      
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .map((item: any) => item.str)
          .join(' ');
        textParts.push(pageText);
      }
      
      const fullText = textParts.join('\n\n');
      
      if (!fullText.trim()) {
        throw new Error('PDF contains no extractable text. It may be a scanned image - try uploading as an image instead.');
      }
      
      return fullText;
    } catch (error) {
      console.error('Error extracting text from PDF:', error);
      throw new Error(`Failed to extract PDF text: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  })();

  // Race between extraction and timeout
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('PDF extraction timed out after 30 seconds. The file may be too large or corrupted.')), timeoutMs);
  });

  return Promise.race([extractionPromise, timeoutPromise]);
};
