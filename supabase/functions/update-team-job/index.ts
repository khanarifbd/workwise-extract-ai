import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface WorkItemUpdate {
  isConfirmed?: boolean;
  hasModification?: boolean;
  variation?: string;
}

interface DocumentUpload {
  name: string;
  url: string;
  type: string;
}

interface UpdateJobRequest {
  teamId: string;
  teamName: string;
  jobId: string;
  languagePreference?: string; // User's language for translation
  updates: {
    status?: string;
    progress?: number;
    notes?: string;
    photos?: string[];
    videos?: string[];
    documents?: DocumentUpload[];
    workItemUpdates?: Record<string, WorkItemUpdate>;
    isCompletion?: boolean; // Flag to indicate this is a job completion/sign-off
  };
}

interface Attachment {
  id: string;
  name: string;
  type: 'image' | 'video' | 'document';
  url: string;
  path?: string;
  uploadedAt: string;
  uploadedBy?: string;
  category?: string; // 'team-photo', 'team-video', 'team-document'
}

// Rate limiting configuration
interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();
const RATE_LIMIT_MAX_REQUESTS = 50; // 50 updates per team per hour
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

function checkRateLimit(teamId: string): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  let entry = rateLimitStore.get(teamId);
  
  // Clean up old entries
  for (const [key, e] of rateLimitStore.entries()) {
    if (e.resetAt < now) rateLimitStore.delete(key);
  }
  
  if (!entry || entry.resetAt < now) {
    entry = { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS };
    rateLimitStore.set(teamId, entry);
    return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - 1, resetAt: entry.resetAt };
  }
  
  if (entry.count >= RATE_LIMIT_MAX_REQUESTS) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }
  
  entry.count++;
  return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - entry.count, resetAt: entry.resetAt };
}

// Translate text using Lovable AI
async function translateToEnglish(text: string, sourceLanguage: string): Promise<string> {
  if (!text || sourceLanguage === 'en') return text;
  
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY) {
    console.error('LOVABLE_API_KEY not configured, skipping translation');
    return text;
  }

  try {
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { 
            role: 'system', 
            content: `You are a professional translator. Translate the given text from ${sourceLanguage} to English accurately while preserving the meaning and tone. Return ONLY the translated text, nothing else. If the text is already in English, return it unchanged.`
          },
          { role: 'user', content: text }
        ],
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      console.error('Translation API error:', response.status);
      return text;
    }

    const data = await response.json();
    const translated = data.choices?.[0]?.message?.content?.trim();
    return translated || text;
  } catch (error) {
    console.error('Translation error:', error);
    return text;
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Only allow POST
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse request body
    let body: UpdateJobRequest;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid JSON body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { teamId, teamName, jobId, languagePreference, updates } = body;

    // Rate limiting check (per team) - check early after parsing body
    if (teamId) {
      const rateLimit = checkRateLimit(teamId);
      
      if (!rateLimit.allowed) {
        const retryAfter = Math.ceil((rateLimit.resetAt - Date.now()) / 1000);
        console.log(`Rate limit exceeded for team: ${teamId}`);
        return new Response(
          JSON.stringify({ 
            error: "Too many requests. Please try again later.",
            retryAfterSeconds: retryAfter 
          }),
          { 
            status: 429, 
            headers: { 
              ...corsHeaders, 
              "Content-Type": "application/json",
              "Retry-After": String(retryAfter)
            } 
          }
        );
      }
    }

   
    console.log(`[update-team-job] Request received for job: ${jobId}`);
    console.log(`[update-team-job] Team: ${teamName} (${teamId})`);
    console.log(`[update-team-job] Photos count: ${updates?.photos?.length ?? 0}`);
    console.log(`[update-team-job] Videos count: ${updates?.videos?.length ?? 0}`);
    console.log(`[update-team-job] Documents count: ${updates?.documents?.length ?? 0}`);
    if (updates?.photos && updates.photos.length > 0) {
      console.log(`[update-team-job] Photo URLs:`, updates.photos.map((p: string) => p.startsWith('data:') ? 'base64' : p.substring(0, 100)));
    }

    // Validate input
    if (!teamId || !teamName || !jobId) {
      return new Response(
        JSON.stringify({ error: "Team ID, team name, and job ID are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate UUID format for jobId
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(jobId)) {
      return new Response(
        JSON.stringify({ error: "Invalid job ID format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate updates object
    if (!updates || typeof updates !== "object") {
      return new Response(
        JSON.stringify({ error: "Updates object is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate individual update fields
    if (updates.status && typeof updates.status !== "string") {
      return new Response(
        JSON.stringify({ error: "Invalid status format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (updates.progress !== undefined && (typeof updates.progress !== "number" || updates.progress < 0 || updates.progress > 100)) {
      return new Response(
        JSON.stringify({ error: "Progress must be a number between 0 and 100" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (updates.notes && typeof updates.notes !== "string") {
      return new Response(
        JSON.stringify({ error: "Invalid notes format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create Supabase client with service role key
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("Missing Supabase configuration");
      return new Response(
        JSON.stringify({ error: "Server configuration error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify the team exists and is active
    const { data: teamData, error: teamError } = await supabase
      .from("team_access_codes")
      .select("team_id, team_name, is_active")
      .eq("team_id", teamId)
      .eq("is_active", true)
      .maybeSingle();

    if (teamError || !teamData) {
      console.error("Team validation failed:", teamError?.message);
      return new Response(
        JSON.stringify({ error: "Invalid team session" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify the job belongs to this team
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("id, team, work_items, attachments")
      .eq("id", jobId)
      .maybeSingle();

    if (jobError || !job) {
      console.error("Job not found:", jobError?.message);
      return new Response(
        JSON.stringify({ error: "Job not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (job.team !== teamName) {
      console.error("Team mismatch: job belongs to", job.team, "but request from", teamName);
      return new Response(
        JSON.stringify({ error: "You don't have permission to update this job" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build update object for jobs table
    const jobUpdates: Record<string, unknown> = {};
    const timestamp = new Date().toISOString();
    
    if (updates.status) {
      jobUpdates.status = updates.status;
      // If status is 'complete', also set is_completed and completion_date
      if (updates.status === 'complete') {
        jobUpdates.is_completed = true;
        jobUpdates.completion_date = timestamp;
      }
    }
    
    if (updates.progress !== undefined) {
      jobUpdates.progress = updates.progress;
    }
    
    if (updates.notes) {
      // Translate notes to English if user has a different language preference
      let notesToSave = updates.notes;
      if (languagePreference && languagePreference !== 'en') {
        console.log(`Translating notes from ${languagePreference} to English`);
        notesToSave = await translateToEnglish(updates.notes, languagePreference);
        console.log('Notes translated successfully');
      }
      jobUpdates.progress_notes = notesToSave;
    }

    // Handle work item updates - merge with existing work items
    let updatedWorkItems: Array<Record<string, unknown>> = [];
    if (updates.workItemUpdates && Object.keys(updates.workItemUpdates).length > 0) {
      // Use the work_items from the job we already fetched
      const workItems = (job.work_items as Array<Record<string, unknown>>) || [];
      updatedWorkItems = workItems.map((item) => {
        const itemId = item.id as string;
        const itemUpdate = updates.workItemUpdates?.[itemId];
        if (itemUpdate) {
          return {
            ...item,
            isConfirmed: itemUpdate.isConfirmed ?? item.isConfirmed,
            hasModification: itemUpdate.hasModification ?? item.hasModification,
            variation: itemUpdate.variation ?? item.variation,
            // Add metadata for tracking
            lastUpdatedBy: teamName,
            lastUpdatedAt: timestamp,
          };
        }
        return item;
      });

      jobUpdates.work_items = updatedWorkItems;
      console.log(`Updated ${Object.keys(updates.workItemUpdates).length} work items for job ${jobId}`);
    }

    // Handle attachments - merge photos, videos, documents into the attachments array
    const existingAttachments = (job.attachments as Attachment[]) || [];
    const newAttachments: Attachment[] = [];
    
    // Process photos
    if (updates.photos && updates.photos.length > 0) {
      console.log(`Processing ${updates.photos.length} photos for job ${jobId}`);
      updates.photos.forEach((photoUrl, index) => {
        // Skip base64 images (they should have been uploaded to storage first)
        if (photoUrl.startsWith('data:')) {
          console.log(`Skipping base64 photo ${index + 1}`);
          return;
        }
        
        const photoId = `photo-${teamName}-${Date.now()}-${index}`;
        newAttachments.push({
          id: photoId,
          name: `Team Photo ${index + 1}`,
          type: 'image',
          url: photoUrl,
          uploadedAt: timestamp,
          uploadedBy: teamName,
          category: 'team-photo',
        });
      });
    }

    // Process videos
    if (updates.videos && updates.videos.length > 0) {
      console.log(`Processing ${updates.videos.length} videos for job ${jobId}`);
      updates.videos.forEach((videoUrl, index) => {
        // Skip base64 videos
        if (videoUrl.startsWith('data:')) {
          console.log(`Skipping base64 video ${index + 1}`);
          return;
        }
        
        const videoId = `video-${teamName}-${Date.now()}-${index}`;
        newAttachments.push({
          id: videoId,
          name: `Team Video ${index + 1}`,
          type: 'video',
          url: videoUrl,
          uploadedAt: timestamp,
          uploadedBy: teamName,
          category: 'team-video',
        });
      });
    }

    // Process documents
    if (updates.documents && updates.documents.length > 0) {
      console.log(`Processing ${updates.documents.length} documents for job ${jobId}`);
      updates.documents.forEach((doc, index) => {
        // Skip base64 documents
        if (doc.url.startsWith('data:')) {
          console.log(`Skipping base64 document ${index + 1}`);
          return;
        }
        
        const docId = `doc-${teamName}-${Date.now()}-${index}`;
        newAttachments.push({
          id: docId,
          name: doc.name,
          type: 'document',
          url: doc.url,
          uploadedAt: timestamp,
          uploadedBy: teamName,
          category: 'team-document',
        });
      });
    }

    // Merge new attachments with existing ones (avoid duplicates by URL)
    if (newAttachments.length > 0) {
      const existingUrls = new Set(existingAttachments.map(a => a.url));
      const uniqueNewAttachments = newAttachments.filter(a => !existingUrls.has(a.url));
      
      if (uniqueNewAttachments.length > 0) {
        jobUpdates.attachments = [...existingAttachments, ...uniqueNewAttachments];
        console.log(`Added ${uniqueNewAttachments.length} new attachments to job ${jobId}`);
      }
    }

    // Calculate sign-off stats
    const photosCount = updates.photos?.filter(p => !p.startsWith('data:'))?.length || 0;
    const videosCount = updates.videos?.filter(v => !v.startsWith('data:'))?.length || 0;
    const documentsCount = updates.documents?.filter(d => !d.url.startsWith('data:'))?.length || 0;
    const workItemsModified = updates.workItemUpdates 
      ? Object.values(updates.workItemUpdates).filter(u => u.hasModification).length 
      : 0;
    const workItemsTotal = updatedWorkItems.length || (job.work_items as Array<unknown>)?.length || 0;

    // If this is a job completion, add a completion record note and create admin notification
    if (updates.isCompletion || updates.status === 'complete') {
      const completionNote = `\n\n--- JOB SIGN-OFF ---\nCompleted by: ${teamName}\nDate: ${new Date(timestamp).toLocaleString()}\nWork Items Reviewed: ${workItemsTotal}\nPhotos: ${photosCount}\nVideos: ${videosCount}\nDocuments: ${documentsCount}`;
      
      jobUpdates.progress_notes = (updates.notes || '') + completionNote;
      console.log(`Job ${jobId} signed off by team ${teamName}`);

      // Get job details for notification
      const { data: jobDetails } = await supabase
        .from("jobs")
        .select("job_number, name")
        .eq("id", jobId)
        .single();

      // Create sign-off notification for admin
      const { error: notifError } = await supabase
        .from("team_sign_off_notifications")
        .insert({
          job_id: jobId,
          job_number: jobDetails?.job_number || 'Unknown',
          job_name: jobDetails?.name || 'Unknown',
          team_id: teamId,
          team_name: teamName,
          photos_count: photosCount,
          videos_count: videosCount,
          documents_count: documentsCount,
          work_items_modified: workItemsModified,
          work_items_total: workItemsTotal,
          progress_notes: updates.notes || null,
        });

      if (notifError) {
        console.error("Failed to create sign-off notification:", notifError.message);
        // Don't fail the request, just log
      } else {
        console.log(`Sign-off notification created for admin - job ${jobId}`);
      }
    }

    // Update the job
    if (Object.keys(jobUpdates).length > 0) {
      const { error: updateError } = await supabase
        .from("jobs")
        .update(jobUpdates)
        .eq("id", jobId);

      if (updateError) {
        console.error("Failed to update job:", updateError.message);
        return new Response(
          JSON.stringify({ error: "Failed to update job" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Record the update in team_job_updates for audit trail
    const { error: recordError } = await supabase
      .from("team_job_updates")
      .insert({
        team_id: teamId,
        job_id: jobId,
        status: updates.status || null,
        progress: updates.progress || null,
        notes: updates.notes || null,
        photos: updates.photos?.filter(p => !p.startsWith('data:')) || null,
        updated_by: teamName,
      });

    if (recordError) {
      console.error("Failed to record update:", recordError.message);
      // Don't fail the request, just log the error
    }

    console.log(`Job ${jobId} updated successfully by team ${teamName}`);

    return new Response(
      JSON.stringify({ 
        success: true,
        message: updates.isCompletion ? 'Job signed off and all data transferred' : 'Job updated successfully',
        summary: {
          workItemsUpdated: updates.workItemUpdates ? Object.keys(updates.workItemUpdates).length : 0,
          photosAdded: newAttachments.filter(a => a.type === 'image').length,
          videosAdded: newAttachments.filter(a => a.type === 'video').length,
          documentsAdded: newAttachments.filter(a => a.type === 'document').length,
          isComplete: updates.status === 'complete',
        }
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
