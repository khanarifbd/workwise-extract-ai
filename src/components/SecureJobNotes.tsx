/**
 * SecureJobNotes — locked per-job admin notes.
 * Access requires the 5-digit ADMIN_SECURE_NOTES_CODE stored on the backend.
 * All reads/writes go through the `secure-job-notes` edge function.
 *
 * Once verified in a browser session, the code is cached in sessionStorage
 * so the admin isn't re-prompted per job for the same session.
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Lock, ShieldCheck, Loader2, Trash2, Pencil, Save, X, LogOut } from 'lucide-react';
import { format } from 'date-fns';

interface SecureNote {
  id: string;
  job_id: string;
  note_text: string;
  author_name: string | null;
  author_user_id: string | null;
  created_at: string;
  updated_at: string;
}

interface JobContext {
  description?: string;
  summaryOfWorks?: string;
  workItems?: Array<{ sorCode?: string; description?: string; qty?: number; cost?: number }>;
  additionalWorks?: Array<{ sorCode?: string; description?: string; qty?: number; cost?: number }>;
  ongoingReason?: string;
  progressNotes?: string;
  privateNotes?: string;
  isOngoing?: boolean;
  scheduledTrades?: Array<{ trade: string; tradesman: string; date: string }>;
}

interface Props {
  jobId: string;
  jobNumber?: string;
  compact?: boolean;
  context?: JobContext;
}

const CODE_SESSION_KEY = 'admin_secure_notes_code';

async function callFn(action: string, code: string, payload: Record<string, unknown> = {}) {
  const { data, error } = await supabase.functions.invoke('secure-job-notes', {
    body: { action, code, ...payload },
  });
  if (error) throw new Error(error.message || 'Request failed');
  if (data?.error) throw new Error(data.error);
  return data;
}

export function SecureJobNotes({ jobId, jobNumber, compact = false, context }: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const [notes, setNotes] = useState<SecureNote[]>([]);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [saving, setSaving] = useState(false);

  // Restore cached code
  useEffect(() => {
    if (!open) return;
    const cached = sessionStorage.getItem(CODE_SESSION_KEY);
    if (cached) {
      setCode(cached);
      setUnlocked(true);
    }
  }, [open]);

  const loadNotes = useCallback(async (usingCode: string) => {
    setLoading(true);
    try {
      const res = await callFn('list', usingCode, { jobId });
      setNotes(res.notes ?? []);
    } catch (e) {
      toast({
        title: 'Could not load notes',
        description: (e as Error).message,
        variant: 'destructive',
      });
      // If the code was rejected server-side, force re-entry
      if ((e as Error).message?.toLowerCase().includes('code')) {
        sessionStorage.removeItem(CODE_SESSION_KEY);
        setUnlocked(false);
      }
    } finally {
      setLoading(false);
    }
  }, [jobId, toast]);

  useEffect(() => {
    if (open && unlocked) loadNotes(code);
  }, [open, unlocked, code, loadNotes]);

  const handleVerify = async () => {
    if (!/^\d{5}$/.test(code)) {
      toast({ title: 'Enter your 5-digit code', variant: 'destructive' });
      return;
    }
    setVerifying(true);
    try {
      await callFn('verify', code);
      sessionStorage.setItem(CODE_SESSION_KEY, code);
      setUnlocked(true);
    } catch (e) {
      toast({
        title: 'Access denied',
        description: (e as Error).message,
        variant: 'destructive',
      });
    } finally {
      setVerifying(false);
    }
  };

  const handleAdd = async () => {
    if (!draft.trim()) return;
    setSaving(true);
    try {
      const res = await callFn('create', code, { jobId, noteText: draft });
      setNotes((n) => [res.note as SecureNote, ...n]);
      setDraft('');
    } catch (e) {
      toast({ title: 'Save failed', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (id: string) => {
    if (!editDraft.trim()) return;
    setSaving(true);
    try {
      const res = await callFn('update', code, { noteId: id, noteText: editDraft });
      setNotes((n) => n.map((x) => (x.id === id ? (res.note as SecureNote) : x)));
      setEditingId(null);
      setEditDraft('');
    } catch (e) {
      toast({ title: 'Save failed', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this secure note? This cannot be undone.')) return;
    try {
      await callFn('delete', code, { noteId: id });
      setNotes((n) => n.filter((x) => x.id !== id));
    } catch (e) {
      toast({ title: 'Delete failed', description: (e as Error).message, variant: 'destructive' });
    }
  };

  const handleLock = () => {
    sessionStorage.removeItem(CODE_SESSION_KEY);
    setCode('');
    setUnlocked(false);
    setNotes([]);
  };

  const handleOpenChange = (o: boolean) => {
    setOpen(o);
    if (!o) {
      setEditingId(null);
      setEditDraft('');
      setDraft('');
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="border-purple-500/40 text-purple-700 dark:text-purple-300 hover:bg-purple-500/10"
        title="Secure admin-only notes"
      >
        <Lock className="w-3.5 h-3.5 mr-1.5" />
        Secure Notes
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-purple-600" />
              Secure Admin Notes
              {jobNumber && (
                <span className="text-xs font-normal text-muted-foreground">
                  · Job {jobNumber}
                </span>
              )}
            </DialogTitle>
            <DialogDescription>
              Restricted space. Only admins with the 5-digit access code can read or write here.
              Progressors, operations managers and other staff cannot see this content.
            </DialogDescription>
          </DialogHeader>

          {!unlocked ? (
            <div className="space-y-3 py-2">
              <label className="text-sm font-medium">Enter 5-digit access code</label>
              <Input
                type="password"
                inputMode="numeric"
                autoComplete="off"
                maxLength={5}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 5))}
                placeholder="•••••"
                className="text-center text-2xl tracking-[0.5em] font-mono"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleVerify();
                }}
                autoFocus
              />
              <Button
                onClick={handleVerify}
                disabled={verifying || code.length !== 5}
                className="w-full"
              >
                {verifying ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Verifying…
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4 mr-2" /> Unlock
                  </>
                )}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                  <ShieldCheck className="w-3.5 h-3.5" /> Unlocked for this session
                </span>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={handleLock}>
                  <LogOut className="w-3 h-3 mr-1" /> Lock
                </Button>
              </div>

              {/* Add note */}
              <div className="space-y-2 border rounded-lg p-3 bg-muted/30">
                <Textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Write a private admin note about this job…"
                  className="min-h-[80px] text-sm"
                />
                <div className="flex justify-end">
                  <Button size="sm" onClick={handleAdd} disabled={saving || !draft.trim()}>
                    {saving ? (
                      <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                    ) : (
                      <Save className="w-3.5 h-3.5 mr-1" />
                    )}
                    Add note
                  </Button>
                </div>
              </div>

              {/* List */}
              <div className="max-h-[45vh] overflow-y-auto space-y-2 pr-1">
                {loading ? (
                  <div className="flex items-center justify-center py-6 text-muted-foreground text-sm">
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Loading…
                  </div>
                ) : notes.length === 0 ? (
                  <p className="text-center text-sm text-muted-foreground py-6">
                    No secure notes on this job yet.
                  </p>
                ) : (
                  notes.map((n) => (
                    <div
                      key={n.id}
                      className="border rounded-lg p-3 bg-card space-y-1.5"
                    >
                      {editingId === n.id ? (
                        <>
                          <Textarea
                            value={editDraft}
                            onChange={(e) => setEditDraft(e.target.value)}
                            className="min-h-[70px] text-sm"
                          />
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setEditingId(null);
                                setEditDraft('');
                              }}
                            >
                              <X className="w-3.5 h-3.5 mr-1" /> Cancel
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => handleUpdate(n.id)}
                              disabled={saving || !editDraft.trim()}
                            >
                              <Save className="w-3.5 h-3.5 mr-1" /> Save
                            </Button>
                          </div>
                        </>
                      ) : (
                        <>
                          <p className="text-sm whitespace-pre-wrap break-words">
                            {n.note_text}
                          </p>
                          <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t">
                            <span>
                              {n.author_name || 'Admin'} ·{' '}
                              {format(new Date(n.created_at), 'd MMM yyyy HH:mm')}
                              {n.updated_at !== n.created_at && ' · edited'}
                            </span>
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0"
                                onClick={() => {
                                  setEditingId(n.id);
                                  setEditDraft(n.note_text);
                                }}
                              >
                                <Pencil className="w-3 h-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0 text-destructive"
                                onClick={() => handleDelete(n.id)}
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
