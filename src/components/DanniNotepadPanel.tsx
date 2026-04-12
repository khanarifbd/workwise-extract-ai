import { useState, useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Calendar } from '@/components/ui/calendar';
import {
  X, StickyNote, Bell, BellRing, Plus, Trash2, Loader2,
  Search, Filter, MapPin, Hash
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface ReadinessJob {
  id: string;
  jobNumber: string;
  name: string;
  address: string;
  team: string | null;
}

interface NotepadPanelProps {
  dmJobs: any[];
  readinessJobs: ReadinessJob[];
  danniNotes: any[];
  activeAlerts: any[];
  onClose: () => void;
  onSaveNote: () => void;
  onDeleteNote: (id: string) => void;
  onDismissAlert: (id: string) => void;
  notepadJobId: string | null;
  setNotepadJobId: (id: string | null) => void;
  newNoteText: string;
  setNewNoteText: (text: string) => void;
  newNoteAlertDate: Date | undefined;
  setNewNoteAlertDate: (date: Date | undefined) => void;
  savingNote: boolean;
}

export const NotepadPanel = ({
  dmJobs,
  readinessJobs,
  danniNotes,
  activeAlerts,
  onClose,
  onSaveNote,
  onDeleteNote,
  onDismissAlert,
  notepadJobId,
  setNotepadJobId,
  newNoteText,
  setNewNoteText,
  newNoteAlertDate,
  setNewNoteAlertDate,
  savingNote,
}: NotepadPanelProps) => {
  const [jobSearch, setJobSearch] = useState('');
  const [noteSearch, setNoteSearch] = useState('');
  const [noteFilter, setNoteFilter] = useState<'all' | 'alerts' | 'general' | 'job'>('all');

  // All DM jobs for the dropdown (sorted by job number)
  const allDmJobsSorted = useMemo(() => {
    return [...dmJobs]
      .filter(j => !j.deleted_at)
      .sort((a, b) => {
        const aNum = parseInt(a.job_number) || 0;
        const bNum = parseInt(b.job_number) || 0;
        return bNum - aNum; // newest first
      });
  }, [dmJobs]);

  // Filtered jobs for dropdown search
  const filteredDropdownJobs = useMemo(() => {
    if (!jobSearch.trim()) return allDmJobsSorted.slice(0, 50);
    const search = jobSearch.toLowerCase();
    return allDmJobsSorted.filter(j =>
      j.job_number?.toLowerCase().includes(search) ||
      j.name?.toLowerCase().includes(search) ||
      j.address?.toLowerCase().includes(search) ||
      j.team?.toLowerCase().includes(search)
    ).slice(0, 50);
  }, [allDmJobsSorted, jobSearch]);

  // Selected job display
  const selectedJob = useMemo(() => {
    if (!notepadJobId) return null;
    return dmJobs.find(j => j.id === notepadJobId);
  }, [notepadJobId, dmJobs]);

  // Filter notes
  const filteredNotes = useMemo(() => {
    let result = danniNotes;
    switch (noteFilter) {
      case 'alerts':
        result = danniNotes.filter((n: any) => n.alert_date && !n.alert_dismissed); break;
      case 'general':
        result = danniNotes.filter((n: any) => !n.job_id); break;
      case 'job':
        result = danniNotes.filter((n: any) => n.job_id); break;
    }
    if (noteSearch.trim()) {
      const s = noteSearch.toLowerCase();
      result = result.filter((n: any) => {
        const job = dmJobs.find((j: any) => j.id === n.job_id);
        return (
          n.note_text?.toLowerCase().includes(s) ||
          job?.job_number?.toLowerCase().includes(s) ||
          job?.name?.toLowerCase().includes(s) ||
          job?.address?.toLowerCase().includes(s)
        );
      });
    }
    return result;
  }, [danniNotes, noteFilter, noteSearch, dmJobs]);

  // Count notes per category
  const alertCount = danniNotes.filter((n: any) => n.alert_date && !n.alert_dismissed).length;
  const jobNoteCount = danniNotes.filter((n: any) => n.job_id).length;
  const generalCount = danniNotes.filter((n: any) => !n.job_id).length;

  // Check if selected job is overdue (appears in readinessJobs)
  const isOverdueJob = notepadJobId ? readinessJobs.some(j => j.id === notepadJobId) : false;

  return (
    <div className="absolute inset-0 z-10 bg-background rounded-lg flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2">
          <StickyNote className="w-5 h-5 text-primary" />
          <h3 className="font-semibold text-foreground">Danni's Notepad</h3>
          {activeAlerts.length > 0 && (
            <Badge variant="destructive" className="text-[10px] animate-pulse">
              {activeAlerts.length} due
            </Badge>
          )}
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Active alerts */}
      {activeAlerts.length > 0 && (
        <div className="px-4 pt-3 space-y-2">
          {activeAlerts.map((alert: any) => {
            const job = dmJobs.find((j: any) => j.id === alert.job_id);
            return (
              <div key={alert.id} className="bg-destructive/10 border border-destructive/30 rounded-lg p-2.5 flex items-start gap-2">
                <BellRing className="w-4 h-4 text-destructive mt-0.5 flex-shrink-0 animate-bounce" />
                <div className="flex-1 min-w-0">
                  {job && (
                    <p className="text-[11px] font-bold text-destructive">
                      #{job.job_number} — {job.name}
                    </p>
                  )}
                  <p className="text-xs text-foreground">{alert.note_text}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Due: {format(new Date(alert.alert_date), 'dd MMM HH:mm')}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[10px] px-2"
                  onClick={() => onDismissAlert(alert.id)}
                >
                  Dismiss
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {/* New note form */}
      <div className="px-4 pt-3 space-y-2 border-b pb-3">
        {/* Job selector with search */}
        <div className="space-y-1.5">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-full justify-start text-xs h-9 font-normal",
                  notepadJobId ? "text-foreground" : "text-muted-foreground"
                )}
              >
                <Hash className="w-3.5 h-3.5 mr-1.5 flex-shrink-0" />
                {selectedJob ? (
                  <span className="truncate">
                    <span className="font-mono font-bold">#{selectedJob.job_number}</span>
                    {' — '}
                    {selectedJob.name}
                    {selectedJob.team && <span className="text-muted-foreground"> ({selectedJob.team})</span>}
                  </span>
                ) : (
                  'Select a job (or leave for general note)'
                )}
                {isOverdueJob && (
                  <Badge variant="destructive" className="ml-auto text-[9px] px-1 py-0">Overdue</Badge>
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
                    onChange={(e) => setJobSearch(e.target.value)}
                    className="h-8 text-xs pl-7"
                    autoFocus
                  />
                </div>
              </div>
              <ScrollArea className="max-h-[300px]">
                <div className="p-1">
                  <button
                    onClick={() => { setNotepadJobId(null); setJobSearch(''); }}
                    className={cn(
                      "w-full text-left px-3 py-2 rounded text-xs hover:bg-accent transition-colors",
                      !notepadJobId && "bg-accent font-medium"
                    )}
                  >
                    📋 General Note (no job attached)
                  </button>
                  
                  {/* Overdue jobs section */}
                  {readinessJobs.length > 0 && !jobSearch.trim() && (
                    <>
                      <div className="px-3 py-1.5 text-[10px] font-semibold text-destructive uppercase tracking-wider mt-1">
                        ⚠️ Overdue Jobs ({readinessJobs.length})
                      </div>
                      {readinessJobs.slice(0, 20).map(j => (
                        <button
                          key={`overdue-${j.id}`}
                          onClick={() => { setNotepadJobId(j.id); setJobSearch(''); }}
                          className={cn(
                            "w-full text-left px-3 py-1.5 rounded text-xs hover:bg-accent transition-colors flex items-center gap-2",
                            notepadJobId === j.id && "bg-accent font-medium"
                          )}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-destructive flex-shrink-0" />
                          <span className="font-mono font-bold text-primary">#{j.jobNumber}</span>
                          <span className="truncate">{j.name}</span>
                          {j.team && <span className="text-muted-foreground ml-auto text-[10px] flex-shrink-0">{j.team}</span>}
                        </button>
                      ))}
                      <div className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mt-2">
                        All DM Jobs
                      </div>
                    </>
                  )}

                  {filteredDropdownJobs.map(j => (
                    <button
                      key={j.id}
                      onClick={() => { setNotepadJobId(j.id); setJobSearch(''); }}
                      className={cn(
                        "w-full text-left px-3 py-1.5 rounded text-xs hover:bg-accent transition-colors",
                        notepadJobId === j.id && "bg-accent font-medium"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-primary">#{j.job_number}</span>
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
        </div>

        <Textarea
          placeholder="Write a note... (chase reminder, booking, action item)"
          value={newNoteText}
          onChange={(e) => setNewNoteText(e.target.value)}
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
                onSelect={(d) => {
                  if (d) {
                    d.setHours(9, 0, 0, 0);
                    setNewNoteAlertDate(d);
                  }
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
            className="h-7 text-xs gap-1"
            disabled={!newNoteText.trim() || savingNote}
            onClick={onSaveNote}
          >
            {savingNote ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
            Add Note
          </Button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="px-4 pt-2 pb-1 flex items-center gap-1.5">
        <Filter className="w-3 h-3 text-muted-foreground mr-1" />
        {[
          { key: 'all' as const, label: 'All', count: danniNotes.length },
          { key: 'alerts' as const, label: 'Reminders', count: alertCount },
          { key: 'job' as const, label: 'Job Notes', count: jobNoteCount },
          { key: 'general' as const, label: 'General', count: generalCount },
        ].map(tab => (
          <Button
            key={tab.key}
            variant={noteFilter === tab.key ? 'default' : 'ghost'}
            size="sm"
            className="h-6 text-[10px] px-2 gap-1"
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
          {filteredNotes.map((note: any) => {
            const job = dmJobs.find((j: any) => j.id === note.job_id);
            const hasAlert = note.alert_date && !note.alert_dismissed;
            const alertDue = hasAlert && new Date(note.alert_date) <= new Date();
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
                      <span className="text-[10px] font-bold text-primary">
                        #{job.job_number} — {job.name}
                        {job.team && <span className="text-muted-foreground font-normal"> ({job.team})</span>}
                      </span>
                    )}
                    {!job && note.team_name && (
                      <span className="text-[10px] font-medium text-muted-foreground">
                        Team: {note.team_name}
                      </span>
                    )}
                    {!job && !note.team_name && (
                      <span className="text-[10px] font-medium text-muted-foreground">📋 General</span>
                    )}
                    <p className="text-foreground mt-0.5 whitespace-pre-wrap">{note.note_text}</p>
                    <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                      <span>{format(new Date(note.created_at), 'dd MMM HH:mm')}</span>
                      {hasAlert && (
                        <span className={cn("flex items-center gap-0.5", alertDue ? "text-destructive font-bold" : "text-amber-600")}>
                          <Bell className="w-2.5 h-2.5" />
                          {format(new Date(note.alert_date), 'dd MMM HH:mm')}
                        </span>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-muted-foreground hover:text-destructive"
                    onClick={() => onDeleteNote(note.id)}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            );
          })}
          {filteredNotes.length === 0 && (
            <p className="text-center text-muted-foreground py-8 text-sm">
              {noteFilter === 'all' ? 'No notes yet. Start tracking jobs above.' : `No ${noteFilter} notes.`}
            </p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
};
