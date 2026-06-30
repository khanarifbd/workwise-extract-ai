import React from 'react';

/**
 * Progressor markup utilities.
 *
 * Progressor edits within job descriptions are wrapped with
 *   [[PROG]] ...content... [[/PROG]]
 * markers so they can be rendered in blue everywhere the description is shown.
 */

export const PROG_OPEN = '[[PROG]]';
export const PROG_CLOSE = '[[/PROG]]';

/** Wrap arbitrary text with progressor markers (used when saving). */
export const wrapProgressorText = (text: string) =>
  `${PROG_OPEN}${text}${PROG_CLOSE}`;

/** Strip all markers from text — used for plain-text exports. */
export const stripProgressorMarkers = (text: string | null | undefined) =>
  (text || '').replace(/\[\[\/?PROG\]\]/g, '');

/** Detect if text already contains progressor markers. */
export const hasProgressorMarkers = (text: string | null | undefined) =>
  !!text && text.includes(PROG_OPEN);

/**
 * Render text with progressor segments highlighted in blue.
 * Use anywhere a job description or notes field is displayed.
 */
export const RenderWithProgressor: React.FC<{ text: string | null | undefined; className?: string }> = ({
  text,
  className,
}) => {
  if (!text) return null;
  // Match either [[PROG]]…[[/PROG]] markers or the legacy <<<…>>> convention
  // typed manually by progressors. Both render as purple progressor edits.
  const re = /\[\[PROG\]\]([\s\S]*?)\[\[\/PROG\]\]|<<<([\s\S]*?)>>>/g;
  const parts: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(<span key={`p${i++}`}>{text.slice(last, m.index)}</span>);
    const inner = m[1] ?? m[2] ?? '';
    parts.push(
      <span key={`b${i++}`} className="text-progressor font-medium">
        {inner}
      </span>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(<span key={`p${i++}`}>{text.slice(last)}</span>);
  return <span className={className}>{parts}</span>;
};

/* ───────── Priority detection (emergency / urgent / special) ───────── */

export type JobPriority = 'emergency' | 'urgent' | 'special' | null;

const EMERGENCY_RE = /\b(emergency|critical|leak|flood|gas leak|no heating|no hot water|dangerous|hazard)\b/i;
const URGENT_RE = /\b(urgent|asap|immediate|priority|same day)\b/i;
const SPECIAL_RE = /\b(vulnerable|elderly|disabled|special|complaint|escalat)/i;

export const detectJobPriority = (...fields: (string | null | undefined)[]): JobPriority => {
  const blob = fields.filter(Boolean).join(' \n ');
  if (!blob) return null;
  if (EMERGENCY_RE.test(blob)) return 'emergency';
  if (URGENT_RE.test(blob)) return 'urgent';
  if (SPECIAL_RE.test(blob)) return 'special';
  return null;
};
