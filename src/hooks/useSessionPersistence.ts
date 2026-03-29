import { useEffect, useRef } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';

/**
 * Persists the current route + search params in sessionStorage.
 * On mount, if a stored route exists for this portal and current URL has
 * no search params, restores the saved params.
 * 
 * With HashRouter the location.pathname is always "/" for the main page,
 * so we persist the search params string which carries tab/category/job state.
 */
export const useSessionPersistence = (portalKey: 'genie' | 'progressor') => {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const storageKey = `lastRoute_${portalKey}`;
  const hasRestoredRef = useRef(false);

  // Restore saved search params on first mount (browser bounce recovery)
  useEffect(() => {
    if (hasRestoredRef.current) return;
    hasRestoredRef.current = true;

    const saved = sessionStorage.getItem(storageKey);
    if (!saved) return;

    // Only restore if current URL has no search params
    // (user landed on bare "/" without any state)
    const currentSearch = location.search;
    if (currentSearch && currentSearch !== '?') return;

    try {
      const savedParams = new URLSearchParams(saved);
      // Only restore if saved params actually have content
      if (savedParams.toString()) {
        setSearchParams(savedParams, { replace: true });
      }
    } catch {
      // Invalid saved data, clear it
      sessionStorage.removeItem(storageKey);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Save current search params on every navigation
  useEffect(() => {
    const paramsString = searchParams.toString();
    if (paramsString) {
      sessionStorage.setItem(storageKey, paramsString);
    }
  }, [searchParams, storageKey]);
};

/**
 * Returns the last saved search params for a portal, or null.
 */
export const getLastRoute = (portalKey: 'genie' | 'progressor'): string | null => {
  return sessionStorage.getItem(`lastRoute_${portalKey}`);
};
