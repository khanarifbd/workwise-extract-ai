import { useState } from 'react';
import { Job } from '@/types/job';
import { Button } from '@/components/ui/button';
import { BarChart3, FileDown, X, Building2, Home, Gauge, Calendar, CheckCircle2, Clock, TrendingUp } from 'lucide-react';
import { format, differenceInWeeks, startOfWeek, endOfWeek, eachWeekOfInterval, isWithinInterval } from 'date-fns';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface InsulationAnalyticsReportProps {
  jobs: Job[];
}

interface InsulationStats {
  totalJobs: number;
  totalUnits: number;
  housesCompleted: number;
  buildingsCompleted: number;
  totalHouses: number;
  totalBuildings: number;
  avgRollsPerHouse: number;
  avgRollsPerBuilding: number;
  epcsComplete: number;
  epcsBooked: number;
  avgCompletionsPerWeek: number;
  completionRate: number;
  totalRollsUsed: number;
  assignedJobs: number;
  unassignedJobs: number;
  teamBreakdown: Record<string, { total: number; completed: number; units: number }>;
  weeklyCompletions: { week: string; count: number }[];
  insulationTypeBreakdown: Record<string, { count: number; units: number }>;
  monthlyTrend: { month: string; completed: number; total: number }[];
}

const calculateStats = (jobs: Job[]): InsulationStats => {
  const now = new Date();
  const sixMonthsAgo = new Date(now);
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  // Filter jobs with insulation info
  const insulationJobs = jobs.filter(j => {
    const info = (j as any).insulationInfo;
    return info && Array.isArray(info) && info.length > 0;
  });

  // Categorize by property type (house vs building based on keywords)
  const categorizeProperty = (job: Job): 'house' | 'building' => {
    const text = `${job.name} ${job.address || ''} ${job.description || ''} ${job.summaryOfWorks || ''}`.toLowerCase();
    const buildingKeywords = ['flat', 'apartment', 'block', 'tower', 'floor', 'unit', 'complex', 'estate', 'maisonette'];
    return buildingKeywords.some(kw => text.includes(kw)) ? 'building' : 'house';
  };

  // Calculate rolls/units per job
  const getUnitsForJob = (job: Job): number => {
    const info = (job as any).insulationInfo || [];
    return info.reduce((sum: number, item: any) => sum + (item.quantity || 0), 0);
  };

  // Check if job is EPC related
  const isEpcJob = (job: Job): boolean => {
    const text = `${job.name} ${job.description || ''} ${job.summaryOfWorks || ''}`.toLowerCase();
    return text.includes('epc') || text.includes('energy performance');
  };

  // Completed jobs
  const completedJobs = insulationJobs.filter(j => 
    j.status === 'complete' || j.isCompleted || j.progress === 100
  );

  // Houses and buildings
  const houses = insulationJobs.filter(j => categorizeProperty(j) === 'house');
  const buildings = insulationJobs.filter(j => categorizeProperty(j) === 'building');
  const housesCompleted = houses.filter(j => j.status === 'complete' || j.isCompleted || j.progress === 100);
  const buildingsCompleted = buildings.filter(j => j.status === 'complete' || j.isCompleted || j.progress === 100);

  // Calculate average rolls
  const houseRolls = housesCompleted.map(getUnitsForJob).filter(u => u > 0);
  const buildingRolls = buildingsCompleted.map(getUnitsForJob).filter(u => u > 0);
  const avgRollsPerHouse = houseRolls.length > 0 
    ? Math.round((houseRolls.reduce((a, b) => a + b, 0) / houseRolls.length) * 10) / 10 
    : 0;
  const avgRollsPerBuilding = buildingRolls.length > 0 
    ? Math.round((buildingRolls.reduce((a, b) => a + b, 0) / buildingRolls.length) * 10) / 10 
    : 0;

  // EPCs
  const epcJobs = insulationJobs.filter(isEpcJob);
  const epcsComplete = epcJobs.filter(j => j.status === 'complete' || j.isCompleted).length;
  const epcsBooked = epcJobs.filter(j => j.bookedDate && !j.isCompleted && j.status !== 'complete').length;

  // Weekly completions (last 12 weeks)
  const twelveWeeksAgo = new Date(now);
  twelveWeeksAgo.setDate(twelveWeeksAgo.getDate() - 84);
  
  const weeks = eachWeekOfInterval({ start: twelveWeeksAgo, end: now });
  const weeklyCompletions = weeks.map(weekStart => {
    const weekEnd = endOfWeek(weekStart);
    const count = completedJobs.filter(j => {
      const completionDate = j.completionDate;
      if (!completionDate) return false;
      const date = new Date(completionDate);
      return isWithinInterval(date, { start: weekStart, end: weekEnd });
    }).length;
    return {
      week: format(weekStart, 'dd MMM'),
      count
    };
  });

  const totalWeeklyCompletions = weeklyCompletions.reduce((sum, w) => sum + w.count, 0);
  const weeksWithData = weeklyCompletions.filter(w => w.count > 0).length || 1;
  const avgCompletionsPerWeek = Math.round((totalWeeklyCompletions / Math.max(weeksWithData, 1)) * 10) / 10;

  // Team breakdown
  const teamBreakdown: Record<string, { total: number; completed: number; units: number }> = {};
  insulationJobs.forEach(job => {
    const team = job.team || 'Unassigned';
    if (!teamBreakdown[team]) {
      teamBreakdown[team] = { total: 0, completed: 0, units: 0 };
    }
    teamBreakdown[team].total++;
    teamBreakdown[team].units += getUnitsForJob(job);
    if (job.status === 'complete' || job.isCompleted) {
      teamBreakdown[team].completed++;
    }
  });

  // Insulation type breakdown
  const insulationTypeBreakdown: Record<string, { count: number; units: number }> = {};
  insulationJobs.forEach(job => {
    const info = (job as any).insulationInfo || [];
    info.forEach((item: any) => {
      const type = item.type || 'Unknown';
      if (!insulationTypeBreakdown[type]) {
        insulationTypeBreakdown[type] = { count: 0, units: 0 };
      }
      insulationTypeBreakdown[type].count++;
      insulationTypeBreakdown[type].units += item.quantity || 0;
    });
  });

  // Monthly trend (last 6 months)
  const monthlyTrend: { month: string; completed: number; total: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const monthDate = new Date(now);
    monthDate.setMonth(monthDate.getMonth() - i);
    const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
    const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
    
    const monthJobs = insulationJobs.filter(j => {
      const issued = j.dateIssued;
      if (!issued) return false;
      return isWithinInterval(new Date(issued), { start: monthStart, end: monthEnd });
    });
    
    const monthCompleted = monthJobs.filter(j => j.status === 'complete' || j.isCompleted).length;
    
    monthlyTrend.push({
      month: format(monthStart, 'MMM yyyy'),
      completed: monthCompleted,
      total: monthJobs.length
    });
  }

  // Total rolls/units used
  const totalRollsUsed = completedJobs.reduce((sum, job) => sum + getUnitsForJob(job), 0);
  const totalUnits = insulationJobs.reduce((sum, job) => sum + getUnitsForJob(job), 0);

  return {
    totalJobs: insulationJobs.length,
    totalUnits,
    housesCompleted: housesCompleted.length,
    buildingsCompleted: buildingsCompleted.length,
    totalHouses: houses.length,
    totalBuildings: buildings.length,
    avgRollsPerHouse,
    avgRollsPerBuilding,
    epcsComplete,
    epcsBooked,
    avgCompletionsPerWeek,
    completionRate: insulationJobs.length > 0 
      ? Math.round((completedJobs.length / insulationJobs.length) * 100) 
      : 0,
    totalRollsUsed,
    assignedJobs: insulationJobs.filter(j => j.team).length,
    unassignedJobs: insulationJobs.filter(j => !j.team).length,
    teamBreakdown,
    weeklyCompletions,
    insulationTypeBreakdown,
    monthlyTrend
  };
};

export const InsulationAnalyticsReport = ({ jobs }: InsulationAnalyticsReportProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const stats = calculateStats(jobs);

  const generatePDF = async () => {
    setIsGenerating(true);
    
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      let yPos = 20;

      // Header
      doc.setFillColor(34, 139, 34); // Forest green
      doc.rect(0, 0, pageWidth, 40, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(22);
      doc.setFont('helvetica', 'bold');
      doc.text('NPH INSULATION ANALYTICS REPORT', pageWidth / 2, 18, { align: 'center' });
      doc.setFontSize(12);
      doc.setFont('helvetica', 'normal');
      doc.text(`Generated: ${format(new Date(), 'dd MMMM yyyy HH:mm')}`, pageWidth / 2, 30, { align: 'center' });

      yPos = 50;
      doc.setTextColor(0, 0, 0);

      // Executive Summary
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text('Executive Summary', 14, yPos);
      yPos += 8;

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      const summaryText = `This report provides a comprehensive overview of insulation works across ${stats.totalJobs} properties. ` +
        `A total of ${stats.housesCompleted + stats.buildingsCompleted} properties have been completed, ` +
        `with ${stats.totalRollsUsed} insulation units/rolls installed. ` +
        `The overall completion rate stands at ${stats.completionRate}%, ` +
        `with an average of ${stats.avgCompletionsPerWeek} completions per week.`;
      
      const splitSummary = doc.splitTextToSize(summaryText, pageWidth - 28);
      doc.text(splitSummary, 14, yPos);
      yPos += splitSummary.length * 5 + 10;

      // Key Metrics Table
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('Key Performance Metrics', 14, yPos);
      yPos += 6;

      autoTable(doc, {
        startY: yPos,
        head: [['Metric', 'Value', 'Details']],
        body: [
          ['Total Insulation Jobs', stats.totalJobs.toString(), `${stats.assignedJobs} assigned, ${stats.unassignedJobs} unassigned`],
          ['Houses Completed', `${stats.housesCompleted} / ${stats.totalHouses}`, `${Math.round((stats.housesCompleted / Math.max(stats.totalHouses, 1)) * 100)}% completion rate`],
          ['Buildings Completed', `${stats.buildingsCompleted} / ${stats.totalBuildings}`, `${Math.round((stats.buildingsCompleted / Math.max(stats.totalBuildings, 1)) * 100)}% completion rate`],
          ['Total Units/Rolls Installed', stats.totalRollsUsed.toString(), `${stats.totalUnits} total identified`],
          ['Avg Rolls per House', stats.avgRollsPerHouse.toString(), 'Based on completed houses'],
          ['Avg Rolls per Building', stats.avgRollsPerBuilding.toString(), 'Based on completed buildings'],
          ['EPCs Complete', stats.epcsComplete.toString(), 'Energy Performance Certificates issued'],
          ['EPCs Booked', stats.epcsBooked.toString(), 'Pending EPC assessments'],
          ['Avg Completions/Week', stats.avgCompletionsPerWeek.toString(), 'Based on last 12 weeks'],
          ['Overall Completion Rate', `${stats.completionRate}%`, `${stats.housesCompleted + stats.buildingsCompleted} of ${stats.totalJobs} jobs`],
        ],
        styles: { fontSize: 9, cellPadding: 3 },
        headStyles: { fillColor: [34, 139, 34], textColor: [255, 255, 255] },
        alternateRowStyles: { fillColor: [245, 245, 245] },
        columnStyles: {
          0: { fontStyle: 'bold', cellWidth: 50 },
          1: { cellWidth: 35, halign: 'center' },
          2: { cellWidth: 'auto' }
        }
      });

      yPos = (doc as any).lastAutoTable.finalY + 15;

      // Insulation Type Breakdown
      if (Object.keys(stats.insulationTypeBreakdown).length > 0) {
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('Insulation Type Breakdown', 14, yPos);
        yPos += 6;

        const typeData = Object.entries(stats.insulationTypeBreakdown)
          .sort((a, b) => b[1].units - a[1].units)
          .map(([type, data]) => [type, data.count.toString(), data.units.toString()]);

        autoTable(doc, {
          startY: yPos,
          head: [['Insulation Type', 'Installations', 'Units/Rolls']],
          body: typeData,
          styles: { fontSize: 9, cellPadding: 3 },
          headStyles: { fillColor: [59, 130, 246], textColor: [255, 255, 255] },
          alternateRowStyles: { fillColor: [245, 245, 245] },
        });

        yPos = (doc as any).lastAutoTable.finalY + 15;
      }

      // Check if we need a new page
      if (yPos > 220) {
        doc.addPage();
        yPos = 20;
      }

      // Team Performance
      if (Object.keys(stats.teamBreakdown).length > 0) {
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('Team Performance', 14, yPos);
        yPos += 6;

        const teamData = Object.entries(stats.teamBreakdown)
          .sort((a, b) => b[1].completed - a[1].completed)
          .map(([team, data]) => [
            team,
            data.total.toString(),
            data.completed.toString(),
            `${Math.round((data.completed / Math.max(data.total, 1)) * 100)}%`,
            data.units.toString()
          ]);

        autoTable(doc, {
          startY: yPos,
          head: [['Team', 'Total Jobs', 'Completed', 'Rate', 'Units Installed']],
          body: teamData,
          styles: { fontSize: 9, cellPadding: 3 },
          headStyles: { fillColor: [139, 69, 19], textColor: [255, 255, 255] },
          alternateRowStyles: { fillColor: [245, 245, 245] },
        });

        yPos = (doc as any).lastAutoTable.finalY + 15;
      }

      // Check if we need a new page
      if (yPos > 200) {
        doc.addPage();
        yPos = 20;
      }

      // Monthly Trend
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('Monthly Completion Trend (Last 6 Months)', 14, yPos);
      yPos += 6;

      autoTable(doc, {
        startY: yPos,
        head: [['Month', 'Jobs Issued', 'Completed', 'Completion Rate']],
        body: stats.monthlyTrend.map(m => [
          m.month,
          m.total.toString(),
          m.completed.toString(),
          m.total > 0 ? `${Math.round((m.completed / m.total) * 100)}%` : 'N/A'
        ]),
        styles: { fontSize: 9, cellPadding: 3 },
        headStyles: { fillColor: [75, 0, 130], textColor: [255, 255, 255] },
        alternateRowStyles: { fillColor: [245, 245, 245] },
      });

      yPos = (doc as any).lastAutoTable.finalY + 15;

      // Weekly Completions Chart Data
      if (yPos > 220) {
        doc.addPage();
        yPos = 20;
      }

      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('Weekly Completions (Last 12 Weeks)', 14, yPos);
      yPos += 6;

      autoTable(doc, {
        startY: yPos,
        head: [['Week Starting', 'Completions']],
        body: stats.weeklyCompletions.map(w => [w.week, w.count.toString()]),
        styles: { fontSize: 9, cellPadding: 2 },
        headStyles: { fillColor: [255, 140, 0], textColor: [255, 255, 255] },
        alternateRowStyles: { fillColor: [245, 245, 245] },
      });

      yPos = (doc as any).lastAutoTable.finalY + 15;

      // Footer on last page
      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(128, 128, 128);
        doc.text(
          `Page ${i} of ${pageCount} | NPH Insulation Analytics Report | Confidential`,
          pageWidth / 2,
          doc.internal.pageSize.getHeight() - 10,
          { align: 'center' }
        );
      }

      // Save the PDF
      doc.save(`NPH-Insulation-Analytics-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
    } catch (error) {
      console.error('Error generating PDF:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <>
      <Button
        onClick={() => setIsOpen(true)}
        variant="outline"
        size="sm"
        className="gap-2"
      >
        <BarChart3 className="w-4 h-4" />
        Analytics Report
      </Button>

      {isOpen && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden animate-scale-in">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-emerald-500/10">
              <div className="flex items-center gap-3">
                <BarChart3 className="w-6 h-6 text-emerald-500" />
                <h2 className="text-lg font-semibold">Insulation Analytics Report</h2>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-2 hover:bg-muted rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
              {/* Quick Stats Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-emerald-500/10 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Home className="w-5 h-5 text-emerald-500" />
                    <span className="text-sm text-muted-foreground">Houses Complete</span>
                  </div>
                  <p className="text-2xl font-bold">{stats.housesCompleted} <span className="text-sm text-muted-foreground">/ {stats.totalHouses}</span></p>
                </div>
                
                <div className="bg-blue-500/10 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Building2 className="w-5 h-5 text-blue-500" />
                    <span className="text-sm text-muted-foreground">Buildings Complete</span>
                  </div>
                  <p className="text-2xl font-bold">{stats.buildingsCompleted} <span className="text-sm text-muted-foreground">/ {stats.totalBuildings}</span></p>
                </div>
                
                <div className="bg-amber-500/10 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Gauge className="w-5 h-5 text-amber-500" />
                    <span className="text-sm text-muted-foreground">Avg Rolls/House</span>
                  </div>
                  <p className="text-2xl font-bold">{stats.avgRollsPerHouse}</p>
                </div>
                
                <div className="bg-purple-500/10 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Gauge className="w-5 h-5 text-purple-500" />
                    <span className="text-sm text-muted-foreground">Avg Rolls/Building</span>
                  </div>
                  <p className="text-2xl font-bold">{stats.avgRollsPerBuilding}</p>
                </div>
              </div>

              {/* Second Row Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-green-500/10 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                    <span className="text-sm text-muted-foreground">EPCs Complete</span>
                  </div>
                  <p className="text-2xl font-bold">{stats.epcsComplete}</p>
                </div>
                
                <div className="bg-orange-500/10 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Calendar className="w-5 h-5 text-orange-500" />
                    <span className="text-sm text-muted-foreground">EPCs Booked</span>
                  </div>
                  <p className="text-2xl font-bold">{stats.epcsBooked}</p>
                </div>
                
                <div className="bg-cyan-500/10 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="w-5 h-5 text-cyan-500" />
                    <span className="text-sm text-muted-foreground">Avg/Week</span>
                  </div>
                  <p className="text-2xl font-bold">{stats.avgCompletionsPerWeek}</p>
                </div>
                
                <div className="bg-rose-500/10 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="w-5 h-5 text-rose-500" />
                    <span className="text-sm text-muted-foreground">Completion Rate</span>
                  </div>
                  <p className="text-2xl font-bold">{stats.completionRate}%</p>
                </div>
              </div>

              {/* Total Units */}
              <div className="bg-muted/30 rounded-xl p-4 mb-6">
                <h3 className="font-semibold mb-3">Summary Statistics</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Total Jobs:</span>
                    <span className="ml-2 font-semibold">{stats.totalJobs}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Total Units Identified:</span>
                    <span className="ml-2 font-semibold">{stats.totalUnits}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Units Installed:</span>
                    <span className="ml-2 font-semibold">{stats.totalRollsUsed}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Assigned Jobs:</span>
                    <span className="ml-2 font-semibold">{stats.assignedJobs}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Unassigned Jobs:</span>
                    <span className="ml-2 font-semibold">{stats.unassignedJobs}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Teams Active:</span>
                    <span className="ml-2 font-semibold">{Object.keys(stats.teamBreakdown).filter(t => t !== 'Unassigned').length}</span>
                  </div>
                </div>
              </div>

              {/* Team Breakdown Preview */}
              {Object.keys(stats.teamBreakdown).length > 0 && (
                <div className="mb-6">
                  <h3 className="font-semibold mb-3">Team Performance</h3>
                  <div className="space-y-2">
                    {Object.entries(stats.teamBreakdown)
                      .sort((a, b) => b[1].completed - a[1].completed)
                      .slice(0, 5)
                      .map(([team, data]) => (
                        <div key={team} className="flex items-center justify-between bg-muted/20 rounded-lg px-3 py-2">
                          <span className="font-medium">{team}</span>
                          <div className="flex items-center gap-4 text-sm">
                            <span>{data.completed}/{data.total} jobs</span>
                            <span className="text-muted-foreground">{data.units} units</span>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-border bg-muted/20">
              <Button 
                onClick={generatePDF} 
                disabled={isGenerating}
                className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700"
              >
                <FileDown className="w-4 h-4" />
                {isGenerating ? 'Generating PDF...' : 'Download Full Analytics Report (PDF)'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default InsulationAnalyticsReport;
