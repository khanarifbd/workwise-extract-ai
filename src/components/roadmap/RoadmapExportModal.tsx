import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FileDown } from 'lucide-react';
import type { RoadmapPdfOptions } from '@/lib/roadmapPdfExport';

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onConfirm: (opts: RoadmapPdfOptions) => void;
  taskCount: number;
  roadmapName: string;
};

// A4 landscape: 842 x 595 pt · Letter landscape: 792 x 612 pt
const PREVIEW_H = 220;

export function RoadmapExportModal({ open, onOpenChange, onConfirm, taskCount, roadmapName }: Props) {
  const [pageSize, setPageSize] = useState<'a4' | 'letter'>('a4');
  const [orientation, setOrientation] = useState<'landscape' | 'portrait'>('landscape');
  const [margin, setMargin] = useState<number>(32);

  const dims = pageSize === 'a4' ? { w: 842, h: 595 } : { w: 792, h: 612 };
  const pageW = orientation === 'landscape' ? dims.w : dims.h;
  const pageH = orientation === 'landscape' ? dims.h : dims.w;
  const scale = PREVIEW_H / pageH;
  const previewW = pageW * scale;
  const mPx = margin * scale;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Export roadmap PDF</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <Label>Page size</Label>
              <Select value={pageSize} onValueChange={(v) => setPageSize(v as 'a4' | 'letter')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="a4">A4 (210 × 297 mm)</SelectItem>
                  <SelectItem value="letter">Letter (8.5 × 11 in)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Orientation</Label>
              <Select value={orientation} onValueChange={(v) => setOrientation(v as 'landscape' | 'portrait')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="landscape">Landscape</SelectItem>
                  <SelectItem value="portrait">Portrait</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Margin (pt): {margin}</Label>
              <Input
                type="range"
                min={12}
                max={96}
                step={2}
                value={margin}
                onChange={(e) => setMargin(Number(e.target.value))}
              />
              <p className="text-xs text-muted-foreground mt-1">
                ≈ {(margin / 28.35).toFixed(2)} cm on every edge
              </p>
            </div>
            <div className="text-xs text-muted-foreground">
              <div><strong>{taskCount}</strong> task{taskCount === 1 ? '' : 's'} · {roadmapName}</div>
            </div>
          </div>

          <div className="flex items-center justify-center">
            <div
              className="relative bg-white border border-border shadow-sm"
              style={{ width: previewW, height: PREVIEW_H }}
              aria-label="Page preview"
            >
              <div
                className="absolute border border-dashed border-primary/50"
                style={{ left: mPx, top: mPx, right: mPx, bottom: mPx }}
              >
                <div className="absolute top-1 left-1 right-1 h-2 bg-[hsl(215_50%_15%)] rounded-sm" />
                <div className="absolute top-5 left-1 right-1 space-y-[2px]">
                  {Array.from({ length: Math.min(8, Math.max(3, Math.round(taskCount / 8))) }).map((_, i) => (
                    <div key={i} className="h-[3px] bg-primary/40 rounded-sm" style={{ width: `${40 + (i * 7) % 55}%` }} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => { onConfirm({ pageSize, orientation, margin }); onOpenChange(false); }}>
            <FileDown className="w-4 h-4 mr-1" /> Generate PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
