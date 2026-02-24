import { useMemo, useRef } from 'react';
import Fuse from 'fuse.js';
import { Job } from '@/types/job';

interface FuzzySearchOptions {
  threshold?: number;
  minMatchCharLength?: number;
  includeScore?: boolean;
}

const FUSE_KEYS = [
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
  { name: 'privateNotes', weight: 0.8 },
  { name: 'workItems.sorCode', weight: 1.5 },
  { name: 'workItems.description', weight: 1.0 },
  { name: 'additionalWorks.sorCode', weight: 1.2 },
  { name: 'additionalWorks.description', weight: 0.9 },
];

/**
 * Custom hook for fuzzy searching jobs with Fuse.js
 * Uses a stable Fuse index that only rebuilds when the job list identity changes
 */
export const useFuzzySearch = (
  jobs: Job[],
  searchTerm: string,
  options: FuzzySearchOptions = {}
) => {
  const {
    threshold = 0.35,
    minMatchCharLength = 2,
  } = options;

  // Track previous jobs array reference to avoid unnecessary Fuse rebuilds
  const prevJobsRef = useRef<Job[]>([]);
  const fuseRef = useRef<Fuse<Job> | null>(null);

  // Only rebuild Fuse when the jobs array reference actually changes
  const fuse = useMemo(() => {
    // Reuse existing Fuse if the jobs array is the same reference
    if (prevJobsRef.current === jobs && fuseRef.current) {
      return fuseRef.current;
    }
    prevJobsRef.current = jobs;
    const instance = new Fuse(jobs, {
      keys: FUSE_KEYS,
      threshold,
      minMatchCharLength,
      includeScore: true,
      includeMatches: true,
      ignoreLocation: true,
      useExtendedSearch: true,
      findAllMatches: true,
      shouldSort: true,
      distance: 100,
      ignoreFieldNorm: false,
    });
    fuseRef.current = instance;
    return instance;
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
      const fuseResults = fuse.search(trimmedSearch);
      
      // Combine: exact matches first, then fuzzy matches not already included
      const exactIds = new Set(exactMatches.map(e => e.id));
      const combined = [
        ...exactMatches,
        ...fuseResults
          .filter(r => !exactIds.has(r.item.id))
          .map(r => r.item)
      ];
      
      return { matches: combined, hasSearch: true };
    }

    // Use fuzzy search for general queries
    const fuseResults = fuse.search(trimmedSearch);
    
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
