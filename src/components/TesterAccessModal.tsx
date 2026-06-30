import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Loader2, ShieldCheck } from 'lucide-react';
import { useTesterPermissions, SECTION_LIST, SectionKey } from '@/hooks/useTesterPermissions';
import { useToast } from '@/hooks/use-toast';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function TesterAccessModal({ open, onOpenChange }: Props) {
  const { isEnabled, setEnabled, loading } = useTesterPermissions();
  const [pending, setPending] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  const handleToggle = async (key: SectionKey, next: boolean) => {
    setPending((s) => new Set(s).add(key));
    try {
      await setEnabled(key, next);
    } catch (e: any) {
      toast({ title: 'Failed to update', description: e?.message ?? 'Unknown error', variant: 'destructive' });
    } finally {
      setPending((s) => {
        const n = new Set(s);
        n.delete(key);
        return n;
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-600" />
            Tester Access Control
          </DialogTitle>
          <DialogDescription>
            Tick the sections testers (e.g. Nav) are allowed to view. Unticked sections will be hidden and routes blocked. Admins and viewers are unaffected.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-2 max-h-[55vh] overflow-y-auto pr-1">
            {SECTION_LIST.map((s) => {
              const checked = isEnabled(s.key);
              const isPending = pending.has(s.key);
              return (
                <label
                  key={s.key}
                  htmlFor={`sec-${s.key}`}
                  className="flex items-start gap-3 p-3 rounded-md border bg-card hover:bg-muted/40 cursor-pointer"
                >
                  <Checkbox
                    id={`sec-${s.key}`}
                    checked={checked}
                    disabled={isPending}
                    onCheckedChange={(v) => handleToggle(s.key, v === true)}
                    className="mt-0.5"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Label htmlFor={`sec-${s.key}`} className="cursor-pointer font-medium">
                        {s.label}
                      </Label>
                      {isPending && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{s.description}</p>
                  </div>
                </label>
              );
            })}
          </div>
        )}

        <div className="flex justify-end pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
