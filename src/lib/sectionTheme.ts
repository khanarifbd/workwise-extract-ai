/**
 * Section theme system — lets Nav customize each section's background
 * (light-blue palette) and previews changes instantly across pages.
 *
 * Class strings are emitted literally so Tailwind's JIT picks them up.
 */
import { useEffect, useState, useSyncExternalStore } from "react";

export type SectionPresetId =
  | "sky" | "powder" | "ice" | "azure"
  | "arctic" | "mist" | "glacial" | "denim";

export interface SectionPreset {
  id: SectionPresetId;
  label: string;
  swatch: string;      // small dot in picker
  className: string;   // applied to the section wrapper
}

export const SECTION_PRESETS: SectionPreset[] = [
  {
    id: "sky", label: "Sky",
    swatch: "bg-sky-200 border-sky-400",
    className: "bg-sky-100 border-sky-400 ring-1 ring-sky-200/60 dark:bg-sky-950/30 dark:border-sky-700 dark:ring-sky-900/40",
  },
  {
    id: "powder", label: "Powder",
    swatch: "bg-blue-100 border-blue-300",
    className: "bg-blue-50 border-blue-300 ring-1 ring-blue-200/60 dark:bg-blue-950/30 dark:border-blue-700 dark:ring-blue-900/40",
  },
  {
    id: "ice", label: "Ice",
    swatch: "bg-cyan-100 border-cyan-300",
    className: "bg-cyan-50 border-cyan-300 ring-1 ring-cyan-200/60 dark:bg-cyan-950/30 dark:border-cyan-700 dark:ring-cyan-900/40",
  },
  {
    id: "azure", label: "Azure",
    swatch: "bg-sky-100 border-sky-300",
    className: "bg-sky-50 border-sky-300 ring-1 ring-sky-200/50 dark:bg-sky-950/20 dark:border-sky-800 dark:ring-sky-900/30",
  },
  {
    id: "arctic", label: "Arctic",
    swatch: "bg-slate-200 border-slate-300",
    className: "bg-slate-100 border-slate-300 ring-1 ring-slate-200/60 dark:bg-slate-900/40 dark:border-slate-700 dark:ring-slate-800",
  },
  {
    id: "mist", label: "Mist",
    swatch: "bg-indigo-100 border-indigo-300",
    className: "bg-indigo-50 border-indigo-300 ring-1 ring-indigo-200/60 dark:bg-indigo-950/30 dark:border-indigo-700 dark:ring-indigo-900/40",
  },
  {
    id: "glacial", label: "Glacial",
    swatch: "bg-teal-100 border-teal-300",
    className: "bg-teal-50 border-teal-300 ring-1 ring-teal-200/60 dark:bg-teal-950/30 dark:border-teal-700 dark:ring-teal-900/40",
  },
  {
    id: "denim", label: "Denim",
    swatch: "bg-sky-300 border-sky-500",
    className: "bg-sky-200 border-sky-500 ring-1 ring-sky-300/60 dark:bg-sky-900/40 dark:border-sky-600 dark:ring-sky-800",
  },
];

export const PRESET_BY_ID: Record<SectionPresetId, SectionPreset> =
  Object.fromEntries(SECTION_PRESETS.map(p => [p.id, p])) as Record<SectionPresetId, SectionPreset>;

/* ───────── Section registry — picker reads from here ───────── */

export interface SectionDescriptor {
  id: string;
  label: string;
  group: string;            // "Command Center" | "DM Tracker" | etc.
  defaultPreset: SectionPresetId;
}

const registry = new Map<string, SectionDescriptor>();
const registryListeners = new Set<() => void>();
let registrySnapshot: SectionDescriptor[] = [];

function notifyRegistry() { registryListeners.forEach(l => l()); }

export function registerSection(desc: SectionDescriptor) {
  const existing = registry.get(desc.id);
  if (existing && existing.label === desc.label && existing.group === desc.group && existing.defaultPreset === desc.defaultPreset) return;
  registry.set(desc.id, desc);
  registrySnapshot = Array.from(registry.values());
  notifyRegistry();
}

export function subscribeRegistry(l: () => void) {
  registryListeners.add(l);
  return () => registryListeners.delete(l);
}

export function snapshotRegistry(): SectionDescriptor[] {
  return registrySnapshot;
}

/* ───────── Selection store — persisted in localStorage ───────── */

const STORAGE_KEY = "command.sectionTheme.v1";

const readStore = (): Record<string, SectionPresetId> => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); }
  catch { return {}; }
};

let cache: Record<string, SectionPresetId> = readStore();
const storeListeners = new Set<() => void>();

const notifyStore = () => storeListeners.forEach(l => l());

export function getSectionPreset(id: string, fallback: SectionPresetId): SectionPresetId {
  return (cache[id] ?? fallback);
}

export function setSectionPreset(id: string, preset: SectionPresetId) {
  cache = { ...cache, [id]: preset };
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cache)); } catch {}
  notifyStore();
}

export function resetSectionPreset(id: string) {
  if (!(id in cache)) return;
  const next = { ...cache };
  delete next[id];
  cache = next;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cache)); } catch {}
  notifyStore();
}

export function resetAllPresets() {
  cache = {};
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
  notifyStore();
}

function subscribeStore(l: () => void) {
  storeListeners.add(l);
  return () => storeListeners.delete(l);
}

function snapshotStore() {
  return cache;
}

/* ───────── Hooks ───────── */

/** Registers a section and returns its current Tailwind class string. */
export function useSectionTone(id: string, label: string, group: string, defaultPreset: SectionPresetId): string {
  useEffect(() => {
    registerSection({ id, label, group, defaultPreset });
  }, [id, label, group, defaultPreset]);

  const store = useSyncExternalStore(subscribeStore, snapshotStore, snapshotStore);
  const presetId = store[id] ?? defaultPreset;
  return PRESET_BY_ID[presetId].className;
}

export function useRegistry(): SectionDescriptor[] {
  return useSyncExternalStore(subscribeRegistry, snapshotRegistry, snapshotRegistry);
}

export function useSelections(): Record<string, SectionPresetId> {
  return useSyncExternalStore(subscribeStore, snapshotStore, snapshotStore);
}
