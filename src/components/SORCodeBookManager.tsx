import { useEffect, useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Upload, Trash2, RefreshCw, FileText, CheckCircle2, AlertCircle, Loader2, BookOpen } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface SORBook {
  id: string;
  file_path: string;
  file_name: string;
  file_size: number | null;
  status: 'pending' | 'processing' | 'ready' | 'error';
  code_count: number;
  error_message: string | null;
  created_at: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const SORCodeBookManager = ({ open, onOpenChange }: Props) => {
  const [books, setBooks] = useState<SORBook[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('sor_code_books')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      toast({ title: 'Failed to load SOR books', description: error.message, variant: 'destructive' });
    } else {
      setBooks((data ?? []) as SORBook[]);
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  // Poll while any book is processing
  useEffect(() => {
    if (!open) return;
    const anyProcessing = books.some((b) => b.status === 'processing' || b.status === 'pending');
    if (!anyProcessing) return;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [open, books, load]);

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    for (const file of Array.from(files)) {
      if (!file.name.toLowerCase().endsWith('.pdf')) {
        toast({ title: 'Skipped', description: `${file.name} is not a PDF`, variant: 'destructive' });
        continue;
      }
      try {
        const path = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        const { error: upErr } = await supabase.storage.from('sor-code-books').upload(path, file, {
          contentType: 'application/pdf',
        });
        if (upErr) throw upErr;
        const { data: row, error: insErr } = await supabase
          .from('sor_code_books')
          .insert({ file_path: path, file_name: file.name, file_size: file.size, status: 'pending' })
          .select()
          .single();
        if (insErr) throw insErr;

        // Kick off extraction
        const { error: fnErr } = await supabase.functions.invoke('extract-sor-codes', { body: { bookId: row.id } });
        if (fnErr) {
          toast({ title: 'Extraction failed', description: fnErr.message, variant: 'destructive' });
        } else {
          toast({ title: 'Uploaded', description: `${file.name} is being processed` });
        }
      } catch (e: any) {
        toast({ title: 'Upload failed', description: e?.message || String(e), variant: 'destructive' });
      }
    }
    setUploading(false);
    load();
  };

  const handleReprocess = async (book: SORBook) => {
    const { error } = await supabase.functions.invoke('extract-sor-codes', { body: { bookId: book.id } });
    if (error) toast({ title: 'Reprocess failed', description: error.message, variant: 'destructive' });
    else toast({ title: 'Reprocessing started' });
    load();
  };

  const handleDelete = async (book: SORBook) => {
    if (!confirm(`Delete "${book.file_name}" and all its SOR codes?`)) return;
    await supabase.storage.from('sor-code-books').remove([book.file_path]);
    const { error } = await supabase.from('sor_code_books').delete().eq('id', book.id);
    if (error) toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
    else toast({ title: 'Deleted' });
    load();
  };

  const totalCodes = books.filter((b) => b.status === 'ready').reduce((s, b) => s + b.code_count, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="w-5 h-5" />
            NPH-Approved SOR Code Books
          </DialogTitle>
          <DialogDescription>
            Upload approved SOR rate schedule PDFs. Codes are extracted automatically and used by AI Convert.
            <span className="block mt-1 text-xs">Total active codes: <strong>{totalCodes.toLocaleString()}</strong></span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <label className={cn(
            "flex items-center justify-center gap-2 p-6 border-2 border-dashed rounded-lg cursor-pointer transition-colors",
            uploading ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30"
          )}>
            <input
              type="file"
              accept="application/pdf"
              multiple
              className="hidden"
              disabled={uploading}
              onChange={(e) => handleUpload(e.target.files)}
            />
            {uploading ? (
              <><Loader2 className="w-5 h-5 animate-spin" /><span className="text-sm">Uploading…</span></>
            ) : (
              <><Upload className="w-5 h-5 text-primary" /><span className="text-sm font-medium">Click to upload SOR PDF(s)</span></>
            )}
          </label>

          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {loading && books.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">Loading…</div>
            ) : books.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No SOR books uploaded yet. Upload a PDF to get started.
              </div>
            ) : (
              books.map((book) => (
                <div key={book.id} className="flex items-center gap-3 p-3 border border-border rounded-lg bg-card">
                  <FileText className="w-5 h-5 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{book.file_name}</div>
                    <div className="flex items-center gap-2 mt-1">
                      {book.status === 'ready' && (
                        <Badge variant="secondary" className="text-xs gap-1">
                          <CheckCircle2 className="w-3 h-3 text-green-600" />
                          {book.code_count} codes
                        </Badge>
                      )}
                      {book.status === 'processing' && (
                        <Badge variant="secondary" className="text-xs gap-1">
                          <Loader2 className="w-3 h-3 animate-spin" /> Processing
                        </Badge>
                      )}
                      {book.status === 'pending' && (
                        <Badge variant="secondary" className="text-xs">Pending</Badge>
                      )}
                      {book.status === 'error' && (
                        <Badge variant="destructive" className="text-xs gap-1">
                          <AlertCircle className="w-3 h-3" /> Error
                        </Badge>
                      )}
                      {book.file_size && (
                        <span className="text-xs text-muted-foreground">
                          {(book.file_size / 1024 / 1024).toFixed(1)} MB
                        </span>
                      )}
                    </div>
                    {book.error_message && (
                      <div className="text-xs text-destructive mt-1 truncate" title={book.error_message}>
                        {book.error_message}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button size="sm" variant="ghost" onClick={() => handleReprocess(book)} title="Re-extract codes">
                      <RefreshCw className="w-4 h-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => handleDelete(book)} title="Delete">
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
