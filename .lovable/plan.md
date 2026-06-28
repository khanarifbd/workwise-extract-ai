## Goal
Make Command Center and main Genie share one authoritative metrics module, surface drift via a debug panel, and remove all mock/seed rows from the three Command pages so every figure is derived from real job data + the `command_events` table.

## 1. Canonical Genie Metrics module

Create `src/lib/genieMetrics.ts` — the **only** place job/flag counting rules live. It re-exports / supersedes today's `metricsIntegrity.ts` helpers and adds the rules currently scattered across `Index.tsx`, `StatsCards.tsx`, and `useCommandMetrics.ts`:

- `isComplete`, `isReferBack`, `isActive`, `isOverdue`, `isOpenFlag`
- `belongsToDM(job, categoryName)`, `belongsToAA(job, categoryName)` (A&A includes Roofing / Flooring / Fire Door / Carpentry trades)
- `completedOnDay`, `completedInRange`, `bookedOnDay`
- `categoryBreakdown(jobs, categories)` returning the per-silo CategoryBreakdown
- `summaryCounts(jobs)` returning the canonical Total / Complete / Active / Booked / Overdue figures that `StatsCards.tsx` should now consume
- `validateMetrics(jobs)` checksum (extended with `is_completed ↔ status` consistency check)

`metricsIntegrity.ts` becomes a thin re-export from `genieMetrics.ts` so existing imports keep working.

`useCommandMetrics.ts` is rewritten to be a pure wrapper around `genieMetrics.ts` — no recomputation inline.

`StatsCards.tsx` and any Genie callers that still recompute counts switch to `summaryCounts()` so the active/complete logic matches Command's.

## 2. Backend `command_events` table

Replace localStorage-only flags/notes/calls with a real table:

```text
command_events
├── id (uuid)
├── job_id (uuid, nullable — for free-text log lines)
├── job_number (text)
├── team (text)
├── kind (text)  -- 'flag' | 'note' | 'call' | 'training' | 'pattern' | 'signoff' | 'schedule'
├── severity (text)  -- 'urgent' | 'warning' | 'note'
├── category (text)  -- 'dm' | 'aa' | 'other'
├── title (text)
├── body (text)
├── metadata (jsonb)
├── resolved_at (timestamptz)
├── created_by (uuid)
├── created_at / updated_at
```

Admin-only RLS (read/write for admins, full access for service_role). Realtime enabled.

New hook `useCommandEvents(filter)` does live fetch + realtime subscription and exposes `add`, `resolve`, etc.

## 3. Remove seed data

`src/pages/DMJobTracker.tsx`, `src/pages/AAJobTracker.tsx`, `src/pages/LiveMonitoringLog.tsx`:

- Delete the `URGENT`, `IN_PROGRESS`, `COMPLETED`, `PIPELINE`, `SEED_FLAGS`, `SEED_QUALITY`, etc. constants.
- Source rows from `useCommandMetrics()` (jobs) + `useCommandEvents()`:
  - **Urgent Flags** = `command_events` where `kind='flag'` and `severity='urgent'` and not resolved (filtered by DM/AA silo).
  - **In Progress** = jobs where `belongsToDM/AA(j)` && `isActive(j)` && `status==='started'` (or has booked_date == today).
  - **Completed Today** = jobs where `belongsToDM/AA(j)` && `completedOnDay(j, today)`.
  - **Tomorrow Pipeline** = jobs booked tomorrow within the silo.
  - **Live Log entries** = full `command_events` stream.
- Remove `localStorage` persistence for notes/flags/etc; the dialogs `FlagJobDialog`, `LiveMonitoringLog` "Add entry" now write to `command_events`.
- Keep the existing dialogs (SignOff, Schedule, Call Log, Flag) — only swap their persistence layer.

## 4. Metrics integrity debug panel

New component `src/components/command/MetricsIntegrityPanel.tsx`:

- Always visible on the Command Center (collapsible card at the bottom, "Diagnostics").
- Calls `genieMetrics.validateMetrics(jobs)` and also reconciles each Command figure against its canonical equivalent using `assertCount`:
  - `Command.dm.completedToday` ↔ `genieMetrics.categoryBreakdown(...).dm.completedToday`
  - `Command.aa.completedToday` ↔ canonical equivalent
  - `Command.openFlags.length` ↔ canonical
  - `Command.overdueJobs.length` ↔ canonical
  - `StatsCards(active|complete|total)` ↔ `summaryCounts()`
- Renders a row per check: ✓ green when aligned, ✗ red with "shown vs canonical" when not.
- Shows a top-of-page **drift banner** (`Alert variant="destructive"`) when any check fails, with a "Show details" toggle that opens the panel.
- Lists the checksum errors from `validateMetrics`.

A `useMetricsReconciliation()` hook returns `{ ok, checks, errors }` and is consumed by the panel plus the banner.

## 5. Files touched

```text
src/lib/genieMetrics.ts                                (new)
src/lib/metricsIntegrity.ts                            (re-export shim)
src/hooks/useCommandMetrics.ts                         (rewrite as wrapper)
src/hooks/useCommandEvents.ts                          (new)
src/hooks/useMetricsReconciliation.ts                  (new)
src/components/command/MetricsIntegrityPanel.tsx      (new)
src/components/StatsCards.tsx                          (use summaryCounts)
src/pages/NavCommandCenter.tsx                         (mount panel + banner)
src/pages/DMJobTracker.tsx                             (remove seeds, live data)
src/pages/AAJobTracker.tsx                             (remove seeds, live data)
src/pages/LiveMonitoringLog.tsx                        (remove seeds, use events)
supabase migration                                     (command_events table)
```

## 6. Out of scope (will not change)

- Existing Genie behaviour and visual design of the trackers / Command Center.
- Auth, routing, theme picker.
- Job data shape — no schema changes to `jobs`.

## Confirmation needed
The Live Log and tracker rows will be **empty** for any team until someone files real flags / notes (or until live jobs exist matching the criteria). The historical mock entries (Shakthi N2640150 etc.) are removed permanently. OK to proceed?
