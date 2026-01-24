import { useCallback, useState } from 'react';
import { Upload, FileText, FileSpreadsheet, Image, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export type InsulationFileType = 'pdf' | 'excel' | 'image';

interface InsulationFileDropZoneProps {
  onFileUpload: (file: File, type: InsulationFileType, textContent?: string) => void;
  isProcessing: boolean;
}

const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const ACCEPTED_EXCEL_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // xlsx
  'application/vnd.ms-excel', // xls
  'text/csv', // csv
];

const getFileType = (file: File): InsulationFileType | null => {
  if (file.type === 'application/pdf') return 'pdf';
  if (ACCEPTED_EXCEL_TYPES.includes(file.type)) return 'excel';
  if (file.name.endsWith('.csv')) return 'excel';
  if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) return 'excel';
  if (ACCEPTED_IMAGE_TYPES.includes(file.type)) return 'image';
  return null;
};

const getFileIcon = (type: InsulationFileType | null) => {
  switch (type) {
    case 'excel':
      return <FileSpreadsheet className="w-8 h-8 text-success" />;
    case 'pdf':
      return <FileText className="w-8 h-8 text-success" />;
    case 'image':
      return <Image className="w-8 h-8 text-success" />;
    default:
      return <FileText className="w-8 h-8 text-success" />;
  }
};

// Parse Excel/CSV content to text for AI processing
const parseExcelToText = async (file: File): Promise<string> => {
  const ExcelJS = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  
  if (file.name.endsWith('.csv') || file.type === 'text/csv') {
    // Read CSV as text
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        resolve(e.target?.result as string || '');
      };
      reader.readAsText(file);
    });
  }
  
  // Read Excel file
  const buffer = await file.arrayBuffer();
  await workbook.xlsx.load(buffer);
  
  let textContent = '';
  
  workbook.eachSheet((worksheet, sheetId) => {
    textContent += `\n=== Sheet: ${worksheet.name} ===\n`;
    
    // Get headers from first row
    const headers: string[] = [];
    worksheet.getRow(1).eachCell((cell, colNumber) => {
      headers[colNumber] = cell.text || `Column${colNumber}`;
    });
    
    // Process each row
    worksheet.eachRow((row, rowNumber) => {
      const rowData: string[] = [];
      row.eachCell((cell, colNumber) => {
        const header = headers[colNumber] || `Col${colNumber}`;
        rowData.push(`${header}: ${cell.text}`);
      });
      textContent += `Row ${rowNumber}: ${rowData.join(' | ')}\n`;
    });
  });
  
  return textContent;
};

export const InsulationFileDropZone = ({ onFileUpload, isProcessing }: InsulationFileDropZoneProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedFileType, setSelectedFileType] = useState<InsulationFileType | null>(null);
  const [isParsingExcel, setIsParsingExcel] = useState(false);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setIsDragging(true);
    } else if (e.type === 'dragleave') {
      setIsDragging(false);
    }
  }, []);

  const processFile = useCallback(async (file: File) => {
    const fileType = getFileType(file);
    if (!fileType) return;
    
    setSelectedFile(file);
    setSelectedFileType(fileType);
    
    if (fileType === 'excel') {
      setIsParsingExcel(true);
      try {
        const textContent = await parseExcelToText(file);
        onFileUpload(file, fileType, textContent);
      } catch (error) {
        console.error('Error parsing Excel:', error);
        onFileUpload(file, fileType);
      } finally {
        setIsParsingExcel(false);
      }
    } else {
      onFileUpload(file, fileType);
    }
  }, [onFileUpload]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files[0]) {
      processFile(files[0]);
    }
  }, [processFile]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files[0]) {
      processFile(files[0]);
    }
  }, [processFile]);

  const clearFile = () => {
    setSelectedFile(null);
    setSelectedFileType(null);
  };

  const isLoading = isProcessing || isParsingExcel;

  return (
    <div
      className={cn(
        "relative border-2 border-dashed rounded-xl p-8 transition-all duration-300 cursor-pointer group",
        isDragging 
          ? "border-primary bg-primary/5 scale-[1.02]" 
          : "border-border hover:border-primary/50 hover:bg-muted/30",
        isLoading && "pointer-events-none opacity-70"
      )}
      onDragEnter={handleDrag}
      onDragLeave={handleDrag}
      onDragOver={handleDrag}
      onDrop={handleDrop}
      onClick={() => document.getElementById('insulation-file-input')?.click()}
    >
      <input
        id="insulation-file-input"
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,.xlsx,.xls,.csv"
        onChange={handleFileSelect}
        className="hidden"
      />

      <div className="flex flex-col items-center justify-center gap-4 text-center">
        {isLoading ? (
          <>
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
            <div>
              <p className="font-semibold text-foreground">
                {isParsingExcel ? 'Parsing spreadsheet...' : 'Processing document...'}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Extracting insulation jobs with AI
              </p>
            </div>
          </>
        ) : selectedFile ? (
          <>
            <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center">
              {getFileIcon(selectedFileType)}
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
              <p className="font-semibold text-foreground">Drop your document here</p>
              <p className="text-sm text-muted-foreground mt-1">
                Upload PDF, Excel, CSV, or image files
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                Lists of jobs will be automatically detected and created separately
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <FileText className="w-3 h-3" />
                PDF
              </span>
              <span className="flex items-center gap-1">
                <FileSpreadsheet className="w-3 h-3" />
                Excel / CSV
              </span>
              <span className="flex items-center gap-1">
                <Image className="w-3 h-3" />
                Images
              </span>
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
