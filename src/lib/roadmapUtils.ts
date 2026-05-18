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
  const cols: { key: string; label: string; sublabel?: string; start: Date; end: Date }[] = [];
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
      });
      cur.setDate(cur.getDate() + 1);
    }
  }
  return cols;
};

/** Compute % offset+width for a bar inside a roadmap range. */
export const barPosition = (
  itemStart: string,
  itemEnd: string,
  roadmapStart: string,
  roadmapEnd: string,
) => {
  const rs = parseLocalDate(roadmapStart);
  const re = parseLocalDate(roadmapEnd);
  const is = parseLocalDate(itemStart);
  const ie = parseLocalDate(itemEnd);
  const total = Math.max(1, daysBetween(rs, re) + 1);
  const offset = Math.max(0, daysBetween(rs, is));
  const span = Math.max(1, daysBetween(is, ie) + 1);
  return {
    leftPct: (offset / total) * 100,
    widthPct: Math.min(100 - (offset / total) * 100, (span / total) * 100),
  };
};
