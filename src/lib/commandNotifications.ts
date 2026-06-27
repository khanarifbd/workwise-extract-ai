// Lightweight notification store + realtime subscription for the command center.
// Uses a module-level subscriber list (no external deps) and persists to localStorage.
import { useSyncExternalStore, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export type CommandNotification = {
  id: string;
  title: string;
  body?: string;
  severity: "info" | "warning" | "urgent" | "success";
  jobId?: string;
  createdAt: number;
  read: boolean;
};

const KEY = "command_notifications_v1";
let items: CommandNotification[] = load();
const listeners = new Set<() => void>();

function load(): CommandNotification[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    return JSON.parse(raw).slice(0, 100);
  } catch { return []; }
}
function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(items.slice(0, 100))); } catch {}
}
function emit() { listeners.forEach((l) => l()); }

export function pushNotification(n: Omit<CommandNotification, "id" | "createdAt" | "read">) {
  const note: CommandNotification = {
    ...n,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    read: false,
  };
  items = [note, ...items].slice(0, 100);
  persist(); emit();
  // Browser notification (best-effort)
  if (typeof Notification !== "undefined" && Notification.permission === "granted") {
    try { new Notification(note.title, { body: note.body, tag: note.id }); } catch {}
  }
}

export function markAllRead() {
  items = items.map((i) => ({ ...i, read: true }));
  persist(); emit();
}
export function markRead(id: string) {
  items = items.map((i) => (i.id === id ? { ...i, read: true } : i));
  persist(); emit();
}
export function dismiss(id: string) {
  items = items.filter((i) => i.id !== id);
  persist(); emit();
}
export function clearAll() {
  items = [];
  persist(); emit();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}
function getSnapshot() { return items; }

export function useNotifications() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

// ----------------- Realtime subscription -----------------
let realtimeStarted = false;

export function useCommandRealtime() {
  useEffect(() => {
    if (realtimeStarted) return;
    realtimeStarted = true;

    const channel = supabase
      .channel("command-center-jobs")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "jobs" },
        (payload) => {
          const n: any = payload.new;
          const o: any = payload.old;
          const jobNum = n?.job_number || n?.id?.slice(0, 6);

          // Completion transition
          if (!o?.is_completed && n?.is_completed) {
            pushNotification({
              title: `Job #${jobNum} completed`,
              body: n?.team ? `Signed off by ${n.team}` : "Marked complete",
              severity: "success",
              jobId: n?.id,
            });
            return;
          }
          // Flag transition
          if (!o?.refer_back && n?.refer_back) {
            pushNotification({
              title: `Job #${jobNum} flagged`,
              body: n?.refer_back_reason || "Requires review",
              severity: "urgent",
              jobId: n?.id,
            });
            return;
          }
          // Status change
          if (o?.status !== n?.status && n?.status) {
            pushNotification({
              title: `Job #${jobNum}: ${n.status}`,
              severity: "info",
              jobId: n?.id,
            });
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "jobs" },
        (payload) => {
          const n: any = payload.new;
          pushNotification({
            title: `New job #${n?.job_number || ""}`,
            body: n?.address || undefined,
            severity: "info",
            jobId: n?.id,
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      realtimeStarted = false;
    };
  }, []);
}

// ----------------- Browser permission helper -----------------
export async function ensureNotificationPermission() {
  if (typeof Notification === "undefined") return "unsupported";
  if (Notification.permission === "default") {
    try { return await Notification.requestPermission(); } catch { return "denied"; }
  }
  return Notification.permission;
}
