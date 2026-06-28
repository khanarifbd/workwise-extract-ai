/**
 * Backwards-compatibility shim. All metric helpers now live in
 * `src/lib/genieMetrics.ts` — the single canonical source of truth.
 * This file simply re-exports them so existing imports keep working.
 */
export {
  isComplete,
  isReferBack,
  isActive,
  isOverdue,
  computeMetrics,
  summaryCounts,
  validateMetrics,
  assertCount,
  type JobMetrics,
  type MetricsCheck,
} from '@/lib/genieMetrics';
