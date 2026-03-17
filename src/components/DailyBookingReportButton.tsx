import { Job } from '@/types/job';
import { Button } from '@/components/ui/button';
import { FileText } from 'lucide-react';
import { format, parseISO, isValid } from 'date-fns';
import jsPDF from 'jspdf';
import { useToast } from '@/hooks/use-toast';
import { downloadPDF } from '@/lib/pdfDownload';

interface DailyBookingReportButtonProps {
  jobs: Job[];
  selectedDate: string;
  isFanCategory: boolean;
}

export const DailyBookingReportButton = ({ 
  jobs, 
  selectedDate, 
  isFanCategory 
}: DailyBookingReportButtonProps) => {
  const { toast } = useToast();

  // Filter jobs for the selected date
  const getJobsForDate = () => {
    return jobs.filter(job => {
      if (!job.bookedDate) return false;
      const jobDate = job.bookedDate instanceof Date 
        ? job.bookedDate 
        : parseISO(job.bookedDate as string);
      if (!isValid(jobDate)) return false;
      return format(jobDate, 'yyyy-MM-dd') === selectedDate;
    });
  };

  // Extract phone number from job
  const extractPhoneNumber = (job: Job): string => {
    if (job.phoneNumber) return job.phoneNumber;
    
    const textToSearch = `${job.name} ${job.description || ''} ${job.summaryOfWorks || ''}`;
    const phonePatterns = [
      /(?:tel|phone|mob|mobile|contact)?[:\s]*(\+44[\s.-]?\d{4}[\s.-]?\d{6})/gi,
      /(?:tel|phone|mob|mobile|contact)?[:\s]*(07\d{3}[\s.-]?\d{6})/gi,
      /(?:tel|phone|mob|mobile|contact)?[:\s]*(0\d{3,4}[\s.-]?\d{6,7})/gi,
      /(\d{5}[\s.-]?\d{6})/g,
    ];
    for (const pattern of phonePatterns) {
      const match = textToSearch.match(pattern);
      if (match) return match[0].replace(/^(tel|phone|mob|mobile|contact)[:\s]*/i, '').trim();
    }
    return '-';
  };

  // Extract fan quantity from job
  const extractFanQuantity = (job: Job): string => {
    const fanInfo = job.fanInfo || [];
    if (Array.isArray(fanInfo) && fanInfo.length > 0) {
      const total = fanInfo.reduce((sum: number, f: any) => sum + (f.quantity || 1), 0);
      return `${total}`;
    }
    
    // Try to extract from description/summary
    const desc = `${job.description || ''} ${job.summaryOfWorks || ''}`;
    const fanPatterns = [
      /(\d+)\s*x?\s*(?:fan|extractor|extract)/gi,
      /(?:install|fit|supply)\s+(\d+)\s*(?:fan|extractor)/gi,
    ];
    for (const pattern of fanPatterns) {
      const match = desc.match(pattern);
      if (match) {
        const numMatch = match[0].match(/\d+/);
        if (numMatch) return numMatch[0];
      }
    }
    return '1';
  };

  const generateReport = () => {
    try {
    const dateJobs = getJobsForDate();
    
    if (dateJobs.length === 0) {
      toast({
        title: "No Jobs Found",
        description: "There are no booked jobs for this date.",
        variant: "destructive",
      });
      return;
    }

    const date = parseISO(selectedDate);
    const formattedDate = format(date, 'EEEE, dd MMMM yyyy');
    
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 14;
    let yPos = 20;

    // Allsaints branding colors
    const primaryColor: [number, number, number] = [249, 115, 22]; // Orange #F97316
    const darkColor: [number, number, number] = [30, 30, 30];

    // Header with Allsaints branding
    doc.setFillColor(...primaryColor);
    doc.rect(0, 0, pageWidth, 35, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('ALLSAINTS', margin, 18);
    
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text(`Daily Booking Report${isFanCategory ? ' - Fan Installations' : ''}`, margin, 28);
    
    yPos = 50;
    
    // Date and summary section
    doc.setTextColor(...darkColor);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(formattedDate, margin, yPos);
    
    yPos += 8;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text(`${dateJobs.length} job${dateJobs.length !== 1 ? 's' : ''} scheduled`, margin, yPos);
    
    yPos += 15;

    // Draw separator line
    doc.setDrawColor(...primaryColor);
    doc.setLineWidth(0.5);
    doc.line(margin, yPos - 5, pageWidth - margin, yPos - 5);

    // Job entries
    dateJobs.forEach((job, index) => {
      // Check if we need a new page
      if (yPos > 250) {
        doc.addPage();
        yPos = 20;
      }

      const phoneNumber = extractPhoneNumber(job);
      const fanQty = isFanCategory ? extractFanQuantity(job) : null;

      // Job number header with orange accent
      doc.setFillColor(255, 247, 237); // Light orange background
      doc.roundedRect(margin, yPos - 5, pageWidth - (margin * 2), 10, 2, 2, 'F');
      
      doc.setTextColor(...primaryColor);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text(`Job ${index + 1} of ${dateJobs.length}`, margin + 3, yPos + 2);
      
      if (job.jobNumber) {
        doc.setTextColor(100, 100, 100);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.text(`#${job.jobNumber}`, pageWidth - margin - 30, yPos + 2);
      }
      
      yPos += 15;

      // Name
      doc.setTextColor(...darkColor);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('Name:', margin, yPos);
      doc.setFont('helvetica', 'normal');
      doc.text(job.name || '-', margin + 25, yPos);
      
      yPos += 8;

      // Address
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('Address:', margin, yPos);
      doc.setFont('helvetica', 'normal');
      const addressLines = doc.splitTextToSize(job.address || '-', pageWidth - margin - 45);
      doc.text(addressLines, margin + 25, yPos);
      yPos += addressLines.length * 5 + 3;

      // Phone
      doc.setFont('helvetica', 'bold');
      doc.text('Phone:', margin, yPos);
      doc.setFont('helvetica', 'normal');
      doc.text(phoneNumber, margin + 25, yPos);
      
      yPos += 8;

      // Fan quantity (only for fan category)
      if (isFanCategory) {
        doc.setFont('helvetica', 'bold');
        doc.text('Fans:', margin, yPos);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...primaryColor);
        doc.text(`${fanQty} fan${parseInt(fanQty || '1') !== 1 ? 's' : ''}`, margin + 25, yPos);
        doc.setTextColor(...darkColor);
        yPos += 8;
      }

      // Description
      doc.setFont('helvetica', 'bold');
      doc.text('Description:', margin, yPos);
      yPos += 5;
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(60, 60, 60);
      
      const description = job.description || job.summaryOfWorks || 'No description available';
      const descLines = doc.splitTextToSize(description, pageWidth - (margin * 2) - 5);
      
      // Limit description to 6 lines max
      const limitedDescLines = descLines.slice(0, 6);
      if (descLines.length > 6) {
        limitedDescLines[5] = limitedDescLines[5].substring(0, limitedDescLines[5].length - 3) + '...';
      }
      
      doc.text(limitedDescLines, margin + 5, yPos);
      yPos += limitedDescLines.length * 4.5 + 5;

      // Separator between jobs
      if (index < dateJobs.length - 1) {
        doc.setDrawColor(220, 220, 220);
        doc.setLineWidth(0.3);
        doc.line(margin + 20, yPos, pageWidth - margin - 20, yPos);
        yPos += 10;
      }
    });

    // Footer
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text(
        `Generated: ${format(new Date(), 'dd/MM/yyyy HH:mm')} | Page ${i} of ${pageCount}`,
        pageWidth / 2,
        doc.internal.pageSize.getHeight() - 10,
        { align: 'center' }
      );
    }

    // Save the PDF using blob URL for reliable downloads
    const fileName = `Allsaints_Daily_Report_${format(date, 'yyyy-MM-dd')}.pdf`;
    const blob = doc.output('blob');
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    toast({
      title: "Report Generated",
      description: `Downloaded ${fileName} with ${dateJobs.length} job${dateJobs.length !== 1 ? 's' : ''}.`,
    });
    } catch (error) {
      console.error('Error generating daily report:', error);
      toast({
        title: "Report Error",
        description: "Failed to generate the report. Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={generateReport}
      className="w-full mt-2 text-xs bg-primary/10 hover:bg-primary/20 text-primary border-primary/30"
    >
      <FileText className="w-3 h-3 mr-1" />
      Generate Daily Report
    </Button>
  );
};
