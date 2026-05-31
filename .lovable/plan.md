## Phase 1 (remaining): Feature 2 + Feature 3

### Feature 2 — Completion Lock System
In `ProgressorJobExpandedContent.tsx` (extending the existing `handleJobSignOff` guard from Phase 1):

Add a pre-close validator that checks:
1. **Before Photos** — at least 1 photo in a folder named/tagged "Before" (via `photo_folders` + `team_job_updates.photos`), OR fallback: any photo flagged before sign-off
2. **After Photos** — at least 1 photo in "After" folder
3. **Notes added** — `progress_notes` non-empty OR at least one `team_job_updates.notes`
4. **Tenant signature** — NEW field required

→ Add `tenant_signature_url` (text, nullable) to `jobs` table (data URL / storage path).
→ Add a signature capture pad (react-signature-canvas style, lightweight inline SVG) in the CONTROL tab.

If any check fails, render a red banner: **"🔴 JOB CANNOT BE CLOSED – INCOMPLETE DATA"** with a checklist showing ✅/❌ per requirement, and disable the "Close Job" / sign-off button.

### Feature 3 — Problem Type Visibility (left panel)
In the progressor job list item component:
- Read latest `job_control_records.problem_type` per job (batched fetch, cached)
- Show emoji icon: 📞 Tenant / 🔧 Trade / 📸 Upload / ⚠️ Complaint / ⏱ Delay
- Status colour dot (from existing status)
- Days Open counter: `floor((now - date_issued) / day)`
- Assigned team chip (already present — keep)

---

## Phase 2 — Control Dashboard

New route `/control-dashboard` (top-level nav link, admin + progressor access):

**1. Summary Strip** (clickable filter chips):
- Total Jobs, At Risk, Problem Jobs (any open control record), Awaiting Action (status=waiting), Ready to Close (all checks pass but not closed)

**2. Problem Breakdown** — counts grouped by `job_control_records.problem_type` where status≠completed

**3. At-Risk Jobs List** — jobs matching ANY:
- No `updated_at` change in 48h
- Category/tag = emergency
- `booked_date` < now (past deadline)

**4. Team Performance Summary** — per team from `team_notification_settings`:
- Completion Rate = signed-off / assigned (last 30 days)
- Upload Compliance = jobs with photos / total assigned
- Complaints = control records with problem_type='complaint'
- Jobs Completed (period)

All counts derived from the **same `jobs` query** used elsewhere (via existing hooks) to preserve metric accuracy.

---

### Technical notes
- New migration: `ALTER TABLE jobs ADD COLUMN tenant_signature_url text` and `ADD COLUMN tenant_signature_signed_at timestamptz`.
- New component: `src/pages/ControlDashboard.tsx`, `src/components/progressor/CompletionChecklist.tsx`, `src/components/progressor/TenantSignaturePad.tsx`, `src/components/progressor/ProblemTypeBadge.tsx`.
- Reuse existing job hooks; do not duplicate fetch logic.
- Add route in `App.tsx` and nav link in progressor header.

### Open questions (please confirm before I build)
1. **Signature**: capture as drawn-pad image (stored as data URL in `tenant_signature_url`), or typed-name + checkbox?
2. **Before/After photos**: should I rely on the existing `photo_folders` (folders named "Before"/"After"), or add explicit boolean tags?
3. **Control Dashboard access**: progressors + admins, or admins only?
4. Should Phase 2 be built **now in same turn** as Phase 1 remaining, or do you want to review Phase 1 first?