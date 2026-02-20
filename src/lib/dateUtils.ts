/**
 * Date utilities - All dates are processed in GMT timezone
 */

/**
 * Get current date/time in GMT
 */
export const getGMTNow = (): Date => {
  const now = new Date();
  // Get UTC components
  return new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    now.getUTCHours(),
    now.getUTCMinutes(),
    now.getUTCSeconds(),
    now.getUTCMilliseconds()
  ));
};

/**
 * Convert a date to GMT
 */
export const toGMT = (date: Date | string | null | undefined): Date | null => {
  if (!date) return null;
  
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return null;
  
  return new Date(Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate(),
    d.getUTCHours(),
    d.getUTCMinutes(),
    d.getUTCSeconds(),
    d.getUTCMilliseconds()
  ));
};

/**
 * Get start of day in GMT
 */
export const getGMTStartOfDay = (date: Date | string): Date => {
  const d = date instanceof Date ? date : new Date(date);
  return new Date(Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate(),
    0, 0, 0, 0
  ));
};

/**
 * Calculate hours difference in GMT
 */
export const getHoursDifferenceGMT = (date1: Date, date2: Date): number => {
  const diff = Math.abs(date1.getTime() - date2.getTime());
  return diff / (1000 * 60 * 60);
};

/**
 * Check if a date is past in GMT
 */
export const isGMTPast = (date: Date | string): boolean => {
  const d = date instanceof Date ? date : new Date(date);
  const now = getGMTNow();
  return d.getTime() < now.getTime();
};

/**
 * Check if a date is today in GMT
 */
export const isGMTToday = (date: Date | string): boolean => {
  const d = date instanceof Date ? date : new Date(date);
  const now = getGMTNow();
  
  return (
    d.getUTCFullYear() === now.getUTCFullYear() &&
    d.getUTCMonth() === now.getUTCMonth() &&
    d.getUTCDate() === now.getUTCDate()
  );
};

/**
 * Get GMT midnight (start of next day in GMT)
 */
export const getGMTMidnight = (): Date => {
  const now = getGMTNow();
  return new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
    0, 0, 0, 0
  ));
};

/**
 * Format date for display with GMT indicator
 */
export const formatGMT = (date: Date | string, formatStr: string = 'yyyy-MM-dd HH:mm'): string => {
  const d = date instanceof Date ? date : new Date(date);
  const pad = (n: number) => n.toString().padStart(2, '0');
  
  return formatStr
    .replace('yyyy', d.getUTCFullYear().toString())
    .replace('MM', pad(d.getUTCMonth() + 1))
    .replace('dd', pad(d.getUTCDate()))
    .replace('HH', pad(d.getUTCHours()))
    .replace('mm', pad(d.getUTCMinutes()))
    .replace('ss', pad(d.getUTCSeconds()));
};
