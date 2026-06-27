import { supabase } from "@/integrations/supabase/client";
import {
  extractFansWithAI,
  extractRoofingWithAI,
  extractFlooringWithAI,
  extractInsulationWithAI,
  extractFireDoorsWithAI,
} from "@/lib/api";

export interface BackfillProgress {
  processed: number;
  total: number;
  found: {
    fans: number;
    roofing: number;
    flooring: number;
    insulation: number;
    fireDoors: number;
  };
  failures: number;
}

const SUFFIXES = ["-FAN", "-ROOF", "-FLOOR", "-INSUL", "-DOOR"];

const isParentJobNumber = (jn: string | null | undefined) =>
  !jn || !SUFFIXES.some((s) => jn.endsWith(s));

async function withRetry<T>(fn: () => Promise<T>, label: string, delay = 2500): Promise<T | null> {
  try {
    return await fn();
  } catch {
    await new Promise((r) => setTimeout(r, delay));
    try {
      return await fn();
    } catch (e) {
      console.error(`[backfill] ${label} failed after retry`, e);
      return null;
    }
  }
}

export async function backfillTradeScans(
  onProgress?: (p: BackfillProgress) => void,
): Promise<BackfillProgress> {
  // Fetch all parent jobs missing any of the 5 *_info markers
  const { data, error } = await supabase
    .from("jobs")
    .select("id, job_number, description, summary_of_works, work_items, fan_info, roofing_info, flooring_info, insulation_info, fire_door_info")
    .or("fan_info.is.null,roofing_info.is.null,flooring_info.is.null,insulation_info.is.null,fire_door_info.is.null")
    .limit(5000);

  if (error) throw error;

  const parents = (data || []).filter((j: any) => isParentJobNumber(j.job_number));
  const progress: BackfillProgress = {
    processed: 0,
    total: parents.length,
    found: { fans: 0, roofing: 0, flooring: 0, insulation: 0, fireDoors: 0 },
    failures: 0,
  };
  onProgress?.(progress);

  // Process serially in small batches to avoid rate limits
  for (const job of parents) {
    const desc: string = job.description || job.summary_of_works || "";
    const works = (Array.isArray(job.work_items) ? job.work_items : []) as any[];
    if (!desc.trim()) {
      progress.processed++;
      onProgress?.({ ...progress });
      continue;
    }

    const updates: Record<string, any> = {};
    let hadFailure = false;

    if (!job.fan_info) {
      const r = await withRetry(() => extractFansWithAI(desc, works), "fans");
      if (r) {
        if (r.hasFans && r.fans.length > 0) { updates.fan_info = r.fans; progress.found.fans++; }
        else updates.fan_info = [{ type: "__SCANNED_NO_FANS__", quantity: 0, location: "" }];
      } else hadFailure = true;
    }
    if (!job.roofing_info) {
      const r = await withRetry(() => extractRoofingWithAI(desc, works), "roofing");
      if (r) {
        if (r.hasRoofing && r.roofing.length > 0) { updates.roofing_info = r.roofing; progress.found.roofing++; }
        else updates.roofing_info = [{ type: "__SCANNED_NO_ROOFING__", quantity: 0, location: "" }];
      } else hadFailure = true;
    }
    if (!job.flooring_info) {
      const r = await withRetry(() => extractFlooringWithAI(desc, works), "flooring");
      if (r) {
        if (r.hasFlooring && r.flooring.length > 0) { updates.flooring_info = r.flooring; progress.found.flooring++; }
        else updates.flooring_info = [{ type: "__SCANNED_NO_FLOORING__", quantity: 0, location: "" }];
      } else hadFailure = true;
    }
    if (!job.insulation_info) {
      const r = await withRetry(() => extractInsulationWithAI(desc, works), "insulation");
      if (r) {
        if (r.hasInsulation && r.insulation.length > 0) { updates.insulation_info = r.insulation; progress.found.insulation++; }
        else updates.insulation_info = [{ type: "__SCANNED_NO_INSULATION__", quantity: 0, location: "" }];
      } else hadFailure = true;
    }
    if (!job.fire_door_info) {
      const r = await withRetry(() => extractFireDoorsWithAI(desc, works), "firedoors");
      if (r) {
        if (r.hasFireDoors && r.fireDoors.length > 0) { updates.fire_door_info = r.fireDoors; progress.found.fireDoors++; }
        else updates.fire_door_info = [{ type: "__NO_FIRE_DOORS__", quantity: 0, location: "" }];
      } else hadFailure = true;
    }

    if (Object.keys(updates).length > 0) {
      const { error: upErr } = await supabase.from("jobs").update(updates as any).eq("id", job.id);
      if (upErr) {
        console.error("[backfill] DB update failed", job.id, upErr);
        hadFailure = true;
      }
    }
    if (hadFailure) progress.failures++;
    progress.processed++;
    onProgress?.({ ...progress });

    // Small delay between jobs to spare the AI rate-limit
    await new Promise((r) => setTimeout(r, 250));
  }

  return progress;
}
