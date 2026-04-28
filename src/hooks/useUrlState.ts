import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

type DatabaseTab = 'all' | 'booked' | 'completed' | 'refer_back' | 'eod';
type ViewType = 'table' | 'kanban' | 'calendar';

interface UrlState {
  activeDatabaseTab: DatabaseTab;
  selectedBookedDate: string | null;
  viewType: ViewType;
  activeCategory: string | null;
  selectedJobId: string | null;
}

const DEFAULTS: UrlState = {
  activeDatabaseTab: 'all',
  selectedBookedDate: null,
  viewType: 'table',
  activeCategory: null,
  selectedJobId: null,
};

/**
 * Custom hook to persist UI state in URL search params.
 * This ensures state survives browser tab switches and page refreshes.
 */
export const useUrlState = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  // Read state from URL
  const activeDatabaseTab = (searchParams.get('tab') as DatabaseTab) || DEFAULTS.activeDatabaseTab;
  const selectedBookedDate = searchParams.get('date') || DEFAULTS.selectedBookedDate;
  const viewType = (searchParams.get('view') as ViewType) || DEFAULTS.viewType;
  const activeCategory = searchParams.get('category') || DEFAULTS.activeCategory;
  const selectedJobId = searchParams.get('job') || DEFAULTS.selectedJobId;

  // Update URL params without causing navigation
  const updateUrlState = useCallback((updates: Partial<UrlState>) => {
    setSearchParams(prev => {
      const newParams = new URLSearchParams(prev);
      
      if (updates.activeDatabaseTab !== undefined) {
        if (updates.activeDatabaseTab === DEFAULTS.activeDatabaseTab) {
          newParams.delete('tab');
        } else {
          newParams.set('tab', updates.activeDatabaseTab);
        }
      }
      
      if (updates.selectedBookedDate !== undefined) {
        if (updates.selectedBookedDate === null) {
          newParams.delete('date');
        } else {
          newParams.set('date', updates.selectedBookedDate);
        }
      }
      
      if (updates.viewType !== undefined) {
        if (updates.viewType === DEFAULTS.viewType) {
          newParams.delete('view');
        } else {
          newParams.set('view', updates.viewType);
        }
      }
      
      if (updates.activeCategory !== undefined) {
        if (updates.activeCategory === null) {
          newParams.delete('category');
        } else {
          newParams.set('category', updates.activeCategory);
        }
      }

      if (updates.selectedJobId !== undefined) {
        if (updates.selectedJobId === null) {
          newParams.delete('job');
        } else {
          newParams.set('job', updates.selectedJobId);
        }
      }
      
      return newParams;
    }, { replace: true }); // Use replace to avoid polluting browser history
  }, [setSearchParams]);

  // Individual setters for convenience
  const setActiveDatabaseTab = useCallback((tab: DatabaseTab) => {
    // When switching away from booked tab, clear the date filter
    if (tab !== 'booked') {
      updateUrlState({ activeDatabaseTab: tab, selectedBookedDate: null });
    } else {
      updateUrlState({ activeDatabaseTab: tab });
    }
  }, [updateUrlState]);

  const setSelectedBookedDate = useCallback((date: string | null) => {
    updateUrlState({ selectedBookedDate: date });
  }, [updateUrlState]);

  const setViewType = useCallback((view: ViewType) => {
    updateUrlState({ viewType: view });
  }, [updateUrlState]);

  const setActiveCategory = useCallback((category: string | null) => {
    updateUrlState({ activeCategory: category });
  }, [updateUrlState]);

  const setSelectedJobId = useCallback((jobId: string | null) => {
    updateUrlState({ selectedJobId: jobId });
  }, [updateUrlState]);

  return {
    // State values
    activeDatabaseTab,
    selectedBookedDate,
    viewType,
    activeCategory,
    selectedJobId,
    // Setters
    setActiveDatabaseTab,
    setSelectedBookedDate,
    setViewType,
    setActiveCategory,
    setSelectedJobId,
    // Bulk update
    updateUrlState,
  };
};
