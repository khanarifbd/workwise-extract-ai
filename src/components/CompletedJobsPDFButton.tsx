import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { FileCheck, Calendar } from 'lucide-react';
import { Job } from '@/types/job';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format, isWithinInterval, startOfDay, endOfDay } from 'date-fns';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Label } from '@/components/ui/label';

interface CompletedJobsPDFButtonProps {
  jobs: Job[];
  categoryName?: string;
}

export const CompletedJobsPDFButton = ({ jobs, categoryName = 'Damp & Mold' }: CompletedJobsPDFButtonProps) => {
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [isOpen, setIsOpen] = useState(false);

  const completedJobs = jobs.filter(job => job.status === 'complete' || job.isCompleted);

  // Filter jobs by date range if both dates are set
  const filteredJobs = completedJobs.filter(job => {
    if (!startDate || !endDate) return true;
    
    const jobDate = job.completionDate || job.bookedDate;
    if (!jobDate) return false;
    
    return isWithinInterval(new Date(jobDate), {
      start: startOfDay(startDate),
      end: endOfDay(endDate)
    });
  });

  const handleGeneratePDF = () => {
    if (filteredJobs.length === 0) {
      alert('No completed jobs to export for the selected date range');
      return;
    }

    const doc = new jsPDF('landscape');
    
    // Title
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('COMPLETED JOBS REPORT', 14, 20);
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Generated: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 14, 28);
    
    // Show date range if filtered
    if (startDate && endDate) {
      doc.text(`Date Range: ${format(startDate, 'dd/MM/yyyy')} - ${format(endDate, 'dd/MM/yyyy')}`, 14, 34);
      doc.text(`Total Completed Jobs: ${filteredJobs.length}`, 14, 40);
    } else {
      doc.text(`Total Completed Jobs: ${filteredJobs.length}`, 14, 34);
    }

    // Table data with specified columns
    const tableData = filteredJobs.map(job => {
      // Site: Name and Address combined
      const site = `${job.name}${job.address ? '\n' + job.address : ''}`;
      
      // Status: Always "Works Complete" for completed jobs
      const status = 'Works Complete';
      
      // Job Type: Category name or default
      const jobType = categoryName;
      
      // Priority: Check if it's an emergency based on job data
      const priority = job.description?.toLowerCase().includes('emergency') || 
                      job.description?.toLowerCase().includes('urgent') ||
                      job.description?.toLowerCase().includes('priority')
                      ? 'Emergency' 
                      : 'Normal';
      
      // Date Logged: date_issued / dateIssued
      const dateLogged = job.dateIssued ? format(job.dateIssued, 'dd/MM/yyyy') : '-';
      
      // Appointment Date: booked_date / bookedDate
      const appointmentDate = job.bookedDate ? format(job.bookedDate, 'dd/MM/yyyy') : '-';
      
      // Order Number: job_number / jobNumber
      const orderNumber = job.jobNumber;
      
      // Target Completion Date: booked_date (same as appointment)
      const targetCompletionDate = job.bookedDate ? format(job.bookedDate, 'dd/MM/yyyy') : '-';
      
      // Date Complete: completion_date if available, otherwise booked_date
      const dateComplete = job.completionDate 
        ? format(job.completionDate, 'dd/MM/yyyy') 
        : (job.bookedDate ? format(job.bookedDate, 'dd/MM/yyyy') : '-');

      return [
        site,
        status,
        jobType,
        priority,
        dateLogged,
        appointmentDate,
        orderNumber,
        targetCompletionDate,
        dateComplete
      ];
    });

    autoTable(doc, {
      head: [[
        'Site',
        'Status',
        'Job Type',
        'Priority',
        'Date Logged',
        'Appointment Date',
        'Order Number',
        'Target Completion Date',
        'Date Complete'
      ]],
      body: tableData,
      startY: startDate && endDate ? 48 : 42,
      styles: { 
        fontSize: 8, 
        cellPadding: 3,
        overflow: 'linebreak',
        valign: 'top'
      },
      headStyles: { 
        fillColor: [34, 139, 34], // Green for completed
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        halign: 'center'
      },
      columnStyles: {
        0: { cellWidth: 50 }, // Site (wider for address)
        1: { cellWidth: 25, halign: 'center' }, // Status
        2: { cellWidth: 25, halign: 'center' }, // Job Type
        3: { cellWidth: 20, halign: 'center' }, // Priority
        4: { cellWidth: 25, halign: 'center' }, // Date Logged
        5: { cellWidth: 28, halign: 'center' }, // Appointment Date
        6: { cellWidth: 25, halign: 'center' }, // Order Number
        7: { cellWidth: 35, halign: 'center' }, // Target Completion Date
        8: { cellWidth: 25, halign: 'center' }, // Date Complete
      },
      alternateRowStyles: {
        fillColor: [245, 245, 245]
      },
      didDrawPage: (data) => {
        // Add page numbers
        const pageCount = doc.getNumberOfPages();
        doc.setFontSize(8);
        doc.text(
          `Page ${data.pageNumber} of ${pageCount}`,
          doc.internal.pageSize.width / 2,
          doc.internal.pageSize.height - 10,
          { align: 'center' }
        );
      }
    });

    // Save the PDF
    const timestamp = format(new Date(), 'yyyy-MM-dd');
    const dateRangeStr = startDate && endDate 
      ? `_${format(startDate, 'yyyyMMdd')}-${format(endDate, 'yyyyMMdd')}` 
      : '';
    doc.save(`completed-jobs-report${dateRangeStr}-${timestamp}.pdf`);
    
    setIsOpen(false);
  };

  const clearDateRange = () => {
    setStartDate(undefined);
    setEndDate(undefined);
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button 
          variant="outline"
          className="bg-green-50 border-green-200 text-green-700 hover:bg-green-100 hover:text-green-800"
          disabled={completedJobs.length === 0}
        >
          <FileCheck className="w-4 h-4 mr-2" />
          Generate Completed PDF ({completedJobs.length})
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-4" align="end">
        <div className="space-y-4">
          <div className="space-y-2">
            <h4 className="font-medium text-sm">Filter by Date Range (Optional)</h4>
            <p className="text-xs text-muted-foreground">
              Select a date range to filter completed jobs, or generate PDF for all.
            </p>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs">Start Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="w-full justify-start text-left font-normal">
                    <Calendar className="mr-2 h-4 w-4" />
                    {startDate ? format(startDate, 'dd/MM/yyyy') : 'Pick date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 pointer-events-auto" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={startDate}
                    onSelect={setStartDate}
                    initialFocus
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>
            
            <div className="space-y-2">
              <Label className="text-xs">End Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="w-full justify-start text-left font-normal">
                    <Calendar className="mr-2 h-4 w-4" />
                    {endDate ? format(endDate, 'dd/MM/yyyy') : 'Pick date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 pointer-events-auto" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={endDate}
                    onSelect={setEndDate}
                    initialFocus
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {(startDate || endDate) && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                {filteredJobs.length} jobs in range
              </span>
              <Button variant="ghost" size="sm" onClick={clearDateRange} className="h-6 px-2 text-xs">
                Clear dates
              </Button>
            </div>
          )}
          
          <div className="flex gap-2">
            <Button 
              onClick={handleGeneratePDF}
              className="flex-1 bg-green-600 hover:bg-green-700"
              disabled={filteredJobs.length === 0}
            >
              <FileCheck className="w-4 h-4 mr-2" />
              Generate PDF ({filteredJobs.length})
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};
