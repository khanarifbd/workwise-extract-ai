## Materials & Trades Procurement Report (in-app feature)

Bring the one-off A&A report we generated into the Genie as a permanent, repeatable tool the admin/organiser can use on any selection of jobs.

### User flow

1. Admin opens **"Materials Report"** (new button in the Header / actions bar, plus a tab inside the Reports area — same pattern as Insulation Analytics & Weekly Leaderboard).
2. A modal opens: **Job Selector**
   - Filter strip: Category (DM/Voids/A&A/Fans/etc), Date range (logged date), Status (incomplete only by default), Team assigned / unassigned.
   - Searchable, multi-select list of jobs (job no, name, address, category, days-since-logged, booked date).
   - "Select all matching" + per-row checkboxes. Sticky footer shows count.
3. Click **Generate Report** → calls a new edge function `generate-materials-report` that:
   - Pulls the selected jobs (work_items, additional_works, description, dateIssued, bookedDate, status, category).
   - Computes an **urgency score** per job server-side (deterministic, NOT AI):
     - Critical: booked within 7 days OR logged 30+ days ago and not booked
     - High: booked within 14 days OR logged 21+ days ago
     - Medium: booked within 30 days OR logged 14+ days ago
     - Low: everything else
   - Sends the corpus to Lovable AI (`google/gemini-2.5-pro`) with a strict tool-calling JSON schema returning structured groups (no free-form markdown).
4. Report renders in a clean, printable two-column layout with **Download PDF** and **Copy to clipboard** actions. Saved to `materials_reports` table so admin can reopen past reports.

### Report layout (Awwwards-clean, scannable)

```text
┌─────────────────────────────────────────────────────┐
│ Materials & Trades Report     Generated 11 May 2026 │
│ 24 jobs · A&A · Incomplete                          │
├──────────────────┬──────────────────────────────────┤
│ URGENCY SUMMARY  │  TRADES TO ASSIGN                │
│ ● Critical  4    │  Plumber          12 jobs        │
│ ● High      9    │  Electrician       8 jobs        │
│ ● Medium    8    │  Tiler             6 jobs        │
│ ○ Low       3    │  Carpenter         5 jobs        │
├──────────────────┴──────────────────────────────────┤
│ MATERIALS TO ORDER                                  │
│                                                     │
│ ▸ Bathroom Suites                                   │
│   Comfort-height WC ········· 1   ● Critical (231..)│
│   Thermostatic shower ······· 3   ● High            │
│ ▸ Grab Rails & Accessibility                        │
│   600mm grab rail ··········· 17  ● High            │
│   Keysafe ··················· 3   ● Medium          │
│ ▸ Flooring · Plumbing · Electrical · ...            │
│                                                     │
│ Each row expands → linked job numbers + per-job qty │
├─────────────────────────────────────────────────────┤
│ ACTION LIST (top of report, printable)              │
│ □ Order all Critical items today                    │
│ □ Assign Plumber to 4 critical jobs                 │
│ □ ...                                               │
└─────────────────────────────────────────────────────┘
```

Design tokens: existing semantic colours. Urgency dots: `destructive` (critical), `warning` (high), `primary` (medium), `muted` (low). Heavy use of whitespace, single H1, monospace for quantities, collapsible material groups, sticky urgency legend on scroll.

### Technical pieces

- **Migration** — `materials_reports` table: `id, created_at, created_by, job_ids uuid[], filters jsonb, report_data jsonb, title text`. RLS: admins manage; viewers select.
- **Edge function** `generate-materials-report` (verify_jwt = true):
  - Input: `{ jobIds: string[], title?: string }`
  - Computes urgency per job, builds compact corpus.
  - Calls Lovable AI with tool-calling schema (`materialGroups[]`, `tradeGroups[]`, `actionList[]`, `notes`). Each material item: `name, qty, unit, urgency, jobRefs[]`.
  - Persists to `materials_reports`, returns the structured JSON.
- **New components**
  - `src/components/MaterialsReportButton.tsx` — entry button (placed in Header next to other report buttons).
  - `src/components/MaterialsReportModal.tsx` — job selector with filters + multi-select.
  - `src/components/MaterialsReport.tsx` — rendered report (collapsible groups, urgency badges).
  - `src/components/MaterialsReportPDF.tsx` — jsPDF export using existing `downloadPDF` helper.
  - `src/hooks/useMaterialsReports.ts` — list/load/create/delete saved reports.
- **History drawer** — list of past reports inside the modal so admin can reopen any prior run.

### Out of scope for v1

- Auto-emailing the merchant.
- Editing line items inside the report (read-only; admin re-runs to refresh).
- Cost totals (the SOR-cost system already covers spend; this report is procurement-focused).
