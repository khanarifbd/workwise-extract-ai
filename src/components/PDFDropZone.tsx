import { useCallback, useState } from 'react';
import { Upload, FileText, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PDFDropZoneProps {
  onFileUpload: (file: File) => void;
  isProcessing: boolean;
}

export const PDFDropZone = ({ onFileUpload, isProcessing }: PDFDropZoneProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setIsDragging(true);
    } else if (e.type === 'dragleave') {
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files[0] && files[0].type === 'application/pdf') {
      setSelectedFile(files[0]);
      onFileUpload(files[0]);
    }
  }, [onFileUpload]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files[0]) {
      setSelectedFile(files[0]);
      onFileUpload(files[0]);
    }
  }, [onFileUpload]);

  const clearFile = () => {
    setSelectedFile(null);
  };

  return (
    <div
      className={cn(
        "relative border-2 border-dashed rounded-xl p-8 transition-all duration-300 cursor-pointer group",
        isDragging 
          ? "border-primary bg-primary/5 scale-[1.02]" 
          : "border-border hover:border-primary/50 hover:bg-muted/30",
        isProcessing && "pointer-events-none opacity-70"
      )}
      onDragEnter={handleDrag}
      onDragLeave={handleDrag}
      onDragOver={handleDrag}
      onDrop={handleDrop}
      onClick={() => document.getElementById('pdf-input')?.click()}
    >
      <input
        id="pdf-input"
        type="file"
        accept=".pdf"
        onChange={handleFileSelect}
        className="hidden"
      />

      <div className="flex flex-col items-center justify-center gap-4 text-center">
        {isProcessing ? (
          <>
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
            <div>
              <p className="font-semibold text-foreground">Processing PDF...</p>
              <p className="text-sm text-muted-foreground mt-1">Extracting job details</p>
            </div>
          </>
        ) : selectedFile ? (
          <>
            <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center">
              <FileText className="w-8 h-8 text-success" />
            </div>
            <div>
              <p className="font-semibold text-foreground">{selectedFile.name}</p>
              <p className="text-sm text-muted-foreground mt-1">
                {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
              </p>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                clearFile();
              }}
              className="absolute top-4 right-4 p-1 rounded-full hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </>
        ) : (
          <>
            <div className={cn(
              "w-16 h-16 rounded-full bg-muted flex items-center justify-center transition-all duration-300",
              "group-hover:bg-primary/10 group-hover:scale-110"
            )}>
              <Upload className={cn(
                "w-8 h-8 text-muted-foreground transition-colors",
                "group-hover:text-primary"
              )} />
            </div>
            <div>
              <p className="font-semibold text-foreground">Drop your PDF here</p>
              <p className="text-sm text-muted-foreground mt-1">
                or click to browse files
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <FileText className="w-3 h-3" />
              <span>PDF files only</span>
            </div>
          </>
        )}
      </div>

      {isDragging && (
        <div className="absolute inset-0 bg-primary/5 rounded-xl flex items-center justify-center">
          <div className="bg-primary text-primary-foreground px-4 py-2 rounded-lg font-medium shadow-glow">
            Drop to upload
          </div>
        </div>
      )}
    </div>
  );
};
