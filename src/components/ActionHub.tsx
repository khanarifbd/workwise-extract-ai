import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Workflow, Sparkles, Package, BookOpen, Rocket } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MaterialsReportModal } from './MaterialsReportModal';
import { SORCodeBookManager } from './SORCodeBookManager';

/**
 * ActionHub
 * A single compact command bar that consolidates the primary admin actions
 * (Roadmap, Auto-Assign, Materials, SOR Book, Progressor) into one
 * cohesive, space-saving section.
 *
 * Design rationale:
 *  - One pill container = one visual anchor, not five floating buttons.
 *  - Icon colour carries the "category" cue; the chip shape stays uniform.
 *  - Inset hairline divider between groups keeps related actions together
 *    (analytics ⟂ knowledge ⟂ workflow) without extra chrome.
 */
export const ActionHub = () => {
  const [materialsOpen, setMaterialsOpen] = useState(false);
  const [sorBookOpen, setSorBookOpen] = useState(false);

  const itemBase =
    'group relative flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-semibold ' +
    'text-foreground/80 hover:text-foreground transition-all duration-150 ' +
    'hover:bg-background hover:shadow-sm active:scale-[0.97]';

  return (
    <>
      <div
        className={cn(
          'inline-flex items-center gap-0.5 p-1 rounded-full',
          'bg-muted/60 border border-border/60 backdrop-blur-sm',
          'shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]'
        )}
        role="toolbar"
        aria-label="Quick actions"
      >
        <Link to="/roadmaps" title="Project Roadmaps" className={itemBase}>
          <Workflow className="w-3.5 h-3.5 text-indigo-400" />
          <span>Roadmap</span>
        </Link>

        <Link to="/auto-assign" title="AI Auto-Assign" className={itemBase}>
          <Sparkles className="w-3.5 h-3.5 text-violet-400" />
          <span>Auto-Assign</span>
        </Link>

        <button
          type="button"
          onClick={() => setMaterialsOpen(true)}
          title="Materials Report"
          className={itemBase}
        >
          <Package className="w-3.5 h-3.5 text-amber-400" />
          <span>Materials</span>
        </button>

        <span className="w-px h-4 bg-border/70 mx-0.5" aria-hidden />

        <button
          type="button"
          onClick={() => setSorBookOpen(true)}
          title="SOR Code Book"
          className={itemBase}
        >
          <BookOpen className="w-3.5 h-3.5 text-emerald-400" />
          <span>SOR Book</span>
        </button>

        <span className="w-px h-4 bg-border/70 mx-0.5" aria-hidden />

        <Link
          to="/progressor"
          title="Open Progressor Workspace"
          className={cn(itemBase, 'text-progressor-foreground/90 hover:text-white')}
        >
          <Rocket className="w-3.5 h-3.5 text-sky-400" />
          <span>Progressor</span>
        </Link>
      </div>

      <MaterialsReportModal open={materialsOpen} onOpenChange={setMaterialsOpen} />
      {sorBookOpen && (
        <SORCodeBookManager open={sorBookOpen} onOpenChange={setSorBookOpen} />
      )}
    </>
  );
};
