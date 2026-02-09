import { Button } from '@/components/ui/button';
import { FileDown } from 'lucide-react';
import { Job } from '@/types/job';
import { ContactHistory } from '@/types/contactHistory';
import { useToast } from '@/hooks/use-toast';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';

interface ReferBackPDFButtonProps {
  jobs: Job[];
  contactHistoryMap: Record<string, ContactHistory[]>;
  categoryName?: string;
}

export function ReferBackPDFButton({ jobs, contactHistoryMap, categoryName = 'Jobs' }: ReferBackPDFButtonProps) {
  const { toast } = useToast();

  const handleGeneratePDF = () => {
    if (jobs.length === 0) {
      toast({
        title: 'No Jobs',
        description: 'There are no refer back jobs to generate a report for.',
        variant: 'destructive',
      });
      return;
    }

    const doc = new jsPDF({ orientation: 'landscape' });

    // Header
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(220, 38, 38); // Red
    doc.text('REFER BACK TO NPH', 14, 18);
    
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100);
    doc.text(`${categoryName} — Uncompletable / Undoable Jobs`, 14, 26);
    doc.text(`Generated: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 14, 32);
    doc.text(`Total Jobs: ${jobs.length}`, 14, 38);

    // Table data
    const tableData = jobs.map(job => {
      const history = contactHistoryMap[job.id] || [];
      const contactSummary = history.length > 0
        ? history.slice(0, 3).map((h, i) => 
            `${i + 1}. ${format(new Date(h.contactDate), 'dd/MM/yy')} - ${h.outcome.replace(/_/g, ' ')}${h.notes ? `: ${h.notes}` : ''}`
          ).join('\n')
        : 'No contact history';

      return [
        job.jobNumber,
        job.name,
        job.phoneNumber || '-',
        job.address || '-',
        job.description?.substring(0, 120) || '-',
        job.bookedDate ? format(job.bookedDate, 'dd/MM/yy') : '-',
        format(job.dateIssued, 'dd/MM/yy'),
        job.referBackReason || 'No reason provided',
        contactSummary,
        job.progressNotes || job.privateNotes || '-',
      ];
    });

    autoTable(doc, {
      head: [[
        'Job #',
        'Name',
        'Phone',
        'Address',
        'Description',
        'Booked',
        'Date Issued',
        'Reason for Refer Back',
        'Contact History',
        'Notes',
      ]],
      body: tableData,
      startY: 44,
      styles: { 
        fontSize: 7, 
        cellPadding: 2,
        overflow: 'linebreak',
      },
      headStyles: { 
        fillColor: [220, 38, 38], // Red header
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 7,
      },
      columnStyles: {
        0: { cellWidth: 20 },
        1: { cellWidth: 25 },
        2: { cellWidth: 22 },
        3: { cellWidth: 35 },
        4: { cellWidth: 40 },
        5: { cellWidth: 18 },
        6: { cellWidth: 18 },
        7: { cellWidth: 35 },
        8: { cellWidth: 40 },
        9: { cellWidth: 30 },
      },
      alternateRowStyles: {
        fillColor: [255, 245, 245],
      },
    });

    // Footer
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(
        `Page ${i} of ${pageCount} — REFER BACK Report — CONFIDENTIAL`,
        doc.internal.pageSize.width / 2,
        doc.internal.pageSize.height - 8,
        { align: 'center' }
      );
    }

    doc.save(`refer-back-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
    toast({ title: 'PDF Downloaded', description: `Refer Back report with ${jobs.length} jobs.` });
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleGeneratePDF}
      className="gap-1.5 border-red-300 text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-950"
    >
      <FileDown className="w-3.5 h-3.5" />
      Generate PDF
    </Button>
  );
}
