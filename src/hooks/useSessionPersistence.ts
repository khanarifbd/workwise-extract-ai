import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/**
 * Persists the current route + search params in sessionStorage.
 * On mount, if a stored route exists for this portal, navigate to it.
 */
export const useSessionPersistence = (portalKey: 'genie' | 'progressor') => {
  const location = useLocation();
  const navigate = useNavigate();
  const storageKey = `lastRoute_${portalKey}`;
  const hasRestoredRef = useRef(false);

  // Restore saved route on first mount (browser bounce recovery)
  useEffect(() => {
    if (hasRestoredRef.current) return;
    hasRestoredRef.current = true;

    const saved = sessionStorage.getItem(storageKey);
    if (!saved) return;

    // Only restore if current location is the bare root (no params)
    // This prevents overriding intentional deep-links
    const currentFull = location.pathname + location.search + location.hash;
    const isBareLanding = currentFull === '/' || currentFull === '/#/' || currentFull === '';
    
    if (isBareLanding && saved !== currentFull) {
      // Use replace so back-button still exits the app
      navigate(saved, { replace: true });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
