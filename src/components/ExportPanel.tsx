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
import ExcelJS from 'exceljs';

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

    // Helper function to extract phone number from description
    const extractPhoneFromDescription = (description: string | undefined): string => {
      if (!description) return '';
      // Match common UK phone patterns
      const phonePatterns = [
        /(?:tel|phone|mob|mobile|contact)?[:\s]*(\+44[\s.-]?\d{4}[\s.-]?\d{6})/gi,
        /(?:tel|phone|mob|mobile|contact)?[:\s]*(07\d{3}[\s.-]?\d{6})/gi,
        /(?:tel|phone|mob|mobile|contact)?[:\s]*(0\d{3,4}[\s.-]?\d{6,7})/gi,
        /(\d{5}[\s.-]?\d{6})/g,
      ];
      for (const pattern of phonePatterns) {
        const match = description.match(pattern);
        if (match) return match[0].replace(/^(tel|phone|mob|mobile|contact)[:\s]*/i, '').trim();
      }
      return '';
    };

    // Helper function to extract name/contact from description
    const extractNameFromDescription = (description: string | undefined, jobName: string): string => {
      if (!description) return jobName;
      // Try to find "name:" or "tenant:" patterns
      const namePatterns = [
        /(?:tenant|name|contact|resident)[:\s]+([A-Za-z\s]+?)(?:\n|,|tel|phone|mob|\d|$)/i,
        /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/m,
      ];
      for (const pattern of namePatterns) {
        const match = description.match(pattern);
        if (match && match[1]) return match[1].trim();
      }
      return jobName;
    };

    // Helper function to extract fan quantity
    const extractFanQuantity = (job: Job): string => {
      const fanInfo = job.fanInfo || [];
      if (fanInfo.length > 0) {
        return fanInfo.map((f: any) => `${f.quantity || 1}x ${f.fanType || 'Fan'}`).join(', ');
      }
      // Try to extract from description
      const desc = job.description || job.summaryOfWorks || '';
      const fanPatterns = [
        /(\d+)\s*x?\s*(?:fan|extractor|extract)/gi,
        /(?:install|fit|supply)\s+(\d+)\s*(?:fan|extractor)/gi,
      ];
      for (const pattern of fanPatterns) {
        const match = desc.match(pattern);
        if (match) return match[0];
      }
      return fanInfo.length > 0 ? `${fanInfo.length}x Fan` : '1x Fan';
    };

    // Table data - different columns for Fan vs DM
    if (isFanCategory) {
      const tableData = filteredJobs.map(job => {
        const description = job.summaryOfWorks || job.description || '';
        const extractedPhone = job.phoneNumber || extractPhoneFromDescription(description);
        const extractedName = extractNameFromDescription(description, job.name);
        const fanQty = extractFanQuantity(job);
        const sorCodes = job.workItems.map(w => w.sorCode).filter(Boolean).join(', ');
        
        return [
          job.dateIssued ? format(job.dateIssued, 'dd/MM/yy') : '-',
          job.bookedDate ? format(job.bookedDate, 'dd/MM/yy') : '-',
          job.jobNumber,
          extractedName,
          extractedPhone || '-',
          description.substring(0, 80) || '-',
          fanQty,
          sorCodes || '-',
          job.status || 'pending',
          job.team || 'Unassigned'
        ];
      });

      autoTable(doc, {
        head: [['Issued', 'Booked', 'Job #', 'Name/Contact', 'Phone', 'Description', 'Fan Qty', 'SOR Codes', 'Status', 'Team']],
        body: tableData,
        startY: 48,
        styles: { fontSize: 6, cellPadding: 1.5 },
        headStyles: { fillColor: [59, 130, 246] },
        columnStyles: {
          3: { cellWidth: 22 },
          4: { cellWidth: 22 },
          5: { cellWidth: 28 },
          6: { cellWidth: 18 },
          7: { cellWidth: 18 },
        }
      });
    } else {
      const tableData = filteredJobs.map(job => [
        job.jobNumber,
        job.name,
        job.phoneNumber || '-',
        job.address || '-',
        job.team || 'Unassigned',
        `${job.progress}%`,
        job.bookedDate ? format(job.bookedDate, 'dd/MM/yy') : '-',
        job.completionDate ? format(job.completionDate, 'dd/MM/yy') : '-',
        job.workItems.map(w => w.sorCode).join(', ') || '-'
      ]);

      autoTable(doc, {
        head: [['Job #', 'Name', 'Phone', 'Address', 'Team', 'Progress', 'Booked', 'End', 'SOR Codes']],
        body: tableData,
        startY: 48,
        styles: { fontSize: 7 },
        headStyles: { fillColor: [59, 130, 246] },
      });
    }

    const filename = isFanCategory ? 'fan-jobs' : 'allsaints-jobs';
    doc.save(`${filename}-${selectedMonth === 'all' ? 'all' : months[parseInt(selectedMonth)]}-${currentYear}.pdf`);
  };

  // Helper functions for Excel (same as PDF)
  const extractPhoneFromDescriptionExcel = (description: string | undefined): string => {
    if (!description) return '';
    const phonePatterns = [
      /(?:tel|phone|mob|mobile|contact)?[:\s]*(\+44[\s.-]?\d{4}[\s.-]?\d{6})/gi,
      /(?:tel|phone|mob|mobile|contact)?[:\s]*(07\d{3}[\s.-]?\d{6})/gi,
      /(?:tel|phone|mob|mobile|contact)?[:\s]*(0\d{3,4}[\s.-]?\d{6,7})/gi,
      /(\d{5}[\s.-]?\d{6})/g,
    ];
    for (const pattern of phonePatterns) {
      const match = description.match(pattern);
      if (match) return match[0].replace(/^(tel|phone|mob|mobile|contact)[:\s]*/i, '').trim();
    }
    return '';
  };

  const extractNameFromDescriptionExcel = (description: string | undefined, jobName: string): string => {
    if (!description) return jobName;
    const namePatterns = [
      /(?:tenant|name|contact|resident)[:\s]+([A-Za-z\s]+?)(?:\n|,|tel|phone|mob|\d|$)/i,
      /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/m,
    ];
    for (const pattern of namePatterns) {
      const match = description.match(pattern);
      if (match && match[1]) return match[1].trim();
    }
    return jobName;
  };

  const extractFanQuantityExcel = (job: Job): string => {
    const fanInfo = job.fanInfo || [];
    if (fanInfo.length > 0) {
      return fanInfo.map((f: any) => `${f.quantity || 1}x ${f.fanType || 'Fan'}`).join(', ');
    }
    const desc = job.description || job.summaryOfWorks || '';
    const fanPatterns = [
      /(\d+)\s*x?\s*(?:fan|extractor|extract)/gi,
      /(?:install|fit|supply)\s+(\d+)\s*(?:fan|extractor)/gi,
    ];
    for (const pattern of fanPatterns) {
      const match = desc.match(pattern);
      if (match) return match[0];
    }
    return fanInfo.length > 0 ? `${fanInfo.length}x Fan` : '1x Fan';
  };

  const handleExportExcel = async () => {
    let excelData;
    
    if (isFanCategory) {
      excelData = filteredJobs.map(job => {
        const description = job.summaryOfWorks || job.description || '';
        const extractedPhone = job.phoneNumber || extractPhoneFromDescriptionExcel(description);
        const extractedName = extractNameFromDescriptionExcel(description, job.name);
        const fanQty = extractFanQuantityExcel(job);
        const sorCodes = job.workItems.map(w => w.sorCode).filter(Boolean).join(', ');
        
        return {
          'Issued': job.dateIssued ? format(job.dateIssued, 'dd/MM/yyyy') : '',
          'Booked': job.bookedDate ? format(job.bookedDate, 'dd/MM/yyyy') : '',
          'Job #': job.jobNumber,
          'Name/Contact': extractedName,
          'Phone': extractedPhone,
          'Description': description,
          'Fan Qty': fanQty,
          'SOR Codes': sorCodes,
          'Status': job.status || 'pending',
          'Team': job.team || 'Unassigned'
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
        'Booked Date': job.bookedDate ? format(job.bookedDate, 'dd/MM/yyyy') : '',
        'Completion Date': job.completionDate ? format(job.completionDate, 'dd/MM/yyyy') : '',
        'Summary': job.summaryOfWorks || '',
        'SOR Codes': job.workItems.map(w => w.sorCode).join(', '),
        'Work Items': job.workItems.map(w => `${w.description} (${w.sorCode})`).join('; '),
        'Total Cost': `£${job.workItems.reduce((sum, w) => sum + w.cost, 0).toFixed(2)}`
      }));
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(isFanCategory ? 'Fan Jobs' : 'Jobs');
    
    // Add headers
    const headers = Object.keys(excelData[0] || {});
    worksheet.addRow(headers);
    
    // Add data
    excelData.forEach(row => {
      worksheet.addRow(Object.values(row));
    });
    
    // Auto-size columns
    worksheet.columns.forEach(column => {
      column.width = 15;
    });
    
    // Generate and download
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const filename = isFanCategory ? 'fan-jobs' : 'allsaints-jobs';
    link.download = `${filename}-${selectedMonth === 'all' ? 'all' : months[parseInt(selectedMonth)]}-${currentYear}.xlsx`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // HTML escape helper to prevent XSS
  const escapeHtml = (text: string): string => {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
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
                  <td>${escapeHtml(job.jobNumber)}</td>
                  <td>${escapeHtml(job.name)}</td>
                  <td>${escapeHtml(job.address || '-')}</td>
                  <td>${escapeHtml(job.team || 'Unassigned')}</td>
                  <td>${job.progress}%</td>
                  <td>${job.bookedDate ? format(job.bookedDate, 'dd/MM/yy') : '-'}</td>
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
