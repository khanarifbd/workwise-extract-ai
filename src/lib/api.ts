import { supabase } from "@/integrations/supabase/client";
import { Job, WorkItem, FanInfo } from "@/types/job";
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

// Extract fans from job description
export const extractFansWithAI = async (description: string, workItems: WorkItem[]): Promise<{ hasFans: boolean; fans: FanInfo[]; totalFanCount: number } | null> => {
  try {
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
  } catch (error) {
    console.error('Error extracting fans:', error);
    throw error;
  }
};

export const extractPDFWithAI = async (pdfText: string): Promise<Partial<Job> | null> => {
  try {
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
      throw new Error(data?.error || 'Failed to extract PDF');
    }

    return data.data;
  } catch (error) {
    console.error('Error extracting PDF:', error);
    throw error;
  }
};

export const extractImageWithAI = async (imageBase64: string, mimeType: string): Promise<Partial<Job> | null> => {
  try {
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
      throw new Error(data?.error || 'Failed to extract image');
    }

    return data.data;
  } catch (error) {
    console.error('Error extracting image:', error);
    throw error;
  }
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
    const headers = await getAuthHeaders();
    const { data, error } = await supabase.functions.invoke('send-whatsapp', {
      body: { 
        teamName,
        whatsappGroup,
        jobDetails
      },
      headers
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
export const mapDatabaseJobToJob = (dbJob: any): Job => ({
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
  progress: dbJob.progress || 0,
  progressNotes: dbJob.progress_notes || '',
  isCompleted: dbJob.is_completed || false,
  dateIssued: dbJob.date_issued ? new Date(dbJob.date_issued) : new Date(),
  bookedDate: dbJob.booked_date ? new Date(dbJob.booked_date) : null,
  isFlexibleBooking: dbJob.is_flexible_booking || false,
  bookingNotes: dbJob.booking_notes || '',
  startDate: dbJob.start_date ? new Date(dbJob.start_date) : null,
  completionDate: dbJob.completion_date ? new Date(dbJob.completion_date) : null,
  attachments: dbJob.attachments || [],
  status: dbJob.status || 'pending',
  fanInfo: dbJob.fan_info || null,
  linkedFanJobId: dbJob.linked_fan_job_id || null,
  costs: dbJob.costs || null,
});

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
  if (job.progress !== undefined) dbJob.progress = job.progress;
  if (job.progressNotes !== undefined) dbJob.progress_notes = job.progressNotes;
  if (job.isCompleted !== undefined) dbJob.is_completed = job.isCompleted;
  if (job.dateIssued !== undefined) dbJob.date_issued = job.dateIssued;
  if (job.bookedDate !== undefined) dbJob.booked_date = job.bookedDate;
  if (job.isFlexibleBooking !== undefined) dbJob.is_flexible_booking = job.isFlexibleBooking;
  if (job.bookingNotes !== undefined) dbJob.booking_notes = job.bookingNotes;
  if (job.startDate !== undefined) dbJob.start_date = job.startDate;
  if (job.completionDate !== undefined) dbJob.completion_date = job.completionDate;
  if (job.attachments !== undefined) dbJob.attachments = job.attachments;
  if (job.status !== undefined) dbJob.status = job.status;
  if (job.fanInfo !== undefined) dbJob.fan_info = job.fanInfo;
  if (job.linkedFanJobId !== undefined) dbJob.linked_fan_job_id = job.linkedFanJobId;
  if (job.costs !== undefined) dbJob.costs = job.costs;
  
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
    progress: 0,
    progressNotes: '',
    isCompleted: false,
    dateIssued: new Date(),
    bookedDate: null,
    isFlexibleBooking: false,
    bookingNotes: '',
    startDate: null,
    completionDate: null,
    attachments: [],
    status: 'pending',
    fanInfo: fanInfo,
    linkedFanJobId: null,
    costs: null,
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
    progress: 0,
    progressNotes: '',
    isCompleted: false,
    dateIssued: new Date(),
    bookedDate: null,
    isFlexibleBooking: false,
    bookingNotes: '',
    startDate: null,
    completionDate: null,
    attachments: [],
    status: 'pending',
    fanInfo: fanInfo,
    linkedFanJobId: null,
    costs: null,
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
