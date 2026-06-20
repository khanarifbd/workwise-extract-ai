import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

const STORAGE_KEY = 'genie:last-route';
// Routes that should never be persisted/restored (auth + transient screens)
const EXCLUDED_PREFIXES = ['/admin', '/reset-password', '/progressor-login', '/welcome'];

/**
 * Mount once inside the Router. Persists the user's current in-app route
 * (path + search + hash) to localStorage on every navigation, and on first
 * mount restores them to the last route they were on when they bounced away
 * to another website / closed the tab without signing out.
 *
 * Restore is conservative: only fires when the user lands on "/" with no
 * params — never overrides explicit deep links.
 */
export const LastRouteRestorer = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const restoreAttempted = useRef(false);

  // One-time restore on mount
  useEffect(() => {
    if (restoreAttempted.current) return;
    restoreAttempted.current = true;
    try {
      const isBareRoot =
        location.pathname === '/' && !location.search && !location.hash;
      if (!isBareRoot) return;
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return;
      if (saved === '/' || EXCLUDED_PREFIXES.some((p) => saved.startsWith(p))) return;
      navigate(saved, { replace: true });
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist current route
  useEffect(() => {
    try {
      const full = `${location.pathname}${location.search}${location.hash}`;
      if (EXCLUDED_PREFIXES.some((p) => location.pathname.startsWith(p))) return;
      localStorage.setItem(STORAGE_KEY, full);
    } catch {
      /* ignore */
    }
  }, [location.pathname, location.search, location.hash]);

  return null;
};
