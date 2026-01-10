import { Button } from '@/components/ui/button';
import { FileCheck } from 'lucide-react';
import { Job } from '@/types/job';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';

interface CompletedJobsPDFButtonProps {
  jobs: Job[];
  categoryName?: string;
}

export const CompletedJobsPDFButton = ({ jobs, categoryName = 'Damp & Mold' }: CompletedJobsPDFButtonProps) => {
  const completedJobs = jobs.filter(job => job.status === 'complete' || job.isCompleted);

  const handleGeneratePDF = () => {
    if (completedJobs.length === 0) {
      alert('No completed jobs to export');
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
    doc.text(`Total Completed Jobs: ${completedJobs.length}`, 14, 34);

    // Table data with specified columns
    const tableData = completedJobs.map(job => {
      // Site: Name and Address combined
      const site = `${job.name}${job.address ? '\n' + job.address : ''}`;
      
      // Status: Always "Works Complete" for completed jobs
      const status = 'Works Complete';
      
      // Job Type: Category name or default
      const jobType = categoryName;
      
      // Priority: Check if it's an emergency based on job data
      // Could be determined by urgency flags or specific keywords
      const priority = job.description?.toLowerCase().includes('emergency') || 
                      job.description?.toLowerCase().includes('urgent') 
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
      startY: 42,
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
    doc.save(`completed-jobs-report-${timestamp}.pdf`);
  };

  return (
    <Button 
      onClick={handleGeneratePDF}
      variant="outline"
      className="bg-green-50 border-green-200 text-green-700 hover:bg-green-100 hover:text-green-800"
      disabled={completedJobs.length === 0}
    >
      <FileCheck className="w-4 h-4 mr-2" />
      Generate Completed PDF ({completedJobs.length})
    </Button>
  );
};
