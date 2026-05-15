import { useEffect, useRef, useState } from 'react';
import { Job } from '@/types/job';
import { validateMetrics, MetricsCheck, computeMetrics } from '@/lib/metricsIntegrity';

/**
 * Continuously validates that derived job metrics across the app reconcile.
 * Re-runs whenever the jobs collection changes. Logs any drift to the console
 * so developers / QA can spot inconsistencies immediately, and exposes the
 * canonical numbers for downstream consumers.
 */
export function useMetricsIntegrity(jobs: Job[]) {
  const [check, setCheck] = useState<MetricsCheck>(() => validateMetrics(jobs));
  const lastSig = useRef<string>('');

  useEffect(() => {
    // Lightweight signature so we only revalidate when jobs really change.
    const sig = `${jobs.length}|${jobs.reduce((a, j) =>
      a + (j.isCompleted ? 1 : 0) + (j.referBack ? 2 : 0) + (j.bookedDate ? 4 : 0), 0)}`;
    if (sig === lastSig.current) return;
    lastSig.current = sig;

    const result = validateMetrics(jobs);
    setCheck(result);

    if (!result.ok) {
      // eslint-disable-next-line no-console
      console.warn('[metrics-integrity] drift detected', {
        errors: result.errors,
        metrics: result.metrics,
      });
    } else if (jobs.length > 0) {
      // eslint-disable-next-line no-console
      console.debug('[metrics-integrity] ✓ aligned', result.metrics);
    }
  }, [jobs]);

  return check;
}

export { computeMetrics, validateMetrics };
