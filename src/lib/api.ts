import { supabase } from "@/integrations/supabase/client";
import { Job, WorkItem } from "@/types/job";
import { SOR_CODES_DATABASE } from "@/data/sorCodes";

// Generate SOR codes context for AI
const getSORCodesContext = () => {
  return SOR_CODES_DATABASE.map(code => 
    `${code.code}: ${code.description} (Category: ${code.category})`
  ).join('\n');
};

export const extractPDFWithAI = async (pdfText: string): Promise<Partial<Job> | null> => {
  try {
    const { data, error } = await supabase.functions.invoke('extract-pdf', {
      body: { 
        pdfText,
        sorCodesContext: getSORCodesContext()
      }
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
    const { data, error } = await supabase.functions.invoke('extract-image', {
      body: { 
        imageBase64,
        mimeType,
        sorCodesContext: getSORCodesContext()
      }
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
    const { data, error } = await supabase.functions.invoke('convert-description', {
      body: { 
        description,
        sorCodesContext: getSORCodesContext()
      }
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
): Promise<{ whatsappLink: string; notificationMessage: string } | null> => {
  try {
    const { data, error } = await supabase.functions.invoke('send-whatsapp', {
      body: { 
        teamName,
        whatsappGroup,
        jobDetails
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
      notificationMessage: data.notificationMessage
    };
  } catch (error) {
    console.error('Error sending WhatsApp:', error);
    throw error;
  }
};

// Database operations
export const fetchJobs = async (): Promise<Job[]> => {
  const { data, error } = await supabase
    .from('jobs')
    .select('*')
    .order('date_issued', { ascending: false });

  if (error) {
    console.error('Error fetching jobs:', error);
    throw error;
  }

  return (data || []).map(mapDatabaseJobToJob);
};

export const createJob = async (job: Omit<Job, 'id'>): Promise<Job> => {
  const dbJob = mapJobToDatabase(job);
  
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
const mapDatabaseJobToJob = (dbJob: any): Job => ({
  id: dbJob.id,
  jobNumber: dbJob.job_number,
  name: dbJob.name,
  address: dbJob.address || '',
  phoneNumber: dbJob.phone_number || '',
  summaryOfWorks: dbJob.summary_of_works || '',
  description: dbJob.description || '',
  workItems: dbJob.work_items || [],
  additionalWorks: dbJob.additional_works || [],
  team: dbJob.team || undefined,
  progress: dbJob.progress || 0,
  progressNotes: dbJob.progress_notes || '',
  isCompleted: dbJob.is_completed || false,
  dateIssued: dbJob.date_issued ? new Date(dbJob.date_issued) : new Date(),
  startDate: dbJob.start_date ? new Date(dbJob.start_date) : undefined,
  completionDate: dbJob.completion_date ? new Date(dbJob.completion_date) : undefined,
  attachments: dbJob.attachments || [],
});

const mapJobToDatabase = (job: Partial<Job>): any => {
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
  if (job.startDate !== undefined) dbJob.start_date = job.startDate;
  if (job.completionDate !== undefined) dbJob.completion_date = job.completionDate;
  if (job.attachments !== undefined) dbJob.attachments = job.attachments;
  
  return dbJob;
};
