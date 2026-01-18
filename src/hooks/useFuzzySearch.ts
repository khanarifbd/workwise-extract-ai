import { useMemo } from 'react';
import Fuse from 'fuse.js';
import { Job } from '@/types/job';

interface FuzzySearchOptions {
  threshold?: number; // 0.0 = exact match, 1.0 = match anything (default: 0.4)
  minMatchCharLength?: number;
  includeScore?: boolean;
}

/**
 * Custom hook for fuzzy searching jobs with Fuse.js
 * Handles misspellings, partial words, and searches across all relevant fields
 */
export const useFuzzySearch = (
  jobs: Job[],
  searchTerm: string,
  options: FuzzySearchOptions = {}
) => {
  const {
    threshold = 0.35, // Balanced - catches typos but not too loose
    minMatchCharLength = 2,
  } = options;

  // Create Fuse instance with comprehensive field configuration
  const fuse = useMemo(() => {
    return new Fuse(jobs, {
      // Search these fields
      keys: [
        { name: 'jobNumber', weight: 2.0 }, // Highest priority
        { name: 'name', weight: 1.8 }, // Tenant name - high priority
        { name: 'address', weight: 1.5 },
        { name: 'phoneNumber', weight: 1.2 },
        { name: 'description', weight: 1.0 },
        { name: 'summaryOfWorks', weight: 1.0 },
        { name: 'team', weight: 1.2 },
        { name: 'team2', weight: 1.0 },
        { name: 'bookingNotes', weight: 0.8 },
        { name: 'progressNotes', weight: 0.8 },
        { name: 'privateNotes', weight: 0.8 },
        // Nested work items
        { name: 'workItems.sorCode', weight: 1.5 },
        { name: 'workItems.description', weight: 1.0 },
        { name: 'additionalWorks.sorCode', weight: 1.2 },
        { name: 'additionalWorks.description', weight: 0.9 },
      ],
      threshold,
      minMatchCharLength,
      includeScore: true,
      includeMatches: true,
      ignoreLocation: true, // Search entire string, not just beginning
      useExtendedSearch: true, // Enable advanced search patterns
      findAllMatches: true,
      shouldSort: true,
      // Tune for fuzzy matching
      distance: 100,
      ignoreFieldNorm: false,
    });
  }, [jobs, threshold, minMatchCharLength]);

  // Perform search
  const results = useMemo(() => {
    if (!searchTerm || searchTerm.trim().length < 2) {
      return { matches: jobs, hasSearch: false };
    }

    const trimmedSearch = searchTerm.trim();
    
    // First, try exact substring match for job numbers (case insensitive)
    const exactMatches = jobs.filter(job => 
      job.jobNumber.toLowerCase().includes(trimmedSearch.toLowerCase())
    );
    
    if (exactMatches.length > 0) {
      // If we have exact job number matches, prioritize those
      const fuseResults = fuse.search(trimmedSearch);
      const fuseJobIds = new Set(fuseResults.map(r => r.item.id));
      
      // Combine: exact matches first, then fuzzy matches not already included
      const combined = [
        ...exactMatches,
        ...fuseResults
          .filter(r => !exactMatches.some(e => e.id === r.item.id))
          .map(r => r.item)
      ];
      
      return { matches: combined, hasSearch: true };
    }

    // Use fuzzy search for general queries
    const fuseResults = fuse.search(trimmedSearch);
    
    // Return matched jobs sorted by score (best matches first)
    return {
      matches: fuseResults.map(result => result.item),
      hasSearch: true,
    };
  }, [jobs, searchTerm, fuse]);

  return results;
};

/**
 * Simple fuzzy search function for use outside of React components
 */
export const fuzzySearchJobs = (
  jobs: Job[],
  searchTerm: string,
  threshold: number = 0.35
): Job[] => {
  if (!searchTerm || searchTerm.trim().length < 2) {
    return jobs;
  }

  const fuse = new Fuse(jobs, {
    keys: [
      { name: 'jobNumber', weight: 2.0 },
      { name: 'name', weight: 1.8 },
      { name: 'address', weight: 1.5 },
      { name: 'phoneNumber', weight: 1.2 },
      { name: 'description', weight: 1.0 },
      { name: 'summaryOfWorks', weight: 1.0 },
      { name: 'team', weight: 1.2 },
      { name: 'team2', weight: 1.0 },
      { name: 'bookingNotes', weight: 0.8 },
      { name: 'progressNotes', weight: 0.8 },
      { name: 'workItems.sorCode', weight: 1.5 },
      { name: 'workItems.description', weight: 1.0 },
      { name: 'additionalWorks.sorCode', weight: 1.2 },
      { name: 'additionalWorks.description', weight: 0.9 },
    ],
    threshold,
    ignoreLocation: true,
    findAllMatches: true,
    shouldSort: true,
  });

  const results = fuse.search(searchTerm.trim());
  return results.map(r => r.item);
};
