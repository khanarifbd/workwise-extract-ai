import { useState, useMemo } from 'react';
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
  Search, Filter, MapPin, Hash, ChevronDown, ChevronUp,
  Crown, Shield, Heart, Edit2, Check,
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Job } from '@/types/job';
import { useAdminNotes, AdminNote } from '@/hooks/useAdminNotes';

// Admin user definitions
const ADMIN_USERS = [
  {
    name: 'Cecil',
    title: 'Strategic Director',
    icon: Crown,
    color: 'bg-amber-500',
    borderColor: 'border-amber-400',
    textColor: 'text-amber-600 dark:text-amber-400',
    bgTint: 'bg-amber-500/5',
    badgeBg: 'bg-amber-500/10',
  },
  {
    name: 'Suki',
    title: 'Operations Director',
    icon: Shield,
    color: 'bg-blue-500',
    borderColor: 'border-blue-400',
    textColor: 'text-blue-600 dark:text-blue-400',
    bgTint: 'bg-blue-500/5',
    badgeBg: 'bg-blue-500/10',
  },
  {
    name: 'Helen',
    title: 'Head Admin',
    icon: Heart,
    color: 'bg-rose-500',
    borderColor: 'border-rose-400',
    textColor: 'text-rose-600 dark:text-rose-400',
    bgTint: 'bg-rose-500/5',
    badgeBg: 'bg-rose-500/10',
  },
] as const;

interface AdminNotesOrganiserProps {
  jobs: Job[];
  onClose: () => void;
  onJobClick?: (job: Job) => void;
}

export const AdminNotesOrganiser = ({ jobs, onClose, onJobClick }: AdminNotesOrganiserProps) => {
  const [activeAdmin, setActiveAdmin] = useState<string>(ADMIN_USERS[0].name);
  const adminConfig = ADMIN_USERS.find(u => u.name === activeAdmin)!;
  const AdminIcon = adminConfig.icon;

  const { notes, loading, addNote, deleteNote, dismissAlert, activeAlerts, updateNote } = useAdminNotes(activeAdmin);

  const [jobSearch, setJobSearch] = useState('');
  const [noteFilter, setNoteFilter] = useState<'all' | 'alerts' | 'general' | 'job'>('all');
  const [newNoteText, setNewNoteText] = useState('');
  const [newNoteJobId, setNewNoteJobId] = useState<string | null>(null);
  const [newNoteAlertDate, setNewNoteAlertDate] = useState<Date | undefined>();
  const [saving, setSaving] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  // All jobs sorted for dropdown
  const allJobsSorted = useMemo(() => {
    return [...jobs]
      .filter(j => !j.deletedAt)
      .sort((a, b) => {
        const aNum = parseInt(a.jobNumber) || 0;
        const bNum = parseInt(b.jobNumber) || 0;
        return bNum - aNum;
      });
  }, [jobs]);

  const filteredDropdownJobs = useMemo(() => {
    if (!jobSearch.trim()) return allJobsSorted.slice(0, 50);
    const search = jobSearch.toLowerCase();
    return allJobsSorted.filter(j =>
      j.jobNumber?.toLowerCase().includes(search) ||
      j.name?.toLowerCase().includes(search) ||
      j.address?.toLowerCase().includes(search) ||
      j.team?.toLowerCase().includes(search)
    ).slice(0, 50);
  }, [allJobsSorted, jobSearch]);

  const selectedJob = useMemo(() => {
    if (!newNoteJobId) return null;
    return jobs.find(j => j.id === newNoteJobId) || null;
  }, [newNoteJobId, jobs]);

  // Filter notes
  const filteredNotes = useMemo(() => {
    switch (noteFilter) {
      case 'alerts':
        return notes.filter(n => n.alert_date && !n.alert_dismissed);
      case 'general':
        return notes.filter(n => !n.job_id);
      case 'job':
        return notes.filter(n => n.job_id);
      default:
        return notes;
    }
  }, [notes, noteFilter]);

  const alertCount = notes.filter(n => n.alert_date && !n.alert_dismissed).length;
  const jobNoteCount = notes.filter(n => n.job_id).length;
  const generalCount = notes.filter(n => !n.job_id).length;

  const handleSave = async () => {
    if (!newNoteText.trim()) return;
    setSaving(true);
    const ok = await addNote({
      jobId: newNoteJobId,
      noteText: newNoteText.trim(),
      alertDate: newNoteAlertDate,
    });
    if (ok) {
      setNewNoteText('');
      setNewNoteJobId(null);
      setNewNoteAlertDate(undefined);
    }
    setSaving(false);
  };

  const handleEditSave = async (noteId: string) => {
    if (!editText.trim()) return;
    await updateNote(noteId, { note_text: editText.trim() });
    setEditingNoteId(null);
    setEditText('');
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className={cn(
        "w-full max-w-3xl h-[85vh] bg-background rounded-xl border-2 shadow-2xl flex flex-col overflow-hidden",
        adminConfig.borderColor
      )}>
        {/* Header with admin tabs */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2 border-b">
          <div className="flex items-center gap-3">
            <div className={cn("p-2 rounded-lg", adminConfig.color)}>
              <StickyNote className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Personal Notes</h3>
              <p className="text-[11px] text-muted-foreground">Admin Organiser</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Admin user tabs */}
        <div className="px-4 py-2 flex gap-2 border-b bg-muted/30">
          {ADMIN_USERS.map(admin => {
            const Icon = admin.icon;
            const isActive = activeAdmin === admin.name;
            return (
              <button
                key={admin.name}
                onClick={() => {
                  setActiveAdmin(admin.name);
                  setNoteFilter('all');
                }}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all",
                  isActive
                    ? cn(admin.bgTint, admin.textColor, "ring-1", admin.borderColor)
                    : "text-muted-foreground hover:bg-muted"
                )}
              >
                <Icon className="w-4 h-4" />
                <div className="text-left">
                  <div className="font-semibold">{admin.name}</div>
                  <div className="text-[9px] opacity-70">{admin.title}</div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Active alerts */}
        {activeAlerts.length > 0 && (
          <div className="px-4 pt-3 space-y-2">
            {activeAlerts.map(alert => {
              const job = jobs.find(j => j.id === alert.job_id);
              return (
                <div key={alert.id} className="bg-destructive/10 border border-destructive/30 rounded-lg p-2.5 flex items-start gap-2">
                  <BellRing className="w-4 h-4 text-destructive mt-0.5 flex-shrink-0 animate-bounce" />
                  <div className="flex-1 min-w-0">
                    {job && (
                      <p className="text-[11px] font-bold text-destructive">
                        #{job.jobNumber} — {job.name}
                      </p>
                    )}
                    <p className="text-xs text-foreground">{alert.note_text}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      Due: {format(new Date(alert.alert_date!), 'dd MMM HH:mm')}
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={() => dismissAlert(alert.id)}>
                    Dismiss
                  </Button>
                </div>
              );
            })}
          </div>
        )}

        {/* New note form */}
        <div className="px-4 pt-3 space-y-2 border-b pb-3">
          {/* Job selector */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-full justify-start text-xs h-9 font-normal",
                  newNoteJobId ? "text-foreground" : "text-muted-foreground"
                )}
              >
                <Hash className="w-3.5 h-3.5 mr-1.5 flex-shrink-0" />
                {selectedJob ? (
                  <span className="truncate">
                    <span className="font-mono font-bold">#{selectedJob.jobNumber}</span>
                    {' — '}{selectedJob.name}
                    {selectedJob.team && <span className="text-muted-foreground"> ({selectedJob.team})</span>}
                  </span>
                ) : (
                  'Select a job (or leave for general note)'
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[400px] p-0" align="start">
              <div className="p-2 border-b">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Search by job number, name, address or team..."
                    value={jobSearch}
                    onChange={e => setJobSearch(e.target.value)}
                    className="h-8 text-xs pl-7"
                    autoFocus
                  />
                </div>
              </div>
              <ScrollArea className="max-h-[300px]">
                <div className="p-1">
                  <button
                    onClick={() => { setNewNoteJobId(null); setJobSearch(''); }}
                    className={cn(
                      "w-full text-left px-3 py-2 rounded text-xs hover:bg-accent transition-colors",
                      !newNoteJobId && "bg-accent font-medium"
                    )}
                  >
                    📋 General Note (no job attached)
                  </button>
                  {filteredDropdownJobs.map(j => (
                    <button
                      key={j.id}
                      onClick={() => { setNewNoteJobId(j.id); setJobSearch(''); }}
                      className={cn(
                        "w-full text-left px-3 py-1.5 rounded text-xs hover:bg-accent transition-colors",
                        newNoteJobId === j.id && "bg-accent font-medium"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-primary">#{j.jobNumber}</span>
                        <span className="truncate flex-1">{j.name}</span>
                        {j.team && <span className="text-muted-foreground text-[10px] flex-shrink-0">{j.team}</span>}
                      </div>
                      {j.address && (
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground mt-0.5 pl-1">
                          <MapPin className="w-2.5 h-2.5" />
                          <span className="truncate">{j.address}</span>
                        </div>
                      )}
                    </button>
                  ))}
                  {filteredDropdownJobs.length === 0 && jobSearch.trim() && (
                    <p className="text-center text-muted-foreground text-xs py-4">No jobs match "{jobSearch}"</p>
                  )}
                </div>
              </ScrollArea>
            </PopoverContent>
          </Popover>

          <Textarea
            placeholder={`${activeAdmin}'s note... (chase reminder, booking, action item)`}
            value={newNoteText}
            onChange={e => setNewNoteText(e.target.value)}
            className="h-20 text-xs"
          />
          <div className="flex items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                  <Bell className="w-3 h-3" />
                  {newNoteAlertDate ? format(newNoteAlertDate, 'dd MMM HH:mm') : 'Set reminder'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={newNoteAlertDate}
                  onSelect={d => {
                    if (d) { d.setHours(9, 0, 0, 0); setNewNoteAlertDate(d); }
                  }}
                />
                {newNoteAlertDate && (
                  <div className="px-3 pb-3 flex gap-1 flex-wrap">
                    {[9, 12, 14, 16].map(h => (
                      <Button
                        key={h}
                        variant={newNoteAlertDate.getHours() === h ? 'default' : 'outline'}
                        size="sm"
                        className="h-6 text-[10px] px-2"
                        onClick={() => {
                          const d = new Date(newNoteAlertDate);
                          d.setHours(h, 0, 0, 0);
                          setNewNoteAlertDate(d);
                        }}
                      >
                        {h}:00
                      </Button>
                    ))}
                  </div>
                )}
              </PopoverContent>
            </Popover>
            {newNoteAlertDate && (
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setNewNoteAlertDate(undefined)}>
                Clear
              </Button>
            )}
            <div className="flex-1" />
            <Button
              size="sm"
              className={cn("h-7 text-xs gap-1", adminConfig.color, "text-white hover:opacity-90")}
              disabled={!newNoteText.trim() || saving}
              onClick={handleSave}
            >
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
              Add Note
            </Button>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="px-4 pt-2 pb-1 flex items-center gap-1.5">
          <Filter className="w-3 h-3 text-muted-foreground mr-1" />
          {[
            { key: 'all' as const, label: 'All', count: notes.length },
            { key: 'alerts' as const, label: 'Reminders', count: alertCount },
            { key: 'job' as const, label: 'Job Notes', count: jobNoteCount },
            { key: 'general' as const, label: 'General', count: generalCount },
          ].map(tab => (
            <Button
              key={tab.key}
              variant={noteFilter === tab.key ? 'default' : 'ghost'}
              size="sm"
              className={cn("h-6 text-[10px] px-2 gap-1", noteFilter === tab.key && adminConfig.color + " text-white")}
              onClick={() => setNoteFilter(tab.key)}
            >
              {tab.label}
              <span className="opacity-60">({tab.count})</span>
            </Button>
          ))}
        </div>

        {/* Notes list */}
        <ScrollArea className="flex-1 px-4 py-2">
          <div className="space-y-2">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : filteredNotes.map(note => {
              const job = jobs.find(j => j.id === note.job_id);
              const hasAlert = note.alert_date && !note.alert_dismissed;
              const alertDue = hasAlert && new Date(note.alert_date!) <= new Date();
              const isEditing = editingNoteId === note.id;

              return (
                <div
                  key={note.id}
                  className={cn(
                    "border rounded-lg p-2.5 text-xs",
                    alertDue ? "border-destructive/50 bg-destructive/5" : "border-border"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      {job && (
                        <button
                          onClick={() => onJobClick?.(job)}
                          className="text-[10px] font-bold text-primary hover:underline"
                        >
                          #{job.jobNumber} — {job.name}
                          {job.team && <span className="text-muted-foreground font-normal"> ({job.team})</span>}
                        </button>
                      )}
                      {!job && !note.job_id && (
                        <span className="text-[10px] font-medium text-muted-foreground">📋 General</span>
                      )}
                      {isEditing ? (
                        <div className="mt-1 flex gap-1">
                          <Textarea
                            value={editText}
                            onChange={e => setEditText(e.target.value)}
                            className="h-16 text-xs flex-1"
                          />
                          <div className="flex flex-col gap-1">
                            <Button size="icon" className="h-6 w-6" onClick={() => handleEditSave(note.id)}>
                              <Check className="w-3 h-3" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditingNoteId(null)}>
                              <X className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-foreground mt-0.5 whitespace-pre-wrap">{note.note_text}</p>
                      )}
                      <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                        <span>{format(new Date(note.created_at), 'dd MMM HH:mm')}</span>
                        {hasAlert && (
                          <span className={cn("flex items-center gap-0.5", alertDue ? "text-destructive font-bold" : "text-amber-600")}>
                            <Bell className="w-2.5 h-2.5" />
                            {format(new Date(note.alert_date!), 'dd MMM HH:mm')}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-0.5">
                      {!isEditing && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-foreground"
                          onClick={() => { setEditingNoteId(note.id); setEditText(note.note_text); }}
                        >
                          <Edit2 className="w-3 h-3" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-destructive"
                        onClick={() => deleteNote(note.id)}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
            {!loading && filteredNotes.length === 0 && (
              <p className="text-center text-muted-foreground py-8 text-sm">
                {noteFilter === 'all'
                  ? `No notes yet for ${activeAdmin}. Start tracking jobs above.`
                  : `No ${noteFilter} notes.`}
              </p>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
};
