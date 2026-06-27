import { useEffect, useState, useCallback } from "react";

/**
 * Tracks last-updated time and exposes stale state.
 * - Auto-ticks every 30s (caller can wire `onRefresh` to refetch data)
 * - Stale after 5 minutes
 */
export function useAutoRefresh(onRefresh?: () => void | Promise<void>, intervalMs = 30_000) {
  const [lastUpdated, setLastUpdated] = useState<number>(Date.now());
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try { await onRefresh?.(); }
    finally {
      setLastUpdated(Date.now());
      setRefreshing(false);
    }
  }, [onRefresh]);

  useEffect(() => {
    const id = window.setInterval(() => { refresh(); }, intervalMs);
    return () => window.clearInterval(id);
  }, [refresh, intervalMs]);

  // Tick for stale display
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 15_000);
    return () => window.clearInterval(id);
  }, []);

  const ageMs = Date.now() - lastUpdated;
  const isStale = ageMs > 5 * 60_000;
  const label =
    ageMs < 60_000 ? "just now" :
    ageMs < 3_600_000 ? `${Math.floor(ageMs / 60_000)}m ago` :
    `${Math.floor(ageMs / 3_600_000)}h ago`;

  return { lastUpdated, refresh, refreshing, isStale, label };
}
