import { useState } from 'react';
import { Job } from '@/types/job';
import { Button } from '@/components/ui/button';
import { 
  FileDown, 
  Printer, 
  FileText,
  FileSpreadsheet,
  X
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { format } from 'date-fns';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

interface ExportPanelProps {
  jobs: Job[];
  onClose: () => void;
  isFanCategory?: boolean;
}

export const ExportPanel = ({ jobs, onClose, isFanCategory = false }: ExportPanelProps) => {
  const [selectedMonth, setSelectedMonth] = useState<string>('all');

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

  const handleExportPDF = () => {
    const doc = new jsPDF();
    
    // Title
    doc.setFontSize(18);
    doc.text(isFanCategory ? 'FAN JOBS REPORT' : 'ALLSAINTS JOB REPORT', 14, 20);
    doc.setFontSize(10);
    doc.text(`Generated: ${format(new Date(), 'dd/MM/yyyy')}`, 14, 28);
    doc.text(
      selectedMonth !== 'all' 
        ? `Month: ${months[parseInt(selectedMonth)]} ${currentYear}` 
        : 'All Jobs',
      14, 34
    );
    doc.text(`Total Jobs: ${filteredJobs.length}`, 14, 40);

    // Table data - different columns for Fan vs DM
    if (isFanCategory) {
      const tableData = filteredJobs.map(job => {
        const fanInfo = job.fanInfo || [];
        const fanSummary = fanInfo.map((f: any) => `${f.quantity || 1}x ${f.fanType || 'Fan'}`).join(', ');
        return [
          job.dateIssued ? format(job.dateIssued, 'dd/MM/yy') : '-',
          job.bookedDate ? format(job.bookedDate, 'dd/MM/yy') : '-',
          job.jobNumber,
          `${job.name}${job.phoneNumber ? `\n${job.phoneNumber}` : ''}`,
          job.summaryOfWorks || job.description || '-',
          fanSummary || '-',
          job.team || 'Unassigned'
        ];
      });

      autoTable(doc, {
        head: [['Issued', 'Booked', 'Job', 'Name/Contact', 'Description', 'Fan', 'Status']],
        body: tableData,
        startY: 48,
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [59, 130, 246] },
        columnStyles: {
          3: { cellWidth: 35 },
          4: { cellWidth: 45 },
        }
      });
    } else {
      const tableData = filteredJobs.map(job => [
        job.jobNumber,
        job.name,
        job.address || '-',
        job.team || 'Unassigned',
        `${job.progress}%`,
        job.startDate ? format(job.startDate, 'dd/MM/yy') : '-',
        job.completionDate ? format(job.completionDate, 'dd/MM/yy') : '-',
        job.workItems.map(w => w.sorCode).join(', ') || '-'
      ]);

      autoTable(doc, {
        head: [['Job #', 'Name', 'Address', 'Team', 'Progress', 'Start', 'End', 'SOR Codes']],
        body: tableData,
        startY: 48,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [59, 130, 246] },
      });
    }

    const filename = isFanCategory ? 'fan-jobs' : 'allsaints-jobs';
    doc.save(`${filename}-${selectedMonth === 'all' ? 'all' : months[parseInt(selectedMonth)]}-${currentYear}.pdf`);
  };

  const handleExportExcel = () => {
    let excelData;
    
    if (isFanCategory) {
      excelData = filteredJobs.map(job => {
        const fanInfo = job.fanInfo || [];
        const fanSummary = fanInfo.map((f: any) => `${f.quantity || 1}x ${f.fanType || 'Fan'}`).join(', ');
        return {
          'Issued': job.dateIssued ? format(job.dateIssued, 'dd/MM/yyyy') : '',
          'Booked': job.bookedDate ? format(job.bookedDate, 'dd/MM/yyyy') : '',
          'Job': job.jobNumber,
          'Name': job.name,
          'Contact': job.phoneNumber || '',
          'Description': job.summaryOfWorks || job.description || '',
          'Fan': fanSummary,
          'Status': job.team || 'Unassigned'
        };
      });
    } else {
      excelData = filteredJobs.map(job => ({
        'Job Number': job.jobNumber,
        'Name': job.name,
        'Address': job.address || '',
        'Phone': job.phoneNumber || '',
        'Team': job.team || 'Unassigned',
        'Progress': `${job.progress}%`,
        'Status': job.isCompleted ? 'Completed' : 'In Progress',
        'Date Issued': format(job.dateIssued, 'dd/MM/yyyy'),
        'Start Date': job.startDate ? format(job.startDate, 'dd/MM/yyyy') : '',
        'Completion Date': job.completionDate ? format(job.completionDate, 'dd/MM/yyyy') : '',
        'Summary': job.summaryOfWorks || '',
        'SOR Codes': job.workItems.map(w => w.sorCode).join(', '),
        'Work Items': job.workItems.map(w => `${w.description} (${w.sorCode})`).join('; '),
        'Total Cost': `£${job.workItems.reduce((sum, w) => sum + w.cost, 0).toFixed(2)}`
      }));
    }

    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, isFanCategory ? 'Fan Jobs' : 'Jobs');
    
    // Auto-size columns
    const maxWidth = 50;
    const colWidths = Object.keys(excelData[0] || {}).map(key => ({
      wch: Math.min(maxWidth, Math.max(key.length, 10))
    }));
    worksheet['!cols'] = colWidths;

    const filename = isFanCategory ? 'fan-jobs' : 'allsaints-jobs';
    XLSX.writeFile(workbook, `${filename}-${selectedMonth === 'all' ? 'all' : months[parseInt(selectedMonth)]}-${currentYear}.xlsx`);
  };

  const handlePrint = () => {
    const printContent = `
      <html>
        <head>
          <title>Allsaints Job Report</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            h1 { color: #333; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 12px; }
            th { background-color: #3b82f6; color: white; }
            tr:nth-child(even) { background-color: #f9fafb; }
            .header { margin-bottom: 20px; }
            .meta { color: #666; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>ALLSAINTS JOB REPORT</h1>
            <p class="meta">Generated: ${format(new Date(), 'dd/MM/yyyy')}</p>
            <p class="meta">${selectedMonth !== 'all' ? `Month: ${months[parseInt(selectedMonth)]} ${currentYear}` : 'All Jobs'}</p>
            <p class="meta">Total Jobs: ${filteredJobs.length}</p>
          </div>
          <table>
            <thead>
              <tr>
                <th>Job #</th>
                <th>Name</th>
                <th>Address</th>
                <th>Team</th>
                <th>Progress</th>
                <th>Start</th>
                <th>End</th>
              </tr>
            </thead>
            <tbody>
              ${filteredJobs.map(job => `
                <tr>
                  <td>${job.jobNumber}</td>
                  <td>${job.name}</td>
                  <td>${job.address || '-'}</td>
                  <td>${job.team || 'Unassigned'}</td>
                  <td>${job.progress}%</td>
                  <td>${job.startDate ? format(job.startDate, 'dd/MM/yy') : '-'}</td>
                  <td>${job.completionDate ? format(job.completionDate, 'dd/MM/yy') : '-'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(printContent);
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

          <div className="space-y-2">
            <Button onClick={handleExportPDF} className="w-full">
              <FileDown className="w-4 h-4 mr-2" />
              Download PDF Report
            </Button>
            <Button variant="outline" onClick={handleExportExcel} className="w-full">
              <FileSpreadsheet className="w-4 h-4 mr-2" />
              Download Excel
            </Button>
            <Button variant="ghost" onClick={handlePrint} className="w-full">
              <Printer className="w-4 h-4 mr-2" />
              Print
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
