import { useMemo, useState, useEffect } from 'react';
import { Job } from '@/types/job';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, Clock, MapPin, Phone, Users, X, ExternalLink, Download } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { getGMTNow, getHoursDifferenceGMT } from '@/lib/dateUtils';
import { supabase } from '@/integrations/supabase/client';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { downloadPDF } from '@/lib/pdfDownload';

interface OverdueJobsDashboardProps {
  jobs: Job[]; // kept for interface compat but we query our own DM jobs
  signOffStatuses?: Record<string, { allSignedOff: boolean }>;
  onClose: () => void;
  onJobClick: (job: Job) => void;
}

interface OverdueJob {
  id: string;
  jobNumber: string;
  name: string;
  address: string;
  phoneNumber: string;
  team: string | null;
  team2: string | null;
  bookedDate: Date | null;
  hoursOverdue: number;
  overdueReason: 'auto' | 'manual';
  isOngoing: boolean;
}

export const OverdueJobsDashboard = ({
  onClose,
  onJobClick,
}: OverdueJobsDashboardProps) => {
  const [selectedTeam, setSelectedTeam] = useState<string>('all');
  const [overdueJobs, setOverdueJobs] = useState<OverdueJob[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch DM-only overdue jobs directly from DB
  useEffect(() => {
    const fetchOverdueJobs = async () => {
      try {
        const [catRes, signOffRes] = await Promise.all([
          supabase.from('categories').select('id').eq('slug', 'dm-jobs').single(),
          supabase.from('team_sign_offs').select('job_id'),
        ]);
        if (!catRes.data) return;

        const { data: jobsData } = await supabase
          .from('jobs')
          .select('id, job_number, name, address, phone_number, team, team2, booked_date, is_completed, status, refer_back, is_ongoing, progress')
          .eq('category_id', catRes.data.id)
          .is('deleted_at', null)
          .eq('is_completed', false)
          .eq('refer_back', false);

        const signedOffIds = new Set((signOffRes.data || []).map(s => s.job_id));
        const now = getGMTNow();
        const result: OverdueJob[] = [];

        for (const job of (jobsData || [])) {
          if (job.status === 'complete' || job.progress === 100) continue;

          // Manual ongoing flag
          if (job.is_ongoing && !signedOffIds.has(job.id)) {
            result.push({
              id: job.id,
              jobNumber: job.job_number,
              name: job.name,
              address: job.address || '',
              phoneNumber: job.phone_number || '',
              team: job.team,
              team2: job.team2,
              bookedDate: job.booked_date ? new Date(job.booked_date) : null,
              hoursOverdue: 0,
              overdueReason: 'manual',
              isOngoing: true,
            });
            continue;
          }

          // Auto-trigger: 24h+ past booked date
          if (!job.booked_date) continue;
          const bd = new Date(job.booked_date);
          if (isNaN(bd.getTime()) || bd.getTime() >= now.getTime()) continue;
          const hoursPast = getHoursDifferenceGMT(now, bd);
          if (hoursPast <= 24) continue;
          if (signedOffIds.has(job.id)) continue;

          result.push({
            id: job.id,
            jobNumber: job.job_number,
            name: job.name,
            address: job.address || '',
            phoneNumber: job.phone_number || '',
            team: job.team,
            team2: job.team2,
            bookedDate: bd,
            hoursOverdue: Math.round(hoursPast - 24),
            overdueReason: 'auto',
            isOngoing: job.is_ongoing || false,
          });
        }

        result.sort((a, b) => {
          if (a.overdueReason === 'manual' && b.overdueReason !== 'manual') return -1;
          if (a.overdueReason !== 'manual' && b.overdueReason === 'manual') return 1;
          return b.hoursOverdue - a.hoursOverdue;
        });

        setOverdueJobs(result);
      } catch (err) {
        console.error('Failed to fetch overdue DM jobs:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchOverdueJobs();
  }, []);

  const availableTeams = useMemo(() => {
    const teams = new Set<string>();
    overdueJobs.forEach(job => {
      if (job.team) teams.add(job.team);
      if (job.team2) teams.add(job.team2);
    });
    return Array.from(teams).sort();
  }, [overdueJobs]);

  const filteredJobs = useMemo(() => {
    if (selectedTeam === 'all') return overdueJobs;
    return overdueJobs.filter(job =>
      job.team === selectedTeam || job.team2 === selectedTeam
    );
  }, [overdueJobs, selectedTeam]);

  const autoOverdueCount = filteredJobs.filter(j => j.overdueReason === 'auto').length;
  const manualOngoingCount = filteredJobs.filter(j => j.overdueReason === 'manual').length;

  const handleJobClick = async (job: OverdueJob) => {
    try {
      const { data } = await supabase.from('jobs').select('*').eq('id', job.id).single();
      if (!data) return;
      // Map DB record to Job type
      const mapped: Job = {
        id: data.id,
        jobNumber: data.job_number,
        name: data.name,
        address: data.address || '',
        phoneNumber: data.phone_number || '',
        summaryOfWorks: data.summary_of_works || '',
        description: data.description || '',
        workItems: Array.isArray(data.work_items) ? data.work_items as any : [],
        additionalWorks: Array.isArray(data.additional_works) ? data.additional_works as any : [],
        team: data.team,
        team2: data.team2,
        progress: data.progress || 0,
        progressNotes: data.progress_notes || '',
        isCompleted: data.is_completed || false,
        isOngoing: data.is_ongoing || false,
        ongoingReason: data.ongoing_reason || '',
        scheduledTrades: Array.isArray(data.scheduled_trades) ? data.scheduled_trades as any : [],
        createdAt: new Date(data.created_at),
        dateIssued: data.date_issued ? new Date(data.date_issued) : new Date(data.created_at),
        bookedDate: data.booked_date ? new Date(data.booked_date) : null,
        isFlexibleBooking: data.is_flexible_booking || false,
        bookingNotes: data.booking_notes || '',
        completionDate: data.completion_date ? new Date(data.completion_date) : null,
        attachments: Array.isArray(data.attachments) ? data.attachments as any : [],
        status: (data.status as any) || 'pending',
        fanInfo: data.fan_info as any,
        linkedFanJobId: data.linked_fan_job_id,
        insulationInfo: data.insulation_info as any,
        linkedInsulationJobId: data.linked_insulation_job_id,
        costs: data.costs as any,
        privateNotes: data.private_notes || '',
        referBack: data.refer_back || false,
        referBackReason: data.refer_back_reason || '',
        referBackDate: data.refer_back_date ? new Date(data.refer_back_date) : null,
        expectedCompletionDate: data.expected_completion_date ? new Date(data.expected_completion_date) : null,
        blockerType: data.blocker_type,
        blockerNotes: data.blocker_notes || '',
        blockerSetAt: data.blocker_set_at ? new Date(data.blocker_set_at) : null,
        blockerChaseDate: data.blocker_chase_date ? new Date(data.blocker_chase_date) : null,
      };
      onJobClick(mapped);
    } catch (err) {
      console.error('Failed to open job:', err);
    }
  };

  const generateTeamPDF = () => {
    if (filteredJobs.length === 0) return;
    const doc = new jsPDF();
    const teamName = selectedTeam === 'all' ? 'All Teams' : selectedTeam;
    const currentDate = format(getGMTNow(), 'dd MMMM yyyy');

    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(220, 38, 38);
    doc.text('Jobs Requiring Completion Immediately', 105, 20, { align: 'center' });
    doc.setFontSize(14);
    doc.setTextColor(0, 0, 0);
    doc.text(`Team: ${teamName}`, 105, 30, { align: 'center' });
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text(`Generated: ${currentDate}`, 105, 37, { align: 'center' });

    doc.setFillColor(254, 243, 199);
    doc.roundedRect(14, 42, 182, 20, 3, 3, 'F');
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(180, 83, 9);
    doc.text('IMPORTANT: Please complete and sign-off the following jobs immediately.', 105, 50, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text('These jobs are overdue and require your urgent attention.', 105, 57, { align: 'center' });

    const tableData = filteredJobs.map((job, index) => {
      const bookedStr = job.bookedDate ? format(job.bookedDate, 'dd/MM/yyyy') : 'N/A';
      const overdueStr = job.overdueReason === 'auto'
        ? (job.hoursOverdue > 48 ? `${Math.floor(job.hoursOverdue / 24)} days` : `${Math.round(job.hoursOverdue)} hrs`)
        : 'Ongoing';
      return [
        (index + 1).toString(),
        job.jobNumber,
        job.name.substring(0, 25) + (job.name.length > 25 ? '...' : ''),
        (job.address?.substring(0, 30) || 'N/A') + (job.address && job.address.length > 30 ? '...' : ''),
        bookedStr,
        overdueStr,
      ];
    });

    autoTable(doc, {
      startY: 68,
      head: [['#', 'Job Number', 'Tenant Name', 'Address', 'Booked Date', 'Overdue']],
      body: tableData,
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [220, 38, 38], textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [254, 242, 242] },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        1: { cellWidth: 25 },
        2: { cellWidth: 40 },
        3: { cellWidth: 55 },
        4: { cellWidth: 25, halign: 'center' },
        5: { cellWidth: 20, halign: 'center' },
      },
    });

    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text(`Page ${i} of ${pageCount} | Total Jobs: ${filteredJobs.length}`, 105, doc.internal.pageSize.height - 10, { align: 'center' });
    }

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
                <CardTitle className="text-xl">DM Jobs Requiring Attention</CardTitle>
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
                    <SelectItem key={team} value={team}>{team}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" size="sm" onClick={generateTeamPDF} disabled={filteredJobs.length === 0} className="gap-2">
              <Download className="h-4 w-4" />Export PDF
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-center py-12 text-muted-foreground">Loading...</div>
        ) : filteredJobs.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center mx-auto mb-4">
              <Clock className="w-8 h-8 text-green-600" />
            </div>
            <h3 className="text-lg font-semibold">
              {selectedTeam === 'all' ? 'All DM Jobs On Track' : `No Overdue Jobs for ${selectedTeam}`}
            </h3>
            <p className="text-muted-foreground mt-1">No overdue or ongoing DM jobs.</p>
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
                  onClick={() => handleJobClick(job)}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-sm font-bold text-primary">#{job.jobNumber}</span>
                        <Badge
                          className={cn(
                            "text-white font-bold text-[10px] px-1.5 py-0.5 shadow-sm",
                            job.overdueReason === 'auto' ? "bg-orange-600 animate-pulse" : "bg-amber-500"
                          )}
                        >
                          <Clock className="w-3 h-3 mr-0.5" />
                          {job.overdueReason === 'auto' ? 'OVERDUE' : 'ONGOING'}
                        </Badge>
                        {job.overdueReason === 'auto' && job.hoursOverdue > 0 && (
                          <span className="text-xs text-orange-600 dark:text-orange-400 font-medium">
                            {job.hoursOverdue > 48
                              ? `${Math.floor(job.hoursOverdue / 24)} days overdue`
                              : `${Math.round(job.hoursOverdue)} hours overdue`}
                          </span>
                        )}
                      </div>
                      <h3 className="font-semibold text-foreground mt-1 truncate">{job.name}</h3>
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
                            <span>{job.team}{job.team2 && ` + ${job.team2}`}</span>
                          </div>
                        )}
                      </div>
                      {job.bookedDate && (
                        <p className="text-xs text-muted-foreground mt-2">
                          Booked: {format(job.bookedDate, 'EEE d MMM yyyy')} ({formatDistanceToNow(job.bookedDate, { addSuffix: true })})
                        </p>
                      )}
                    </div>
                    <Button variant="ghost" size="icon" className="flex-shrink-0" onClick={(e) => { e.stopPropagation(); handleJobClick(job); }}>
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
