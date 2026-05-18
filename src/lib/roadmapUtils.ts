export const ROADMAP_COLORS = [
  { name: 'Blue',    value: '#2563eb' },
  { name: 'Green',   value: '#16a34a' },
  { name: 'Purple',  value: '#7c3aed' },
  { name: 'Orange',  value: '#ea580c' },
  { name: 'Red',     value: '#dc2626' },
  { name: 'Teal',    value: '#0d9488' },
  { name: 'Pink',    value: '#db2777' },
  { name: 'Amber',   value: '#d97706' },
  { name: 'Brown',   value: '#92400e' },
  { name: 'Navy',    value: '#1e3a8a' },
  { name: 'Slate',   value: '#475569' },
  { name: 'Lime',    value: '#65a30d' },
];

export const ROADMAP_SYMBOLS = [
  '', '⚡', '🔥', '🪟', '🚿', '🔧', '🪚', '🪜', '🧱', '🎨', '💧', '🔌',
  '🚪', '🏠', '✅', '⚠️', '⭐', '🔔', '📅', '🛠️', '🧯', '🚧',
];

/** Parse YYYY-MM-DD as a local date (no TZ shift). */
export const parseLocalDate = (s: string): Date => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};

export const toISODate = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export const daysBetween = (a: Date, b: Date): number =>
  Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));

/** Generate columns for the timeline grid. */
export const buildColumns = (start: string, end: string, unit: 'week' | 'day') => {
  const s = parseLocalDate(start);
  const e = parseLocalDate(end);
  const cols: { key: string; label: string; sublabel?: string; start: Date; end: Date; days: number }[] = [];
  if (unit === 'week') {
    let i = 0;
    let cur = new Date(s);
    while (cur <= e) {
      const wkEnd = new Date(cur); wkEnd.setDate(wkEnd.getDate() + 6);
      if (wkEnd > e) wkEnd.setTime(e.getTime());
      i += 1;
      cols.push({
        key: `w${i}`,
        label: `Week ${i}`,
        sublabel: `${cur.toLocaleDateString(undefined,{day:'numeric',month:'short'})} – ${wkEnd.toLocaleDateString(undefined,{day:'numeric',month:'short'})}`,
        start: new Date(cur),
        end: new Date(wkEnd),
        days: daysBetween(cur, wkEnd) + 1,
      });
      cur.setDate(cur.getDate() + 7);
    }
  } else {
    let cur = new Date(s);
    while (cur <= e) {
      cols.push({
        key: toISODate(cur),
        label: cur.toLocaleDateString(undefined, { day: 'numeric' }),
        sublabel: cur.toLocaleDateString(undefined, { weekday: 'short', month: 'short' }),
        start: new Date(cur),
        end: new Date(cur),
        days: 1,
      });
      cur.setDate(cur.getDate() + 1);
    }
  }
  return cols;
};

/** Compute % offset+width for a bar inside a roadmap range.
 *  When unit='week', the bar is snapped to the start of its starting week
 *  and the end of its ending week, so bars cleanly clamp to week columns.
 */
export const barPosition = (
  itemStart: string,
  itemEnd: string,
  roadmapStart: string,
  roadmapEnd: string,
  unit: 'week' | 'day' = 'day',
) => {
  const rs = parseLocalDate(roadmapStart);
  const re = parseLocalDate(roadmapEnd);
  let is = parseLocalDate(itemStart);
  let ie = parseLocalDate(itemEnd);
  if (is < rs) is = rs;
  if (ie > re) ie = re;
  if (ie < is) ie = is;

  if (unit === 'week') {
    // Snap to week boundaries derived from roadmapStart (each week = 7 days)
    const sOffset = daysBetween(rs, is);
    const eOffset = daysBetween(rs, ie);
    const startWeek = Math.floor(sOffset / 7);
    const endWeek = Math.floor(eOffset / 7);
    is = new Date(rs); is.setDate(is.getDate() + startWeek * 7);
    ie = new Date(rs); ie.setDate(ie.getDate() + endWeek * 7 + 6);
    if (ie > re) ie = re;
  }

  const total = Math.max(1, daysBetween(rs, re) + 1);
  const offset = Math.max(0, daysBetween(rs, is));
  const span = Math.max(1, daysBetween(is, ie) + 1);
  const leftPct = (offset / total) * 100;
  const widthPct = Math.max(0, Math.min(100 - leftPct, (span / total) * 100));
  return { leftPct, widthPct };
};
