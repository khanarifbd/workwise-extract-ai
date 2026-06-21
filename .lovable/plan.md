# Plan

Two independent workstreams. I'll do (1) first because it affects every login, then (2) in dependency order per trade.

---

## 1. Faster login + first-paint on The Genie

**Goal:** From entering credentials → seeing a populated job table, cut wall-clock time. Most of the perceived slowness on first load comes from data fetching, not auth.

### Investigation steps
- Measure: open Network panel via Playwright after auth, list all `/rest/v1/jobs*` and `functions/v1/*` calls firing on Index mount, with their durations and payload sizes.
- Check `src/hooks/useJobs.ts` for: page size, whether it pulls all 815 jobs in one shot, whether `select('*')` pulls heavy columns (descriptions, work_items, fire_door_info, fan_info, etc.), and whether realtime subscribes before the initial fetch resolves.
- Check `src/pages/Index.tsx` (1,955 lines) for serial `useEffect` waterfalls and any blocking modals/spinners.
- Check `useAdminAuth.ts` for redundant `getUser()` round-trips (prior turns already added retry logic — verify it's not over-eager).

### Likely fixes (apply only the ones evidence supports)
- Add a Postgres index on `jobs.date_issued` and `jobs.booked_date` if `slow_queries` shows seq-scans.
- Trim the initial `select` to columns the table actually renders; lazy-load `work_items`, `fire_door_info`, `fan_info`, `insulation_info`, `roofing_info`, `flooring_info`, `ongoing_notes` only when a row is expanded.
- Move the current-month folder fetch to the top, defer prior months until the user clicks them (project memory says only current month is visible by default — confirm this is actually deferred).
- Replace any `await`-chain on mount with parallel `Promise.all`.
- React Query: ensure `staleTime` is non-zero so a quick re-login uses cache.
- Skeleton in place of a full-screen spinner so the shell renders immediately.

**Out of scope:** changing auth providers, adding pagination UI, redesigning Index.

---

## 2. End-to-end verify + fix five identification features

Each trade has **two independent capabilities**:
  - **(a) Scan & present** — AI reads description/work items, returns findings, surfaces in the editor.
  - **(b) Create linked folder/job** — user clicks "Create linked …", a suffix-named sub-job is created and bidirectionally linked.

### Per-trade checks

| Trade        | Edge fn (scan)         | Linked-job API                  | Notes |
|--------------|------------------------|---------------------------------|-------|
| Fan          | `extract-fans`         | `createLinkedFanJob` (suffix `-FAN`)    | Has scan fn ✔ |
| Roofing      | `extract-roofing`      | `createLinkedRoofingJob` (`-ROOF`)      | Has scan fn ✔ |
| Flooring     | `extract-flooring`     | `createLinkedFlooringJob` (`-FLOOR`)    | Has scan fn ✔ |
| Insulation   | `extract-insulation`   | linked via existing logic               | Has scan fn ✔ |
| Fire Door    | **no `extract-*` fn**  | `createLinkedFireDoorJob` (`-DOOR`)     | **Fire door has no AI scan function — needs verification whether scan is client-side keyword detection (project memory mentions carpenter-specific green-theme) or actually missing** |

### Test protocol (per trade)
1. Open a real job in the editor.
2. Click "Scan" / equivalent → confirm findings JSON returned, no 401/403/429/402.
3. Confirm findings render in the editor (qty, type, location).
4. Click "Create linked …" → confirm:
   - Sub-job row created with correct suffix in job_number.
   - `linked_*_job_id` written on parent.
   - Parent's `date_issued` syncs to child (per memory).
5. Edit parent's `booked_date` → confirm child syncs (per `sync_job_booked_date_from_subtasks` trigger / linked-job sync rule).
6. Delete the test linked job.

I'll drive 1-6 via Playwright against the running preview, capturing screenshots and the network/console at each step.

### Fix policy
- If a scan fn returns auth error: align with the working pattern in `extract-fans` (admin check + zod validation already in place — those look correct).
- If Fire Door has no AI scan: confirm with you whether you want me to **add an `extract-fire-doors` edge function** mirroring `extract-fans`, or whether the existing keyword detection is intentional.
- If linked-job creation fails: inspect `createLinked*Job` in `src/lib/api.ts` (lines 2021-2140 for fire door) for the same pattern, fix divergence.

---

## Open question before I start

**Fire Door identification:** there's no `extract-fire-doors` edge function. Do you want me to:
  - **A.** Add one (AI scan mirroring fans/roofing/flooring), or
  - **B.** Leave scanning as-is (client-side keyword detection) and only fix linked-job creation?

If you don't answer, I'll assume **A** (add the missing function) since you said "fully test … the identification feature is working" for all five.

---

## Order of work
1. Perf investigation + targeted fixes (workstream 1).
2. Run the per-trade Playwright protocol against the live preview.
3. Fix any failures surfaced in step 2, including the Fire Door gap per your choice above.
4. Re-run the protocol; report results with screenshots.
