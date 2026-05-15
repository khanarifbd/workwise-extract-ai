## New Progressor Workspace

A single, full-screen "Progressor Workspace" that replaces the existing scattered progressor pages (`ProgressorPanel`, `ProgressorBookedDashboard`, `ProgressorTeamView`, etc.). One screen, stays open until the progressor explicitly closes it, with inline job editing, diary, notes, and trade booking integrated.

### 1. Route & Entry
- New route: `/progressor` (replaces current progressor landing).
- Old routes kept as redirects → `/progressor` so deep links don't break.
- Auth: existing `useProgressorAuth` (job_progressor + admin roles).
- Entry button on Admin header: "Progressor Workspace".

### 2. Layout (desktop-first, responsive)
```text
┌────────────────────────────────────────────────────────────────┐
│  Header: Progressor Workspace   [Diary] [Notes] [Trades] [×]   │
├──────────────┬─────────────────────────────────────────────────┤
│ LEFT PANEL   │  RIGHT PANEL                                    │
│ Job List     │  Selected Job Detail (inline editor)            │
│ ─────────    │  ─────────────────────────────────              │
│ Filters:     │  - Header: job#, name, address, team chips      │
│  • Date range│  - Tabs: Description | Notes | Media | Trades   │
│  • Team      │  - All progressor edits render in BLUE          │
│  • Search    │                                                 │
│              │  Inline edit — no modals, no navigation away.   │
│ Scrollable   │                                                 │
│ list of      │                                                 │
│ incomplete   │                                                 │
│ booked jobs  │                                                 │
└──────────────┴─────────────────────────────────────────────────┘
```
- Workspace is a fixed-position overlay (z-50) over the app. Closes only via the × button (no backdrop click, no ESC) — explicit close, as requested.
- Right panel is empty-state until a job is clicked; clicking a job in the left list loads it in the right panel without unmounting the workspace.

### 3. Job List (left panel)
**"Incomplete jobs" definition:** `booked_date IS NOT NULL AND is_completed = false AND status != 'complete'` AND not fully signed off by all assigned teams (uses existing `useSignOffStatus`).

Filters:
- Date range picker (from / to over `booked_date`); default = all upcoming + overdue.
- Quick chips: Today, This Week, Overdue, All.
- Team filter (multi).
- Free-text search (job#, name, address).

Each row shows: job#, tenant name, short address, booked date pill (red if overdue), assigned team badges, sign-off progress dots (e.g. 1/2).

### 4. Inline Job Detail (right panel)
Tabs:
- **Description** — view + edit job description. Saves go to `jobs.description`. Blue text styling for progressor edits.
- **Notes** — adds to `jobs.private_notes` (progressor-only stream); each new entry prefixed with timestamp + "Progressor". Rendered in blue.
- **Media** — reuses `ProgressorMediaUpload` to add photos/files; gallery shows existing.
- **Trades / Sub-tasks** — reuses `useSubTasks` + `AddSubTaskModal` logic inline (no modal — embedded form). Lists current sub-tasks with status, lets progressor book/edit trade slots.

All actions stay inside the workspace (no route changes).

### 5. Side panels (top-right buttons)
- **Diary** → slide-over panel showing booked jobs by date (reuses logic from `ProgressorBookedDashboard`).
- **Notes** → slide-over with progressor-wide notepad (`progressor_todos` + free notes per job).
- **Trades** → slide-over for `TradeCompaniesModal` (manage trade companies/contacts).

These slide in from the right, overlay the right panel, close on × — workspace itself stays open underneath.

### 6. Blue progressor text
- New CSS token `--progressor-text` (HSL blue, e.g. `217 91% 55%`) added to `index.css`, mapped to a `text-progressor` Tailwind utility in `tailwind.config.ts`.
- All progressor-authored text (description edits, notes, sub-task notes) rendered with `text-progressor font-medium`. Admin/team text unchanged.
- We tag progressor edits by prefixing notes with `[Progressor – {name} {timestamp}]` so the source is clear even outside the workspace.

### 7. Removed / deprecated UI
- `ProgressorPanel`, `ProgressorTeamView`, `ProgressorBookedSection`, `ProgressorBookedDashboard` pages → replaced by `/progressor` workspace. Files kept for now but unmounted from routes; can be deleted in a follow-up.
- Old "Progressor" buttons in Admin header point to the new workspace.

### 8. Files

**New:**
- `src/pages/ProgressorWorkspace.tsx` — top-level workspace shell.
- `src/components/progressor/workspace/JobListPanel.tsx`
- `src/components/progressor/workspace/JobDetailPanel.tsx`
- `src/components/progressor/workspace/DescriptionTab.tsx`
- `src/components/progressor/workspace/NotesTab.tsx`
- `src/components/progressor/workspace/MediaTab.tsx`
- `src/components/progressor/workspace/TradesTab.tsx`
- `src/components/progressor/workspace/DiarySlideOver.tsx`
- `src/components/progressor/workspace/NotesSlideOver.tsx`
- `src/components/progressor/workspace/TradesSlideOver.tsx`
- `src/hooks/useProgressorIncompleteJobs.ts` — fetch + filter + realtime.

**Edited:**
- `src/App.tsx` — add `/progressor` route, redirect old paths.
- `src/index.css` — add `--progressor-text` HSL token.
- `tailwind.config.ts` — map `text-progressor` color.
- `src/components/Header.tsx` — replace progressor link with new workspace entry.

### 9. Verification
- Manual flow: log in as progressor → workspace opens → filter by date → click job → edit description → save → verify blue text persists on admin view → add note, upload photo, book a trade sub-task → confirm all writes via DB query → close workspace explicitly.
- Realtime: ensure `jobs`, `job_sub_tasks`, `team_sign_offs` updates reflect in the list without refresh.

### Out of scope
- Deleting the old progressor pages from the repo (deprecated only this round).
- Mobile-specific layout polish beyond responsive stacking.
- Permission changes — uses existing `is_job_progressor` RLS.
