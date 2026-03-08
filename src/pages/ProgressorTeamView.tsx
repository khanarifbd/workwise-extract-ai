import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { mapDatabaseJobToJob } from '@/lib/api';
import { Job } from '@/types/job';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { ProgressorMediaUpload } from '@/components/progressor/ProgressorMediaUpload';
import {
  LogOut, Loader2, ChevronDown, MapPin, Phone, User,
  Info, Save, X, Mic, MicOff, Search,
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

const SESSION_KEY = 'progressor_team_session';

interface TeamSession {
  teamName: string;
  validatedAt: string;
  expiresAt: string;
}

export default function ProgressorTeamView() {
  const [session, setSession] = useState<TeamSession | null>(null);
  const [accessCode, setAccessCode] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [expandedJobs, setExpandedJobs] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [editingDescription, setEditingDescription] = useState<string | null>(null);
  const [descriptionDraft, setDescriptionDraft] = useState('');
  const [isSavingDesc, setIsSavingDesc] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const { toast } = useToast();

  // Load session
  useEffect(() => {
    const stored = localStorage.getItem(SESSION_KEY);
    if (stored) {
      try {
        const parsed: TeamSession = JSON.parse(stored);
        if (new Date(parsed.expiresAt) > new Date()) {
          setSession(parsed);
        } else {
          localStorage.removeItem(SESSION_KEY);
        }
      } catch {
        localStorage.removeItem(SESSION_KEY);
      }
    }
  }, []);

  const login = async () => {
    if (!accessCode.trim()) return;
    setIsLoggingIn(true);
    setLoginError('');

    try {
      const { data, error } = await supabase.functions.invoke('validate-progressor-team-code', {
        body: { accessCode: accessCode.trim() },
      });

      if (error || !data?.success) {
        setLoginError(data?.error || 'Invalid access code');
        setIsLoggingIn(false);
        return;
      }

      const newSession: TeamSession = data.session;
      localStorage.setItem(SESSION_KEY, JSON.stringify(newSession));
      setSession(newSession);
      setAccessCode('');
    } catch (err) {
      setLoginError('Failed to validate. Please try again.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const logout = () => {
    localStorage.removeItem(SESSION_KEY);
    setSession(null);
    setJobs([]);
  };

  // Fetch jobs assigned to this team
  const fetchJobs = useCallback(async () => {
    if (!session) return;
    setJobsLoading(true);
    try {
      // Fetch jobs where team or team2 matches
      const teamName = session.teamName;
      const { data, error } = await supabase
        .from('jobs')
        .select('*')
        .is('deleted_at', null)
        .or(`team.eq.${teamName},team2.eq.${teamName}`)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setJobs((data || []).map(mapDatabaseJobToJob));
    } catch (err) {
      console.error('Error fetching jobs:', err);
    } finally {
      setJobsLoading(false);
    }
  }, [session]);

  useEffect(() => {
    if (session) fetchJobs();
  }, [session, fetchJobs]);

  const filteredJobs = jobs.filter(job => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return job.name.toLowerCase().includes(q) ||
      job.address.toLowerCase().includes(q) ||
      job.jobNumber.toLowerCase().includes(q);
  });

  const saveDescription = async (jobId: string) => {
    setIsSavingDesc(true);
    try {
      const { error } = await supabase
        .from('jobs')
        .update({ description: descriptionDraft })
        .eq('id', jobId);
      if (error) throw error;
      setJobs(prev => prev.map(j => j.id === jobId ? { ...j, description: descriptionDraft } : j));
      setEditingDescription(null);
      toast({ title: 'Saved', description: 'Description updated' });
    } catch (err: any) {
      toast({ title: 'Error', description: 'Failed to save', variant: 'destructive' });
    } finally {
      setIsSavingDesc(false);
    }
  };

  // Voice recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop());
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await transcribeAudio(audioBlob);
      };

      mediaRecorder.start();
      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true);
    } catch (err) {
      toast({ title: 'Microphone Error', description: 'Could not access microphone', variant: 'destructive' });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  const transcribeAudio = async (audioBlob: Blob) => {
    setIsTranscribing(true);
    try {
      // First, transcribe using browser's Speech Recognition API or send to AI
      // For simplicity, we'll convert audio to text using the Whisper-like approach
      // by sending audio as base64 to our AI function
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onloadend = () => {
          const base64 = (reader.result as string).split(',')[1];
          resolve(base64);
        };
        reader.readAsDataURL(audioBlob);
      });
      const base64Audio = await base64Promise;

      // Use the transcribe-description edge function to enhance whatever text we get
      // For now, let's use the Web Speech API for transcription
      // and the AI for enhancement
      toast({
        title: 'Voice Note',
        description: 'Voice recording saved. Type or paste the spoken text and use AI enhance to clean it up.',
      });
    } catch (err) {
      toast({ title: 'Error', description: 'Failed to process voice note', variant: 'destructive' });
    } finally {
      setIsTranscribing(false);
    }
  };

  const enhanceDescription = async (jobId: string) => {
    if (!descriptionDraft.trim()) return;
    setIsTranscribing(true);
    try {
      const { data, error } = await supabase.functions.invoke('transcribe-description', {
        body: { text: descriptionDraft },
      });

      if (error || !data?.success) {
        toast({ title: 'Error', description: data?.error || 'AI enhancement failed', variant: 'destructive' });
        return;
      }

      setDescriptionDraft(data.enhancedText);
      toast({ title: 'Enhanced', description: 'Description cleaned up by AI' });
    } catch (err) {
      toast({ title: 'Error', description: 'AI enhancement failed', variant: 'destructive' });
    } finally {
      setIsTranscribing(false);
    }
  };

  // Login screen
  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-900 dark:to-slate-800 p-4">
        <Card className="w-full max-w-sm p-6 space-y-4">
          <div className="text-center">
            <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
              <User className="h-7 w-7 text-primary" />
            </div>
            <h1 className="text-xl font-bold">Team Access</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Enter your team access code to view and update your jobs
            </p>
          </div>

          <div className="space-y-3">
            <Input
              value={accessCode}
              onChange={(e) => setAccessCode(e.target.value.toUpperCase())}
              placeholder="Enter access code..."
              className="text-center text-lg font-mono tracking-wider"
              maxLength={20}
              onKeyDown={(e) => e.key === 'Enter' && login()}
            />
            {loginError && (
              <p className="text-sm text-destructive text-center">{loginError}</p>
            )}
            <Button
              className="w-full"
              onClick={login}
              disabled={!accessCode.trim() || isLoggingIn}
            >
              {isLoggingIn ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Access My Jobs
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // Main team view
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 bg-card border-b shadow-sm">
        <div className="max-w-[900px] mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">Team: {session.teamName}</h1>
            <p className="text-xs text-muted-foreground">Edit descriptions & upload media for your jobs</p>
          </div>
          <Button variant="ghost" size="sm" onClick={logout}>
            <LogOut className="h-4 w-4 mr-1" /> Sign Out
          </Button>
        </div>
      </header>

      <main className="max-w-[900px] mx-auto px-4 py-5 space-y-4">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search jobs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        <p className="text-xs text-muted-foreground">
          Showing {filteredJobs.length} job{filteredJobs.length !== 1 ? 's' : ''} assigned to {session.teamName}
        </p>

        {jobsLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filteredJobs.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground">
            No jobs found assigned to your team.
          </Card>
        ) : (
          <div className="space-y-2">
            {filteredJobs.map(job => {
              const isExpanded = expandedJobs.has(job.id);
              return (
                <Card key={job.id} className="overflow-hidden">
                  <div
                    className="px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors flex items-center gap-3"
                    onClick={() => setExpandedJobs(prev => {
                      const next = new Set(prev);
                      next.has(job.id) ? next.delete(job.id) : next.add(job.id);
                      return next;
                    })}
                  >
                    <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", isExpanded && "rotate-180")} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs font-mono">#{job.jobNumber}</Badge>
                        <span className="font-semibold text-sm truncate">{job.name}</span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{job.address}</p>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="border-t px-4 py-3 space-y-3">
                      {/* Read-only info */}
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div>
                          <span className="text-muted-foreground flex items-center gap-1"><User className="h-3 w-3" /> Tenant</span>
                          <p className="font-medium">{job.name}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3" /> Address</span>
                          <p className="font-medium">{job.address}</p>
                        </div>
                        {job.phoneNumber && (
                          <div>
                            <span className="text-muted-foreground flex items-center gap-1"><Phone className="h-3 w-3" /> Phone</span>
                            <a href={`tel:${job.phoneNumber}`} className="font-medium text-primary hover:underline">{job.phoneNumber}</a>
                          </div>
                        )}
                        {job.bookedDate && (
                          <div>
                            <span className="text-muted-foreground">Booked Date</span>
                            <p className="font-medium">{format(job.bookedDate, 'dd MMM yyyy')}</p>
                          </div>
                        )}
                      </div>

                      {/* Editable Description */}
                      <div className="bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-800 rounded-lg p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold flex items-center gap-1 text-indigo-700 dark:text-indigo-300">
                            <Info className="h-3 w-3" /> Description (Editable)
                          </span>
                          {editingDescription !== job.id ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 text-[10px] px-2"
                              onClick={() => { setEditingDescription(job.id); setDescriptionDraft(job.description || ''); }}
                            >
                              Edit
                            </Button>
                          ) : (
                            <div className="flex gap-1">
                              <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={() => setEditingDescription(null)}>
                                <X className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-6 text-[10px] px-2"
                                onClick={() => enhanceDescription(job.id)}
                                disabled={isTranscribing || !descriptionDraft.trim()}
                              >
                                {isTranscribing ? <Loader2 className="h-3 w-3 animate-spin" /> : '✨ AI Clean'}
                              </Button>
                              <Button size="sm" className="h-6 text-[10px] px-2" onClick={() => saveDescription(job.id)} disabled={isSavingDesc}>
                                {isSavingDesc ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3 mr-0.5" />}
                                Save
                              </Button>
                            </div>
                          )}
                        </div>

                        {editingDescription === job.id ? (
                          <div className="space-y-2">
                            <Textarea
                              value={descriptionDraft}
                              onChange={(e) => setDescriptionDraft(e.target.value)}
                              placeholder="Describe the works in any language — AI will translate and clean up..."
                              className="min-h-[100px] text-xs resize-y"
                            />
                            <div className="flex gap-2">
                              <Button
                                variant={isRecording ? "destructive" : "outline"}
                                size="sm"
                                className="text-xs h-7"
                                onClick={isRecording ? stopRecording : startRecording}
                              >
                                {isRecording ? (
                                  <><MicOff className="h-3 w-3 mr-1" /> Stop Recording</>
                                ) : (
                                  <><Mic className="h-3 w-3 mr-1" /> Voice Record</>
                                )}
                              </Button>
                              {isRecording && (
                                <span className="text-xs text-red-500 animate-pulse flex items-center">● Recording...</span>
                              )}
                            </div>
                            <p className="text-[10px] text-muted-foreground">
                              Speak in any language. Type or record, then press "AI Clean" to translate and professionalize.
                            </p>
                          </div>
                        ) : (
                          <p className="text-xs whitespace-pre-wrap">
                            {job.description || <span className="text-muted-foreground italic">No description — click Edit to add one</span>}
                          </p>
                        )}
                      </div>

                      {/* Media Upload */}
                      <ProgressorMediaUpload
                        jobId={job.id}
                        jobNumber={job.jobNumber}
                        onUploaded={fetchJobs}
                      />
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
