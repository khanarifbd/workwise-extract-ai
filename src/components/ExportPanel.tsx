import { useState } from 'react';
import { Job } from '@/types/job';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  FileDown, 
  Printer, 
  Calendar,
  FileText,
  X
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface ExportPanelProps {
  jobs: Job[];
  onClose: () => void;
}

export const ExportPanel = ({ jobs, onClose }: ExportPanelProps) => {
  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  const [exportType, setExportType] = useState<'all' | 'summary'>('all');

  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const currentYear = new Date().getFullYear();

  const filteredJobs = selectedMonth === 'all' 
    ? jobs 
    : jobs.filter(job => {
        const jobMonth = job.dateIssued.getMonth();
        return jobMonth === parseInt(selectedMonth);
      });

  const generatePDFContent = () => {
    let content = `
ALLSAINTS JOB REPORT
Generated: ${new Date().toLocaleDateString()}
${selectedMonth !== 'all' ? `Month: ${months[parseInt(selectedMonth)]} ${currentYear}` : 'All Jobs'}
Total Jobs: ${filteredJobs.length}

${'='.repeat(80)}

`;

    filteredJobs.forEach((job, index) => {
      content += `
JOB #${index + 1}: ${job.jobNumber}
${'-'.repeat(40)}
Name: ${job.name}
Address: ${job.address}
Phone: ${job.phoneNumber}
Team: ${job.team || 'Unassigned'}
Status: ${job.isCompleted ? 'COMPLETED' : `In Progress (${job.progress}%)`}

Summary: ${job.summaryOfWorks}

Works:
${job.workItems.map(w => `  • ${w.description} [${w.sorCode}] - Qty: ${w.qty}, Cost: £${w.cost}`).join('\n')}

${job.additionalWorks.length > 0 ? `Additional Works:\n${job.additionalWorks.map(w => `  • ${w.description} [${w.sorCode}] - Qty: ${w.qty}, Cost: £${w.cost}`).join('\n')}` : ''}

Dates:
  Issued: ${job.dateIssued.toLocaleDateString()}
  ${job.startDate ? `Start: ${job.startDate.toLocaleDateString()}` : ''}
  ${job.completionDate ? `Completed: ${job.completionDate.toLocaleDateString()}` : ''}

${'='.repeat(80)}
`;
    });

    return content;
  };

  const handleExport = () => {
    const content = generatePDFContent();
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `allsaints-jobs-${selectedMonth === 'all' ? 'all' : months[parseInt(selectedMonth)]}-${currentYear}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    const content = generatePDFContent();
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>Allsaints Job Report</title>
            <style>
              body { font-family: monospace; white-space: pre-wrap; padding: 20px; }
            </style>
          </head>
          <body>${content}</body>
        </html>
      `);
      printWindow.document.close();
      printWindow.print();
    }
  };

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md animate-scale-in">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold">Export Jobs</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-muted rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div>
            <label className="text-sm font-medium mb-2 block">Filter by Month</label>
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger>
                <SelectValue placeholder="Select month" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Jobs</SelectItem>
                {months.map((month, index) => (
                  <SelectItem key={index} value={index.toString()}>
                    {month} {currentYear}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="p-4 bg-muted/30 rounded-xl">
            <div className="flex items-center gap-3 mb-3">
              <FileText className="w-5 h-5 text-primary" />
              <span className="font-medium">Export Preview</span>
            </div>
            <div className="text-sm text-muted-foreground space-y-1">
              <p>Jobs to export: <span className="font-semibold text-foreground">{filteredJobs.length}</span></p>
              <p>Completed: <span className="font-semibold text-success">{filteredJobs.filter(j => j.isCompleted).length}</span></p>
              <p>In Progress: <span className="font-semibold text-warning">{filteredJobs.filter(j => !j.isCompleted).length}</span></p>
            </div>
          </div>

          <div className="flex gap-3">
            <Button onClick={handleExport} className="flex-1">
              <FileDown className="w-4 h-4 mr-2" />
              Download Report
            </Button>
            <Button variant="outline" onClick={handlePrint} className="flex-1">
              <Printer className="w-4 h-4 mr-2" />
              Print
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
