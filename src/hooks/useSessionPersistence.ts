import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Persists the current route + search params in sessionStorage.
 * On mount, if a stored route exists for this portal, navigate to it.
 */
export const useSessionPersistence = (portalKey: 'genie' | 'progressor') => {
  const location = useLocation();
  const storageKey = `lastRoute_${portalKey}`;

  // Save current location on every navigation
  useEffect(() => {
    const fullPath = location.pathname + location.search + location.hash;
    sessionStorage.setItem(storageKey, fullPath);
  }, [location.pathname, location.search, location.hash, storageKey]);
};

/**
 * Returns the last saved route for a portal, or null.
 */
export const getLastRoute = (portalKey: 'genie' | 'progressor'): string | null => {
  return sessionStorage.getItem(`lastRoute_${portalKey}`);
};
