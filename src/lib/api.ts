import { supabase } from "@/integrations/supabase/client";
import { Job, WorkItem, FanInfo, InsulationInfo } from "@/types/job";
import { SOR_CODES_DATABASE } from "@/data/sorCodes";
import { Json } from "@/integrations/supabase/types";

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
  if (error?.message?.includes('rate limit')) return true;
  if (error?.status === 429) return true;
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
  return withRetry(async () => {
    const headers = await getAuthHeaders();
    const { data, error } = await supabase.functions.invoke('extract-fans', {
      body: { 
        description,
        workItems
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
      throw error;
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
      throw error;
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

export const convertDescriptionToWorkItems = async (description: string): Promise<WorkItem[]> => {
  try {
    const headers = await getAuthHeaders();
    const { data, error } = await supabase.functions.invoke('convert-description', {
      body: { 
        description,
        sorCodesContext: getSORCodesContext()
      },
      headers
    });

    if (error) {
      console.error('Error calling convert-description function:', error);
      throw error;
    }

    if (!data?.success) {
      throw new Error(data?.error || 'Failed to convert description');
    }

    // Add IDs to work items
    return data.workItems.map((item: any) => ({
      ...item,
      id: crypto.randomUUID()
    }));
  } catch (error) {
    console.error('Error converting description:', error);
    throw error;
  }
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
export const fetchJobs = async (categoryId?: string): Promise<Job[]> => {
  let query = supabase
    .from('jobs')
    .select('*')
    .order('date_issued', { ascending: false });

  if (categoryId) {
    query = query.eq('category_id', categoryId);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching jobs:', error);
    throw error;
  }

  return (data || []).map(mapDatabaseJobToJob);
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
    console.error('Error creating job:', error);
    throw error;
  }

  return mapDatabaseJobToJob(data);
};

export const updateJob = async (id: string, updates: Partial<Job>): Promise<Job> => {
  const dbUpdates = mapJobToDatabase(updates);
  
  const { data, error } = await supabase
    .from('jobs')
    .update(dbUpdates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating job:', error);
    throw error;
  }

  return mapDatabaseJobToJob(data);
};

export const deleteJob = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from('jobs')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting job:', error);
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
    createdAt: dbJob.created_at ? new Date(dbJob.created_at) : new Date(),
    dateIssued: dbJob.date_issued ? new Date(dbJob.date_issued) : new Date(),
    bookedDate: dbJob.booked_date ? new Date(dbJob.booked_date) : null,
    isFlexibleBooking: dbJob.is_flexible_booking || false,
    bookingNotes: dbJob.booking_notes || '',
    completionDate: dbJob.completion_date ? new Date(dbJob.completion_date) : null,
    attachments: dbJob.attachments || [],
    status: dbJob.status || 'pending',
    fanInfo: dbJob.fan_info || null,
    linkedFanJobId: dbJob.linked_fan_job_id || null,
    insulationInfo: dbJob.insulation_info || null,
    linkedInsulationJobId: dbJob.linked_insulation_job_id || null,
    costs: dbJob.costs || null,
    privateNotes: dbJob.private_notes || '',
  };
}

// Check for duplicate job number across ALL categories
export const checkDuplicateJobNumber = async (jobNumber: string): Promise<Job | null> => {
  const { data, error } = await supabase
    .from('jobs')
    .select('*')
    .ilike('job_number', jobNumber)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('Error checking duplicate job:', error);
    return null;
  }

  return data ? mapDatabaseJobToJob(data) : null;
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
  if (job.dateIssued !== undefined) dbJob.date_issued = job.dateIssued;
  if (job.bookedDate !== undefined) dbJob.booked_date = job.bookedDate;
  if (job.isFlexibleBooking !== undefined) dbJob.is_flexible_booking = job.isFlexibleBooking;
  if (job.bookingNotes !== undefined) dbJob.booking_notes = job.bookingNotes;
  if (job.completionDate !== undefined) dbJob.completion_date = job.completionDate;
  if (job.attachments !== undefined) dbJob.attachments = job.attachments;
  if (job.status !== undefined) dbJob.status = job.status;
  if (job.fanInfo !== undefined) dbJob.fan_info = job.fanInfo;
  if (job.linkedFanJobId !== undefined) dbJob.linked_fan_job_id = job.linkedFanJobId;
  if ((job as any).insulationInfo !== undefined) dbJob.insulation_info = (job as any).insulationInfo;
  if ((job as any).linkedInsulationJobId !== undefined) dbJob.linked_insulation_job_id = (job as any).linkedInsulationJobId;
  if (job.costs !== undefined) dbJob.costs = job.costs;
  if (job.privateNotes !== undefined) dbJob.private_notes = job.privateNotes;
  
  return dbJob;
};

// Create a linked fan job from an existing job
export const createLinkedFanJob = async (
  sourceJob: Job,
  fanInfo: FanInfo[],
  fanCategoryId: string
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
    createdAt: new Date(),
    dateIssued: new Date(),
    bookedDate: null,
    isFlexibleBooking: false,
    bookingNotes: '',
    completionDate: null,
    attachments: [],
    status: 'pending',
    fanInfo: fanInfo,
    linkedFanJobId: null,
    insulationInfo: null,
    linkedInsulationJobId: null,
    costs: null,
    privateNotes: '',
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
  fanCategoryId: string
): Promise<{ linkedFanJobId: string; created: boolean }> => {
  const fanDescription = fanInfo.map(fan => 
    `${fan.type} x${fan.quantity}${fan.location ? ` - ${fan.location}` : ''}`
  ).join('\n');

  // Check if a linked fan job already exists
  if (sourceJob.linkedFanJobId) {
    // Update existing fan job
    const { error } = await supabase
      .from('jobs')
      .update({
        fan_info: fanInfo as unknown as Json,
        description: fanDescription,
      })
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
    createdAt: new Date(),
    dateIssued: new Date(),
    bookedDate: null,
    isFlexibleBooking: false,
    bookingNotes: '',
    completionDate: null,
    attachments: [],
    status: 'pending',
    fanInfo: fanInfo,
    linkedFanJobId: null,
    insulationInfo: null,
    linkedInsulationJobId: null,
    costs: null,
    privateNotes: '',
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

// Sync (create or update) a linked insulation job based on manual edits
export const syncLinkedInsulationJob = async (
  sourceJob: Job,
  insulationInfo: InsulationInfo[],
  insulationCategoryId: string
): Promise<{ linkedInsulationJobId: string; created: boolean }> => {
  const insulationDescription = insulationInfo.map(unit => 
    `${unit.type} x${unit.quantity}${unit.location ? ` - ${unit.location}` : ''}${unit.thickness ? ` (${unit.thickness})` : ''}`
  ).join('\n');

  // Check if a linked insulation job already exists
  if (sourceJob.linkedInsulationJobId) {
    // Update existing insulation job
    const { error } = await supabase
      .from('jobs')
      .update({
        insulation_info: insulationInfo as unknown as Json,
        description: insulationDescription,
      })
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
    jobNumber: `${sourceJob.jobNumber}-INS`,
    name: sourceJob.name,
    address: sourceJob.address,
    phoneNumber: sourceJob.phoneNumber,
    summaryOfWorks: `Insulation from ${sourceJob.jobNumber}`,
    description: insulationDescription,
    workItems: [],
    additionalWorks: [],
    team: null,
    team2: null,
    progress: 0,
    progressNotes: '',
    isCompleted: false,
    isOngoing: false,
    createdAt: new Date(),
    dateIssued: new Date(),
    bookedDate: null,
    isFlexibleBooking: false,
    bookingNotes: '',
    completionDate: null,
    attachments: [],
    status: 'pending',
    fanInfo: null,
    linkedFanJobId: null,
    insulationInfo: insulationInfo,
    linkedInsulationJobId: null,
    costs: null,
    privateNotes: '',
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
