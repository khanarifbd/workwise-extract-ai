import { useState, useMemo, useEffect, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Calendar } from '@/components/ui/calendar';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

import {
  X, StickyNote, Bell, BellRing, Plus, Trash2, Loader2,
  Search, MapPin, Hash, Edit2, Check,
  Mic, Clock, CheckCircle, ChevronDown, ChevronRight, Camera,
} from 'lucide-react';
import { format, parseISO, isToday, isYesterday, startOfWeek, endOfWeek, isWithinInterval } from 'date-fns';
import { cn } from '@/lib/utils';
import { Job } from '@/types/job';
import { useAdminNotes, AdminNote } from '@/hooks/useAdminNotes';
import { supabase } from '@/integrations/supabase/client';

export const ADMIN_USERS = [
  {
    name: 'Cecil',
    title: 'Strategic Director',
    color: 'bg-amber-500',
    lightBg: 'bg-amber-50 dark:bg-amber-950/30',
    textColor: 'text-amber-700 dark:text-amber-300',
    ring: 'ring-amber-300 dark:ring-amber-700',
    accent: 'text-amber-500',
    headerBorder: 'border-amber-300 dark:border-amber-700',
    headerText: 'text-amber-600 dark:text-amber-400',
    headerHover: 'hover:bg-amber-50 dark:hover:bg-amber-950',
  },
  {
    name: 'Suki',
    title: 'Operations Director',
    color: 'bg-blue-500',
    lightBg: 'bg-blue-50 dark:bg-blue-950/30',
    textColor: 'text-blue-700 dark:text-blue-300',
    ring: 'ring-blue-300 dark:ring-blue-700',
    accent: 'text-blue-500',
    headerBorder: 'border-blue-300 dark:border-blue-700',
    headerText: 'text-blue-600 dark:text-blue-400',
    headerHover: 'hover:bg-blue-50 dark:hover:bg-blue-950',
  },
  {
    name: 'Helen',
    title: 'Head Admin',
    color: 'bg-rose-500',
    lightBg: 'bg-rose-50 dark:bg-rose-950/30',
    textColor: 'text-rose-700 dark:text-rose-300',
    ring: 'ring-rose-300 dark:ring-rose-700',
    accent: 'text-rose-500',
    headerBorder: 'border-rose-300 dark:border-rose-700',
    headerText: 'text-rose-600 dark:text-rose-400',
    headerHover: 'hover:bg-rose-50 dark:hover:bg-rose-950',
  },
] as const;

interface OpsNote {
  id: string;
  title: string;
  enhanced_text: string;
  urgency: string;
  category: string;
  team_association: string | null;
  job_number: string | null;
  is_resolved: boolean;
  created_at: string;
  created_by_name: string;
}

interface AdminNotesOrganiserProps {
  jobs: Job[];
  onClose: () => void;
  onJobClick?: (job: Job) => void;
  initialJobId?: string | null;
  adminName: string; // Which admin's dashboard to show
}

export const AdminNotesOrganiser = ({ jobs, onClose, onJobClick, initialJobId, adminName }: AdminNotesOrganiserProps) => {
  const adminConfig = ADMIN_USERS.find(u => u.name === adminName) || ADMIN_USERS[0];
  const [activeSection, setActiveSection] = useState<'notes' | 'ops'>('notes');

  const { notes, loading, addNote, deleteNote, dismissAlert, activeAlerts, updateNote } = useAdminNotes(adminName);

  // Avatar from Supabase storage
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  useEffect(() => {
    // Try to load avatar URL from storage
    const { data } = supabase.storage.from('admin-avatars').getPublicUrl(`${adminName.toLowerCase()}.jpg`);
    // Check if the file actually exists by fetching with cache-bust
    fetch(`${data.publicUrl}?t=${Date.now()}`, { method: 'HEAD' })
      .then(res => { if (res.ok) setAvatarUrl(`${data.publicUrl}?t=${Date.now()}`); })
      .catch(() => {});
  }, [adminName]);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);

    // Resize to 256px
    const reader = new FileReader();
    reader.onload = async () => {
      const img = new Image();
      img.onload = async () => {
        const canvas = document.createElement('canvas');
        const size = 256;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d')!;
        const scale = Math.max(size / img.width, size / img.height);
        const x = (size - img.width * scale) / 2;
        const y = (size - img.height * scale) / 2;
        ctx.drawImage(img, x, y, img.width * scale, img.height * scale);
        canvas.toBlob(async (blob) => {
          if (!blob) { setUploadingAvatar(false); return; }
          const path = `${adminName.toLowerCase()}.jpg`;
          await supabase.storage.from('admin-avatars').upload(path, blob, { upsert: true, contentType: 'image/jpeg' });
          const { data } = supabase.storage.from('admin-avatars').getPublicUrl(path);
          setAvatarUrl(`${data.publicUrl}?t=${Date.now()}`);
          setUploadingAvatar(false);
        }, 'image/jpeg', 0.85);
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Ops notes state
  const [opsNotes, setOpsNotes] = useState<OpsNote[]>([]);
  const [opsLoading, setOpsLoading] = useState(false);
  const [expandedOpsWeeks, setExpandedOpsWeeks] = useState<Set<string>>(new Set());

  const fetchOpsNotes = useCallback(async () => {
    setOpsLoading(true);
    const { data } = await supabase
      .from('ops_manager_notes')
      .select('id,title,enhanced_text,urgency,category,team_association,job_number,is_resolved,created_at,created_by_name')
      .order('created_at', { ascending: false })
      .limit(100);
    setOpsNotes((data || []) as OpsNote[]);
    setOpsLoading(false);
  }, []);

  useEffect(() => {
    if (activeSection === 'ops') fetchOpsNotes();
  }, [activeSection, fetchOpsNotes]);

  useEffect(() => {
    const ch = supabase
      .channel('notes-ops-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ops_manager_notes' }, () => {
        if (activeSection === 'ops') fetchOpsNotes();
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [activeSection, fetchOpsNotes]);

  const [jobSearch, setJobSearch] = useState('');
  const [noteFilter, setNoteFilter] = useState<'all' | 'alerts' | 'general' | 'job'>(initialJobId ? 'job' : 'all');
  const [newNoteText, setNewNoteText] = useState('');
  const [newNoteJobId, setNewNoteJobId] = useState<string | null>(initialJobId || null);
  const [newNoteAlertDate, setNewNoteAlertDate] = useState<Date | undefined>();
  const [saving, setSaving] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [showNewForm, setShowNewForm] = useState(!!initialJobId);

  const allJobsSorted = useMemo(() => {
    return [...jobs]
      .filter(j => !(j as any).deleted_at)
      .sort((a, b) => (parseInt(b.jobNumber) || 0) - (parseInt(a.jobNumber) || 0));
  }, [jobs]);

  const filteredDropdownJobs = useMemo(() => {
    if (!jobSearch.trim()) return allJobsSorted.slice(0, 40);
    const s = jobSearch.toLowerCase();
    return allJobsSorted.filter(j =>
      j.jobNumber?.toLowerCase().includes(s) || j.name?.toLowerCase().includes(s) ||
      j.address?.toLowerCase().includes(s) || j.team?.toLowerCase().includes(s)
    ).slice(0, 40);
  }, [allJobsSorted, jobSearch]);

  const selectedJob = useMemo(() => newNoteJobId ? jobs.find(j => j.id === newNoteJobId) || null : null, [newNoteJobId, jobs]);

  const filteredNotes = useMemo(() => {
    switch (noteFilter) {
      case 'alerts': return notes.filter(n => n.alert_date && !n.alert_dismissed);
      case 'general': return notes.filter(n => !n.job_id);
      case 'job': return notes.filter(n => n.job_id);
      default: return notes;
    }
  }, [notes, noteFilter]);

  const handleSave = async () => {
    if (!newNoteText.trim()) return;
    setSaving(true);
    const ok = await addNote({ jobId: newNoteJobId, noteText: newNoteText.trim(), alertDate: newNoteAlertDate });
    if (ok) { setNewNoteText(''); setNewNoteJobId(null); setNewNoteAlertDate(undefined); setShowNewForm(false); }
    setSaving(false);
  };

  const handleEditSave = async (noteId: string) => {
    if (!editText.trim()) return;
    await updateNote(noteId, { note_text: editText.trim() });
    setEditingNoteId(null);
    setEditText('');
  };

  const formatDate = (d: string) => {
    const date = parseISO(d);
    if (isToday(date)) return `Today ${format(date, 'HH:mm')}`;
    if (isYesterday(date)) return `Yesterday ${format(date, 'HH:mm')}`;
    return format(date, 'dd MMM HH:mm');
  };

  const unresolvedOps = opsNotes.filter(n => !n.is_resolved).length;

  const opsWeekGroups = useMemo(() => {
    const now = new Date();
    const groups: { label: string; key: string; notes: OpsNote[]; isCurrent: boolean }[] = [];
    const weekMap = new Map<string, { label: string; notes: OpsNote[]; isCurrent: boolean; weekStart: Date }>();

    for (const note of opsNotes) {
      const noteDate = parseISO(note.created_at);
      const ws = startOfWeek(noteDate, { weekStartsOn: 1 });
      const we = endOfWeek(noteDate, { weekStartsOn: 1 });
      const key = format(ws, 'yyyy-MM-dd');
      const isCurrent = isWithinInterval(now, { start: ws, end: we });
      const label = isCurrent
        ? 'This Week'
        : `${format(ws, 'dd MMM')} – ${format(we, 'dd MMM yyyy')}`;

      if (!weekMap.has(key)) {
        weekMap.set(key, { label, notes: [], isCurrent, weekStart: ws });
      }
      weekMap.get(key)!.notes.push(note);
    }

    const sorted = Array.from(weekMap.entries())
      .sort(([, a], [, b]) => {
        if (a.isCurrent) return -1;
        if (b.isCurrent) return 1;
        return b.weekStart.getTime() - a.weekStart.getTime();
      });

    for (const [key, val] of sorted) {
      groups.push({ label: val.label, key, notes: val.notes, isCurrent: val.isCurrent });
    }
    return groups;
  }, [opsNotes]);

  const groupByDay = (weekNotes: OpsNote[]) => {
    const dayMap = new Map<string, OpsNote[]>();
    for (const note of weekNotes) {
      const d = parseISO(note.created_at);
      const dayKey = format(d, 'EEEE, dd MMM');
      if (!dayMap.has(dayKey)) dayMap.set(dayKey, []);
      dayMap.get(dayKey)!.push(note);
    }
    return Array.from(dayMap.entries());
  };

  const toggleOpsWeek = (key: string) => {
    setExpandedOpsWeeks(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const urgencyColors: Record<string, string> = {
    immediate: 'border-l-red-500 bg-red-50/80 dark:bg-red-950/30',
    high: 'border-l-orange-500 bg-orange-50/60 dark:bg-orange-950/20',
    normal: 'border-l-blue-400',
    low: 'border-l-gray-400',
  };
  const urgencyLabels: Record<string, string> = {
    immediate: '🚨 URGENT',
    high: '⚠️ High',
    normal: 'Normal',
    low: 'Low',
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4">
      <div className="w-full max-w-2xl h-[90vh] bg-background rounded-2xl shadow-2xl flex flex-col overflow-hidden border">

        {/* ─── Header: Single admin, personalized ─── */}
        <div className={cn("flex items-center justify-between px-5 py-3 border-b", adminConfig.lightBg)}>
          <div className="flex items-center gap-3">
            <div className="relative group cursor-pointer" onClick={() => document.getElementById('avatar-upload')?.click()}>
              {avatarUrl ? (
                <img src={avatarUrl} alt={adminName} className={cn("w-12 h-12 rounded-xl object-cover ring-2", adminConfig.ring)} />
              ) : (
                <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center text-white font-black text-lg", adminConfig.color)}>
                  {adminName.charAt(0)}
                </div>
              )}
              <div className="absolute inset-0 rounded-xl bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                {uploadingAvatar ? <Loader2 className="w-4 h-4 text-white animate-spin" /> : <Camera className="w-4 h-4 text-white" />}
              </div>
              <input id="avatar-upload" type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleAvatarUpload} />
            </div>
            <div>
              <h2 className={cn("text-lg font-black uppercase tracking-wider", adminConfig.accent)}>{adminName}</h2>
              <p className="text-[10px] text-muted-foreground">{adminConfig.title} — Personal Organiser</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Notes / Ops toggle */}
            <div className="flex bg-muted rounded-lg p-0.5">
              <button
                onClick={() => setActiveSection('notes')}
                className={cn("px-3 py-1 rounded-md text-[11px] font-medium transition-all",
                  activeSection === 'notes' ? "bg-background shadow-sm text-foreground" : "text-muted-foreground"
                )}
              >
                My Notes
              </button>
              <button
                onClick={() => setActiveSection('ops')}
                className={cn("px-3 py-1 rounded-md text-[11px] font-medium transition-all flex items-center gap-1",
                  activeSection === 'ops' ? "bg-background shadow-sm text-foreground" : "text-muted-foreground"
                )}
              >
                <Mic className="w-3 h-3" />
                Ops
                {unresolvedOps > 0 && (
                  <span className="bg-orange-500 text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                    {unresolvedOps}
                  </span>
                )}
              </button>
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {activeSection === 'notes' ? (
          <>
            {/* ─── Active alerts banner ─── */}
            {activeAlerts.length > 0 && (
              <div className="px-5 py-2 bg-destructive/5 border-b space-y-1.5">
                {activeAlerts.slice(0, 3).map(alert => {
                  const job = jobs.find(j => j.id === alert.job_id);
                  return (
                    <div key={alert.id} className="flex items-center gap-2 text-xs">
                      <BellRing className="w-3.5 h-3.5 text-destructive animate-pulse flex-shrink-0" />
                      <span className="flex-1 truncate">
                        {job ? <span className="font-bold">#{job.jobNumber}</span> : <span className="font-medium">General</span>}
                        {' — '}{alert.note_text}
                      </span>
                      <Button variant="ghost" size="sm" className="h-5 text-[9px] px-1.5" onClick={() => dismissAlert(alert.id)}>
                        Dismiss
                      </Button>
                    </div>
                  );
                })}
                {activeAlerts.length > 3 && (
                  <p className="text-[10px] text-muted-foreground">+{activeAlerts.length - 3} more alerts</p>
                )}
              </div>
            )}

            {/* ─── Quick actions ─── */}
            <div className="px-5 py-2 border-b flex items-center gap-2">
              {!showNewForm && (
                <Button
                  size="sm"
                  className={cn("h-7 text-xs gap-1 rounded-full", adminConfig.color, "text-white hover:opacity-90")}
                  onClick={() => setShowNewForm(true)}
                >
                  <Plus className="w-3 h-3" /> New Note
                </Button>
              )}
              <div className="flex-1" />
              {[
                { key: 'all' as const, label: 'All', count: notes.length },
                { key: 'alerts' as const, label: '🔔', count: notes.filter(n => n.alert_date && !n.alert_dismissed).length },
                { key: 'job' as const, label: 'Jobs', count: notes.filter(n => n.job_id).length },
                { key: 'general' as const, label: 'General', count: notes.filter(n => !n.job_id).length },
              ].map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setNoteFilter(tab.key)}
                  className={cn(
                    "px-2 py-0.5 rounded-full text-[10px] font-medium transition-all",
                    noteFilter === tab.key
                      ? cn(adminConfig.lightBg, adminConfig.textColor, "ring-1", adminConfig.ring)
                      : "text-muted-foreground hover:bg-muted"
                  )}
                >
                  {tab.label} <span className="opacity-60">{tab.count}</span>
                </button>
              ))}
            </div>

            {/* ─── New note form ─── */}
            {showNewForm && (
              <div className="px-5 py-3 border-b bg-muted/10 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground">New Note</span>
                  <Button variant="ghost" size="sm" className="h-5 text-[10px] px-1" onClick={() => setShowNewForm(false)}>Cancel</Button>
                </div>

                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-xs h-8 font-normal rounded-lg">
                      <Hash className="w-3 h-3 mr-1.5 flex-shrink-0 text-muted-foreground" />
                      {selectedJob ? (
                        <span className="truncate">
                          <span className="font-mono font-bold">#{selectedJob.jobNumber}</span> — {selectedJob.name}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Link to a job (optional)</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[380px] p-0" align="start">
                    <div className="p-2 border-b">
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                        <Input placeholder="Search jobs..." value={jobSearch} onChange={e => setJobSearch(e.target.value)}
                          className="h-7 text-xs pl-7 rounded-lg" autoFocus />
                      </div>
                    </div>
                    <ScrollArea className="max-h-[250px]">
                      <div className="p-1">
                        <button onClick={() => { setNewNoteJobId(null); setJobSearch(''); }}
                          className={cn("w-full text-left px-3 py-1.5 rounded-md text-xs hover:bg-accent", !newNoteJobId && "bg-accent")}>
                          📋 General (no job)
                        </button>
                        {filteredDropdownJobs.map(j => (
                          <button key={j.id} onClick={() => { setNewNoteJobId(j.id); setJobSearch(''); }}
                            className={cn("w-full text-left px-3 py-1 rounded-md text-xs hover:bg-accent", newNoteJobId === j.id && "bg-accent")}>
                            <span className="font-mono font-bold text-primary">#{j.jobNumber}</span>
                            {' '}<span className="truncate">{j.name}</span>
                            {j.address && <div className="text-[10px] text-muted-foreground truncate flex items-center gap-1 mt-0.5"><MapPin className="w-2.5 h-2.5" />{j.address}</div>}
                          </button>
                        ))}
                      </div>
                    </ScrollArea>
                  </PopoverContent>
                </Popover>

                <Textarea placeholder="Write your note..." value={newNoteText} onChange={e => setNewNoteText(e.target.value)}
                  className="h-16 text-xs rounded-lg resize-none" />

                <div className="flex items-center gap-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1 rounded-full">
                        <Bell className="w-3 h-3" />
                        {newNoteAlertDate ? format(newNoteAlertDate, 'dd MMM HH:mm') : 'Reminder'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={newNoteAlertDate}
                        onSelect={d => { if (d) { d.setHours(9, 0, 0, 0); setNewNoteAlertDate(d); } }} />
                      {newNoteAlertDate && (
                        <div className="px-3 pb-3 flex gap-1">
                          {[9, 12, 14, 16].map(h => (
                            <Button key={h} variant={newNoteAlertDate.getHours() === h ? 'default' : 'outline'}
                              size="sm" className="h-5 text-[10px] px-1.5"
                              onClick={() => { const d = new Date(newNoteAlertDate); d.setHours(h, 0); setNewNoteAlertDate(d); }}>
                              {h}:00
                            </Button>
                          ))}
                        </div>
                      )}
                    </PopoverContent>
                  </Popover>
                  {newNoteAlertDate && (
                    <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => setNewNoteAlertDate(undefined)}>✕</Button>
                  )}
                  <div className="flex-1" />
                  <Button size="sm" className={cn("h-7 text-xs rounded-full gap-1", adminConfig.color, "text-white")}
                    disabled={!newNoteText.trim() || saving} onClick={handleSave}>
                    {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                    Save
                  </Button>
                </div>
              </div>
            )}

            {/* ─── Notes list ─── */}
            <ScrollArea className="flex-1">
              <div className="px-5 py-2 space-y-1.5">
                {loading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  </div>
                ) : filteredNotes.length === 0 ? (
                  <div className="text-center py-12">
                    <StickyNote className="w-8 h-8 mx-auto mb-2 text-muted-foreground/30" />
                    <p className="text-sm text-muted-foreground">
                      {noteFilter === 'all' ? `No notes yet` : `No ${noteFilter} notes`}
                    </p>
                  </div>
                ) : filteredNotes.map(note => {
                  const job = jobs.find(j => j.id === note.job_id);
                  const hasAlert = note.alert_date && !note.alert_dismissed;
                  const alertDue = hasAlert && new Date(note.alert_date!) <= new Date();
                  const isEditing = editingNoteId === note.id;

                  return (
                    <div key={note.id} className={cn(
                      "group rounded-xl px-3 py-2.5 text-xs border transition-all hover:shadow-sm",
                      alertDue ? "border-destructive/40 bg-destructive/5" : "border-transparent hover:border-border bg-muted/30 hover:bg-muted/50"
                    )}>
                      <div className="flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-1">
                            {job ? (
                              <button onClick={() => onJobClick?.(job)} className="text-[10px] font-bold text-primary hover:underline truncate">
                                #{job.jobNumber} — {job.name}
                              </button>
                            ) : (
                              <span className="text-[10px] font-medium text-muted-foreground">📋 General</span>
                            )}
                            {hasAlert && (
                              <span className={cn("inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-full",
                                alertDue ? "bg-destructive/15 text-destructive font-bold" : "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300"
                              )}>
                                <Bell className="w-2.5 h-2.5" />
                                {format(new Date(note.alert_date!), 'dd MMM HH:mm')}
                              </span>
                            )}
                          </div>

                          {isEditing ? (
                            <div className="flex gap-1 mt-1">
                              <Textarea value={editText} onChange={e => setEditText(e.target.value)} className="h-14 text-xs flex-1 rounded-lg" />
                              <div className="flex flex-col gap-0.5">
                                <Button size="icon" className="h-6 w-6 rounded-md" onClick={() => handleEditSave(note.id)}>
                                  <Check className="w-3 h-3" />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-6 w-6 rounded-md" onClick={() => setEditingNoteId(null)}>
                                  <X className="w-3 h-3" />
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <p className="text-foreground whitespace-pre-wrap leading-relaxed">{note.note_text}</p>
                          )}

                          <span className="text-[10px] text-muted-foreground mt-1 block">
                            {formatDate(note.created_at)}
                          </span>
                        </div>

                        {!isEditing && (
                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button variant="ghost" size="icon" className="h-6 w-6 rounded-md"
                              onClick={() => { setEditingNoteId(note.id); setEditText(note.note_text); }}>
                              <Edit2 className="w-3 h-3 text-muted-foreground" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-6 w-6 rounded-md"
                              onClick={() => deleteNote(note.id)}>
                              <Trash2 className="w-3 h-3 text-muted-foreground hover:text-destructive" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </>
        ) : (
          /* ─── Ops Notes Section ─── */
          <ScrollArea className="flex-1">
            <div className="px-5 py-3 space-y-2">
              <div className="flex items-center gap-2 mb-2">
                <Mic className="w-4 h-4 text-orange-500" />
                <span className="text-xs font-semibold">Operations Manager Voice Notes</span>
                <Badge variant="secondary" className="text-[9px] h-4">{opsNotes.length}</Badge>
              </div>

              {opsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : opsWeekGroups.length === 0 ? (
                <div className="text-center py-12">
                  <Mic className="w-8 h-8 mx-auto mb-2 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">No ops notes yet</p>
                </div>
              ) : opsWeekGroups.map(week => {
                const isOpen = week.isCurrent || expandedOpsWeeks.has(week.key);
                const days = groupByDay(week.notes);

                return (
                  <Collapsible key={week.key} open={isOpen} onOpenChange={() => !week.isCurrent && toggleOpsWeek(week.key)}>
                    <CollapsibleTrigger className="w-full flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-muted/50 transition-colors">
                      {isOpen ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
                      <span className={cn("text-xs font-bold", week.isCurrent ? "text-orange-600 dark:text-orange-400" : "text-muted-foreground")}>
                        {week.label}
                      </span>
                      <Badge variant="outline" className="text-[9px] h-4 ml-auto">{week.notes.length}</Badge>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="ml-2 space-y-2 mt-1">
                        {days.map(([dayLabel, dayNotes]) => (
                          <div key={dayLabel}>
                            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1 pl-1">{dayLabel}</p>
                            <div className="space-y-1.5">
                              {dayNotes.map(note => (
                                <div key={note.id} className={cn(
                                  "border-l-4 rounded-lg p-3 text-xs border bg-muted/20",
                                  urgencyColors[note.urgency] || 'border-l-gray-400',
                                  note.is_resolved && "opacity-50"
                                )}>
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-1.5 flex-wrap mb-1">
                                        <Badge variant={note.urgency === 'immediate' || note.urgency === 'high' ? 'destructive' : 'outline'}
                                          className={cn("text-[9px] h-4 px-1.5",
                                            note.urgency === 'immediate' && "bg-red-600 text-white animate-pulse",
                                            note.urgency === 'high' && "bg-orange-500 text-white"
                                          )}>
                                          {urgencyLabels[note.urgency] || note.urgency}
                                        </Badge>
                                        {note.team_association && (
                                          <Badge variant="secondary" className="text-[9px] h-4 px-1.5">{note.team_association}</Badge>
                                        )}
                                        {note.job_number && (
                                          <span className="font-mono text-[10px] font-bold text-primary">#{note.job_number}</span>
                                        )}
                                        {note.is_resolved && (
                                          <CheckCircle className="w-3 h-3 text-green-600" />
                                        )}
                                      </div>
                                      <h4 className={cn("font-medium text-foreground", note.is_resolved && "line-through")}>{note.title}</h4>
                                      <p className="text-muted-foreground mt-1 whitespace-pre-wrap">{note.enhanced_text}</p>
                                      <div className="flex items-center gap-2 mt-1.5 text-[10px] text-muted-foreground">
                                        <Clock className="w-2.5 h-2.5" />
                                        {formatDate(note.created_at)}
                                        <span>by {note.created_by_name}</span>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  );
};
