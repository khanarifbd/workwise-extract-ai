import * as pdfjsLib from 'pdfjs-dist';
import PDFWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = PDFWorker;

export const extractTextFromPDF = async (file: File): Promise<string> => {
  const timeoutMs = 30000;
  
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

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('PDF extraction timed out after 30 seconds.')), timeoutMs);
  });

  return Promise.race([extractionPromise, timeoutPromise]);
};
