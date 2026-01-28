import { useCallback, useState } from 'react';
import { Upload, FileText, Image, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type FileType = 'pdf' | 'image';

interface FileDropZoneProps {
  onFileUpload: (file: File, type: FileType) => void;
  onMultipleFilesUpload?: (files: Array<{ file: File; type: FileType }>) => void;
  isProcessing: boolean;
  allowMultiple?: boolean;
}

const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const ACCEPTED_TYPES = ['application/pdf', ...ACCEPTED_IMAGE_TYPES];

const getFileType = (file: File): FileType | null => {
  if (file.type === 'application/pdf') return 'pdf';
  if (ACCEPTED_IMAGE_TYPES.includes(file.type)) return 'image';
  return null;
};

export const FileDropZone = ({ onFileUpload, onMultipleFilesUpload, isProcessing, allowMultiple = false }: FileDropZoneProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setIsDragging(true);
    } else if (e.type === 'dragleave') {
      setIsDragging(false);
    }
  }, []);

  const processFiles = useCallback((files: FileList) => {
    const validFiles: Array<{ file: File; type: FileType }> = [];
    
    Array.from(files).forEach(file => {
      const fileType = getFileType(file);
      if (fileType) {
        validFiles.push({ file, type: fileType });
      }
    });

    if (validFiles.length === 0) return;

    if (allowMultiple && onMultipleFilesUpload && validFiles.length > 1) {
      setSelectedFiles(validFiles.map(f => f.file));
      onMultipleFilesUpload(validFiles);
    } else if (validFiles.length >= 1) {
      setSelectedFiles([validFiles[0].file]);
      onFileUpload(validFiles[0].file, validFiles[0].type);
    }
  }, [onFileUpload, onMultipleFilesUpload, allowMultiple]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      processFiles(files);
    }
  }, [processFiles]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      processFiles(files);
    }
  }, [processFiles]);

  const clearFiles = () => {
    setSelectedFiles([]);
  };

  const isImage = selectedFiles.length === 1 && ACCEPTED_IMAGE_TYPES.includes(selectedFiles[0].type);

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
      onClick={() => document.getElementById('file-input')?.click()}
    >
      <input
        id="file-input"
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,.webp,.gif"
        onChange={handleFileSelect}
        multiple={allowMultiple}
        className="hidden"
      />

      <div className="flex flex-col items-center justify-center gap-4 text-center">
        {isProcessing ? (
          <>
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
            <div>
              <p className="font-semibold text-foreground">Processing {selectedFiles.length > 1 ? 'files' : 'file'}...</p>
              <p className="text-sm text-muted-foreground mt-1">Extracting job details with AI</p>
            </div>
          </>
        ) : selectedFiles.length > 0 ? (
          <>
            <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center">
              {selectedFiles.length > 1 ? (
                <span className="text-2xl font-bold text-success">{selectedFiles.length}</span>
              ) : isImage ? (
                <Image className="w-8 h-8 text-success" />
              ) : (
                <FileText className="w-8 h-8 text-success" />
              )}
            </div>
            <div>
              <p className="font-semibold text-foreground">
                {selectedFiles.length > 1 
                  ? `${selectedFiles.length} files selected`
                  : selectedFiles[0].name
                }
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {selectedFiles.length > 1 
                  ? selectedFiles.map(f => f.name).join(', ').substring(0, 50) + (selectedFiles.length > 2 ? '...' : '')
                  : `${(selectedFiles[0].size / 1024 / 1024).toFixed(2)} MB`
                }
              </p>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                clearFiles();
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
              <p className="font-semibold text-foreground">
                {allowMultiple ? 'Drop your files here' : 'Drop your file here'}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                or click to browse {allowMultiple ? '(supports multiple files)' : ''}
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <FileText className="w-3 h-3" />
                PDF
              </span>
              <span className="flex items-center gap-1">
                <Image className="w-3 h-3" />
                Images (JPG, PNG, WebP)
              </span>
            </div>
            {allowMultiple && (
              <p className="text-xs text-muted-foreground bg-muted/50 px-3 py-1 rounded-full">
                💡 Select multiple files for bulk processing
              </p>
            )}
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
