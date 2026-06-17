import { supabase } from "@/integrations/supabase/client";
import { Job, WorkItem, FanInfo, RoofingInfo, InsulationInfo, FlooringInfo, FireDoorInfo } from "@/types/job";
import { SOR_CODES_DATABASE } from "@/data/sorCodes";
import { Json } from "@/integrations/supabase/types";

// Parse a date string as a local date (prevents timezone shift for date-only values)
const parseDateAsLocal = (dateStr: string | Date): Date => {
  if (dateStr instanceof Date) return dateStr;
  const dateOnly = String(dateStr).substring(0, 10);
  const [year, month, day] = dateOnly.split('-').map(Number);
  if (!year || !month || !day || isNaN(year) || isNaN(month) || isNaN(day)) {
    return new Date(dateStr);
  }
  return new Date(year, month - 1, day);
};

// Format a Date as YYYY-MM-DD string using local date components
const formatDateOnly = (date: Date | string): string => {
  const d = date instanceof Date ? date : new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Generate SOR codes context for AI with costs
const getSORCodesContext = () => {
  return SOR_CODES_DATABASE.map(code => 
    `${code.code}: ${code.description} (Category: ${code.category}, Cost: £${code.cost})`
  ).join('\n');
};

// Helper to get auth headers for authenticated edge function calls
const getAuthHeaders = async (): Promise<Record<string, string>> => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('Authentication required - please log in');
  }
  return {
    Authorization: `Bearer ${session.access_token}`
  };
};

// Retry configuration for rate-limited requests
interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 2000,
  maxDelayMs: 30000,
};

// Sleep helper
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Exponential backoff with jitter
const getRetryDelay = (attempt: number, config: RetryConfig): number => {
  const exponentialDelay = config.baseDelayMs * Math.pow(2, attempt);
  const jitter = Math.random() * 1000;
  return Math.min(exponentialDelay + jitter, config.maxDelayMs);
};

// Check if error is rate limit related
const isRateLimitError = (error: any): boolean => {
  if (error?.message?.includes('429')) return true;
  if (error?.message?.toLowerCase()?.includes('rate limit')) return true;
  if (error?.status === 429) return true;
  // supabase.functions.invoke wraps errors in FunctionsHttpError
  if (error?.context?.status === 429) return true;
  return false;
};

// Wrapper for functions with retry logic
const withRetry = async <T>(
  fn: () => Promise<T>,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): Promise<T> => {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      
      if (isRateLimitError(error) && attempt < config.maxRetries) {
        const delay = getRetryDelay(attempt, config);
        console.log(`Rate limited, retrying in ${Math.round(delay / 1000)}s (attempt ${attempt + 1}/${config.maxRetries})`);
        await sleep(delay);
        continue;
      }
      
      throw error;
    }
  }
  
  throw lastError;
};

// Extract fans from job description
export const extractFansWithAI = async (description: string, workItems: WorkItem[]): Promise<{ hasFans: boolean; fans: FanInfo[]; totalFanCount: number } | null> => {
  const hasDescription = description && description.trim().length > 0;
  const hasWorkItems = workItems && workItems.length > 0;
  
  if (!hasDescription && !hasWorkItems) {
    return { hasFans: false, fans: [], totalFanCount: 0 };
  }

  return withRetry(async () => {
    const headers = await getAuthHeaders();
    const { data, error } = await supabase.functions.invoke('extract-fans', {
      body: { 
        ...(hasDescription ? { description } : {}),
        ...(hasWorkItems ? { workItems } : {})
      },
      headers
    });

    if (error) {
      console.error('Error calling extract-fans function:', error);
      throw error;
    }

    if (!data?.success) {
      throw new Error(data?.error || 'Failed to extract fans');
    }

    return data.data;
  });
};

// Extract insulation from job description (single-job AI scan, paralleling extractFansWithAI)
export const extractInsulationWithAI = async (
  description: string,
  workItems: WorkItem[]
): Promise<{ hasInsulation: boolean; insulation: InsulationInfo[]; totalInsulationCount: number } | null> => {
  const hasDescription = description && description.trim().length > 0;
  const hasWorkItems = workItems && workItems.length > 0;

  if (!hasDescription && !hasWorkItems) {
    return { hasInsulation: false, insulation: [], totalInsulationCount: 0 };
  }

  return withRetry(async () => {
    const headers = await getAuthHeaders();
    const { data, error } = await supabase.functions.invoke('extract-insulation', {
      body: {
        ...(hasDescription ? { description } : {}),
        ...(hasWorkItems ? { workItems } : {}),
      },
      headers,
    });

    if (error) {
      console.error('Error calling extract-insulation function:', error);
      throw error;
    }

    if (!data?.success) {
      throw new Error(data?.error || 'Failed to extract insulation');
    }

    return data.data;
  });
};

export const extractPDFWithAI = async (pdfText: string): Promise<Partial<Job> | null> => {
  return withRetry(async () => {
    const headers = await getAuthHeaders();
    const { data, error } = await supabase.functions.invoke('extract-pdf', {
      body: { 
        pdfText,
        sorCodesContext: getSORCodesContext()
      },
      headers
    });

    if (error) {
      console.error('Error calling extract-pdf function:', error);
      // Extract status from FunctionsHttpError context
      const status = (error as any)?.context?.status || (error as any)?.status;
      if (status === 429) {
        const rateLimitError = new Error('Rate limit exceeded');
        (rateLimitError as any).status = 429;
        throw rateLimitError;
      }
      throw new Error(error.message || 'Failed to call extract-pdf');
    }

    if (!data?.success) {
      const errorMsg = data?.error || 'Failed to extract PDF';
      if (errorMsg.includes('Rate limit') || errorMsg.includes('429')) {
        const rateLimitError = new Error(errorMsg);
        (rateLimitError as any).status = 429;
        throw rateLimitError;
      }
      throw new Error(errorMsg);
    }

    return data.data;
  });
};

export const extractImageWithAI = async (imageBase64: string, mimeType: string): Promise<Partial<Job> | null> => {
  return withRetry(async () => {
    const headers = await getAuthHeaders();
    const { data, error } = await supabase.functions.invoke('extract-image', {
      body: { 
        imageBase64,
        mimeType,
        sorCodesContext: getSORCodesContext()
      },
      headers
    });

    if (error) {
      console.error('Error calling extract-image function:', error);
      // Extract status from FunctionsHttpError context
      const status = (error as any)?.context?.status || (error as any)?.status;
      if (status === 429) {
        const rateLimitError = new Error('Rate limit exceeded');
        (rateLimitError as any).status = 429;
        throw rateLimitError;
      }
      throw new Error(error.message || 'Failed to call extract-image');
    }

    if (!data?.success) {
      const errorMsg = data?.error || 'Failed to extract image';
      if (errorMsg.includes('Rate limit') || errorMsg.includes('429')) {
        const rateLimitError = new Error(errorMsg);
        (rateLimitError as any).status = 429;
        throw rateLimitError;
      }
      throw new Error(errorMsg);
    }

    return data.data;
  });
};

// Extract multiple insulation jobs from a single document (PDF, Excel, spreadsheet)
export interface ExtractedInsulationJob {
  jobNumber: string;
  name: string;
  address: string;
  phoneNumber: string;
  team: string; // From Team column -> maps to Assigned
  status: string; // From Action/Contact columns
  description: string; // To be collected, Loft rubbish, Issue, Vent, Type, Tenant contact
  privateNotes: string; // EPC bookings and sensitive data
  workItems: WorkItem[];
  insulationInfo: InsulationInfo[];
}

export const extractInsulationJobsFromDocument = async (
  documentText: string,
  documentType: 'pdf' | 'excel' | 'spreadsheet' | 'text' = 'pdf'
): Promise<{ jobCount: number; jobs: ExtractedInsulationJob[] }> => {
  return withRetry(async () => {
    const headers = await getAuthHeaders();
    const { data, error } = await supabase.functions.invoke('extract-insulation-jobs', {
      body: { 
        documentText,
        documentType,
        sorCodesContext: getSORCodesContext()
      },
      headers
    });

    if (error) {
      console.error('Error calling extract-insulation-jobs function:', error);
      throw error;
    }

    if (!data?.success) {
      const errorMsg = data?.error || 'Failed to extract insulation jobs';
      if (errorMsg.includes('Rate limit') || errorMsg.includes('429')) {
        const rateLimitError = new Error(errorMsg);
        (rateLimitError as any).status = 429;
        throw rateLimitError;
      }
      throw new Error(errorMsg);
    }

    return data.data;
  });
};

export interface ConvertTierItem {
  description: string;
  code: string;
  qty: number;
  cost: number;
  unit: string | null;
  category: string | null;
  valid: boolean;
  confidence?: number;
  rationale?: string;
}
export interface ConvertTier {
  label: string;
  notes: string;
  items: ConvertTierItem[];
  total: number;
}
export interface ConvertResponse {
  tiers: Record<'baseline' | 'enhanced' | 'premium', ConvertTier>;
  accuracy: Record<string, { total: number; itemCount: number; invalidCodes: string[]; valid: boolean }>;
  review: any;
  codeSource: 'nph_books' | 'fallback';
  codeCount: number;
  minimumCost: number;
}

export interface ExistingWorkInput {
  description: string;
  code?: string;
  qty?: number;
  cost?: number;
}

export const convertDescriptionToTieredQuotes = async (
  description: string,
  minimumCost?: number,
  existingWorks?: ExistingWorkInput[]
): Promise<ConvertResponse> => {
  const headers = await getAuthHeaders();
  // Mark convert-in-flight so app-level idle/refresh logic doesn't reload the page mid-conversion.
  (window as any).__convertInFlight = ((window as any).__convertInFlight || 0) + 1;
  try {
    const { data, error } = await supabase.functions.invoke('convert-description', {
      body: {
        description,
        ...(typeof minimumCost === 'number' ? { minimumCost } : {}),
        ...(existingWorks && existingWorks.length > 0 ? { existingWorks } : {}),
        sorCodesContext: getSORCodesContext(),
      },
      headers,
    });
    if (error) throw error;
    if (!data?.success) throw new Error(data?.error || 'Failed to convert description');
    return data as ConvertResponse;
  } finally {
    (window as any).__convertInFlight = Math.max(0, ((window as any).__convertInFlight || 1) - 1);
  }
};

export type SORMatchRating = 'good' | 'fair' | 'bad';
export const submitSORMatchFeedback = async (params: {
  sourceDescription: string;
  lineDescription: string;
  sorCode: string;
  rating: SORMatchRating;
  tier?: string;
  confidence?: number;
  rationale?: string;
}): Promise<void> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Sign in required to rate matches');
  const { error } = await supabase.from('sor_match_feedback').insert({
    user_id: user.id,
    source_description: params.sourceDescription.slice(0, 5000),
    line_description: params.lineDescription.slice(0, 2000),
    sor_code: params.sorCode.slice(0, 64),
    rating: params.rating,
    tier: params.tier ?? null,
    confidence: typeof params.confidence === 'number' ? Math.round(params.confidence) : null,
    rationale: params.rationale ? params.rationale.slice(0, 500) : null,
  });
  if (error) throw error;
};

// Legacy single-list helper kept for backwards compatibility (returns baseline tier as WorkItem[])
export const convertDescriptionToWorkItems = async (description: string): Promise<WorkItem[]> => {
  const res = await convertDescriptionToTieredQuotes(description);
  return res.tiers.baseline.items.map((i) => ({
    id: crypto.randomUUID(),
    description: i.description,
    sorCode: i.code,
    qty: i.qty,
    cost: i.cost,
  }));
};

export const sendWhatsAppNotification = async (
  teamName: string, 
  whatsappGroup: string | undefined, 
  jobDetails: Partial<Job>
): Promise<{ 
  whatsappLink: string; 
  notificationMessage: string; 
  sentViaTwilio?: boolean;
  twilioResult?: { sid: string; status: string } | null;
} | null> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      throw new Error('Authentication required - please log in');
    }
    
    const { data, error } = await supabase.functions.invoke('send-whatsapp', {
      body: { 
        teamName,
        whatsappGroup,
        jobDetails
      },
      headers: {
        Authorization: `Bearer ${session.access_token}`
      }
    });

    if (error) {
      console.error('Error calling send-whatsapp function:', error);
      throw error;
    }

    if (!data?.success) {
      throw new Error(data?.error || 'Failed to send WhatsApp notification');
    }

    return {
      whatsappLink: data.whatsappLink,
      notificationMessage: data.notificationMessage,
      sentViaTwilio: data.sentViaTwilio,
      twilioResult: data.twilioResult
    };
  } catch (error) {
    console.error('Error sending WhatsApp:', error);
    throw error;
  }
};

// Database operations
// In-flight dedupe + short-lived cache so multiple components mounting at once
// don't all fire their own /jobs request (which was contributing to statement
// timeouts under load — the same query was being issued 5-10x concurrently).
const _jobsInflight = new Map<string, Promise<Job[]>>();
const _jobsCache = new Map<string, { at: number; data: Job[] }>();
// Coalesce bursts AND serve a recent result for ~15s so rapid remounts /
// multiple hooks subscribing to the same category don't each issue their
// own /jobs query (every duplicate request was costing ~1s of DB time).
const JOBS_DEDUPE_TTL = 15_000;

const _runFetchJobs = async (categoryId?: string): Promise<Job[]> => {
  const batchSize = 1000;
  const allData: any[] = [];
  let offset = 0;
  let hasMore = true;
  const maxAttemptsPerBatch = 3;

  while (hasMore) {
    let attempt = 0;
    let lastErr: any = null;
    let data: any[] | null = null;

    while (attempt < maxAttemptsPerBatch) {
      let query = supabase
        .from('jobs')
        .select('*')
        .is('deleted_at', null)
        .order('date_issued', { ascending: false })
        .range(offset, offset + batchSize - 1);
      if (categoryId) query = query.eq('category_id', categoryId);

      const { data: rows, error } = await query;
      if (!error) { data = rows ?? []; break; }
      lastErr = error;
      // 57014 = statement_timeout — back off briefly and retry the same range.
      if ((error as any)?.code === '57014' && attempt < maxAttemptsPerBatch - 1) {
        console.warn(`fetchJobs timeout, retry ${attempt + 1}/${maxAttemptsPerBatch - 1}`);
        await sleep(800 * (attempt + 1));
        attempt++;
        continue;
      }
      console.error('Error fetching jobs:', error);
      throw error;
    }

    if (!data) throw lastErr ?? new Error('Failed to fetch jobs');

    if (data.length > 0) {
      allData.push(...data);
      offset += batchSize;
      hasMore = data.length === batchSize;
    } else {
      hasMore = false;
    }
  }

  return allData.map(mapDatabaseJobToJob);
};

export const fetchJobs = async (categoryId?: string): Promise<Job[]> => {
  const key = categoryId || '__all__';

  const cached = _jobsCache.get(key);
  if (cached && Date.now() - cached.at < JOBS_DEDUPE_TTL) return cached.data;

  const inflight = _jobsInflight.get(key);
  if (inflight) return inflight;

  const p = (async () => {
    try {
      const data = await _runFetchJobs(categoryId);
      _jobsCache.set(key, { at: Date.now(), data });
      return data;
    } catch (err) {
      // Stale-while-error: if we have a previous successful result, return it
      // so transient DB blips don't surface as a "Failed to load" toast.
      const stale = _jobsCache.get(key);
      if (stale) {
        console.warn('fetchJobs failed, serving stale cache:', (err as any)?.message);
        return stale.data;
      }
      throw err;
    } finally {
      _jobsInflight.delete(key);
    }
  })();
  _jobsInflight.set(key, p);
  return p;
};

export const createJob = async (job: Omit<Job, 'id'>, categoryId?: string): Promise<Job> => {
  const dbJob = mapJobToDatabase(job);
  if (categoryId) {
    dbJob.category_id = categoryId;
  }
  
  const { data, error } = await supabase
    .from('jobs')
    .insert(dbJob)
    .select()
    .single();

  if (error) {
    // 23505 = unique_violation (jobs_job_number_active_unique partial index)
    if ((error as any).code === '23505') {
      const dup = new Error(`Duplicate job number: ${job.jobNumber} already exists in the database.`);
      (dup as any).code = 'DUPLICATE_JOB_NUMBER';
      (dup as any).jobNumber = job.jobNumber;
      console.warn('Duplicate job blocked at DB level:', job.jobNumber);
      throw dup;
    }
    console.error('Error creating job:', error);
    throw error;
  }

  return mapDatabaseJobToJob(data);
};

export const updateJob = async (id: string, updates: Partial<Job>): Promise<Job> => {
  const dbUpdates = mapJobToDatabase(updates);
  
  // CRITICAL: Enforce completion consistency at the database level
  if (dbUpdates.status === 'complete') {
    dbUpdates.is_completed = true;
    dbUpdates.progress = 100;
    if (!dbUpdates.completion_date) dbUpdates.completion_date = new Date().toISOString();
  } else if (dbUpdates.is_completed === true) {
    dbUpdates.status = 'complete';
    dbUpdates.progress = 100;
    if (!dbUpdates.completion_date) dbUpdates.completion_date = new Date().toISOString();
  } else if (dbUpdates.status && dbUpdates.status !== 'complete' && dbUpdates.is_completed !== true) {
    // Moving away from complete: ensure is_completed is false
    if (dbUpdates.is_completed === undefined) {
      // Only reset if the job was previously complete (handled by caller)
    }
  }
  
  // Log the update for debugging
  console.log('Updating job:', id, 'with fields:', Object.keys(dbUpdates));
  
  const { data, error } = await supabase
    .from('jobs')
    .update(dbUpdates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating job:', error);
    // Create a more descriptive error message
    const errorMessage = error.message || 'Unknown database error';
    const detailedError = new Error(`Failed to update job: ${errorMessage}`);
    (detailedError as any).code = error.code;
    (detailedError as any).details = error.details;
    throw detailedError;
  }

  if (!data) {
    throw new Error('Job update returned no data - job may not exist');
  }

  const updatedJob = mapDatabaseJobToJob(data);

  // Sync key fields to linked child jobs (fan, roof, floor) in their category folders
  // This runs in background - don't block the main update
  syncLinkedChildJobs(data).catch(err => 
    console.error('Background sync to linked jobs failed:', err)
  );

  return updatedJob;
};

// Sync parent job fields → linked child jobs so category folders stay up-to-date
const syncLinkedChildJobs = async (parentDbJob: any) => {
  const linkedIds: string[] = [];
  if (parentDbJob.linked_fan_job_id) linkedIds.push(parentDbJob.linked_fan_job_id);
  if (parentDbJob.linked_roofing_job_id) linkedIds.push(parentDbJob.linked_roofing_job_id);
  if (parentDbJob.linked_flooring_job_id) linkedIds.push(parentDbJob.linked_flooring_job_id);
  if (parentDbJob.linked_fire_door_job_id) linkedIds.push(parentDbJob.linked_fire_door_job_id);

  if (linkedIds.length === 0) return;

  // Fields that should always mirror the parent (identity only).
  // IMPORTANT: Do NOT sync booked_date / date_issued — linked trade jobs
  // (Fans, Roofing, Flooring, Fire Door) are scheduled independently of
  // the parent DM job. Booking the parent must not move the child's date.
  const syncFields: Record<string, any> = {
    name: parentDbJob.name,
    address: parentDbJob.address,
    phone_number: parentDbJob.phone_number,
    updated_at: new Date().toISOString(),
  };

  for (const childId of linkedIds) {
    const { error } = await supabase
      .from('jobs')
      .update(syncFields)
      .eq('id', childId)
      .is('deleted_at', null);

    if (error) {
      console.error(`Failed to sync linked job ${childId}:`, error);
    }
  }
};

export const deleteJob = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from('jobs')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);

  if (error) {
    console.error('Error soft-deleting job:', error);
    throw error;
  }
};

export const restoreJob = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from('jobs')
    .update({ deleted_at: null })
    .eq('id', id);

  if (error) {
    console.error('Error restoring job:', error);
    throw error;
  }
};

// Helper functions to map between frontend and database formats
export function mapDatabaseJobToJob(dbJob: any): Job {
  return {
    id: dbJob.id,
    jobNumber: dbJob.job_number,
    name: dbJob.name,
    address: dbJob.address || '',
    phoneNumber: dbJob.phone_number || '',
    summaryOfWorks: dbJob.summary_of_works || '',
    description: dbJob.description || '',
    workItems: dbJob.work_items || [],
    additionalWorks: dbJob.additional_works || [],
    team: dbJob.team || null,
    team2: dbJob.team2 || null,
    progress: dbJob.progress || 0,
    progressNotes: dbJob.progress_notes || '',
    isCompleted: dbJob.is_completed || false,
    isOngoing: dbJob.is_ongoing || false,
    ongoingReason: dbJob.ongoing_reason || '',
    scheduledTrades: dbJob.scheduled_trades || [],
    createdAt: dbJob.created_at ? new Date(dbJob.created_at) : new Date(),
    dateIssued: dbJob.date_issued ? new Date(dbJob.date_issued) : new Date(),
    bookedDate: dbJob.booked_date ? parseDateAsLocal(dbJob.booked_date) : null,
    isFlexibleBooking: dbJob.is_flexible_booking || false,
    bookingNotes: dbJob.booking_notes || '',
    completionDate: dbJob.completion_date ? new Date(dbJob.completion_date) : null,
    attachments: dbJob.attachments || [],
    status: dbJob.status || 'pending',
    fanInfo: dbJob.fan_info || null,
    linkedFanJobId: dbJob.linked_fan_job_id || null,
    insulationInfo: dbJob.insulation_info || null,
    linkedInsulationJobId: dbJob.linked_insulation_job_id || null,
    roofingInfo: dbJob.roofing_info || null,
    linkedRoofingJobId: dbJob.linked_roofing_job_id || null,
    flooringInfo: dbJob.flooring_info || null,
    linkedFlooringJobId: dbJob.linked_flooring_job_id || null,
    fireDoorInfo: dbJob.fire_door_info || null,
    linkedFireDoorJobId: dbJob.linked_fire_door_job_id || null,
    costs: dbJob.costs || null,
    privateNotes: dbJob.private_notes || '',
    referBack: dbJob.refer_back || false,
    referBackReason: dbJob.refer_back_reason || '',
    referBackDate: dbJob.refer_back_date ? new Date(dbJob.refer_back_date) : null,
    expectedCompletionDate: dbJob.expected_completion_date ? new Date(dbJob.expected_completion_date) : null,
    blockerType: dbJob.blocker_type || null,
    blockerNotes: dbJob.blocker_notes || '',
    blockerSetAt: dbJob.blocker_set_at ? new Date(dbJob.blocker_set_at) : null,
    blockerChaseDate: dbJob.blocker_chase_date ? new Date(dbJob.blocker_chase_date) : null,
  };
}

// Check for duplicate job number across ALL categories
export const checkDuplicateJobNumber = async (jobNumber: string): Promise<Job | null> => {
  const { data, error } = await supabase
    .from('jobs')
    .select('*')
    .ilike('job_number', jobNumber)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('Error checking duplicate job:', error);
    return null;
  }

  return data ? mapDatabaseJobToJob(data) : null;
};

// Normalize address for comparison (remove extra spaces, normalize case)
const normalizeAddress = (address: string): string => {
  return address
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/,\s*/g, ', ')
    .trim();
};

// Extract postcode from UK address
const extractPostcode = (address: string): string | null => {
  const postcodeRegex = /([A-Z]{1,2}\d{1,2}[A-Z]?\s*\d[A-Z]{2})/i;
  const match = address.match(postcodeRegex);
  return match ? match[1].toUpperCase().replace(/\s+/g, ' ') : null;
};

// Find existing job by address OR job number within a category
export const findExistingJobByAddressOrNumber = async (
  jobNumber: string,
  address: string,
  categoryId: string
): Promise<Job | null> => {
  // First try exact job number match
  const { data: byNumber, error: numError } = await supabase
    .from('jobs')
    .select('*')
    .eq('category_id', categoryId)
    .ilike('job_number', jobNumber)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle();

  if (numError) {
    console.error('Error finding job by number:', numError);
  }

  if (byNumber) {
    return mapDatabaseJobToJob(byNumber);
  }

  // If no match by number and we have an address, try address matching
  if (address && address.trim().length > 5) {
    const normalizedNewAddress = normalizeAddress(address);
    const newPostcode = extractPostcode(address);

    // Fetch all jobs in category to compare addresses
    const { data: categoryJobs, error: addrError } = await supabase
      .from('jobs')
      .select('*')
      .eq('category_id', categoryId)
      .is('deleted_at', null)
      .not('address', 'is', null);

    if (addrError) {
      console.error('Error finding jobs by address:', addrError);
      return null;
    }

    if (categoryJobs) {
      for (const job of categoryJobs) {
        const existingAddress = job.address || '';
        const normalizedExisting = normalizeAddress(existingAddress);
        const existingPostcode = extractPostcode(existingAddress);

        // Match by postcode first (most reliable for UK addresses)
        if (newPostcode && existingPostcode && newPostcode === existingPostcode) {
          // Check if house number / first part matches too
          const newFirstPart = normalizedNewAddress.split(/[,\s]/)[0];
          const existingFirstPart = normalizedExisting.split(/[,\s]/)[0];
          if (newFirstPart === existingFirstPart || normalizedNewAddress.includes(normalizedExisting.substring(0, 20))) {
            return mapDatabaseJobToJob(job);
          }
        }

        // Fuzzy match on full address (if 80%+ similar)
        const similarity = calculateAddressSimilarity(normalizedNewAddress, normalizedExisting);
        if (similarity > 0.8) {
          return mapDatabaseJobToJob(job);
        }
      }
    }
  }

  return null;
};

// Simple address similarity calculation
const calculateAddressSimilarity = (addr1: string, addr2: string): number => {
  if (!addr1 || !addr2) return 0;
  
  const words1 = addr1.split(/\s+/).filter(w => w.length > 2);
  const words2 = addr2.split(/\s+/).filter(w => w.length > 2);
  
  if (words1.length === 0 || words2.length === 0) return 0;
  
  let matches = 0;
  for (const word of words1) {
    if (words2.some(w => w.includes(word) || word.includes(w))) {
      matches++;
    }
  }
  
  return matches / Math.max(words1.length, words2.length);
};

// Hardwired post-extraction validation for insulation jobs
// Extracts team, EPC, and other data from description if not properly mapped
export const validateAndFixInsulationJob = (job: Partial<Job>): Partial<Job> => {
  const fixed = { ...job };
  const description = job.description || '';
  
  // HARDWIRED RULE 1: Extract Team from description if team field is empty
  if (!fixed.team || fixed.team === '') {
    const teamMatch = description.match(/Team:\s*(\w+)/i);
    if (teamMatch) {
      fixed.team = teamMatch[1];
      console.log(`[Validation] Extracted team "${fixed.team}" from description`);
    }
  }
  
  // HARDWIRED RULE 2: Extract EPC data from description to privateNotes if empty
  if (!fixed.privateNotes || fixed.privateNotes === '') {
    const epcParts: string[] = [];
    
    // EPC Booking
    const epcBookingMatch = description.match(/EPC Booking:\s*([^;|\n]+)/i);
    if (epcBookingMatch && epcBookingMatch[1].trim().toLowerCase() !== 'no') {
      epcParts.push(`EPC Booking: ${epcBookingMatch[1].trim()}`);
    }
    
    // EPC Status
    const epcStatusMatch = description.match(/EPC Status[^:]*:\s*([^;|\n]+)/i);
    if (epcStatusMatch && epcStatusMatch[1].trim().toLowerCase() !== 'no') {
      epcParts.push(`EPC Status: ${epcStatusMatch[1].trim()}`);
    }
    
    if (epcParts.length > 0) {
      fixed.privateNotes = epcParts.join(' | ');
      console.log(`[Validation] Extracted EPC data to privateNotes: "${fixed.privateNotes}"`);
    }
  }
  
  // HARDWIRED RULE 3: Extract Action/Contact data to progressNotes if empty
  if (!fixed.progressNotes || fixed.progressNotes === '') {
    const actionMatch = description.match(/Action:\s*([^;|\n]+)/i) ||
                       description.match(/Contact:\s*([^;|\n]+)/i);
    if (actionMatch) {
      fixed.progressNotes = actionMatch[1].trim();
      console.log(`[Validation] Extracted action to progressNotes: "${fixed.progressNotes}"`);
    }
  }
  
  // HARDWIRED RULE 4: Validate phone number format (UK)
  if (fixed.phoneNumber) {
    // Clean phone number - remove spaces and normalize
    fixed.phoneNumber = fixed.phoneNumber.replace(/\s+/g, '').replace(/[^\d+]/g, '');
    // Ensure UK format
    if (fixed.phoneNumber.startsWith('44')) {
      fixed.phoneNumber = '0' + fixed.phoneNumber.substring(2);
    }
  }
  
  // HARDWIRED RULE 5: Validate address has postcode
  if (fixed.address) {
    const hasPostcode = /[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}/i.test(fixed.address);
    if (!hasPostcode) {
      console.log(`[Validation Warning] Address may be missing postcode: "${fixed.address}"`);
    }
  }
  
  return fixed;
};

// Check for duplicate jobs in database by fuzzy address matching
export const checkInsulationDuplicates = async (
  address: string,
  categoryId: string
): Promise<{ isDuplicate: boolean; matchedJob?: Job }> => {
  if (!address || address.trim().length < 5) {
    return { isDuplicate: false };
  }
  
  // Extract postcode and house number for matching
  const postcodeMatch = address.match(/([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})/i);
  const houseNumberMatch = address.match(/^(\d+[A-Za-z]?)\s/);
  
  if (!postcodeMatch) {
    return { isDuplicate: false };
  }
  
  const postcode = postcodeMatch[1].replace(/\s+/g, '').toUpperCase();
  const houseNumber = houseNumberMatch ? houseNumberMatch[1] : '';
  
  // Query jobs with similar postcode
  const { data: existingJobs } = await supabase
    .from('jobs')
    .select('*')
    .eq('category_id', categoryId)
    .is('deleted_at', null)
    .ilike('address', `%${postcode.substring(0, 4)}%`);
  
  if (!existingJobs || existingJobs.length === 0) {
    return { isDuplicate: false };
  }
  
  // Find exact match by postcode + house number
  for (const job of existingJobs) {
    const jobAddress = job.address || '';
    const jobPostcodeMatch = jobAddress.match(/([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})/i);
    const jobHouseMatch = jobAddress.match(/^(\d+[A-Za-z]?)\s/);
    
    if (jobPostcodeMatch && jobHouseMatch) {
      const jobPostcode = jobPostcodeMatch[1].replace(/\s+/g, '').toUpperCase();
      const jobHouseNumber = jobHouseMatch[1];
      
      if (postcode === jobPostcode && houseNumber === jobHouseNumber) {
        return { isDuplicate: true, matchedJob: mapDatabaseJobToJob(job) };
      }
    }
  }
  
  return { isDuplicate: false };
};

// Merge new job data into existing job (for insulation updates)
export const mergeJobData = async (
  existingJob: Job,
  newData: Partial<Job>
): Promise<Job> => {
  // Apply hardwired validation to incoming data
  const validatedData = validateAndFixInsulationJob(newData);
  
  // Merge work items (add new ones, don't duplicate)
  const existingWorkItemDescriptions = new Set(
    (existingJob.workItems || []).map(w => w.description.toLowerCase().trim())
  );
  const newWorkItems = (validatedData.workItems || []).filter(
    w => !existingWorkItemDescriptions.has(w.description.toLowerCase().trim())
  );
  const mergedWorkItems = [...(existingJob.workItems || []), ...newWorkItems];

  // Merge insulation info (add new types, update quantities for existing)
  const existingInsulation = existingJob.insulationInfo || [];
  const newInsulation = validatedData.insulationInfo || [];
  const mergedInsulation = [...existingInsulation];
  
  for (const newIns of newInsulation) {
    const existingIdx = mergedInsulation.findIndex(
      e => e.type.toLowerCase() === newIns.type.toLowerCase() && 
           (e.location || '').toLowerCase() === (newIns.location || '').toLowerCase()
    );
    if (existingIdx >= 0) {
      // Update existing - add quantities if not manually overridden
      if (!mergedInsulation[existingIdx].manualOverride) {
        mergedInsulation[existingIdx] = {
          ...mergedInsulation[existingIdx],
          quantity: mergedInsulation[existingIdx].quantity + newIns.quantity,
          thickness: newIns.thickness || mergedInsulation[existingIdx].thickness,
          material: newIns.material || mergedInsulation[existingIdx].material,
        };
      }
    } else {
      // Add new insulation type
      mergedInsulation.push(newIns);
    }
  }

  // Build description appendix for any unmapped data
  let descriptionAppendix = '';
  if (validatedData.description && validatedData.description.trim()) {
    const existingDesc = (existingJob.description || '').toLowerCase();
    const newDesc = validatedData.description.trim();
    if (!existingDesc.includes(newDesc.toLowerCase().substring(0, 50))) {
      descriptionAppendix = `\n\n--- Additional Notes (${new Date().toLocaleDateString()}) ---\n${newDesc}`;
    }
  }

  // Prepare update with hardwired field mapping
  const updates: Partial<Job> = {
    workItems: mergedWorkItems,
    insulationInfo: mergedInsulation,
    description: (existingJob.description || '') + descriptionAppendix,
    // Update phone if we have new one and existing is empty
    phoneNumber: existingJob.phoneNumber || validatedData.phoneNumber || '',
    // Update name if existing is generic
    name: (existingJob.name === 'Unknown' || !existingJob.name) ? (validatedData.name || existingJob.name) : existingJob.name,
    // HARDWIRED: Team from extraction (if not already set)
    team: existingJob.team || validatedData.team || null,
    // HARDWIRED: Progress notes from Action/Contact columns
    progressNotes: existingJob.progressNotes || validatedData.progressNotes || '',
    // HARDWIRED: Private notes from EPC bookings
    privateNotes: existingJob.privateNotes || validatedData.privateNotes || '',
  };

  const dbUpdates = mapJobToDatabase(updates);
  
  const { data, error } = await supabase
    .from('jobs')
    .update(dbUpdates)
    .eq('id', existingJob.id)
    .select()
    .single();

  if (error) {
    console.error('Error merging job data:', error);
    throw error;
  }

  return mapDatabaseJobToJob(data);
};

export const mapJobToDatabase = (job: Partial<Job>): any => {
  const dbJob: any = {};
  
  if (job.jobNumber !== undefined) dbJob.job_number = job.jobNumber;
  if (job.name !== undefined) dbJob.name = job.name;
  if (job.address !== undefined) dbJob.address = job.address;
  if (job.phoneNumber !== undefined) dbJob.phone_number = job.phoneNumber;
  if (job.summaryOfWorks !== undefined) dbJob.summary_of_works = job.summaryOfWorks;
  if (job.description !== undefined) dbJob.description = job.description;
  if (job.workItems !== undefined) dbJob.work_items = job.workItems;
  if (job.additionalWorks !== undefined) dbJob.additional_works = job.additionalWorks;
  if (job.team !== undefined) dbJob.team = job.team;
  if (job.team2 !== undefined) dbJob.team2 = job.team2;
  if (job.progress !== undefined) dbJob.progress = job.progress;
  if (job.progressNotes !== undefined) dbJob.progress_notes = job.progressNotes;
  if (job.isCompleted !== undefined) dbJob.is_completed = job.isCompleted;
  if (job.isOngoing !== undefined) dbJob.is_ongoing = job.isOngoing;
  if (job.ongoingReason !== undefined) dbJob.ongoing_reason = job.ongoingReason;
  if (job.scheduledTrades !== undefined) dbJob.scheduled_trades = job.scheduledTrades;
  if (job.dateIssued !== undefined) dbJob.date_issued = job.dateIssued;
  if (job.bookedDate !== undefined) dbJob.booked_date = job.bookedDate ? formatDateOnly(job.bookedDate) : null;
  if (job.isFlexibleBooking !== undefined) dbJob.is_flexible_booking = job.isFlexibleBooking;
  if (job.bookingNotes !== undefined) dbJob.booking_notes = job.bookingNotes;
  if (job.completionDate !== undefined) dbJob.completion_date = job.completionDate;
  if (job.attachments !== undefined) dbJob.attachments = job.attachments;
  if (job.status !== undefined) dbJob.status = job.status;
  if (job.fanInfo !== undefined) dbJob.fan_info = job.fanInfo;
  if (job.linkedFanJobId !== undefined) dbJob.linked_fan_job_id = job.linkedFanJobId;
  if ((job as any).insulationInfo !== undefined) dbJob.insulation_info = (job as any).insulationInfo;
  if ((job as any).linkedInsulationJobId !== undefined) dbJob.linked_insulation_job_id = (job as any).linkedInsulationJobId;
  if (job.roofingInfo !== undefined) dbJob.roofing_info = job.roofingInfo;
  if (job.linkedRoofingJobId !== undefined) dbJob.linked_roofing_job_id = job.linkedRoofingJobId;
  if ((job as any).flooringInfo !== undefined) dbJob.flooring_info = (job as any).flooringInfo;
  if ((job as any).linkedFlooringJobId !== undefined) dbJob.linked_flooring_job_id = (job as any).linkedFlooringJobId;
  if ((job as any).fireDoorInfo !== undefined) dbJob.fire_door_info = (job as any).fireDoorInfo;
  if ((job as any).linkedFireDoorJobId !== undefined) dbJob.linked_fire_door_job_id = (job as any).linkedFireDoorJobId;
  if (job.costs !== undefined) dbJob.costs = job.costs;
  if (job.privateNotes !== undefined) dbJob.private_notes = job.privateNotes;
  if (job.referBack !== undefined) dbJob.refer_back = job.referBack;
  if (job.referBackReason !== undefined) dbJob.refer_back_reason = job.referBackReason;
  if (job.referBackDate !== undefined) dbJob.refer_back_date = job.referBackDate;
  if (job.expectedCompletionDate !== undefined) dbJob.expected_completion_date = job.expectedCompletionDate;
  if (job.blockerType !== undefined) dbJob.blocker_type = job.blockerType;
  if (job.blockerNotes !== undefined) dbJob.blocker_notes = job.blockerNotes;
  if (job.blockerSetAt !== undefined) dbJob.blocker_set_at = job.blockerSetAt;
  if (job.blockerChaseDate !== undefined) dbJob.blocker_chase_date = job.blockerChaseDate;
  
  return dbJob;
};

// Create a linked fan job from an existing job
export const createLinkedFanJob = async (
  sourceJob: Job,
  fanInfo: FanInfo[],
  fanCategoryId: string,
  bookedDate?: Date | null
): Promise<Job> => {
  const fanDescription = fanInfo.map(fan => 
    `${fan.type} x${fan.quantity}${fan.location ? ` - ${fan.location}` : ''}`
  ).join('\n');

  const fanJob: Omit<Job, 'id'> = {
    jobNumber: `${sourceJob.jobNumber}-FAN`,
    name: sourceJob.name,
    address: sourceJob.address,
    phoneNumber: sourceJob.phoneNumber,
    summaryOfWorks: `Fan Installation from ${sourceJob.jobNumber}`,
    description: fanDescription,
    workItems: [],
    additionalWorks: [],
    team: null,
    team2: null,
    progress: 0,
    progressNotes: '',
    isCompleted: false,
    isOngoing: false,
    ongoingReason: '',
    scheduledTrades: [],
    createdAt: new Date(),
    dateIssued: bookedDate || new Date(),
    bookedDate: bookedDate || null,
    isFlexibleBooking: false,
    bookingNotes: '',
    completionDate: null,
    attachments: [],
    status: 'pending',
    fanInfo: fanInfo,
    linkedFanJobId: null,
    insulationInfo: null,
    linkedInsulationJobId: null,
    roofingInfo: null,
    linkedRoofingJobId: null,
    flooringInfo: null,
    linkedFlooringJobId: null,
    fireDoorInfo: null,
    linkedFireDoorJobId: null,
    costs: null,
    privateNotes: '',
    referBack: false,
    referBackReason: '',
    referBackDate: null,
    expectedCompletionDate: null,
    blockerType: null,
    blockerNotes: '',
    blockerSetAt: null,
    blockerChaseDate: null,
  };

  const dbJob = mapJobToDatabase(fanJob);
  dbJob.category_id = fanCategoryId;

  const { data, error } = await supabase
    .from('jobs')
    .insert(dbJob)
    .select()
    .single();

  if (error) {
    console.error('Error creating linked fan job:', error);
    throw error;
  }

  // Update the source job to link to the fan job
  await supabase
    .from('jobs')
    .update({ linked_fan_job_id: data.id })
    .eq('id', sourceJob.id);

  return mapDatabaseJobToJob(data);
};

// Sync (create or update) a linked fan job based on manual fan edits
export const syncLinkedFanJob = async (
  sourceJob: Job,
  fanInfo: FanInfo[],
  fanCategoryId: string,
  bookedDate?: Date | null
): Promise<{ linkedFanJobId: string; created: boolean }> => {
  const fanDescription = fanInfo.map(fan => 
    `${fan.type} x${fan.quantity}${fan.location ? ` - ${fan.location}` : ''}`
  ).join('\n');

  // Check if a linked fan job already exists
  if (sourceJob.linkedFanJobId) {
    // Update existing fan job - also update booked_date if provided
    const updateData: any = {
      fan_info: fanInfo as unknown as Json,
      description: fanDescription,
    };
    
    // Update booked_date and date_issued (for monthly folder) if explicitly provided
    if (bookedDate !== undefined) {
      updateData.booked_date = bookedDate ? formatDateOnly(bookedDate) : null;
      if (bookedDate) updateData.date_issued = formatDateOnly(bookedDate);
    }

    const { error } = await supabase
      .from('jobs')
      .update(updateData)
      .eq('id', sourceJob.linkedFanJobId);

    if (error) {
      console.error('Error updating linked fan job:', error);
      throw error;
    }

    // Also update the source job's fan_info
    await supabase
      .from('jobs')
      .update({ fan_info: fanInfo as unknown as Json })
      .eq('id', sourceJob.id);

    return { linkedFanJobId: sourceJob.linkedFanJobId, created: false };
  }

  // Create new fan job
  const fanJob: Omit<Job, 'id'> = {
    jobNumber: `${sourceJob.jobNumber}-FAN`,
    name: sourceJob.name,
    address: sourceJob.address,
    phoneNumber: sourceJob.phoneNumber,
    summaryOfWorks: `Fan Installation from ${sourceJob.jobNumber}`,
    description: fanDescription,
    workItems: [],
    additionalWorks: [],
    team: null,
    team2: null,
    progress: 0,
    progressNotes: '',
    isCompleted: false,
    isOngoing: false,
    ongoingReason: '',
    scheduledTrades: [],
    createdAt: new Date(),
    dateIssued: bookedDate || new Date(),
    bookedDate: bookedDate || null,
    isFlexibleBooking: false,
    bookingNotes: '',
    completionDate: null,
    attachments: [],
    status: 'pending',
    fanInfo: fanInfo,
    linkedFanJobId: null,
    insulationInfo: null,
    linkedInsulationJobId: null,
    roofingInfo: null,
    linkedRoofingJobId: null,
    flooringInfo: null,
    linkedFlooringJobId: null,
    fireDoorInfo: null,
    linkedFireDoorJobId: null,
    costs: null,
    privateNotes: '',
    referBack: false,
    referBackReason: '',
    referBackDate: null,
    expectedCompletionDate: null,
    blockerType: null,
    blockerNotes: '',
    blockerSetAt: null,
    blockerChaseDate: null,
  };

  const dbJob = mapJobToDatabase(fanJob);
  dbJob.category_id = fanCategoryId;

  const { data, error } = await supabase
    .from('jobs')
    .insert(dbJob)
    .select()
    .single();

  if (error) {
    console.error('Error creating linked fan job:', error);
    throw error;
  }

  // Update the source job to link to the fan job and save fan_info
  await supabase
    .from('jobs')
    .update({ 
      linked_fan_job_id: data.id,
      fan_info: fanInfo as unknown as Json 
    })
    .eq('id', sourceJob.id);

  return { linkedFanJobId: data.id, created: true };
};

// Create a linked insulation job from an existing job (paralleling createLinkedFanJob)
export const createLinkedInsulationJob = async (
  sourceJob: Job,
  insulationInfo: InsulationInfo[],
  insulationCategoryId: string,
  bookedDate?: Date | null
): Promise<Job> => {
  const insulationDescription = insulationInfo.map(unit =>
    `${unit.type} x${unit.quantity}${unit.location ? ` - ${unit.location}` : ''}${unit.thickness ? ` (${unit.thickness})` : ''}`
  ).join('\n');

  const insulationJob: Omit<Job, 'id'> = {
    jobNumber: `${sourceJob.jobNumber}-INSUL`,
    name: sourceJob.name,
    address: sourceJob.address,
    phoneNumber: sourceJob.phoneNumber,
    summaryOfWorks: `Loft Insulation from ${sourceJob.jobNumber}`,
    description: insulationDescription,
    workItems: [],
    additionalWorks: [],
    team: null,
    team2: null,
    progress: 0,
    progressNotes: '',
    isCompleted: false,
    isOngoing: false,
    ongoingReason: '',
    scheduledTrades: [],
    createdAt: new Date(),
    dateIssued: bookedDate || new Date(),
    bookedDate: bookedDate || null,
    isFlexibleBooking: false,
    bookingNotes: '',
    completionDate: null,
    attachments: [],
    status: 'pending',
    fanInfo: null,
    linkedFanJobId: null,
    insulationInfo: insulationInfo,
    linkedInsulationJobId: null,
    roofingInfo: null,
    linkedRoofingJobId: null,
    flooringInfo: null,
    linkedFlooringJobId: null,
    fireDoorInfo: null,
    linkedFireDoorJobId: null,
    costs: null,
    privateNotes: '',
    referBack: false,
    referBackReason: '',
    referBackDate: null,
    expectedCompletionDate: null,
    blockerType: null,
    blockerNotes: '',
    blockerSetAt: null,
    blockerChaseDate: null,
  };

  const dbJob = mapJobToDatabase(insulationJob);
  dbJob.category_id = insulationCategoryId;

  const { data, error } = await supabase
    .from('jobs')
    .insert(dbJob)
    .select()
    .single();

  if (error) {
    console.error('Error creating linked insulation job:', error);
    throw error;
  }

  await supabase
    .from('jobs')
    .update({ linked_insulation_job_id: data.id })
    .eq('id', sourceJob.id);

  return mapDatabaseJobToJob(data);
};

// Sync (create or update) a linked insulation job based on manual edits
export const syncLinkedInsulationJob = async (
  sourceJob: Job,
  insulationInfo: InsulationInfo[],
  insulationCategoryId: string,
  bookedDate?: Date | null
): Promise<{ linkedInsulationJobId: string; created: boolean }> => {
  const insulationDescription = insulationInfo.map(unit => 
    `${unit.type} x${unit.quantity}${unit.location ? ` - ${unit.location}` : ''}${unit.thickness ? ` (${unit.thickness})` : ''}`
  ).join('\n');

  // Check if a linked insulation job already exists
  if (sourceJob.linkedInsulationJobId) {
    const updateData: any = {
      insulation_info: insulationInfo as unknown as Json,
      description: insulationDescription,
    };
    if (bookedDate !== undefined) {
      updateData.booked_date = bookedDate ? formatDateOnly(bookedDate) : null;
      if (bookedDate) updateData.date_issued = formatDateOnly(bookedDate);
    }

    const { error } = await supabase
      .from('jobs')
      .update(updateData)
      .eq('id', sourceJob.linkedInsulationJobId);

    if (error) {
      console.error('Error updating linked insulation job:', error);
      throw error;
    }

    // Also update the source job's insulation_info
    await supabase
      .from('jobs')
      .update({ insulation_info: insulationInfo as unknown as Json })
      .eq('id', sourceJob.id);

    return { linkedInsulationJobId: sourceJob.linkedInsulationJobId, created: false };
  }

  // Create new insulation job
  const insulationJob: Omit<Job, 'id'> = {
    jobNumber: `${sourceJob.jobNumber}-INSUL`,
    name: sourceJob.name,
    address: sourceJob.address,
    phoneNumber: sourceJob.phoneNumber,
    summaryOfWorks: `Loft Insulation from ${sourceJob.jobNumber}`,
    description: insulationDescription,
    workItems: [],
    additionalWorks: [],
    team: null,
    team2: null,
    progress: 0,
    progressNotes: '',
    isCompleted: false,
    isOngoing: false,
    ongoingReason: '',
    scheduledTrades: [],
    createdAt: new Date(),
    dateIssued: bookedDate || new Date(),
    bookedDate: bookedDate || null,
    isFlexibleBooking: false,
    bookingNotes: '',
    completionDate: null,
    attachments: [],
    status: 'pending',
    fanInfo: null,
    linkedFanJobId: null,
    insulationInfo: insulationInfo,
    linkedInsulationJobId: null,
    roofingInfo: null,
    linkedRoofingJobId: null,
    flooringInfo: null,
    linkedFlooringJobId: null,
    fireDoorInfo: null,
    linkedFireDoorJobId: null,
    costs: null,
    privateNotes: '',
    referBack: false,
    referBackReason: '',
    referBackDate: null,
    expectedCompletionDate: null,
    blockerType: null,
    blockerNotes: '',
    blockerSetAt: null,
    blockerChaseDate: null,
  };

  const dbJob = mapJobToDatabase(insulationJob);
  dbJob.category_id = insulationCategoryId;

  const { data, error } = await supabase
    .from('jobs')
    .insert(dbJob)
    .select()
    .single();

  if (error) {
    console.error('Error creating linked insulation job:', error);
    throw error;
  }

  // Update the source job to link to the insulation job
  await supabase
    .from('jobs')
    .update({ 
      linked_insulation_job_id: data.id,
      insulation_info: insulationInfo as unknown as Json 
    })
    .eq('id', sourceJob.id);

  return { linkedInsulationJobId: data.id, created: true };
};


// Extract roofing from job description using AI
export const extractRoofingWithAI = async (description: string, workItems: WorkItem[]): Promise<{ hasRoofing: boolean; roofing: RoofingInfo[]; totalRoofingCount: number } | null> => {
  const hasDescription = description && description.trim().length > 0;
  const hasWorkItems = workItems && workItems.length > 0;
  
  if (!hasDescription && !hasWorkItems) {
    return { hasRoofing: false, roofing: [], totalRoofingCount: 0 };
  }

  return withRetry(async () => {
    const headers = await getAuthHeaders();
    const { data, error } = await supabase.functions.invoke('extract-roofing', {
      body: { 
        ...(hasDescription ? { description } : {}),
        ...(hasWorkItems ? { workItems } : {})
      },
      headers
    });

    if (error) {
      console.error('Error calling extract-roofing function:', error);
      throw error;
    }

    if (!data?.success) {
      throw new Error(data?.error || 'Failed to extract roofing');
    }

    return data.data;
  });
};

// Create a linked roofing job from an existing job
export const createLinkedRoofingJob = async (
  sourceJob: Job,
  roofingInfo: RoofingInfo[],
  roofingCategoryId: string,
  bookedDate?: Date | null
): Promise<Job> => {
  const roofingDescription = roofingInfo.map(item =>
    `${item.type} x${item.quantity}${item.location ? ` - ${item.location}` : ''}`
  ).join('\n');

  const roofingJob: Omit<Job, 'id'> = {
    jobNumber: `${sourceJob.jobNumber}-ROOF`,
    name: sourceJob.name,
    address: sourceJob.address,
    phoneNumber: sourceJob.phoneNumber,
    summaryOfWorks: `Roofing from ${sourceJob.jobNumber}`,
    description: roofingDescription,
    workItems: [],
    additionalWorks: [],
    team: null,
    team2: null,
    progress: 0,
    progressNotes: '',
    isCompleted: false,
    isOngoing: false,
    ongoingReason: '',
    scheduledTrades: [],
    createdAt: new Date(),
    dateIssued: bookedDate || new Date(),
    bookedDate: bookedDate || null,
    isFlexibleBooking: false,
    bookingNotes: '',
    completionDate: null,
    attachments: [],
    status: 'pending',
    fanInfo: null,
    linkedFanJobId: null,
    insulationInfo: null,
    linkedInsulationJobId: null,
    roofingInfo: roofingInfo,
    linkedRoofingJobId: null,
    flooringInfo: null,
    linkedFlooringJobId: null,
    fireDoorInfo: null,
    linkedFireDoorJobId: null,
    costs: null,
    privateNotes: '',
    referBack: false,
    referBackReason: '',
    referBackDate: null,
    expectedCompletionDate: null,
    blockerType: null,
    blockerNotes: '',
    blockerSetAt: null,
    blockerChaseDate: null,
  };

  const dbJob = mapJobToDatabase(roofingJob);
  dbJob.category_id = roofingCategoryId;

  const { data, error } = await supabase
    .from('jobs')
    .insert(dbJob)
    .select()
    .single();

  if (error) {
    console.error('Error creating linked roofing job:', error);
    throw error;
  }

  await supabase
    .from('jobs')
    .update({ linked_roofing_job_id: data.id })
    .eq('id', sourceJob.id);

  return mapDatabaseJobToJob(data);
};

// Sync (create or update) a linked roofing job
export const syncLinkedRoofingJob = async (
  sourceJob: Job,
  roofingInfo: RoofingInfo[],
  roofingCategoryId: string,
  bookedDate?: Date | null
): Promise<{ linkedRoofingJobId: string; created: boolean }> => {
  const roofingDescription = roofingInfo.map(item =>
    `${item.type} x${item.quantity}${item.location ? ` - ${item.location}` : ''}`
  ).join('\n');

  if (sourceJob.linkedRoofingJobId) {
    const updateData: any = {
      roofing_info: roofingInfo as unknown as Json,
      description: roofingDescription,
    };
    
    if (bookedDate !== undefined) {
      updateData.booked_date = bookedDate ? formatDateOnly(bookedDate) : null;
      if (bookedDate) updateData.date_issued = formatDateOnly(bookedDate);
    }

    const { error } = await supabase
      .from('jobs')
      .update(updateData)
      .eq('id', sourceJob.linkedRoofingJobId);

    if (error) {
      console.error('Error updating linked roofing job:', error);
      throw error;
    }

    await supabase
      .from('jobs')
      .update({ roofing_info: roofingInfo as unknown as Json })
      .eq('id', sourceJob.id);

    return { linkedRoofingJobId: sourceJob.linkedRoofingJobId, created: false };
  }

  const roofingJob: Omit<Job, 'id'> = {
    jobNumber: `${sourceJob.jobNumber}-ROOF`,
    name: sourceJob.name,
    address: sourceJob.address,
    phoneNumber: sourceJob.phoneNumber,
    summaryOfWorks: `Roofing from ${sourceJob.jobNumber}`,
    description: roofingDescription,
    workItems: [],
    additionalWorks: [],
    team: null,
    team2: null,
    progress: 0,
    progressNotes: '',
    isCompleted: false,
    isOngoing: false,
    ongoingReason: '',
    scheduledTrades: [],
    createdAt: new Date(),
    dateIssued: bookedDate || new Date(),
    bookedDate: bookedDate || null,
    isFlexibleBooking: false,
    bookingNotes: '',
    completionDate: null,
    attachments: [],
    status: 'pending',
    fanInfo: null,
    linkedFanJobId: null,
    insulationInfo: null,
    linkedInsulationJobId: null,
    roofingInfo: roofingInfo,
    linkedRoofingJobId: null,
    flooringInfo: null,
    linkedFlooringJobId: null,
    fireDoorInfo: null,
    linkedFireDoorJobId: null,
    costs: null,
    privateNotes: '',
    referBack: false,
    referBackReason: '',
    referBackDate: null,
    expectedCompletionDate: null,
    blockerType: null,
    blockerNotes: '',
    blockerSetAt: null,
    blockerChaseDate: null,
  };

  const dbJob = mapJobToDatabase(roofingJob);
  dbJob.category_id = roofingCategoryId;

  const { data, error } = await supabase
    .from('jobs')
    .insert(dbJob)
    .select()
    .single();

  if (error) {
    console.error('Error creating linked roofing job:', error);
    throw error;
  }

  await supabase
    .from('jobs')
    .update({
      linked_roofing_job_id: data.id,
      roofing_info: roofingInfo as unknown as Json
    })
    .eq('id', sourceJob.id);

  return { linkedRoofingJobId: data.id, created: true };
};

// Extract flooring from job description using AI
export const extractFlooringWithAI = async (description: string, workItems: WorkItem[]): Promise<{ hasFlooring: boolean; flooring: FlooringInfo[]; totalFlooringCount: number } | null> => {
  const hasDescription = description && description.trim().length > 0;
  const hasWorkItems = workItems && workItems.length > 0;
  
  if (!hasDescription && !hasWorkItems) {
    return { hasFlooring: false, flooring: [], totalFlooringCount: 0 };
  }

  return withRetry(async () => {
    const headers = await getAuthHeaders();
    const { data, error } = await supabase.functions.invoke('extract-flooring', {
      body: { 
        ...(hasDescription ? { description } : {}),
        ...(hasWorkItems ? { workItems } : {})
      },
      headers
    });

    if (error) {
      console.error('Error calling extract-flooring function:', error);
      throw error;
    }

    if (!data?.success) {
      throw new Error(data?.error || 'Failed to extract flooring');
    }

    return data.data;
  });
};

// Create a linked flooring job from an existing job
export const createLinkedFlooringJob = async (
  sourceJob: Job,
  flooringInfo: FlooringInfo[],
  flooringCategoryId: string,
  bookedDate?: Date | null
): Promise<Job> => {
  const flooringDescription = flooringInfo.map(item =>
    `${item.type} x${item.quantity}${item.location ? ` - ${item.location}` : ''}`
  ).join('\n');

  const flooringJob: Omit<Job, 'id'> = {
    jobNumber: `${sourceJob.jobNumber}-FLOOR`,
    name: sourceJob.name,
    address: sourceJob.address,
    phoneNumber: sourceJob.phoneNumber,
    summaryOfWorks: `Flooring from ${sourceJob.jobNumber}`,
    description: flooringDescription,
    workItems: [],
    additionalWorks: [],
    team: null,
    team2: null,
    progress: 0,
    progressNotes: '',
    isCompleted: false,
    isOngoing: false,
    ongoingReason: '',
    scheduledTrades: [],
    createdAt: new Date(),
    dateIssued: bookedDate || new Date(),
    bookedDate: bookedDate || null,
    isFlexibleBooking: false,
    bookingNotes: '',
    completionDate: null,
    attachments: [],
    status: 'pending',
    fanInfo: null,
    linkedFanJobId: null,
    insulationInfo: null,
    linkedInsulationJobId: null,
    roofingInfo: null,
    linkedRoofingJobId: null,
    flooringInfo: flooringInfo,
    linkedFlooringJobId: null,
    fireDoorInfo: null,
    linkedFireDoorJobId: null,
    costs: null,
    privateNotes: '',
    referBack: false,
    referBackReason: '',
    referBackDate: null,
    expectedCompletionDate: null,
    blockerType: null,
    blockerNotes: '',
    blockerSetAt: null,
    blockerChaseDate: null,
  };

  const dbJob = mapJobToDatabase(flooringJob);
  dbJob.category_id = flooringCategoryId;

  const { data, error } = await supabase
    .from('jobs')
    .insert(dbJob)
    .select()
    .single();

  if (error) {
    console.error('Error creating linked flooring job:', error);
    throw error;
  }

  await supabase
    .from('jobs')
    .update({
      linked_flooring_job_id: data.id,
      flooring_info: flooringInfo as unknown as Json
    })
    .eq('id', sourceJob.id);

  return mapDatabaseJobToJob(data);
};

// Sync (create or update) a linked flooring job
export const syncLinkedFlooringJob = async (
  sourceJob: Job,
  flooringInfo: FlooringInfo[],
  flooringCategoryId: string,
  bookedDate?: Date | null
): Promise<{ linkedFlooringJobId: string; created: boolean }> => {
  const flooringDescription = flooringInfo.map(item =>
    `${item.type} x${item.quantity}${item.location ? ` - ${item.location}` : ''}`
  ).join('\n');

  if (sourceJob.linkedFlooringJobId) {
    const updateData: any = {
      flooring_info: flooringInfo as unknown as Json,
      description: flooringDescription,
    };
    if (bookedDate !== undefined) {
      updateData.booked_date = bookedDate ? formatDateOnly(bookedDate) : null;
      if (bookedDate) updateData.date_issued = formatDateOnly(bookedDate);
    }

    const { error } = await supabase
      .from('jobs')
      .update(updateData)
      .eq('id', sourceJob.linkedFlooringJobId);

    if (error) {
      console.error('Error updating linked flooring job:', error);
      throw error;
    }

    await supabase
      .from('jobs')
      .update({ flooring_info: flooringInfo as unknown as Json })
      .eq('id', sourceJob.id);

    return { linkedFlooringJobId: sourceJob.linkedFlooringJobId, created: false };
  }

  const flooringJob: Omit<Job, 'id'> = {
    jobNumber: `${sourceJob.jobNumber}-FLOOR`,
    name: sourceJob.name,
    address: sourceJob.address,
    phoneNumber: sourceJob.phoneNumber,
    summaryOfWorks: `Flooring from ${sourceJob.jobNumber}`,
    description: flooringDescription,
    workItems: [],
    additionalWorks: [],
    team: null,
    team2: null,
    progress: 0,
    progressNotes: '',
    isCompleted: false,
    isOngoing: false,
    ongoingReason: '',
    scheduledTrades: [],
    createdAt: new Date(),
    dateIssued: bookedDate || new Date(),
    bookedDate: bookedDate || null,
    isFlexibleBooking: false,
    bookingNotes: '',
    completionDate: null,
    attachments: [],
    status: 'pending',
    fanInfo: null,
    linkedFanJobId: null,
    insulationInfo: null,
    linkedInsulationJobId: null,
    roofingInfo: null,
    linkedRoofingJobId: null,
    flooringInfo: flooringInfo,
    linkedFlooringJobId: null,
    fireDoorInfo: null,
    linkedFireDoorJobId: null,
    costs: null,
    privateNotes: '',
    referBack: false,
    referBackReason: '',
    referBackDate: null,
    expectedCompletionDate: null,
    blockerType: null,
    blockerNotes: '',
    blockerSetAt: null,
    blockerChaseDate: null,
  };

  const dbJob = mapJobToDatabase(flooringJob);
  dbJob.category_id = flooringCategoryId;

  const { data, error } = await supabase
    .from('jobs')
    .insert(dbJob)
    .select()
    .single();

  if (error) {
    console.error('Error creating linked flooring job:', error);
    throw error;
  }

  await supabase
    .from('jobs')
    .update({
      linked_flooring_job_id: data.id,
      flooring_info: flooringInfo as unknown as Json
    })
    .eq('id', sourceJob.id);

  return { linkedFlooringJobId: data.id, created: true };
};

// Create a linked fire door job from an existing job
export const createLinkedFireDoorJob = async (
  sourceJob: Job,
  fireDoorInfo: FireDoorInfo[],
  fireDoorCategoryId: string,
  bookedDate?: Date | null
): Promise<Job> => {
  const doorDescription = fireDoorInfo.map(item =>
    `${item.type} x${item.quantity}${item.location ? ` - ${item.location}` : ''}`
  ).join('\n');

  const doorJob: Omit<Job, 'id'> = {
    jobNumber: `${sourceJob.jobNumber}-DOOR`,
    name: sourceJob.name,
    address: sourceJob.address,
    phoneNumber: sourceJob.phoneNumber,
    summaryOfWorks: `Fire Door from ${sourceJob.jobNumber}`,
    description: doorDescription,
    workItems: [],
    additionalWorks: [],
    team: null,
    team2: null,
    progress: 0,
    progressNotes: '',
    isCompleted: false,
    isOngoing: false,
    ongoingReason: '',
    scheduledTrades: [],
    createdAt: new Date(),
    dateIssued: bookedDate || new Date(),
    bookedDate: bookedDate || null,
    isFlexibleBooking: false,
    bookingNotes: '',
    completionDate: null,
    attachments: [],
    status: 'pending',
    fanInfo: null,
    linkedFanJobId: null,
    insulationInfo: null,
    linkedInsulationJobId: null,
    roofingInfo: null,
    linkedRoofingJobId: null,
    flooringInfo: null,
    linkedFlooringJobId: null,
    fireDoorInfo: fireDoorInfo,
    linkedFireDoorJobId: null,
    costs: null,
    privateNotes: '',
    referBack: false,
    referBackReason: '',
    referBackDate: null,
    expectedCompletionDate: null,
    blockerType: null,
    blockerNotes: '',
    blockerSetAt: null,
    blockerChaseDate: null,
  };

  const dbJob = mapJobToDatabase(doorJob);
  dbJob.category_id = fireDoorCategoryId;

  const { data, error } = await supabase
    .from('jobs')
    .insert(dbJob)
    .select()
    .single();

  if (error) {
    console.error('Error creating linked fire door job:', error);
    throw error;
  }

  await supabase
    .from('jobs')
    .update({
      linked_fire_door_job_id: data.id,
      fire_door_info: fireDoorInfo as unknown as Json
    })
    .eq('id', sourceJob.id);

  return mapDatabaseJobToJob(data);
};

// Sync (create or update) a linked fire door job
export const syncLinkedFireDoorJob = async (
  sourceJob: Job,
  fireDoorInfo: FireDoorInfo[],
  fireDoorCategoryId: string,
  bookedDate?: Date | null
): Promise<{ linkedFireDoorJobId: string; created: boolean }> => {
  const doorDescription = fireDoorInfo.map(item =>
    `${item.type} x${item.quantity}${item.location ? ` - ${item.location}` : ''}`
  ).join('\n');

  if (sourceJob.linkedFireDoorJobId) {
    const updateData: any = {
      fire_door_info: fireDoorInfo as unknown as Json,
      description: doorDescription,
    };
    if (bookedDate !== undefined) {
      updateData.booked_date = bookedDate ? formatDateOnly(bookedDate) : null;
      if (bookedDate) updateData.date_issued = formatDateOnly(bookedDate);
    }

    const { error } = await supabase
      .from('jobs')
      .update(updateData)
      .eq('id', sourceJob.linkedFireDoorJobId);

    if (error) {
      console.error('Error updating linked fire door job:', error);
      throw error;
    }

    await supabase
      .from('jobs')
      .update({ fire_door_info: fireDoorInfo as unknown as Json })
      .eq('id', sourceJob.id);

    return { linkedFireDoorJobId: sourceJob.linkedFireDoorJobId, created: false };
  }

  const doorJob: Omit<Job, 'id'> = {
    jobNumber: `${sourceJob.jobNumber}-DOOR`,
    name: sourceJob.name,
    address: sourceJob.address,
    phoneNumber: sourceJob.phoneNumber,
    summaryOfWorks: `Fire Door from ${sourceJob.jobNumber}`,
    description: doorDescription,
    workItems: [],
    additionalWorks: [],
    team: null,
    team2: null,
    progress: 0,
    progressNotes: '',
    isCompleted: false,
    isOngoing: false,
    ongoingReason: '',
    scheduledTrades: [],
    createdAt: new Date(),
    dateIssued: bookedDate || new Date(),
    bookedDate: bookedDate || null,
    isFlexibleBooking: false,
    bookingNotes: '',
    completionDate: null,
    attachments: [],
    status: 'pending',
    fanInfo: null,
    linkedFanJobId: null,
    insulationInfo: null,
    linkedInsulationJobId: null,
    roofingInfo: null,
    linkedRoofingJobId: null,
    flooringInfo: null,
    linkedFlooringJobId: null,
    fireDoorInfo: fireDoorInfo,
    linkedFireDoorJobId: null,
    costs: null,
    privateNotes: '',
    referBack: false,
    referBackReason: '',
    referBackDate: null,
    expectedCompletionDate: null,
    blockerType: null,
    blockerNotes: '',
    blockerSetAt: null,
    blockerChaseDate: null,
  };

  const dbJob = mapJobToDatabase(doorJob);
  dbJob.category_id = fireDoorCategoryId;

  const { data, error } = await supabase
    .from('jobs')
    .insert(dbJob)
    .select()
    .single();

  if (error) {
    console.error('Error creating linked fire door job:', error);
    throw error;
  }

  await supabase
    .from('jobs')
    .update({
      linked_fire_door_job_id: data.id,
      fire_door_info: fireDoorInfo as unknown as Json
    })
    .eq('id', sourceJob.id);

  return { linkedFireDoorJobId: data.id, created: true };
};

// Notification history functions
export const fetchNotificationHistory = async (): Promise<any[]> => {
  const { data, error } = await supabase
    .from('notification_history')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching notification history:', error);
    throw error;
  }

  return data || [];
};

export const saveNotificationToHistory = async (notification: {
  jobId: string;
  jobNumber: string;
  teamName: string;
  whatsappNumber: string | null;
  message: string;
  sentVia: string;
  status: string;
}): Promise<void> => {
  const { error } = await supabase
    .from('notification_history')
    .insert({
      job_id: notification.jobId,
      job_number: notification.jobNumber,
      team_name: notification.teamName,
      whatsapp_number: notification.whatsappNumber,
      message: notification.message,
      sent_via: notification.sentVia,
      status: notification.status,
    });

  if (error) {
    console.error('Error saving notification history:', error);
    throw error;
  }
};

// Delete a linked job (fan/roof/floor/door) and unlink from parent
export const deleteLinkedJob = async (
  linkedJobId: string,
  parentJobId: string,
  linkType: 'fan' | 'roofing' | 'flooring' | 'fire_door'
): Promise<void> => {
  // Soft-delete the linked job
  const { error: deleteError } = await supabase
    .from('jobs')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', linkedJobId);

  if (deleteError) throw deleteError;

  // Unlink from parent
  const unlinkField = linkType === 'fan' ? 'linked_fan_job_id'
    : linkType === 'roofing' ? 'linked_roofing_job_id'
    : linkType === 'flooring' ? 'linked_flooring_job_id'
    : 'linked_fire_door_job_id';

  const { error: unlinkError } = await supabase
    .from('jobs')
    .update({ [unlinkField]: null, updated_at: new Date().toISOString() } as any)
    .eq('id', parentJobId);

  if (unlinkError) throw unlinkError;
};
