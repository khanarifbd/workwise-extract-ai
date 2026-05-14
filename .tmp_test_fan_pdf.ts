import jsPDF from "jspdf";
import { writeFileSync } from "node:fs";

const jobs = [
  { jobNumber: "N2629308-FAN", name: "Ms M Manukure", phoneNumber: "07519197160", address: "57 Churchill Avenue Lakeview Northampton NN3 6NY", description: "Install 1 extractor fan in bathroom" },
  { jobNumber: "N2632312-FAN", name: "Miss S Rowe", phoneNumber: "07359788047", address: "121 Danefield Road Abington Northampton NN3 2SR", description: "Supply and fit 1 fan to kitchen" },
  { jobNumber: "N2635227-FAN", name: "Mr S Miah & Mrs M Begum", phoneNumber: "07786971005", address: "276 Broadmead Avenue Eastfield Northampton NN3 2RP", description: "Install 1 extractor fan and ducting" },
  { jobNumber: "N2640672-FAN", name: "Mrs S Smith", phoneNumber: "07519728514", address: "78 Waterpump Court Thorplands Northampton NN3 8UR", description: "Install extractor fan in wet room" },
  { jobNumber: "N2640683-FAN", name: "Mr M Wright", phoneNumber: "07904291997", address: "6 Grafton House Scarletwell St Spring Boroughs Northampton NN1 2SF", description: "Fit 1 fan and make good" },
  { jobNumber: "N2641158-FAN", name: "Mr S Welch", phoneNumber: "07305882686", address: "36 Cardigan Close Dallington Northampton NN5 7DH", description: "Replace extractor fan" }
];

const doc = new jsPDF();
const pageWidth = doc.internal.pageSize.getWidth();
const margin = 14;
let yPos = 20;
const primaryColor = [249, 115, 22] as const;
const darkColor = [30, 30, 30] as const;

doc.setFillColor(...primaryColor);
doc.rect(0, 0, pageWidth, 35, 'F');
doc.setTextColor(255, 255, 255);
doc.setFontSize(20);
doc.setFont('helvetica', 'bold');
doc.text('ALLSAINTS', margin, 18);
doc.setFontSize(11);
doc.setFont('helvetica', 'normal');
doc.text('Daily Booking Report - Fan Installations', margin, 28);
yPos = 50;
doc.setTextColor(...darkColor);
doc.setFontSize(14);
doc.setFont('helvetica', 'bold');
doc.text('Thursday, 14 May 2026', margin, yPos);
yPos += 8;
doc.setFontSize(10);
doc.setFont('helvetica', 'normal');
doc.setTextColor(100, 100, 100);
doc.text(`${jobs.length} jobs scheduled`, margin, yPos);
yPos += 15;
doc.setDrawColor(...primaryColor);
doc.setLineWidth(0.5);
doc.line(margin, yPos - 5, pageWidth - margin, yPos - 5);

jobs.forEach((job, index) => {
  if (yPos > 250) {
    doc.addPage();
    yPos = 20;
  }
  doc.setFillColor(255, 247, 237);
  doc.roundedRect(margin, yPos - 5, pageWidth - margin * 2, 10, 2, 2, 'F');
  doc.setTextColor(...primaryColor);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(`Job ${index + 1} of ${jobs.length}`, margin + 3, yPos + 2);
  doc.setTextColor(100, 100, 100);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`#${job.jobNumber}`, pageWidth - margin - 30, yPos + 2);
  yPos += 15;

  doc.setTextColor(...darkColor);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Name:', margin, yPos);
  doc.setFont('helvetica', 'normal');
  doc.text(job.name, margin + 25, yPos);
  yPos += 8;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Address:', margin, yPos);
  doc.setFont('helvetica', 'normal');
  const addressLines = doc.splitTextToSize(job.address, pageWidth - margin - 45);
  doc.text(addressLines, margin + 25, yPos);
  yPos += addressLines.length * 5 + 3;

  doc.setFont('helvetica', 'bold');
  doc.text('Phone:', margin, yPos);
  doc.setFont('helvetica', 'normal');
  doc.text(job.phoneNumber, margin + 25, yPos);
  yPos += 8;

  doc.setFont('helvetica', 'bold');
  doc.text('Fans:', margin, yPos);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...primaryColor);
  doc.text('1 fan', margin + 25, yPos);
  doc.setTextColor(...darkColor);
  yPos += 8;

  doc.setFont('helvetica', 'bold');
  doc.text('Description:', margin, yPos);
  yPos += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(60, 60, 60);
  const descLines = doc.splitTextToSize(job.description, pageWidth - margin * 2 - 5);
  doc.text(descLines.slice(0, 6), margin + 5, yPos);
  yPos += Math.min(descLines.length, 6) * 4.5 + 5;

  if (index < jobs.length - 1) {
    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(0.3);
    doc.line(margin + 20, yPos, pageWidth - margin - 20, yPos);
    yPos += 10;
  }
});

const pageCount = doc.getNumberOfPages();
for (let i = 1; i <= pageCount; i++) {
  doc.setPage(i);
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.text(`Generated: 14/05/2026 03:00 | Page ${i} of ${pageCount}`, pageWidth / 2, doc.internal.pageSize.getHeight() - 10, { align: 'center' });
}

writeFileSync('/mnt/documents/fan-daily-report-test.pdf', Buffer.from(doc.output('arraybuffer')));
