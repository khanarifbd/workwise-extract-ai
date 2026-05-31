import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Eraser, PenLine, Save, Loader2, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { format } from 'date-fns';

interface Props {
  jobId: string;
  jobNumber: string;
  existingUrl: string | null;
  existingName: string | null;
  signedAt: Date | null;
  onSaved: (url: string, name: string, signedAt: string) => void;
}

/**
 * Minimal canvas signature pad. Stores the signature as a data URL on the job row.
 * Required by the Completion Lock System before a job can be closed.
 */
export function TenantSignaturePad({ jobId, jobNumber, existingUrl, existingName, signedAt, onSaved }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const hasDrawn = useRef(false);
  const [name, setName] = useState(existingName || '');
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(!existingUrl);

  const ctx = () => canvasRef.current?.getContext('2d') || null;

  useEffect(() => {
    if (!editing) return;
    const c = canvasRef.current;
    if (!c) return;
    // High-DPI setup
    const ratio = window.devicePixelRatio || 1;
    const rect = c.getBoundingClientRect();
    c.width = rect.width * ratio;
    c.height = rect.height * ratio;
    const g = c.getContext('2d');
    if (!g) return;
    g.scale(ratio, ratio);
    g.lineWidth = 2;
    g.lineCap = 'round';
    g.strokeStyle = '#111';
    g.fillStyle = '#fff';
    g.fillRect(0, 0, rect.width, rect.height);
  }, [editing]);

  const pos = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onDown = (e: React.PointerEvent) => {
    drawing.current = true;
    hasDrawn.current = true;
    const g = ctx(); if (!g) return;
    const { x, y } = pos(e);
    g.beginPath(); g.moveTo(x, y);
    (e.target as Element).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const g = ctx(); if (!g) return;
    const { x, y } = pos(e);
    g.lineTo(x, y); g.stroke();
  };
  const onUp = () => { drawing.current = false; };

  const clear = () => {
    const c = canvasRef.current; if (!c) return;
    const g = c.getContext('2d'); if (!g) return;
    const rect = c.getBoundingClientRect();
    g.fillStyle = '#fff';
    g.fillRect(0, 0, rect.width, rect.height);
    hasDrawn.current = false;
  };

  const save = async () => {
    if (!hasDrawn.current) {
      toast({ title: 'Signature required', description: 'Please ask the tenant to sign on the pad.', variant: 'destructive' });
      return;
    }
    if (!name.trim()) {
      toast({ title: 'Tenant name required', description: 'Please type the tenant\u2019s printed name.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const dataUrl = canvasRef.current!.toDataURL('image/png');
      const signedAtIso = new Date().toISOString();
      const { error } = await supabase
        .from('jobs')
        .update({
          tenant_signature_url: dataUrl,
          tenant_signature_name: name.trim(),
          tenant_signature_signed_at: signedAtIso,
        })
        .eq('id', jobId);
      if (error) throw error;
      toast({ title: 'Signature captured', description: `Job #${jobNumber}` });
      onSaved(dataUrl, name.trim(), signedAtIso);
      setEditing(false);
    } catch (err: any) {
      toast({ title: 'Failed to save signature', description: err?.message || String(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (!editing && existingUrl) {
    return (
      <div className="rounded-lg border border-emerald-300 bg-emerald-50/40 dark:bg-emerald-950/20 p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="h-4 w-4" />
            Tenant Signature on file
          </div>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditing(true)}>
            <PenLine className="h-3 w-3 mr-1" /> Re-capture
          </Button>
        </div>
        <img src={existingUrl} alt="Tenant signature" className="max-h-24 bg-white rounded border" />
        <div className="text-[11px] text-muted-foreground">
          Signed by <span className="font-medium text-foreground">{existingName || 'Unknown'}</span>
          {signedAt && <> on {format(signedAt, 'd MMM yyyy HH:mm')}</>}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50/30 dark:bg-amber-950/20 p-3 space-y-2">
      <div className="flex items-center gap-2 text-sm font-semibold text-amber-800 dark:text-amber-300">
        <PenLine className="h-4 w-4" /> Tenant Signature Required
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Tenant printed name *</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Jane Doe" className="h-8 text-sm" />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Sign below *</Label>
        <canvas
          ref={canvasRef}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerLeave={onUp}
          className="w-full h-32 rounded border border-dashed bg-white touch-none cursor-crosshair"
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={clear} disabled={saving} className="h-7 text-xs">
          <Eraser className="h-3 w-3 mr-1" /> Clear
        </Button>
        <Button size="sm" onClick={save} disabled={saving} className="h-7 text-xs">
          {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />}
          Save Signature
        </Button>
      </div>
    </div>
  );
}
