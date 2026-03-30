import { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { NotepadPanel } from '@/components/DanniNotepadPanel';
import { DanniNewJobPanel } from '@/components/DanniNewJobPanel';
import { Job, Attachment, WorkItem } from '@/types/job';
import { ContactCell } from '@/components/ContactCell';
import { useAllContactHistory } from '@/hooks/useContactHistory';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import {
  Clock, MapPin, Users, X, ExternalLink,
  Camera, FileText, Wrench, ShieldAlert, DoorOpen, PenLine,
  CalendarDays, Tag, Save, RotateCcw, BarChart3, Loader2,
  CalendarPlus, SendHorizonal, UserPlus, StickyNote, Bell, BellRing,
  Plus, Trash2, ChevronDown, CheckCircle2, Link2, CircleDot
} from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { format, isPast, isToday } from 'date-fns';
import { cn } from '@/lib/utils';
import { getGMTNow, getHoursDifferenceGMT } from '@/lib/dateUtils';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useTeamSettings } from '@/hooks/useTeamSettings';

// Blocker types with metadata
const BLOCKER_TYPES = [
  { value: 'awaiting_photos', label: 'Awaiting Photos', icon: Camera, color: 'bg-blue-500' },
  { value: 'awaiting_description', label: 'Awaiting Description', icon: PenLine, color: 'bg-indigo-500' },
  { value: 'photos_and_description', label: 'Photos & Description', icon: FileText, color: 'bg-violet-500' },
  { value: 'awaiting_trade', label: 'Awaiting Trade', icon: Wrench, color: 'bg-amber-500' },
  { value: 'awaiting_nph', label: 'Awaiting NPH', icon: ShieldAlert, color: 'bg-purple-500' },
  { value: 'rework_required', label: 'Rework Required', icon: RotateCcw, color: 'bg-red-500' },
  { value: 'no_access', label: 'No Access', icon: DoorOpen, color: 'bg-gray-500' },
] as const;

type BlockerType = typeof BLOCKER_TYPES[number]['value'];

interface DanniDashboardProps {
  onClose: () => void;
  onJobClick: (job: Job) => void;
  onJobUpdated?: () => void;
  onShowMetrics?: () => void;
}

interface ReadinessJob {
  id: string;
  jobNumber: string;
  name: string;
  address: string;
  phoneNumber: string;
  team: string | null;
  team2: string | null;
  description: string;
  attachments: Attachment[];
  bookedDate: Date | null;
  status: string;
  isCompleted: boolean;
  isOngoing: boolean;
  blockerType: string | null;
  blockerNotes: string;
  blockerChaseDate: Date | null;
  referBack: boolean;
  hoursOverdue: number;
  hasPhotos: boolean;
  hasDescription: boolean;
  hasSignOff: boolean;
  hasTradePending: boolean;
  autoBlocker: string | null;
}

export const DanniDashboard = ({
  onClose,
  onJobClick,
  onJobUpdated,
  onShowMetrics,
}: DanniDashboardProps) => {
  const [selectedTeam, setSelectedTeam] = useState<string>('all');
  const [filterBlocker, setFilterBlocker] = useState<string>('all');
  const [editingBlocker, setEditingBlocker] = useState<string | null>(null);
  const [rebookingJob, setRebookingJob] = useState<string | null>(null);
  const [rebookDate, setRebookDate] = useState<Date | undefined>(undefined);
  const [rebookTeam, setRebookTeam] = useState<string>('same');
  const [rebookTeam2, setRebookTeam2] = useState<string>('none');
  const [savingRebook, setSavingRebook] = useState(false);
  const [blockerForm, setBlockerForm] = useState<{
    type: BlockerType | '';
    notes: string;
    chaseDate: Date | undefined;
  }>({ type: '', notes: '', chaseDate: undefined });
  const [savingBlocker, setSavingBlocker] = useState(false);
  const [dmJobs, setDmJobs] = useState<any[]>([]);
  const [dmCategoryId, setDmCategoryId] = useState<string>('');
  const [signOffs, setSignOffs] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [childJobsMap, setChildJobsMap] = useState<Record<string, any[]>>({});
  const [expandedChildren, setExpandedChildren] = useState<Record<string, boolean>>({});
  const [signingOffJob, setSigningOffJob] = useState<string | null>(null);
  
  // Notepad state
  const [showNotepad, setShowNotepad] = useState(false);
  const [notepadJobId, setNotepadJobId] = useState<string | null>(null);
  const [danniNotes, setDanniNotes] = useState<any[]>([]);
  const [newNoteText, setNewNoteText] = useState('');
  const [newNoteAlertDate, setNewNoteAlertDate] = useState<Date | undefined>(undefined);
  const [savingNote, setSavingNote] = useState(false);
  const [activeAlerts, setActiveAlerts] = useState<any[]>([]);
  const [expandedNotes, setExpandedNotes] = useState<Record<string, boolean>>({});
  const alertAudioRef = useRef<HTMLAudioElement | null>(null);
  
  const { toast } = useToast();
  const { settings: teamSettings } = useTeamSettings();

  // Get all readiness job IDs for bulk contact history loading
  const allJobIds = useMemo(() => dmJobs.map((j: any) => j.id), [dmJobs]);
  const { historyMap: contactHistoryMap } = useAllContactHistory(allJobIds);

  // Get DM team members only
  const dmTeams = useMemo(() => {
    return teamSettings.filter(t => t.type === 'dm').sort((a, b) => a.teamName.localeCompare(b.teamName));
  }, [teamSettings]);

  // Fetch DM jobs directly from database
  const fetchDmJobs = useCallback(async () => {
    try {
      // Get DM category ID
      const { data: catData } = await supabase
        .from('categories')
        .select('id')
        .eq('slug', 'dm-jobs')
        .single();

      if (!catData) return;
      const dmCatId = catData.id;
      setDmCategoryId(dmCatId);

      // Fetch DM jobs and sign-offs in parallel
      const [jobsRes, signOffRes] = await Promise.all([
        supabase
          .from('jobs')
          .select('id, job_number, name, address, phone_number, team, team2, description, attachments, booked_date, status, is_completed, is_ongoing, blocker_type, blocker_notes, blocker_chase_date, refer_back, ongoing_reason')
          .eq('category_id', dmCatId)
          .is('deleted_at', null),
        supabase
          .from('team_sign_offs')
          .select('job_id')
      ]);

      if (jobsRes.data) setDmJobs(jobsRes.data);

      // Build sign-off lookup
      if (signOffRes.data) {
        const signedOffJobIds = new Set(signOffRes.data.map(s => s.job_id));
        const map: Record<string, boolean> = {};
        signedOffJobIds.forEach(id => { map[id] = true; });
        setSignOffs(map);
      }
    } catch (err) {
      console.error('Failed to fetch DM jobs for Danni:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch linked child jobs for all DM jobs
  const fetchChildJobs = useCallback(async () => {
    if (dmJobs.length === 0) return;
    try {
      // Child jobs have private_notes containing parent job ID
      const { data } = await supabase
        .from('jobs')
        .select('id, job_number, name, status, is_completed, progress, team, team2, booked_date, private_notes, attachments, description')
        .is('deleted_at', null);
      
      if (!data) return;
      
      const map: Record<string, any[]> = {};
      const parentIds = new Set(dmJobs.map((j: any) => j.id));
      
      for (const job of data) {
        if (!job.private_notes) continue;
        // Match pattern: "Linked from parent job #XXX (UUID)"
        for (const parentId of parentIds) {
          if (job.private_notes.includes(parentId)) {
            if (!map[parentId]) map[parentId] = [];
            map[parentId].push(job);
            break;
          }
        }
      }
      setChildJobsMap(map);
    } catch (err) {
      console.error('Failed to fetch child jobs:', err);
    }
  }, [dmJobs]);

  useEffect(() => {
    fetchChildJobs();
  }, [fetchChildJobs]);

  useEffect(() => {
    fetchDmJobs();
  }, [fetchDmJobs]);

  const handleRefresh = useCallback(() => {
    fetchDmJobs();
    fetchDanniNotes();
    fetchChildJobs();
    onJobUpdated?.();
  }, [fetchDmJobs, onJobUpdated, fetchChildJobs]);

  // Fetch Danni notes
  const fetchDanniNotes = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('danni_notes')
        .select('*')
        .order('created_at', { ascending: false });
      if (data) {
        setDanniNotes(data);
        // Check for active alerts (due now or overdue, not dismissed)
        const now = new Date();
        const alerts = data.filter((n: any) => 
          n.alert_date && !n.alert_dismissed && new Date(n.alert_date) <= now
        );
        setActiveAlerts(alerts);
        if (alerts.length > 0) {
          // Play alert sound
          try {
            const ctx = new AudioContext();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.value = 800;
            gain.gain.value = 0.3;
            osc.start();
            osc.stop(ctx.currentTime + 0.3);
            setTimeout(() => {
              const osc2 = ctx.createOscillator();
              const gain2 = ctx.createGain();
              osc2.connect(gain2);
              gain2.connect(ctx.destination);
              osc2.frequency.value = 1000;
              gain2.gain.value = 0.3;
              osc2.start();
              osc2.stop(ctx.currentTime + 0.3);
            }, 350);
          } catch {}
        }
      }
    } catch (err) {
      console.error('Failed to fetch danni notes:', err);
    }
  }, []);

  useEffect(() => {
    fetchDanniNotes();
    const interval = setInterval(fetchDanniNotes, 60000); // check alerts every minute
    return () => clearInterval(interval);
  }, [fetchDanniNotes]);

  const handleSaveNote = useCallback(async () => {
    if (!newNoteText.trim()) return;
    setSavingNote(true);
    try {
      const noteData: any = {
        note_text: newNoteText.trim(),
        job_id: notepadJobId || null,
        alert_date: newNoteAlertDate?.toISOString() || null,
      };
      // Find team name from job if job-specific
      if (notepadJobId) {
        const job = dmJobs.find(j => j.id === notepadJobId);
        if (job?.team) noteData.team_name = job.team;
      }
      const { error } = await supabase.from('danni_notes').insert(noteData);
      if (error) throw error;
      setNewNoteText('');
      setNewNoteAlertDate(undefined);
      toast({ title: 'Note saved' });
      fetchDanniNotes();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSavingNote(false);
    }
  }, [newNoteText, notepadJobId, newNoteAlertDate, dmJobs, toast, fetchDanniNotes]);

  const handleDeleteNote = useCallback(async (noteId: string) => {
    try {
      await supabase.from('danni_notes').delete().eq('id', noteId);
      fetchDanniNotes();
    } catch {}
  }, [fetchDanniNotes]);

  const handleDismissAlert = useCallback(async (noteId: string) => {
    try {
      await supabase.from('danni_notes').update({ alert_dismissed: true }).eq('id', noteId);
      fetchDanniNotes();
      toast({ title: 'Alert dismissed' });
    } catch {}
  }, [fetchDanniNotes, toast]);

  // Compute readiness data for DM jobs: 24h+ past booked date OR manually flagged ongoing
  const readinessJobs = useMemo(() => {
    const now = getGMTNow();
    const result: ReadinessJob[] = [];

    for (const raw of dmJobs) {
      if (raw.is_completed || raw.status === 'complete') continue;
      if (raw.refer_back) continue;

      // Determine if job qualifies: either 24h+ overdue OR manually flagged ongoing
      let isAutoOverdue = false;
      let hoursOverdue = 0;
      let bookedDate: Date | null = null;

      if (raw.booked_date) {
        bookedDate = new Date(raw.booked_date);
        if (!isNaN(bookedDate.getTime())) {
          const hoursPast = getHoursDifferenceGMT(now, bookedDate);
          if (bookedDate.getTime() < now.getTime() && hoursPast > 24 && !signOffs[raw.id]) {
            isAutoOverdue = true;
            hoursOverdue = Math.round(hoursPast - 24);
          }
        }
      }

      const isManualOngoing = raw.is_ongoing && !signOffs[raw.id];

      // Skip if neither overdue nor manually ongoing
      if (!isAutoOverdue && !isManualOngoing) continue;

      const attachments: Attachment[] = Array.isArray(raw.attachments) ? raw.attachments : [];
      const hasPhotos = attachments.some((a: any) => a.type === 'image');
      const hasDescription = !!(raw.description && raw.description.trim().length > 10);
      const hasTradePending = raw.status === 'awaiting_trade' || raw.is_ongoing;

      let autoBlocker: string | null = null;
      if (!hasPhotos && !hasDescription) autoBlocker = 'photos_and_description';
      else if (!hasPhotos) autoBlocker = 'awaiting_photos';
      else if (!hasDescription) autoBlocker = 'awaiting_description';
      else if (hasTradePending) autoBlocker = 'awaiting_trade';

      result.push({
        id: raw.id,
        jobNumber: raw.job_number,
        name: raw.name,
        address: raw.address || '',
        phoneNumber: raw.phone_number || '',
        team: raw.team,
        team2: raw.team2,
        description: raw.description || '',
        attachments,
        bookedDate: bookedDate || new Date(),
        status: raw.status || 'pending',
        isCompleted: raw.is_completed || false,
        isOngoing: raw.is_ongoing || false,
        blockerType: raw.blocker_type,
        blockerNotes: raw.blocker_notes || '',
        blockerChaseDate: raw.blocker_chase_date ? new Date(raw.blocker_chase_date) : null,
        referBack: raw.refer_back || false,
        hoursOverdue,
        hasPhotos,
        hasDescription,
        hasSignOff: false,
        hasTradePending,
        autoBlocker,
      });
    }

    // Sort: manual ongoing first, then by hours overdue
    return result.sort((a, b) => {
      if (a.isOngoing && !b.isOngoing) return -1;
      if (!a.isOngoing && b.isOngoing) return 1;
      return b.hoursOverdue - a.hoursOverdue;
    });
  }, [dmJobs, signOffs]);

  // Team filter
  const availableTeams = useMemo(() => {
    const teams = new Set<string>();
    readinessJobs.forEach(j => {
      if (j.team) teams.add(j.team);
      if (j.team2) teams.add(j.team2);
    });
    return Array.from(teams).sort();
  }, [readinessJobs]);

  const filteredJobs = useMemo(() => {
    let result = readinessJobs;
    if (selectedTeam !== 'all') {
      result = result.filter(j => j.team === selectedTeam || j.team2 === selectedTeam);
    }
    if (filterBlocker !== 'all') {
      if (filterBlocker === 'untagged') {
        result = result.filter(j => !j.blockerType);
      } else {
        result = result.filter(j => j.blockerType === filterBlocker);
      }
    }
    return result;
  }, [readinessJobs, selectedTeam, filterBlocker]);

  // Build notes-per-job lookup for displaying on cards
  const notesByJobId = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const note of danniNotes) {
      if (note.job_id) {
        if (!map[note.job_id]) map[note.job_id] = [];
        map[note.job_id].push(note);
      }
    }
    return map;
  }, [danniNotes]);

  const missingPhotos = readinessJobs.filter(j => !j.hasPhotos).length;
  const missingDescription = readinessJobs.filter(j => !j.hasDescription).length;
  const awaitingTrade = readinessJobs.filter(j => j.hasTradePending).length;

  const handleSaveBlocker = useCallback(async (jobId: string) => {
    if (!blockerForm.type) return;
    setSavingBlocker(true);
    try {
      const { error } = await supabase
        .from('jobs')
        .update({
          blocker_type: blockerForm.type,
          blocker_notes: blockerForm.notes,
          blocker_set_at: new Date().toISOString(),
          blocker_chase_date: blockerForm.chaseDate?.toISOString() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', jobId);
      if (error) throw error;

      toast({ title: 'Blocker tagged', description: `Job tagged as "${BLOCKER_TYPES.find(b => b.value === blockerForm.type)?.label}"` });
      setEditingBlocker(null);
      setBlockerForm({ type: '', notes: '', chaseDate: undefined });
      handleRefresh();
    } catch (err) {
      console.error('Failed to save blocker:', err);
      toast({ title: 'Error', description: 'Failed to save blocker tag', variant: 'destructive' });
    } finally {
      setSavingBlocker(false);
    }
  }, [blockerForm, toast, handleRefresh]);

  const handleClearBlocker = useCallback(async (jobId: string) => {
    try {
      const { error } = await supabase
        .from('jobs')
        .update({
          blocker_type: null,
          blocker_notes: '',
          blocker_set_at: null,
          blocker_chase_date: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', jobId);
      if (error) throw error;
      toast({ title: 'Blocker cleared' });
      handleRefresh();
    } catch (err) {
      toast({ title: 'Error', description: 'Failed to clear blocker', variant: 'destructive' });
    }
  }, [toast, handleRefresh]);

  const handleRebook = useCallback(async (job: ReadinessJob) => {
    if (!rebookDate) return;
    setSavingRebook(true);
    try {
      const newTeam = rebookTeam === 'same' ? job.team : rebookTeam;
      const newTeam2 = rebookTeam2 === 'none' ? null : rebookTeam2;

      const { error } = await supabase
        .from('jobs')
        .update({
          booked_date: rebookDate.toISOString(),
          team: newTeam,
          team2: newTeam2,
          blocker_type: null,
          blocker_notes: '',
          blocker_set_at: null,
          blocker_chase_date: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', job.id);
      if (error) throw error;

      const teamLabel = newTeam || 'unassigned';
      const team2Label = newTeam2 ? ` + ${newTeam2}` : '';

      toast({
        title: 'Job rebooked',
        description: `${job.name} rebooked for ${format(rebookDate, 'EEE dd MMM')} with ${teamLabel}${team2Label}`,
      });
      setRebookingJob(null);
      setRebookDate(undefined);
      setRebookTeam('same');
      setRebookTeam2('none');
      handleRefresh();
    } catch (err) {
      console.error('Failed to rebook:', err);
      toast({ title: 'Error', description: 'Failed to rebook job', variant: 'destructive' });
    } finally {
      setSavingRebook(false);
    }
  }, [rebookDate, rebookTeam, rebookTeam2, toast, handleRefresh]);

  const handleQuickTag = useCallback(async (jobId: string, type: BlockerType) => {
    setSavingBlocker(true);
    try {
      const { error } = await supabase
        .from('jobs')
        .update({
          blocker_type: type,
          blocker_notes: '',
          blocker_set_at: new Date().toISOString(),
          blocker_chase_date: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', jobId);
      if (error) throw error;
      const label = BLOCKER_TYPES.find(b => b.value === type)?.label;
      toast({ title: 'Tagged', description: `Job tagged as "${label}"` });
      handleRefresh();
    } catch (err) {
      toast({ title: 'Error', description: 'Failed to tag', variant: 'destructive' });
    } finally {
      setSavingBlocker(false);
    }
  }, [toast, handleRefresh]);

  const getBlockerInfo = (job: ReadinessJob) => {
    return BLOCKER_TYPES.find(b => b.value === job.blockerType) || null;
  };

  // Convert ReadinessJob to full Job by fetching from DB
  const handleJobClick = useCallback(async (rj: ReadinessJob) => {
    try {
      const { data, error } = await supabase
        .from('jobs')
        .select('*')
        .eq('id', rj.id)
        .single();
      
      if (error || !data) {
        toast({ title: 'Error', description: 'Failed to load job details', variant: 'destructive' });
        return;
      }

      const jobForModal: Job = {
        id: data.id,
        jobNumber: data.job_number,
        name: data.name,
        address: data.address || '',
        phoneNumber: data.phone_number || '',
        summaryOfWorks: data.summary_of_works || '',
        description: data.description || '',
        workItems: Array.isArray(data.work_items) ? (data.work_items as any[]) : [],
        additionalWorks: Array.isArray(data.additional_works) ? (data.additional_works as any[]) : [],
        team: data.team,
        team2: data.team2,
        progress: data.progress || 0,
        progressNotes: data.progress_notes || '',
        isCompleted: data.is_completed || false,
        isOngoing: data.is_ongoing || false,
        ongoingReason: data.ongoing_reason || '',
        scheduledTrades: Array.isArray(data.scheduled_trades) ? (data.scheduled_trades as any[]) : [],
        createdAt: new Date(data.created_at),
        dateIssued: data.date_issued ? new Date(data.date_issued) : new Date(),
        bookedDate: data.booked_date ? new Date(data.booked_date) : null,
        isFlexibleBooking: data.is_flexible_booking || false,
        bookingNotes: data.booking_notes || '',
        completionDate: data.completion_date ? new Date(data.completion_date) : null,
        attachments: Array.isArray(data.attachments) ? (data.attachments as any[]) : [],
        status: (data.status || 'pending') as any,
        fanInfo: Array.isArray(data.fan_info) ? (data.fan_info as any[]) : null,
        linkedFanJobId: data.linked_fan_job_id,
        insulationInfo: Array.isArray(data.insulation_info) ? (data.insulation_info as any[]) : null,
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
      onJobClick(jobForModal);
    } catch (err) {
      console.error('Failed to open job:', err);
      toast({ title: 'Error', description: 'Failed to open job', variant: 'destructive' });
    }
  }, [onJobClick, toast]);

  // Sign off a job - marks complete and creates sign-off record
  const handleSignOff = useCallback(async (job: ReadinessJob) => {
    setSigningOffJob(job.id);
    try {
      const attachments: Attachment[] = job.attachments || [];
      const photosCount = attachments.filter(a => a.type === 'image').length;
      const videosCount = attachments.filter(a => a.type === 'video').length;
      const documentsCount = attachments.filter(a => a.type === 'document').length;

      // Create sign-off record
      const signOffData = {
        job_id: job.id,
        team_id: job.team || 'danni',
        team_name: job.team || 'Danni',
        photos_count: photosCount,
        videos_count: videosCount,
        documents_count: documentsCount,
        work_items_total: 0,
        work_items_modified: 0,
        progress_notes: `Signed off by Danni from Sign-Off Dashboard`,
      };

      const [signOffRes, jobUpdateRes] = await Promise.all([
        supabase.from('team_sign_offs').insert(signOffData),
        supabase.from('jobs').update({
          is_completed: true,
          status: 'complete',
          progress: 100,
          completion_date: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('id', job.id),
      ]);

      if (signOffRes.error) throw signOffRes.error;
      if (jobUpdateRes.error) throw jobUpdateRes.error;

      // Also create notification for admin dashboard
      await supabase.from('team_sign_off_notifications').insert({
        job_id: job.id,
        job_number: job.jobNumber,
        job_name: job.name,
        team_id: job.team || 'danni',
        team_name: job.team || 'Danni',
        photos_count: photosCount,
        videos_count: videosCount,
        documents_count: documentsCount,
        work_items_total: 0,
        work_items_modified: 0,
        progress_notes: 'Signed off by Danni',
      });

      toast({
        title: 'Job signed off ✓',
        description: `${job.name} moved to Completed folder`,
      });
      handleRefresh();
    } catch (err: any) {
      console.error('Sign-off failed:', err);
      toast({ title: 'Sign-off failed', description: err.message, variant: 'destructive' });
    } finally {
      setSigningOffJob(null);
    }
  }, [toast, handleRefresh]);

  if (loading) {
    return (
      <Card className="w-full max-w-5xl mx-auto max-h-[90vh] flex flex-col">
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">Loading DM jobs...</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-5xl mx-auto max-h-[90vh] flex flex-col relative overflow-hidden">
      <CardHeader className="pb-3 flex-shrink-0">
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-red-100 dark:bg-red-900/30">
                <Clock className="w-6 h-6 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <CardTitle className="text-xl">Danni's Sign-Off Readiness</CardTitle>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {readinessJobs.length} DM job{readinessJobs.length !== 1 ? 's' : ''} overdue 24h+ without sign-off
                </p>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-2.5 text-center">
              <p className="text-2xl font-bold text-red-600 dark:text-red-400">{readinessJobs.length}</p>
              <p className="text-[11px] text-muted-foreground">Total Overdue</p>
            </div>
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-2.5 text-center">
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{missingPhotos}</p>
              <p className="text-[11px] text-muted-foreground">Missing Photos</p>
            </div>
            <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-2.5 text-center">
              <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{missingDescription}</p>
              <p className="text-[11px] text-muted-foreground">Missing Description</p>
            </div>
            <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-2.5 text-center">
              <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{awaitingTrade}</p>
              <p className="text-[11px] text-muted-foreground">Awaiting Trade</p>
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <Select value={selectedTeam} onValueChange={setSelectedTeam}>
                <SelectTrigger className="w-[160px] h-8 text-xs">
                  <SelectValue placeholder="Team" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Teams</SelectItem>
                  {availableTeams.map(t => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Tag className="h-4 w-4 text-muted-foreground" />
              <Select value={filterBlocker} onValueChange={setFilterBlocker}>
                <SelectTrigger className="w-[180px] h-8 text-xs">
                  <SelectValue placeholder="Blocker" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Blockers</SelectItem>
                  <SelectItem value="untagged">Untagged</SelectItem>
                  {BLOCKER_TYPES.map(b => (
                    <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Badge variant="secondary" className="text-xs">
              Showing {filteredJobs.length} of {readinessJobs.length}
            </Badge>
            <div className="flex-1" />
            {activeAlerts.length > 0 && (
              <Button
                variant="destructive"
                size="sm"
                className="h-7 text-xs gap-1 animate-pulse"
                onClick={() => setShowNotepad(true)}
              >
                <BellRing className="w-3 h-3" />
                {activeAlerts.length} Alert{activeAlerts.length !== 1 ? 's' : ''}
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => setShowNotepad(!showNotepad)}
            >
              <StickyNote className="w-3 h-3" />
              Notes
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={onShowMetrics}
            >
              <BarChart3 className="w-3 h-3" />
              Team Report
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 overflow-hidden pt-0">
        {filteredJobs.length === 0 ? (
          <div className="text-center py-12">
            <Clock className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-40" />
            <p className="text-muted-foreground">No matching overdue DM jobs</p>
          </div>
        ) : (
          <ScrollArea className="h-[calc(90vh-340px)]">
            <div className="space-y-2 pr-3">
              {filteredJobs.map((job) => {
                const blockerInfo = getBlockerInfo(job);
                const isEditing = editingBlocker === job.id;
                const isRebooking = rebookingJob === job.id;

                return (
                  <div
                    key={job.id}
                    className={cn(
                      "border rounded-lg p-3 transition-all hover:shadow-md",
                      "border-l-4",
                      job.hoursOverdue > 72 ? "border-l-red-600 bg-red-50/50 dark:bg-red-950/20" :
                      job.hoursOverdue > 48 ? "border-l-orange-500 bg-orange-50/30 dark:bg-orange-950/10" :
                      "border-l-amber-400 bg-amber-50/20 dark:bg-amber-950/10"
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-sm font-bold text-primary">
                            #{job.jobNumber}
                          </span>
                          <Badge className="bg-red-600 text-white text-[10px] px-1.5 py-0 font-bold">
                            {job.hoursOverdue > 48
                              ? `${Math.floor(job.hoursOverdue / 24)}d overdue`
                              : `${job.hoursOverdue}h overdue`}
                          </Badge>
                          <div className="flex items-center gap-1 ml-1">
                            <span title={job.hasPhotos ? 'Photos uploaded' : 'Missing photos'}
                              className={cn("w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px]",
                                job.hasPhotos ? "bg-emerald-500" : "bg-red-500 animate-pulse"
                              )}>
                              <Camera className="w-3 h-3" />
                            </span>
                            <span title={job.hasDescription ? 'Description filled' : 'Missing description'}
                              className={cn("w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px]",
                                job.hasDescription ? "bg-emerald-500" : "bg-red-500 animate-pulse"
                              )}>
                              <PenLine className="w-3 h-3" />
                            </span>
                            <span title={job.hasTradePending ? 'Trade pending' : 'No trade issue'}
                              className={cn("w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px]",
                                !job.hasTradePending ? "bg-emerald-500" : "bg-amber-500"
                              )}>
                              <Wrench className="w-3 h-3" />
                            </span>
                          </div>
                        </div>

                        <h3 className="font-semibold text-foreground mt-1 truncate text-sm">
                          {job.name}
                        </h3>

                        <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1 text-xs text-muted-foreground">
                          {job.address && (
                            <span className="flex items-center gap-1 truncate max-w-[200px]">
                              <MapPin className="w-3 h-3" />{job.address}
                            </span>
                          )}
                          {job.team && (
                            <span className="flex items-center gap-1">
                              <Users className="w-3 h-3" />{job.team}{job.team2 ? ` + ${job.team2}` : ''}
                            </span>
                          )}
                          {job.bookedDate && (
                            <span className="flex items-center gap-1">
                              <CalendarDays className="w-3 h-3" />
                              {format(job.bookedDate, 'dd MMM')}
                            </span>
                          )}
                        </div>

                        {/* Call Log - shared with Genie */}
                        <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                          <ContactCell
                            jobId={job.id}
                            jobNumber={job.jobNumber}
                            tenantName={job.name}
                            phoneNumber={job.phoneNumber}
                            description={job.description}
                            bookedDate={job.bookedDate}
                            status={job.status}
                            contactHistory={contactHistoryMap[job.id] || []}
                          />
                        </div>

                        {/* Collapsible notes preview on card */}
                        {(() => {
                          const jobNotes = notesByJobId[job.id] || [];
                          const latestNotes = jobNotes.slice(0, 3);
                          const hasActiveAlert = jobNotes.some((n: any) => n.alert_date && !n.alert_dismissed && new Date(n.alert_date) <= new Date());
                          return (
                            <Collapsible
                              open={expandedNotes[job.id] ?? hasActiveAlert}
                              onOpenChange={(open) => setExpandedNotes(prev => ({ ...prev, [job.id]: open }))}
                            >
                              <div
                                className={cn(
                                  "mt-2 rounded-md border transition-colors",
                                  hasActiveAlert ? "border-destructive/50 bg-destructive/5" : "border-border bg-muted/30"
                                )}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <CollapsibleTrigger asChild>
                                  <button className="w-full flex items-center gap-1.5 p-2 hover:bg-accent/50 transition-colors rounded-t-md text-left">
                                    <StickyNote className="w-3 h-3 text-primary flex-shrink-0" />
                                    <span className="text-[10px] font-semibold text-primary">
                                      Notes {jobNotes.length > 0 ? `(${jobNotes.length})` : ''}
                                    </span>
                                    {hasActiveAlert && (
                                      <BellRing className="w-3 h-3 text-destructive animate-pulse ml-auto" />
                                    )}
                                    {jobNotes.length === 0 && (
                                      <span className="text-[10px] text-muted-foreground ml-auto">Click to add</span>
                                    )}
                                    <ChevronDown className={cn(
                                      "w-3 h-3 text-muted-foreground transition-transform duration-200 flex-shrink-0",
                                      (expandedNotes[job.id] ?? hasActiveAlert) && "rotate-180"
                                    )} />
                                  </button>
                                </CollapsibleTrigger>
                                <CollapsibleContent>
                                  <div className="px-2 pb-2 space-y-0.5">
                                    {latestNotes.map((note: any) => (
                                      <div key={note.id} className="flex items-start gap-1.5 text-[10px] text-muted-foreground">
                                        {note.alert_date && !note.alert_dismissed && (
                                          <Bell className="w-2.5 h-2.5 text-amber-500 mt-0.5 flex-shrink-0" />
                                        )}
                                        <span className="truncate">{note.note_text}</span>
                                        <span className="text-[9px] opacity-60 flex-shrink-0 ml-auto">
                                          {format(new Date(note.created_at), 'dd MMM')}
                                        </span>
                                      </div>
                                    ))}
                                    {jobNotes.length > 3 && (
                                      <p className="text-[9px] text-primary">+{jobNotes.length - 3} more...</p>
                                    )}
                                    <button
                                      className="w-full text-[10px] text-primary font-medium mt-1 hover:underline text-left"
                                      onClick={() => { setNotepadJobId(job.id); setShowNotepad(true); }}
                                    >
                                      {jobNotes.length > 0 ? '→ View all / Add note' : '→ Add a note'}
                                    </button>
                                  </div>
                                </CollapsibleContent>
                              </div>
                            </Collapsible>
                          );
                        })()}

                        {/* New Linked Job panel */}
                        <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                          <DanniNewJobPanel
                            parentJobId={job.id}
                            parentJobNumber={job.jobNumber}
                            parentName={job.name}
                            parentAddress={job.address}
                            parentPhone={job.phoneNumber}
                            parentTeam={job.team}
                            dmCategoryId={dmCategoryId}
                            dmTeams={dmTeams}
                            onJobCreated={handleRefresh}
                          />
                        </div>

                        {/* Linked Child Jobs */}
                        {(() => {
                          const children = childJobsMap[job.id] || [];
                          if (children.length === 0) return null;
                          return (
                            <Collapsible
                              open={expandedChildren[job.id] ?? false}
                              onOpenChange={(open) => setExpandedChildren(prev => ({ ...prev, [job.id]: open }))}
                            >
                              <div className="mt-2 rounded-md border border-primary/20 bg-primary/5" onClick={(e) => e.stopPropagation()}>
                                <CollapsibleTrigger asChild>
                                  <button className="w-full flex items-center gap-1.5 p-2 hover:bg-accent/50 transition-colors rounded-t-md text-left">
                                    <Link2 className="w-3 h-3 text-primary flex-shrink-0" />
                                    <span className="text-[10px] font-semibold text-primary">
                                      Linked Jobs ({children.length})
                                    </span>
                                    <ChevronDown className={cn(
                                      "w-3 h-3 text-muted-foreground transition-transform duration-200 ml-auto flex-shrink-0",
                                      expandedChildren[job.id] && "rotate-180"
                                    )} />
                                  </button>
                                </CollapsibleTrigger>
                                <CollapsibleContent>
                                  <div className="px-2 pb-2 space-y-1.5">
                                    {children.map((child: any) => {
                                      const isChildComplete = child.is_completed || child.status === 'complete';
                                      const childPhotos = Array.isArray(child.attachments) ? child.attachments.filter((a: any) => a.type === 'image').length : 0;
                                      const childHasDesc = !!(child.description && child.description.trim().length > 10);
                                      return (
                                        <div key={child.id} className={cn(
                                          "flex items-center gap-2 p-1.5 rounded border text-xs",
                                          isChildComplete ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800" : "bg-background border-border"
                                        )}>
                                          <CircleDot className={cn("w-3 h-3 flex-shrink-0", isChildComplete ? "text-emerald-500" : "text-amber-500")} />
                                          <div className="flex-1 min-w-0">
                                            <span className="font-mono text-[10px] font-bold">#{child.job_number}</span>
                                            <span className="text-muted-foreground text-[10px] ml-1.5">{child.team || 'Unassigned'}</span>
                                          </div>
                                          <div className="flex items-center gap-1 flex-shrink-0">
                                            <span className={cn("w-4 h-4 rounded-full flex items-center justify-center text-white", childPhotos > 0 ? "bg-emerald-500" : "bg-red-500")} title={`${childPhotos} photos`}>
                                              <Camera className="w-2.5 h-2.5" />
                                            </span>
                                            <span className={cn("w-4 h-4 rounded-full flex items-center justify-center text-white", childHasDesc ? "bg-emerald-500" : "bg-red-500")} title={childHasDesc ? "Has description" : "No description"}>
                                              <PenLine className="w-2.5 h-2.5" />
                                            </span>
                                          </div>
                                          <Badge variant={isChildComplete ? "default" : "secondary"} className={cn("text-[9px] px-1.5 py-0", isChildComplete && "bg-emerald-600")}>
                                            {isChildComplete ? 'Complete' : (child.status || 'Pending')}
                                          </Badge>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </CollapsibleContent>
                              </div>
                            </Collapsible>
                          );
                        })()}

                        {blockerInfo && !isEditing && (
                          <div className="mt-2 flex items-center gap-2 flex-wrap">
                            <Badge className={cn("text-white text-[10px] px-2 py-0.5", blockerInfo.color)}>
                              <blockerInfo.icon className="w-3 h-3 mr-1" />
                              {blockerInfo.label}
                            </Badge>
                            {job.blockerChaseDate && (
                              <span className="text-[10px] text-muted-foreground">
                                Chase: {format(job.blockerChaseDate, 'dd MMM')}
                              </span>
                            )}
                            {job.blockerNotes && (
                              <span className="text-[10px] text-muted-foreground truncate max-w-[200px]">
                                {job.blockerNotes}
                              </span>
                            )}
                          </div>
                        )}

                        {!blockerInfo && !isEditing && job.autoBlocker && (
                          <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] text-orange-600 dark:text-orange-400 font-medium mr-1">
                              ⚡ Suggested:
                            </span>
                            {!job.hasPhotos && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-5 text-[10px] px-1.5 py-0 gap-0.5"
                                onClick={(e) => { e.stopPropagation(); handleQuickTag(job.id, !job.hasDescription ? 'photos_and_description' : 'awaiting_photos'); }}
                                disabled={savingBlocker}
                              >
                                <Camera className="w-2.5 h-2.5" />
                                {!job.hasDescription ? 'Photos & Desc' : 'Photos'}
                              </Button>
                            )}
                            {job.hasPhotos && !job.hasDescription && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-5 text-[10px] px-1.5 py-0 gap-0.5"
                                onClick={(e) => { e.stopPropagation(); handleQuickTag(job.id, 'awaiting_description'); }}
                                disabled={savingBlocker}
                              >
                                <PenLine className="w-2.5 h-2.5" />
                                Description
                              </Button>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col gap-1 flex-shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={(e) => { e.stopPropagation(); handleJobClick(job); }}
                          title="View job"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant={isEditing ? "secondary" : "ghost"}
                          size="icon"
                          className="h-7 w-7"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (isEditing) {
                              setEditingBlocker(null);
                            } else {
                              setEditingBlocker(job.id);
                              setRebookingJob(null);
                              setBlockerForm({
                                type: (job.blockerType || '') as BlockerType | '',
                                notes: job.blockerNotes || '',
                                chaseDate: job.blockerChaseDate || undefined,
                              });
                            }
                          }}
                          title="Tag blocker"
                        >
                          <Tag className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant={isRebooking ? "secondary" : "ghost"}
                          size="icon"
                          className="h-7 w-7"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (isRebooking) {
                              setRebookingJob(null);
                            } else {
                              setRebookingJob(job.id);
                              setEditingBlocker(null);
                              setRebookDate(undefined);
                              setRebookTeam('same');
                              setRebookTeam2('none');
                            }
                          }}
                          title="Rebook job"
                        >
                          <CalendarPlus className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className={cn("h-7 w-7", signingOffJob === job.id && "opacity-50")}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (signingOffJob) return;
                            if (window.confirm(`Sign off "${job.name}" and move to Completed?`)) {
                              handleSignOff(job);
                            }
                          }}
                          disabled={signingOffJob === job.id}
                          title="Sign off job"
                        >
                          {signingOffJob === job.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                          )}
                        </Button>
                      </div>
                    </div>

                    {/* Rebook panel with team reassignment */}
                    {isRebooking && (
                      <div className="mt-3 pt-3 border-t space-y-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-2 mb-2">
                          <CalendarPlus className="w-4 h-4 text-primary" />
                          <span className="text-xs font-semibold text-foreground">Rebook Job</span>
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <UserPlus className="w-3.5 h-3.5 text-muted-foreground" />
                            <span className="text-xs font-medium text-foreground">Team 1</span>
                          </div>
                          <Select value={rebookTeam} onValueChange={setRebookTeam}>
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="same">Same team ({job.team || 'unassigned'})</SelectItem>
                              {dmTeams.map(t => (
                                <SelectItem key={t.teamId} value={t.teamName}>{t.teamName}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>

                          <div className="flex items-center gap-2">
                            <Users className="w-3.5 h-3.5 text-muted-foreground" />
                            <span className="text-xs font-medium text-foreground">Team 2 (optional)</span>
                          </div>
                          <Select value={rebookTeam2} onValueChange={setRebookTeam2}>
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">No second team</SelectItem>
                              {dmTeams
                                .filter(t => t.teamName !== (rebookTeam === 'same' ? job.team : rebookTeam))
                                .map(t => (
                                  <SelectItem key={t.teamId} value={t.teamName}>{t.teamName}</SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="bg-muted/50 rounded-lg p-2">
                          <Calendar
                            mode="single"
                            selected={rebookDate}
                            onSelect={(d) => setRebookDate(d || undefined)}
                            disabled={(date) => date < new Date(new Date().setHours(0,0,0,0))}
                            className="rounded-md"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 text-xs text-muted-foreground">
                            {rebookDate ? `Rebook for ${format(rebookDate, 'EEE dd MMM yyyy')}` : 'Select a date above'}
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => { setRebookingJob(null); setRebookDate(undefined); setRebookTeam('same'); setRebookTeam2('none'); }}
                          >
                            Cancel
                          </Button>
                          <Button
                            size="sm"
                            className="h-7 text-xs gap-1"
                            disabled={!rebookDate || savingRebook}
                            onClick={() => handleRebook(job)}
                          >
                            {savingRebook ? <Loader2 className="w-3 h-3 animate-spin" /> : <SendHorizonal className="w-3 h-3" />}
                            {savingRebook ? 'Booking...' : 'Rebook'}
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Blocker editing panel */}
                    {isEditing && (
                      <div className="mt-3 pt-3 border-t space-y-2" onClick={(e) => e.stopPropagation()}>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5">
                          {BLOCKER_TYPES.map(b => (
                            <button
                              key={b.value}
                              onClick={() => setBlockerForm(f => ({ ...f, type: b.value }))}
                              className={cn(
                                "flex items-center gap-1.5 px-2 py-1.5 rounded text-xs font-medium transition-all border",
                                blockerForm.type === b.value
                                  ? `${b.color} text-white border-transparent`
                                  : "bg-muted/50 text-foreground border-border hover:bg-muted"
                              )}
                            >
                              <b.icon className="w-3 h-3" />
                              {b.label}
                            </button>
                          ))}
                        </div>
                        <Textarea
                          placeholder="Blocker notes (optional)..."
                          value={blockerForm.notes}
                          onChange={(e) => setBlockerForm(f => ({ ...f, notes: e.target.value }))}
                          className="h-16 text-xs"
                        />
                        <div className="flex items-center gap-2 flex-wrap">
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                                <CalendarDays className="w-3 h-3" />
                                {blockerForm.chaseDate ? format(blockerForm.chaseDate, 'dd MMM') : 'Chase date'}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <Calendar
                                mode="single"
                                selected={blockerForm.chaseDate}
                                onSelect={(d) => setBlockerForm(f => ({ ...f, chaseDate: d || undefined }))}
                              />
                            </PopoverContent>
                          </Popover>
                          <div className="flex-1" />
                          {blockerInfo && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs text-destructive"
                              onClick={() => handleClearBlocker(job.id)}
                            >
                              Clear
                            </Button>
                          )}
                          <Button
                            size="sm"
                            className="h-7 text-xs gap-1"
                            disabled={!blockerForm.type || savingBlocker}
                            onClick={() => handleSaveBlocker(job.id)}
                          >
                            <Save className="w-3 h-3" />
                            {savingBlocker ? 'Saving...' : 'Save Tag'}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>

      {/* Notepad Slide Panel */}
      {showNotepad && (
        <NotepadPanel
          dmJobs={dmJobs}
          readinessJobs={readinessJobs}
          danniNotes={danniNotes}
          activeAlerts={activeAlerts}
          onClose={() => setShowNotepad(false)}
          onSaveNote={handleSaveNote}
          onDeleteNote={handleDeleteNote}
          onDismissAlert={handleDismissAlert}
          notepadJobId={notepadJobId}
          setNotepadJobId={setNotepadJobId}
          newNoteText={newNoteText}
          setNewNoteText={setNewNoteText}
          newNoteAlertDate={newNoteAlertDate}
          setNewNoteAlertDate={setNewNoteAlertDate}
          savingNote={savingNote}
        />
      )}
    </Card>
  );
};
