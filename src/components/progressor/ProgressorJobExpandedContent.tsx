import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Job, JOB_STATUS_OPTIONS, FanInfo } from '@/types/job';
import { SubTask, SUB_TASK_STATUS_OPTIONS } from '@/types/subTask';
import { useAuditLog } from '@/hooks/useAuditLog';
import { useCategories } from '@/hooks/useCategories';
import { ProgressorDescriptionEditor } from '@/components/progressor/ProgressorDescriptionEditor';
import { ProgressorTodoList } from '@/components/progressor/ProgressorTodoList';
import { ProgressorMediaUpload } from '@/components/progressor/ProgressorMediaUpload';
import { SubTaskJobSheetPDF } from '@/components/progressor/SubTaskJobSheetPDF';
import { ContactTimelineModal } from '@/components/ContactTimelineModal';
import { FanEditor } from '@/components/FanEditor';
import { FanBookingDateDialog } from '@/components/FanBookingDateDialog';
import { TeamSelector } from '@/components/TeamSelector';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { BookedDateCell } from '@/components/BookedDateCell';
import { extractFansWithAI, createLinkedFanJob, syncLinkedFanJob } from '@/lib/api';
import {
  AlertTriangle, Phone, MapPin, User, Flag, Plus, MessageSquare,
  Wrench, Users, Trash2, CalendarCheck, CheckCircle, CalendarClock, CornerDownRight, X, Fan, Pencil, Loader2, Wand2,
} from 'lucide-react';
import { format, differenceInHours, isPast } from 'date-fns';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface ContactRecord {
  id: string;
  outcome: string;
  notes: string | null;
  contact_date: string;
  next_action: string | null;
  next_action_date: string | null;
}

interface ProgressorJobExpandedContentProps {
  job: Job;
  jobSubTasks: SubTask[];
  jobContacts: ContactRecord[];
  onJobUpdate: (jobId: string, updates: Partial<Job>) => void;
  onSubTaskUpdate: (subTask: SubTask, field: string, value: any) => Promise<void>;
  onDeleteSubTask: (subTask: SubTask) => Promise<void>;
  onAddSubTask: (job: Job) => void;
  onRefresh: () => void;
}

// Parse ongoing reason into team and progressor parts
const parseOngoingReason = (reason: string) => {
  const PROGRESSOR_MARKER = '\n---PROGRESSOR---\n';
  const parts = reason.split(PROGRESSOR_MARKER);
  return { teamNotes: parts[0] || '', progressorNotes: parts[1] || '' };
};

// Get compliance risk level for a deadline
const getComplianceRisk = (deadline: Date | null) => {
  if (!deadline) return { level: 'unknown', color: 'bg-muted', label: 'No Deadline' };
  const hoursLeft = differenceInHours(deadline, new Date());
  if (hoursLeft < 0) return { level: 'overdue', color: 'bg-red-600 animate-pulse', label: 'OVERDUE' };
  if (hoursLeft < 24) return { level: 'critical', color: 'bg-red-500', label: '< 24h' };
  if (hoursLeft < 48) return { level: 'warning', color: 'bg-amber-500', label: '< 48h' };
  return { level: 'safe', color: 'bg-emerald-500', label: `${Math.ceil(hoursLeft / 24)}d` };
};

export function ProgressorJobExpandedContent({
  job,
  jobSubTasks,
  jobContacts,
  onJobUpdate,
  onSubTaskUpdate,
  onDeleteSubTask,
  onAddSubTask,
  onRefresh,
}: ProgressorJobExpandedContentProps) {
  const { logAction } = useAuditLog();
  const { categories } = useCategories();
  const [editingOngoingReason, setEditingOngoingReason] = useState(false);
  const [ongoingReasonDraft, setOngoingReasonDraft] = useState('');
  const [callLogOpen, setCallLogOpen] = useState(false);
  const [showTeamSelector, setShowTeamSelector] = useState(false);
  const [editingAddress, setEditingAddress] = useState(false);
  const [addressDraft, setAddressDraft] = useState('');
  const [isScanningFans, setIsScanningFans] = useState(false);
  const [fanBookingDialogData, setFanBookingDialogData] = useState<{ fanInfo: FanInfo[]; totalFanCount: number } | null>(null);

  const fanCategoryId = categories.find(c => c.name.toLowerCase().includes('fan'))?.id;
  const expectedDatePast = job.expectedCompletionDate && isPast(job.expectedCompletionDate);

  const startEditingOngoingReason = () => {
    setEditingOngoingReason(true);
    setOngoingReasonDraft(job.ongoingReason || '');
  };

  const handleSaveAddress = async () => {
    try {
      const { error } = await supabase.from('jobs').update({ address: addressDraft }).eq('id', job.id);
      if (error) throw error;
      await logAction({
        action: 'update', tableName: 'jobs', recordId: job.id,
        fieldChanged: 'address', oldValue: job.address || '', newValue: addressDraft,
        metadata: { jobNumber: job.jobNumber, updatedByProgressor: true },
      });
      onJobUpdate(job.id, { address: addressDraft });
      setEditingAddress(false);
      toast({ title: 'Address Updated', description: `Address saved for #${job.jobNumber}` });
    } catch (err) {
      console.error('Error saving address:', err);
      toast({ title: 'Error', description: 'Failed to update address', variant: 'destructive' });
    }
  };

  const handleAIFanScan = async () => {
    setIsScanningFans(true);
    try {
      const result = await extractFansWithAI(job.description || job.summaryOfWorks || '', job.workItems);
      if (result && result.hasFans) {
        // Update fan info on the job
        const { error } = await supabase.from('jobs').update({ fan_info: JSON.parse(JSON.stringify(result.fans)) }).eq('id', job.id);
        if (error) throw error;
        onJobUpdate(job.id, { fanInfo: result.fans });
        
        // Show booking dialog for the detected fans
        setFanBookingDialogData({ fanInfo: result.fans, totalFanCount: result.totalFanCount });
        toast({ title: 'Fans Detected!', description: `Found ${result.totalFanCount} fan(s) in job #${job.jobNumber}` });
      } else {
        // Mark as scanned with no fans
        const noFans = [{ type: '__SCANNED_NO_FANS__', quantity: 0, location: '' }];
        await supabase.from('jobs').update({ fan_info: JSON.parse(JSON.stringify(noFans)) }).eq('id', job.id);
        onJobUpdate(job.id, { fanInfo: noFans as FanInfo[] });
        toast({ title: 'No Fans Found', description: `No fans detected in job #${job.jobNumber}` });
      }
    } catch (err) {
      console.error('Error scanning fans:', err);
      toast({ title: 'Fan Scan Failed', description: 'Could not scan for fans', variant: 'destructive' });
    } finally {
      setIsScanningFans(false);
    }
  };

  const handleFanBookingConfirm = async (bookedDate: Date | null) => {
    if (!fanBookingDialogData || !fanCategoryId) return;
    try {
      const result = await createLinkedFanJob(job, fanBookingDialogData.fanInfo, fanCategoryId, bookedDate || undefined);
      if (result?.linkedFanJobId) {
        onJobUpdate(job.id, { linkedFanJobId: result.linkedFanJobId });
      }
      onRefresh();
      toast({ title: 'Fan Job Created', description: `Fan job created${bookedDate ? ` and booked for ${format(bookedDate, 'dd MMM yyyy')}` : ''}` });
    } catch (err) {
      console.error('Error creating fan job:', err);
      toast({ title: 'Error', description: 'Failed to create fan job', variant: 'destructive' });
    }
  };

  const handleSaveOngoingReason = async () => {
    try {
      const existingReason = job.ongoingReason || '';
      const PROGRESSOR_MARKER = '\n---PROGRESSOR---\n';
      const parts = existingReason.split(PROGRESSOR_MARKER);
      const teamPart = parts[0] || '';
      const progressorText = ongoingReasonDraft.replace(teamPart, '').trim();
      const newReason = progressorText
        ? `${teamPart}${PROGRESSOR_MARKER}${progressorText}`
        : teamPart;

      const { error } = await supabase
        .from('jobs')
        .update({ ongoing_reason: newReason })
        .eq('id', job.id);
      if (error) throw error;

      await logAction({
        action: 'update', tableName: 'jobs', recordId: job.id,
        fieldChanged: 'ongoing_reason', oldValue: existingReason, newValue: newReason,
        metadata: { jobNumber: job.jobNumber },
      });

      onJobUpdate(job.id, { ongoingReason: newReason });
      setEditingOngoingReason(false);
    } catch (err) {
      console.error('Error saving ongoing reason:', err);
    }
  };

  const handleExpectedCompletionDate = async (dateStr: string) => {
    try {
      const newDate = dateStr ? new Date(dateStr).toISOString() : null;
      const { error } = await supabase
        .from('jobs')
        .update({ expected_completion_date: newDate })
        .eq('id', job.id);
      if (error) throw error;

      await logAction({
        action: 'update', tableName: 'jobs', recordId: job.id,
        fieldChanged: 'expected_completion_date',
        oldValue: job.expectedCompletionDate ? job.expectedCompletionDate.toISOString() : '',
        newValue: dateStr || '',
        metadata: { jobNumber: job.jobNumber },
      });

      onJobUpdate(job.id, { expectedCompletionDate: dateStr ? new Date(dateStr) : null });
    } catch (err) {
      console.error('Error saving expected completion date:', err);
    }
  };

  const handleJobSignOff = async () => {
    if (!confirm(`Sign off job #${job.jobNumber} - ${job.name} as COMPLETE? This will move it to the Completed folder.`)) return;
    try {
      const { error } = await supabase
        .from('jobs')
        .update({
          is_completed: true, status: 'complete', progress: 100,
          completion_date: new Date().toISOString(),
        })
        .eq('id', job.id);
      if (error) throw error;

      await logAction({
        action: 'update', tableName: 'jobs', recordId: job.id,
        fieldChanged: 'status', oldValue: job.status, newValue: 'complete',
        metadata: { jobNumber: job.jobNumber, signedOffByProgressor: true },
      });

      onRefresh();
    } catch (err) {
      console.error('Error signing off job:', err);
    }
  };

  const handleTeamAssign = async (teamValue: string | null) => {
    try {
      let team1: string | null = null;
      let team2: string | null = null;
      if (teamValue && teamValue.includes('|')) {
        const parts = teamValue.split('|');
        team1 = parts[0];
        team2 = parts[1];
      } else {
        team1 = teamValue;
      }
      const { error } = await supabase
        .from('jobs')
        .update({ team: team1, team2: team2 })
        .eq('id', job.id);
      if (error) throw error;

      await logAction({
        action: 'update', tableName: 'jobs', recordId: job.id,
        fieldChanged: 'team', oldValue: job.team || '', newValue: team1 || '',
        metadata: { jobNumber: job.jobNumber, assignedByProgressor: true },
      });

      onJobUpdate(job.id, { team: team1, team2 });
      setShowTeamSelector(false);
      toast({ title: 'Team Updated', description: `Job #${job.jobNumber} team assignment updated.` });
    } catch (err) {
      console.error('Error assigning team:', err);
      toast({ title: 'Error', description: 'Failed to assign team', variant: 'destructive' });
    }
  };
  const handleReferBackNPH = async () => {
    if (!confirm(`Refer job #${job.jobNumber} - ${job.name} back to NPH? This will remove it from the Progressor Portal.`)) return;
    try {
      const { error } = await supabase
        .from('jobs')
        .update({
          refer_back: true,
          refer_back_reason: (job.referBackReason ? job.referBackReason + '; ' : '') + 'Referred back by Progressor',
          refer_back_date: new Date().toISOString(),
        })
        .eq('id', job.id);
      if (error) throw error;

      await logAction({
        action: 'update', tableName: 'jobs', recordId: job.id,
        fieldChanged: 'refer_back', oldValue: 'false', newValue: 'true',
        metadata: { jobNumber: job.jobNumber, referredByProgressor: true },
      });

      toast({ title: 'Job Referred Back', description: `#${job.jobNumber} sent to Refer Back NPH folder.` });
      onRefresh();
    } catch (err) {
      console.error('Error referring back job:', err);
    }
  };

  return (
    <div className="border-t">
      <div className="px-4 py-3 bg-muted/20 space-y-3">
        {/* Key info row */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3 text-xs">
          <div>
            <span className="text-muted-foreground flex items-center gap-1"><User className="h-3 w-3" /> Tenant</span>
            <p className="font-medium">{job.name}</p>
          </div>
          <div>
            <span className="text-muted-foreground flex items-center gap-1">
              <MapPin className="h-3 w-3" /> Address
              {!editingAddress && (
                <button onClick={(e) => { e.stopPropagation(); setEditingAddress(true); setAddressDraft(job.address || ''); }}
                  className="ml-1 text-primary hover:text-primary/80"><Pencil className="h-2.5 w-2.5" /></button>
              )}
            </span>
            {editingAddress ? (
              <div className="flex items-center gap-1 mt-0.5">
                <Input value={addressDraft} onChange={(e) => setAddressDraft(e.target.value)}
                  className="h-6 text-xs flex-1" autoFocus onKeyDown={(e) => e.key === 'Enter' && handleSaveAddress()} />
                <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-emerald-600" onClick={handleSaveAddress}>
                  <CheckCircle className="h-3 w-3" />
                </Button>
                <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setEditingAddress(false)}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ) : (
              <p className="font-medium">{job.address || '—'}</p>
            )}
          </div>
          <div>
            <span className="text-muted-foreground flex items-center gap-1"><Phone className="h-3 w-3" /> Phone</span>
            {job.phoneNumber ? (
              <div className="flex items-center gap-1.5">
                <a href={`tel:${job.phoneNumber}`} className="font-medium text-primary hover:underline">{job.phoneNumber}</a>
                <button
                  onClick={(e) => { e.stopPropagation(); setCallLogOpen(true); }}
                  className="h-6 w-6 flex items-center justify-center rounded-md bg-primary/10 hover:bg-primary/20 text-primary transition-colors"
                  title="Open Call Log"
                >
                  <Phone className="h-3 w-3" />
                </button>
              </div>
            ) : <p className="font-medium">—</p>}
          </div>
          <div>
            <span className="text-muted-foreground flex items-center gap-1"><CalendarCheck className="h-3 w-3" /> Booking</span>
            <BookedDateCell
              bookedDate={job.bookedDate}
              bookingNotes={job.bookingNotes || ''}
              teamName={job.team}
              isFlexible={job.isFlexibleBooking}
              onDateChange={async (date) => {
                try {
                  const updates: any = { booked_date: date ? date.toISOString() : null };
                  if (date && job.isCompleted) {
                    updates.is_completed = false;
                    updates.status = 'started';
                    updates.completion_date = null;
                    updates.progress = 50;
                  }
                  const { error } = await supabase.from('jobs').update(updates).eq('id', job.id);
                  if (error) throw error;

                  // Also update ALL pending (non-completed) sub-task booked dates so the
                  // trade-based scheduling stays in sync with the parent job date
                  if (date && jobSubTasks.length > 0) {
                    const pendingIds = jobSubTasks
                      .filter(st => !st.completionDate && !['completed_awaiting_portal', 'completed_signed_off'].includes(st.status))
                      .map(st => st.id);
                    if (pendingIds.length > 0) {
                      await supabase
                        .from('job_sub_tasks')
                        .update({ booked_date: date.toISOString() })
                        .in('id', pendingIds);
                    }
                  }

                  await logAction({
                    action: 'update', tableName: 'jobs', recordId: job.id,
                    fieldChanged: 'booked_date',
                    oldValue: job.bookedDate ? format(job.bookedDate, 'yyyy-MM-dd') : '',
                    newValue: date ? format(date, 'yyyy-MM-dd') : '',
                    metadata: { jobNumber: job.jobNumber, updatedByProgressor: true },
                  });
                  onJobUpdate(job.id, {
                    bookedDate: date,
                    ...(date && job.isCompleted ? { isCompleted: false, status: 'started' as const, completionDate: null, progress: 50 } : {}),
                  });
                  toast({ title: date ? 'Job Rebooked' : 'Booking Removed', description: `#${job.jobNumber} ${date ? `moved to ${format(date, 'dd MMM yyyy')}` : 'unbooked'}` });
                  // Refresh all views so the job moves to the correct date folder
                  onRefresh();
                } catch (err) {
                  console.error('Error updating booking:', err);
                  toast({ title: 'Error', description: 'Failed to update booking', variant: 'destructive' });
                }
              }}
              onNotesChange={async (notes) => {
                try {
                  const { error } = await supabase.from('jobs').update({ booking_notes: notes }).eq('id', job.id);
                  if (error) throw error;
                  onJobUpdate(job.id, { bookingNotes: notes });
                } catch (err) {
                  console.error('Error updating booking notes:', err);
                }
              }}
            />
          </div>
          <div className="relative">
            <span className="text-muted-foreground flex items-center gap-1"><Users className="h-3 w-3" /> Team</span>
            <div className="flex items-center gap-1.5">
              <p className="font-medium">{job.team || '—'}{job.team2 ? ` + ${job.team2}` : ''}</p>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 px-1.5 text-[10px]"
                onClick={(e) => { e.stopPropagation(); setShowTeamSelector(true); }}
              >
                <Users className="h-3 w-3" />
              </Button>
            </div>
            {showTeamSelector && (
              <TeamSelector
                job={job}
                currentCategoryId={undefined}
                onSelect={handleTeamAssign}
                onClose={() => setShowTeamSelector(false)}
              />
            )}
          </div>
          {/* Fan Editor with AI Scan */}
          <div>
            <span className="text-muted-foreground flex items-center gap-1"><Fan className="h-3 w-3" /> FAN</span>
            <div className="flex items-center gap-1.5">
              <FanEditor
                fanInfo={job.fanInfo || []}
                onUpdate={(fanInfo) => onJobUpdate(job.id, { fanInfo })}
                job={job}
                fanCategoryId={fanCategoryId}
                onJobUpdated={(updates) => {
                  onJobUpdate(job.id, updates);
                  onRefresh();
                }}
              />
              <Button
                variant="outline"
                size="sm"
                className="h-6 px-1.5 text-[10px]"
                onClick={(e) => { e.stopPropagation(); handleAIFanScan(); }}
                disabled={isScanningFans}
                title="AI Scan for Fans"
              >
                {isScanningFans ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
              </Button>
            </div>
          </div>
        </div>

        {/* Ongoing Reason — editable */}
        <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-2.5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-amber-700 dark:text-amber-300 font-semibold flex items-center gap-1 text-xs">
              <AlertTriangle className="h-3 w-3" /> Ongoing Reason / Notes
            </span>
            {!editingOngoingReason ? (
              <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2"
                onClick={(e) => { e.stopPropagation(); startEditingOngoingReason(); }}>
                Edit
              </Button>
            ) : (
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2"
                  onClick={() => setEditingOngoingReason(false)}>Cancel</Button>
                <Button size="sm" className="h-6 text-[10px] px-2"
                  onClick={handleSaveOngoingReason}>Save</Button>
              </div>
            )}
          </div>
          {editingOngoingReason ? (
            <Textarea
              value={ongoingReasonDraft}
              onChange={(e) => setOngoingReasonDraft(e.target.value)}
              placeholder="Add notes about why this job is ongoing..."
              className="min-h-[60px] resize-none text-xs bg-white dark:bg-background text-indigo-700 dark:text-indigo-300 font-medium"
            />
          ) : (
            <div className="text-xs space-y-1">
              {(() => {
                const { teamNotes, progressorNotes } = parseOngoingReason(job.ongoingReason || '');
                return (
                  <>
                    {teamNotes && <p className="whitespace-pre-wrap">{teamNotes}</p>}
                    {progressorNotes && (
                      <p className="whitespace-pre-wrap text-indigo-700 dark:text-indigo-300 font-medium border-l-2 border-indigo-400 pl-2 mt-1">
                        {progressorNotes}
                      </p>
                    )}
                    {!teamNotes && !progressorNotes && (
                      <p className="text-muted-foreground italic">No notes yet — click Edit to add</p>
                    )}
                  </>
                );
              })()}
            </div>
          )}
        </div>

        {/* ═══════════ PROGRESSOR SECTION ═══════════ */}
        <div className="bg-indigo-50/60 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-800 rounded-xl p-3 space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <div className="h-1 flex-1 bg-indigo-300 dark:bg-indigo-700 rounded-full" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">Progressor Section</span>
            <div className="h-1 flex-1 bg-indigo-300 dark:bg-indigo-700 rounded-full" />
          </div>

          {/* Description & To-Do side by side */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <ProgressorDescriptionEditor
              jobId={job.id}
              description={job.description || ''}
              onSaved={(newDesc) => onJobUpdate(job.id, { description: newDesc })}
            />
            <ProgressorTodoList jobId={job.id} />
          </div>

          {/* Contact History */}
          <div className="bg-background border rounded-lg p-2.5 text-xs">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-muted-foreground font-semibold flex items-center gap-1">
                <Phone className="h-3 w-3" /> Contact Log ({jobContacts.length})
              </span>
              <Button variant="outline" size="sm" className="h-6 text-[10px] px-2"
                onClick={(e) => { e.stopPropagation(); setCallLogOpen(true); }}>
                <Plus className="h-3 w-3 mr-0.5" /> Log Call
              </Button>
            </div>
            {jobContacts.length > 0 ? (
              <div className="space-y-1 max-h-[80px] overflow-y-auto">
                {jobContacts.slice(0, 5).map(c => (
                  <div key={c.id} className="flex items-center gap-2 text-[11px]">
                    <span className="text-muted-foreground shrink-0">
                      {format(new Date(c.contact_date), 'dd/MM HH:mm')}
                    </span>
                    <Badge variant="outline" className="text-[10px] shrink-0">{c.outcome}</Badge>
                    {c.notes && <span className="truncate">{c.notes}</span>}
                  </div>
                ))}
                {jobContacts.length > 5 && (
                  <p className="text-muted-foreground text-[10px]">+ {jobContacts.length - 5} more</p>
                )}
              </div>
            ) : (
              <p className="text-muted-foreground text-[10px] italic">No calls logged yet</p>
            )}
          </div>

          {/* Contact Timeline Modal */}
          {callLogOpen && (
            <ContactTimelineModal
              isOpen={true}
              onClose={() => { setCallLogOpen(false); onRefresh(); }}
              jobId={job.id}
              jobNumber={job.jobNumber}
              tenantName={job.name}
              phoneNumber={job.phoneNumber || ''}
              description={job.description}
              bookedDate={job.bookedDate}
              onBookJob={async (bookedDate, isFlexible) => {
                try {
                  await supabase.from('jobs').update({
                    booked_date: bookedDate.toISOString(),
                    is_flexible_booking: isFlexible,
                  }).eq('id', job.id);
                  onJobUpdate(job.id, { bookedDate, isFlexibleBooking: isFlexible });
                } catch (err) { console.error('Error booking:', err); }
              }}
              onDescriptionChange={async (newDesc) => {
                try {
                  await supabase.from('jobs').update({ description: newDesc }).eq('id', job.id);
                  onJobUpdate(job.id, { description: newDesc });
                } catch (err) { console.error('Error updating description:', err); }
              }}
              onReferBack={async (reason) => {
                try {
                  await supabase.from('jobs').update({
                    refer_back: true, refer_back_reason: reason,
                    refer_back_date: new Date().toISOString(),
                  }).eq('id', job.id);
                  onJobUpdate(job.id, { referBack: true });
                } catch (err) { console.error('Error referring back:', err); }
              }}
            />
          )}

          {/* Existing Attachments */}
          {job.attachments && job.attachments.length > 0 && (
            <div className="bg-background border rounded-lg p-3 space-y-2">
              <span className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
                📎 Existing Media ({job.attachments.length})
              </span>
              <div className="grid grid-cols-4 md:grid-cols-6 gap-2 max-h-[200px] overflow-y-auto">
                {job.attachments.map((att: any) => (
                  <div key={att.id || att.url} className="relative group rounded-md border overflow-hidden">
                    <a href={att.url} target="_blank" rel="noopener noreferrer"
                      className="block hover:ring-2 hover:ring-primary transition-all">
                      {att.type === 'image' ? (
                        <img src={att.url} alt={att.name || 'Photo'} className="w-full h-16 object-cover" loading="lazy" />
                      ) : att.type === 'video' ? (
                        <div className="w-full h-16 bg-muted flex items-center justify-center text-[10px] text-muted-foreground">🎥 Video</div>
                      ) : (
                        <div className="w-full h-16 bg-muted flex items-center justify-center text-[10px] text-muted-foreground">📄 {att.name || 'Doc'}</div>
                      )}
                    </a>
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (!confirm(`Delete ${att.name || 'this file'}?`)) return;
                        try {
                          // Remove from storage if path exists
                          const path = att.path || att.url?.match(/\/job-attachments\/(.+)$/)?.[1];
                          if (path) {
                            await supabase.storage.from('job-attachments').remove([path]);
                          }
                          // Remove from job attachments array
                          const updatedAttachments = job.attachments.filter((a: any) => (a.id || a.url) !== (att.id || att.url));
                          const { error } = await supabase.from('jobs').update({ attachments: JSON.parse(JSON.stringify(updatedAttachments)) }).eq('id', job.id);
                          if (error) throw error;
                          onJobUpdate(job.id, { attachments: updatedAttachments });
                          toast({ title: 'File deleted', description: `${att.name || 'File'} removed.` });
                        } catch (err) {
                          console.error('Error deleting attachment:', err);
                          toast({ title: 'Delete failed', variant: 'destructive' });
                        }
                      }}
                      className="absolute top-0.5 right-0.5 p-0.5 rounded-full bg-destructive text-destructive-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Summary of Works (read-only) */}
          {job.summaryOfWorks && (
            <div className="bg-background border rounded-lg p-2.5 text-xs">
              <span className="text-muted-foreground font-semibold">📋 Summary of Works</span>
              <p className="mt-0.5 whitespace-pre-wrap">{job.summaryOfWorks}</p>
            </div>
          )}

          {/* Work Items (read-only) */}
          {job.workItems && job.workItems.length > 0 && (
            <div className="bg-background border rounded-lg p-2.5 text-xs">
              <span className="text-muted-foreground font-semibold">🔧 Work Items ({job.workItems.length})</span>
              <div className="mt-1 space-y-1 max-h-[120px] overflow-y-auto">
                {job.workItems.map((item: any, i: number) => (
                  <div key={item.id || i} className="flex items-center gap-2 text-[11px]">
                    {item.isConfirmed === false && <span className="text-red-500 line-through">{item.description}</span>}
                    {item.isConfirmed !== false && <span>{item.sorCode && <Badge variant="outline" className="text-[9px] mr-1">{item.sorCode}</Badge>}{item.description}</span>}
                    {item.hasModification && item.variation && (
                      <span className="text-amber-600 italic text-[10px]">({item.variation})</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Media Upload */}
          <ProgressorMediaUpload jobId={job.id} jobNumber={job.jobNumber} onUploaded={onRefresh} />

          {/* Expected Completion Date + Actions */}
          <div className="flex items-center justify-between gap-3 bg-background border rounded-lg p-2.5">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 text-xs">
                <CalendarCheck className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-muted-foreground font-medium">Expected Completion:</span>
                <Input
                  type="date"
                  value={job.expectedCompletionDate ? format(job.expectedCompletionDate, 'yyyy-MM-dd') : ''}
                  onChange={(e) => handleExpectedCompletionDate(e.target.value)}
                  className={cn(
                    "h-7 text-xs w-[140px]",
                    !job.expectedCompletionDate && "border-orange-400",
                    expectedDatePast && "border-red-500 bg-red-50 dark:bg-red-950/20",
                  )}
                />
                {expectedDatePast && (
                  <span className="text-red-600 dark:text-red-400 font-bold text-[10px] animate-pulse">⚠ PAST DUE</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="text-xs border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700"
                onClick={(e) => { e.stopPropagation(); handleReferBackNPH(); }}
              >
                <CornerDownRight className="h-3.5 w-3.5 mr-1" /> Refer to NPH
              </Button>
              <Button
                size="sm"
                className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={(e) => { e.stopPropagation(); handleJobSignOff(); }}
              >
                <CheckCircle className="h-3.5 w-3.5 mr-1" /> Sign Off Complete
              </Button>
            </div>
          </div>
        </div>

        {/* Refer back info */}
        {job.referBack && (
          <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg p-2 text-xs">
            <span className="text-red-700 dark:text-red-300 font-semibold flex items-center gap-1">
              <Flag className="h-3 w-3" /> Referred Back
            </span>
            <p className="mt-0.5">{job.referBackReason || 'No reason given'}</p>
            {job.referBackDate && <p className="text-muted-foreground">{format(job.referBackDate, 'dd MMM yyyy')}</p>}
          </div>
        )}

        {/* Progress Notes (read-only) */}
        {job.progressNotes && (
          <div className="bg-background border rounded-lg p-2.5 text-xs">
            <span className="text-muted-foreground font-semibold flex items-center gap-1">
              <MessageSquare className="h-3 w-3" /> Progress Notes
            </span>
            <p className="mt-0.5 whitespace-pre-wrap line-clamp-3">{job.progressNotes}</p>
          </div>
        )}
      </div>

      {/* Sub-Task / Trade Section */}
      <div className="mx-2 mb-2 rounded-xl border-2 border-amber-400 dark:border-amber-500 bg-amber-50/80 dark:bg-amber-950/30 shadow-lg shadow-amber-200/30 dark:shadow-amber-900/20">
        <div className="flex items-center justify-between px-4 py-2.5 bg-amber-100/80 dark:bg-amber-900/40 rounded-t-xl border-b border-amber-300 dark:border-amber-700">
          <div className="flex items-center gap-2">
            <Wrench className="h-4.5 w-4.5 text-amber-700 dark:text-amber-400" />
            <span className="font-bold text-sm text-amber-800 dark:text-amber-300 uppercase tracking-wide">
              Scheduled Trades ({jobSubTasks.length})
            </span>
          </div>
          {jobSubTasks.length > 0 && (
            <div className="flex gap-1.5">
              {(() => {
                const completed = jobSubTasks.filter(st => st.status === 'completed_signed_off').length;
                const booked = jobSubTasks.filter(st => st.bookedDate).length;
                return (
                  <>
                    <Badge className="bg-emerald-600 text-white text-[10px] px-1.5">{completed}/{jobSubTasks.length} Done</Badge>
                    <Badge className="bg-blue-600 text-white text-[10px] px-1.5">{booked} Booked</Badge>
                  </>
                );
              })()}
            </div>
          )}
        </div>

        {jobSubTasks.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-amber-200 dark:border-amber-800 bg-amber-100/40 dark:bg-amber-900/20">
                    <th className="px-3 py-2 text-left text-xs font-bold text-amber-800 dark:text-amber-300">Trade</th>
                    <th className="px-3 py-2 text-left text-xs font-bold text-amber-800 dark:text-amber-300">Team</th>
                    <th className="px-3 py-2 text-left text-xs font-bold text-amber-800 dark:text-amber-300">Booked</th>
                    <th className="px-3 py-2 text-left text-xs font-bold text-amber-800 dark:text-amber-300">Deadline</th>
                    <th className="px-3 py-2 text-left text-xs font-bold text-amber-800 dark:text-amber-300">Completion</th>
                    <th className="px-3 py-2 text-left text-xs font-bold text-amber-800 dark:text-amber-300">Status</th>
                    <th className="px-3 py-2 text-left text-xs font-bold text-amber-800 dark:text-amber-300">Portal</th>
                    <th className="px-3 py-2 text-left text-xs font-bold text-amber-800 dark:text-amber-300">Notes</th>
                    <th className="px-3 py-2 text-center text-xs font-bold text-amber-800 dark:text-amber-300">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {jobSubTasks.map(st => {
                    const risk = getComplianceRisk(st.deadlineDate);
                    const isComplete = st.status === 'completed_signed_off';
                    const hasBookedDate = !!st.bookedDate;
                    return (
                      <tr key={st.id} className={cn(
                        "border-b border-amber-200/60 dark:border-amber-800/40 transition-colors",
                        risk.level === 'overdue' && !isComplete && "bg-red-50 dark:bg-red-950/20",
                        isComplete && "bg-emerald-50/70 dark:bg-emerald-950/10 opacity-80",
                        hasBookedDate && !isComplete && "bg-blue-50/50 dark:bg-blue-950/10",
                        !hasBookedDate && !isComplete && "bg-amber-50/30 dark:bg-amber-950/10",
                      )}>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-1.5">
                            <Wrench className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                            <Input
                              value={st.trade}
                              onChange={(e) => onSubTaskUpdate(st, 'trade', e.target.value)}
                              className="h-7 text-xs font-semibold w-[120px]"
                            />
                          </div>
                          {st.description && (
                            <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">{st.description}</p>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <Input value={st.assignedTeam || ''} onChange={(e) => onSubTaskUpdate(st, 'assignedTeam', e.target.value)}
                            placeholder="Assign..." className="h-7 text-xs w-[100px]" />
                        </td>
                        <td className="px-3 py-2">
                          <Input type="date" value={st.bookedDate ? format(st.bookedDate, 'yyyy-MM-dd') : ''}
                            onChange={(e) => onSubTaskUpdate(st, 'bookedDate', e.target.value || null)}
                            className={cn("h-7 text-xs w-[120px]", hasBookedDate && "border-blue-400 bg-blue-50 dark:bg-blue-950/30 font-medium")} />
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1.5">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className={cn("w-2.5 h-2.5 rounded-full flex-shrink-0", risk.color)} />
                              </TooltipTrigger>
                              <TooltipContent>{risk.label}</TooltipContent>
                            </Tooltip>
                            <Input type="date" value={st.deadlineDate ? format(st.deadlineDate, 'yyyy-MM-dd') : ''}
                              onChange={(e) => onSubTaskUpdate(st, 'deadlineDate', e.target.value || null)}
                              className="h-7 text-xs w-[120px]" />
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <Input type="date" value={st.completionDate ? format(st.completionDate, 'yyyy-MM-dd') : ''}
                            onChange={(e) => onSubTaskUpdate(st, 'completionDate', e.target.value || null)}
                            className="h-7 text-xs w-[120px]" />
                        </td>
                        <td className="px-3 py-2">
                          <Select value={st.status} onValueChange={(v) => onSubTaskUpdate(st, 'status', v)}>
                            <SelectTrigger className="h-7 text-xs w-[160px]"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {SUB_TASK_STATUS_OPTIONS.map(o => (
                                <SelectItem key={o.value} value={o.value} disabled={o.value === 'completed_signed_off' && !st.completionDate}>
                                  <div className="flex items-center gap-1.5">
                                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: o.color }} />
                                    <span className="text-xs">{o.label}</span>
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <Checkbox checked={st.portalUpdated} onCheckedChange={(v) => onSubTaskUpdate(st, 'portalUpdated', !!v)} className="h-4 w-4" />
                        </td>
                        <td className="px-3 py-2">
                          <Input value={st.notes} onChange={(e) => onSubTaskUpdate(st, 'notes', e.target.value)}
                            placeholder="Notes..." className="h-7 text-xs w-[150px]" />
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center justify-center gap-1">
                            <SubTaskJobSheetPDF subTask={st} job={job} />
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                              onClick={() => onDeleteSubTask(st)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-2.5 border-t border-amber-200 dark:border-amber-800 flex justify-end">
              <Button size="sm" className="text-xs bg-amber-600 hover:bg-amber-700 text-white" onClick={() => onAddSubTask(job)}>
                <Plus className="h-3 w-3 mr-1" /> Add Trades
              </Button>
            </div>
          </>
        ) : (
          <div className="px-4 py-6 text-center">
            <Wrench className="h-8 w-8 text-amber-400 mx-auto mb-2" />
            <p className="text-sm font-medium text-amber-800 dark:text-amber-300">No trades scheduled yet</p>
            <Button size="sm" className="mt-2 text-xs bg-amber-600 hover:bg-amber-700 text-white" onClick={() => onAddSubTask(job)}>
              <Plus className="h-3 w-3 mr-1" /> Add Trades
            </Button>
          </div>
        )}
      </div>

      {/* Fan Booking Date Dialog */}
      {fanBookingDialogData && (
        <FanBookingDateDialog
          open={!!fanBookingDialogData}
          onOpenChange={(open) => { if (!open) setFanBookingDialogData(null); }}
          job={job}
          fanInfo={fanBookingDialogData.fanInfo}
          totalFanCount={fanBookingDialogData.totalFanCount}
          onConfirm={handleFanBookingConfirm}
        />
      )}
    </div>
  );
}
