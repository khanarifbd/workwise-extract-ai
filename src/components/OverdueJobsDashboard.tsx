import { useMemo, useState } from 'react';
import { Job } from '@/types/job';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, Clock, MapPin, Phone, Users, X, ExternalLink, FileText, Download } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { getGMTNow, getHoursDifferenceGMT } from '@/lib/dateUtils';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { downloadPDF } from '@/lib/pdfDownload';

interface OverdueJobsDashboardProps {
  jobs: Job[];
  signOffStatuses?: Record<string, { allSignedOff: boolean }>;
  onClose: () => void;
  onJobClick: (job: Job) => void;
}

interface OverdueJob extends Job {
  hoursOverdue: number;
  overdueReason: 'auto' | 'manual';
}

export const OverdueJobsDashboard = ({
  jobs,
  signOffStatuses = {},
  onClose,
  onJobClick,
}: OverdueJobsDashboardProps) => {
  const [selectedTeam, setSelectedTeam] = useState<string>('all');

  const overdueJobs = useMemo(() => {
    const now = getGMTNow();
    const result: OverdueJob[] = [];

    for (const job of jobs) {
      // Skip completed or cancelled jobs
      if (job.isCompleted || job.progress === 100) continue;
      if (job.status === 'pause' || job.status === 'jan2026') continue;
      // Skip refer back jobs — they live in their own folder
      if (job.referBack) continue;

      // Check manual ongoing flag
      if (job.isOngoing) {
        result.push({
          ...job,
          hoursOverdue: 0,
          overdueReason: 'manual',
        });
        continue;
      }

      // Check auto-trigger: 24+ hours past booked date without sign-off
      if (job.bookedDate) {
        const bookedDate = job.bookedDate instanceof Date 
          ? job.bookedDate 
          : new Date(job.bookedDate);

        if (!isNaN(bookedDate.getTime())) {
          const hoursPast = getHoursDifferenceGMT(now, bookedDate);
          
          // Check if booked date is in the past and more than 24 hours ago
          if (bookedDate.getTime() < now.getTime() && hoursPast > 24) {
            const signOffData = signOffStatuses[job.id];
            const isNotSignedOff = !signOffData?.allSignedOff;

            if (isNotSignedOff) {
              result.push({
                ...job,
                hoursOverdue: Math.round(hoursPast - 24),
                overdueReason: 'auto',
              });
            }
          }
        }
      }
    }

    // Sort by hours overdue (most overdue first)
    return result.sort((a, b) => {
      // Manual ongoing jobs first, then by hours overdue
      if (a.overdueReason === 'manual' && b.overdueReason !== 'manual') return -1;
      if (a.overdueReason !== 'manual' && b.overdueReason === 'manual') return 1;
      return b.hoursOverdue - a.hoursOverdue;
    });
  }, [jobs, signOffStatuses]);

  // Get unique team names from overdue jobs
  const availableTeams = useMemo(() => {
    const teams = new Set<string>();
    overdueJobs.forEach(job => {
      if (job.team) teams.add(job.team);
      if (job.team2) teams.add(job.team2);
    });
    return Array.from(teams).sort();
  }, [overdueJobs]);

  // Filter jobs by selected team
  const filteredJobs = useMemo(() => {
    if (selectedTeam === 'all') return overdueJobs;
    return overdueJobs.filter(job => 
      job.team === selectedTeam || job.team2 === selectedTeam
    );
  }, [overdueJobs, selectedTeam]);

  const autoOverdueCount = filteredJobs.filter(j => j.overdueReason === 'auto').length;
  const manualOngoingCount = filteredJobs.filter(j => j.overdueReason === 'manual').length;

  // Generate PDF for selected team
  const generateTeamPDF = () => {
    if (filteredJobs.length === 0) return;

    const doc = new jsPDF();
    const teamName = selectedTeam === 'all' ? 'All Teams' : selectedTeam;
    const currentDate = format(getGMTNow(), 'dd MMMM yyyy');

    // Title
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(220, 38, 38); // Red color for urgency
    doc.text('Jobs Requiring Completion Immediately', 105, 20, { align: 'center' });

    // Team name
    doc.setFontSize(14);
    doc.setTextColor(0, 0, 0);
    doc.text(`Team: ${teamName}`, 105, 30, { align: 'center' });

    // Date
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text(`Generated: ${currentDate}`, 105, 37, { align: 'center' });

    // Instruction box
    doc.setFillColor(254, 243, 199); // Amber background
    doc.roundedRect(14, 42, 182, 20, 3, 3, 'F');
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(180, 83, 9); // Amber text
    doc.text('IMPORTANT: Please complete and sign-off the following jobs immediately.', 105, 50, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text('These jobs are overdue and require your urgent attention. Update progress and sign-off in the Team Portal.', 105, 57, { align: 'center' });

    // Table data
    const tableData = filteredJobs.map((job, index) => {
      const bookedStr = job.bookedDate 
        ? format(job.bookedDate instanceof Date ? job.bookedDate : new Date(job.bookedDate), 'dd/MM/yyyy')
        : 'N/A';
      
      const overdueStr = job.overdueReason === 'auto' 
        ? (job.hoursOverdue > 48 
            ? `${Math.floor(job.hoursOverdue / 24)} days`
            : `${Math.round(job.hoursOverdue)} hrs`)
        : 'Ongoing';

      return [
        (index + 1).toString(),
        job.jobNumber,
        job.name.substring(0, 25) + (job.name.length > 25 ? '...' : ''),
        job.address?.substring(0, 30) + (job.address && job.address.length > 30 ? '...' : '') || 'N/A',
        bookedStr,
        overdueStr,
      ];
    });

    autoTable(doc, {
      startY: 68,
      head: [['#', 'Job Number', 'Tenant Name', 'Address', 'Booked Date', 'Overdue']],
      body: tableData,
      styles: {
        fontSize: 9,
        cellPadding: 3,
      },
      headStyles: {
        fillColor: [220, 38, 38],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      alternateRowStyles: {
        fillColor: [254, 242, 242],
      },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        1: { cellWidth: 25 },
        2: { cellWidth: 40 },
        3: { cellWidth: 55 },
        4: { cellWidth: 25, halign: 'center' },
        5: { cellWidth: 20, halign: 'center' },
      },
    });

    // Footer
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text(
        `Page ${i} of ${pageCount} | Total Jobs: ${filteredJobs.length} | Generated by WorkWish`,
        105,
        doc.internal.pageSize.height - 10,
        { align: 'center' }
      );
    }

    // Save PDF
    const filename = selectedTeam === 'all' 
      ? `overdue-jobs-all-teams-${format(getGMTNow(), 'yyyy-MM-dd')}.pdf`
      : `overdue-jobs-${selectedTeam.toLowerCase().replace(/\s+/g, '-')}-${format(getGMTNow(), 'yyyy-MM-dd')}.pdf`;
    
    downloadPDF(doc, filename);
  };

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-orange-100 dark:bg-orange-900/30">
                <AlertTriangle className="w-6 h-6 text-orange-600 dark:text-orange-400" />
              </div>
              <div>
                <CardTitle className="text-xl">Jobs Requiring Attention</CardTitle>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {filteredJobs.length} job{filteredJobs.length !== 1 ? 's' : ''} need attention
                  {autoOverdueCount > 0 && ` • ${autoOverdueCount} overdue`}
                  {manualOngoingCount > 0 && ` • ${manualOngoingCount} ongoing`}
                </p>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* Team filter and PDF export */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <Select value={selectedTeam} onValueChange={setSelectedTeam}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Filter by team" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Teams</SelectItem>
                  {availableTeams.map((team) => (
                    <SelectItem key={team} value={team}>
                      {team}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={generateTeamPDF}
              disabled={filteredJobs.length === 0}
              className="gap-2"
            >
              <Download className="h-4 w-4" />
              Export PDF
            </Button>

            {selectedTeam !== 'all' && (
              <Badge variant="secondary" className="text-xs">
                <FileText className="h-3 w-3 mr-1" />
                {selectedTeam}'s overdue list
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {filteredJobs.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-4">
              <Clock className="w-8 h-8 text-success" />
            </div>
            <h3 className="text-lg font-semibold text-foreground">
              {selectedTeam === 'all' ? 'All Jobs On Track' : `No Overdue Jobs for ${selectedTeam}`}
            </h3>
            <p className="text-muted-foreground mt-1">
              {selectedTeam === 'all' 
                ? 'No overdue or ongoing jobs requiring attention.'
                : 'This team member has no outstanding jobs.'}
            </p>
          </div>
        ) : (
          <ScrollArea className="h-[500px] pr-4">
            <div className="space-y-3">
              {filteredJobs.map((job) => (
                <div
                  key={job.id}
                  className={cn(
                    "border rounded-lg p-4 cursor-pointer transition-all hover:shadow-md",
                    job.overdueReason === 'auto' 
                      ? "border-l-4 border-l-orange-500 bg-orange-50/50 dark:bg-orange-900/10" 
                      : "border-l-4 border-l-amber-500 bg-amber-50/50 dark:bg-amber-900/10"
                  )}
                  onClick={() => onJobClick(job)}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-sm font-bold text-primary">
                          #{job.jobNumber}
                        </span>
                        <Badge 
                          className={cn(
                            "text-white font-bold text-[10px] px-1.5 py-0.5 shadow-sm",
                            job.overdueReason === 'auto' 
                              ? "bg-orange-600 animate-pulse" 
                              : "bg-amber-500"
                          )}
                        >
                          <Clock className="w-3 h-3 mr-0.5" />
                          {job.overdueReason === 'auto' ? 'OVERDUE' : 'ONGOING'}
                        </Badge>
                        {job.overdueReason === 'auto' && job.hoursOverdue > 0 && (
                          <span className="text-xs text-orange-600 dark:text-orange-400 font-medium">
                            {job.hoursOverdue > 48 
                              ? `${Math.floor(job.hoursOverdue / 24)} days overdue`
                              : `${Math.round(job.hoursOverdue)} hours overdue`
                            }
                          </span>
                        )}
                      </div>
                      
                      <h3 className="font-semibold text-foreground mt-1 truncate">
                        {job.name}
                      </h3>
                      
                      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-sm text-muted-foreground">
                        {job.address && (
                          <div className="flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5" />
                            <span className="truncate max-w-[200px]">{job.address}</span>
                          </div>
                        )}
                        {job.phoneNumber && (
                          <div className="flex items-center gap-1">
                            <Phone className="w-3.5 h-3.5" />
                            <span>{job.phoneNumber}</span>
                          </div>
                        )}
                        {job.team && (
                          <div className="flex items-center gap-1">
                            <Users className="w-3.5 h-3.5" />
                            <span>{job.team}</span>
                            {job.team2 && <span>+ {job.team2}</span>}
                          </div>
                        )}
                      </div>

                      {job.bookedDate && (
                        <p className="text-xs text-muted-foreground mt-2">
                          Booked: {format(
                            job.bookedDate instanceof Date ? job.bookedDate : new Date(job.bookedDate),
                            'EEE d MMM yyyy'
                          )} ({formatDistanceToNow(
                            job.bookedDate instanceof Date ? job.bookedDate : new Date(job.bookedDate),
                            { addSuffix: true }
                          )})
                        </p>
                      )}
                    </div>

                    <Button
                      variant="ghost"
                      size="icon"
                      className="flex-shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        onJobClick(job);
                      }}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
};
