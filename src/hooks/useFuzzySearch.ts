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
  { name: 'ongoingReason', weight: 0.8 },
  { name: 'workItems.sorCode', weight: 1.5 },
  { name: 'workItems.description', weight: 1.0 },
  { name: 'additionalWorks.sorCode', weight: 1.2 },
  { name: 'additionalWorks.description', weight: 0.9 },
];

/**
 * Performs a case-insensitive substring search across all relevant text fields of a job.
 * Returns true if the keyword is found anywhere in the job's data.
 */
const jobContainsKeyword = (job: Job, keyword: string): boolean => {
  const lower = keyword.toLowerCase();

  // Direct string fields
  if (job.jobNumber?.toLowerCase().includes(lower)) return true;
  if (job.name?.toLowerCase().includes(lower)) return true;
  if (job.address?.toLowerCase().includes(lower)) return true;
  if (job.phoneNumber?.toLowerCase().includes(lower)) return true;
  if (job.description?.toLowerCase().includes(lower)) return true;
  if (job.summaryOfWorks?.toLowerCase().includes(lower)) return true;
  if (job.team?.toLowerCase().includes(lower)) return true;
  if (job.team2?.toLowerCase().includes(lower)) return true;
  if (job.bookingNotes?.toLowerCase().includes(lower)) return true;
  if (job.progressNotes?.toLowerCase().includes(lower)) return true;
  if (job.privateNotes?.toLowerCase().includes(lower)) return true;
  if (job.ongoingReason?.toLowerCase().includes(lower)) return true;
  if (job.status?.toLowerCase().includes(lower)) return true;

  // Work items
  if (job.workItems?.some(w =>
    w.sorCode?.toLowerCase().includes(lower) ||
    w.description?.toLowerCase().includes(lower) ||
    w.variation?.toLowerCase().includes(lower)
  )) return true;

  // Additional works
  if (job.additionalWorks?.some(w =>
    w.sorCode?.toLowerCase().includes(lower) ||
    w.description?.toLowerCase().includes(lower) ||
    w.variation?.toLowerCase().includes(lower)
  )) return true;

  return false;
};

/**
 * Custom hook for searching jobs - exact substring match first, fuzzy fallback second.
 * This ensures keywords like "basement", "cellar", "polysafe" are found with 100% accuracy
 * while still supporting fuzzy matching for typos and partial name matches.
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

  const prevJobsRef = useRef<Job[]>([]);
  const fuseRef = useRef<Fuse<Job> | null>(null);

  const fuse = useMemo(() => {
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

  const results = useMemo(() => {
    if (!searchTerm || searchTerm.trim().length < 2) {
      return { matches: jobs, hasSearch: false };
    }

    const trimmedSearch = searchTerm.trim();

    // Step 1: Exact substring matches across ALL fields (100% accurate for keywords)
    const exactMatches = jobs.filter(job => jobContainsKeyword(job, trimmedSearch));

    if (exactMatches.length > 0) {
      // Exact matches found - ONLY return exact matches for keyword searches
      // Don't mix in fuzzy results that don't contain the keyword, as this confuses users
      return { matches: exactMatches, hasSearch: true };
    }

    // Step 2: No exact matches found - fall back to fuzzy search for typos/partial matches
    const fuseResults = fuse.search(trimmedSearch);
    return {
      matches: fuseResults.map(result => result.item),
      hasSearch: true,
    };
  }, [jobs, searchTerm, fuse]);

  return results;
};

/**
 * Simple search function for use outside of React components
 */
export const fuzzySearchJobs = (
  jobs: Job[],
  searchTerm: string,
  threshold: number = 0.35
): Job[] => {
  if (!searchTerm || searchTerm.trim().length < 2) {
    return jobs;
  }

  const trimmed = searchTerm.trim();

  // Exact substring first - only return exact matches when found
  const exactMatches = jobs.filter(job => jobContainsKeyword(job, trimmed));
  if (exactMatches.length > 0) {
    return exactMatches;
  }

  const fuse = new Fuse(jobs, {
    keys: FUSE_KEYS,
    threshold,
    ignoreLocation: true,
    findAllMatches: true,
    shouldSort: true,
  });
  return fuse.search(trimmed).map(r => r.item);
};
