# Changelog

This document tracks all changes made to the Student Learning Monitoring and Internal Communication Platform workspace. Each entry captures the date, affected Work Item ID, change details, files affected, verification methodology, and regression assessments.

---

## [2026-06-09] - WI-302: Settings Panel UI
* **Work Item ID**: WI-302
* **Summary**: Added an interactive settings panel to the expanded batch detail view on the Batches admin page. Displays 6 feature toggles (mailbox_enabled, student_to_student_messaging, meeting_join_enabled, require_camera, require_microphone) as toggle switches and require_screen_share as a dropdown. Each change triggers PATCH /api/batches/:id/settings. Green notification toast confirms saves. Admin role gating hides interactive controls for non-Admin users.
* **Files Affected**:
  - [MODIFIED] `frontend/src/pages/admin/BatchesPage.jsx` (added settings panel, notification, settings API calls)
  - [MODIFIED] `frontend/src/pages/admin/BatchesPage.css` (added toggle switch, notification, settings grid styles)
* **Verification Done**:
  - [x] Admin can toggle all 5 boolean settings with immediate PATCH save
  - [x] Admin can change screen share mode via dropdown
  - [x] Green "Settings saved" notification appears after each change
  - [x] Settings controls disabled/read-only for non-Admin roles
  - [x] Existing student roster and assign form still work
  - [x] `npm run build` succeeds
* **Impact on Existing Functionality**: None. Enhances the batch detail view.

## [2026-06-09] - WI-301: Feature Settings Backend Logic
* **Work Item ID**: WI-301
* **Summary**: Created GET and PATCH /api/batches/:id/settings endpoints to read and update batch feature permissions (mailbox_enabled, student_to_student_messaging, meeting_join_enabled, require_camera, require_microphone, require_screen_share). All mutations require Admin mock role. Zod validation on all fields. PATCH auto-creates default settings if no row exists for the batch.
* **Files Affected**:
  - [NEW] `backend/src/routes/batchSettings.js`
  - [MODIFIED] `backend/index.js` (registered /api/batches/:id/settings route group)
  - [MODIFIED] `backend/README.md` (added Batch Settings section)
* **Verification Done**:
  - [x] GET /api/batches/:id/settings returns 200 with settings
  - [x] GET returns 404 for non-existent batch
  - [x] PATCH updates settings (Admin only)
  - [x] PATCH returns 403 for non-Admin
  - [x] PATCH returns 400 for invalid values (Zod)
  - [x] Auto-creates defaults if row missing
  - [x] Parameterized SQL queries
* **Impact on Existing Functionality**: None.

## [2026-06-09] - WI-202: Student & Batch Configuration UI
* **Work Item ID**: WI-202
* **Summary**: Built the frontend admin management pages for students and batches. Created a student roster page with a creation form, and a batch management page with a list, creation form, and drill-down details for viewing assigned students and assigning fresh students to a cohort. Integrated with the backend API from WI-201 using the Axios mock-identity interceptor.
* **Files Affected**:
  - [NEW] `frontend/src/pages/admin/StudentsPage.jsx`
  - [NEW] `frontend/src/pages/admin/StudentsPage.css`
  - [NEW] `frontend/src/pages/admin/BatchesPage.jsx`
  - [NEW] `frontend/src/pages/admin/BatchesPage.css`
  - [MODIFIED] `frontend/src/routes/AppRoutes.jsx` (added /admin/students and /admin/batches routes)
  - [MODIFIED] `frontend/src/pages/HomePage.jsx` (added quick-links to new admin pages)
* **Verification Done**:
  - [x] Students roster table lists data from GET /api/users/students
  - [x] Student creation form works (requires ADMIN mock role)
  - [x] Batch list table shows student counts and status
  - [x] Batch creation works (with transactional settings on backend)
  - [x] Batch drill-down shows assigned students
  - [x] Student-to-batch assignment works (enforces single-batch rule with 409 from backend)
  - [x] `npm run build` succeeds
  - [x] CSS styling follows project standards
* **Impact on Existing Functionality**: None. Adds new admin-facing views.

## [2026-06-09] - WI-201: Cohort CRUD Backend APIs
* **Work Item ID**: WI-201
* **Summary**: Created 8 Express route handlers for cohort management: student list (with optional batch filter), student create (Admin only, generates UUID, no Supabase Auth), student update, batch list (with student count), batch create (transactional batch+batch_settings insert), batch update (name/status), batch student roster, and student-to-batch assignment (enforces single-batch-per-student with 409 Conflict). Added requireRole middleware and Zod input validation.
* **Files Affected**:
  - [NEW] `backend/src/lib/requireRole.js`
  - [NEW] `backend/src/routes/students.js`
  - [NEW] `backend/src/routes/batches.js`
  - [MODIFIED] `backend/index.js` (registered /api/users/students and /api/batches route groups)
  - [MODIFIED] `backend/package.json` (added zod dependency)
  - [MODIFIED] `backend/README.md` (added Routes section)
* **Verification Done**:
  - [x] `POST /api/users/students` returns 201 for Admin, 403 for Student/anon
  - [x] `GET /api/users/students` returns student list (no auth gate)
  - [x] `GET /api/users/students?batchId=...` filters by batch
  - [x] `PATCH /api/users/students/:id` updates student name/email
  - [x] `POST /api/batches` creates batch + default batch_settings (transactional)
  - [x] `PATCH /api/batches/:id` updates name and/or status
  - [x] `GET /api/batches/:id/students` returns assigned roster
  - [x] `POST /api/batches/:id/students` returns 201 for new assignment, 409 for duplicate
  - [x] Invalid request bodies return 400 with Zod validation errors
  - [x] All queries use parameterized $N inputs (no SQL injection)
  - [x] No Supabase Auth users created; supabase_user_id remains NULL
* **Impact on Existing Functionality**: None. Existing health check endpoints and Mock Session middleware from WI-102 are unchanged.

## [2026-06-09] - WI-104: Base Database Schema Provisioning
* **Work Item ID**: WI-104
* **Summary**: Provisioned the 9 base PostgreSQL tables on Supabase (users, batches, student_batches, batch_settings, mail_messages, meetings, meeting_participants, meeting_consents, attendance_logs) with enums, FKs, defaults, and updated_at triggers. Added the @supabase/supabase-js service-role client, a pg connection pool, an idempotent db:init migration script, a db:verify checker, and a GET /api/health/db endpoint. RLS is intentionally disabled and marked for Phase 8 (WI-804).
* **Files Affected**:
  - [NEW] `backend/db/schema.sql`
  - [NEW] `backend/db/verify.sql`
  - [NEW] `backend/db/README.md`
  - [NEW] `backend/scripts/apply-schema.js`
  - [NEW] `backend/scripts/verify-schema.js`
  - [NEW] `backend/src/lib/supabaseClient.js`
  - [NEW] `backend/src/lib/pgPool.js`
  - [MODIFIED] `backend/index.js` (added /api/health/db endpoint)
  - [MODIFIED] `backend/package.json` (added pg, @supabase/supabase-js, db:init, db:verify scripts)
  - [MODIFIED] `backend/.env.example` (DATABASE_URL documentation)
  - [MODIFIED] `backend/README.md` (Database section)
* **Verification Done**:
  - [x] schema.sql is idempotent (IF NOT EXISTS, DO $$ EXCEPTION, DROP TRIGGER IF EXISTS)
  - [x] RLS-off block marked with `TODO(PHASE-8: ENABLE RLS)`
  - [x] supabase_user_id is nullable uuid with no FK to auth.users
  - [x] list_public_tables() RPC defined for /api/health/db
  - [x] db:init and db:verify npm scripts registered
  - [x] No secrets committed; .env is git-ignored
* **Impact on Existing Functionality**: None. Adds database infrastructure; existing /api/health endpoint and Mock Session middleware from WI-102 are unchanged. Requires real Supabase credentials in .env to run db:init.

## [2026-06-09] - WI-103: React App Routing & Mock Identity Bar
* **Work Item ID**: WI-103
* **Summary**: Scaffolded React + Vite frontend with React Router, axios, and lucide-react. Added a Mock Identity Context, a floating Mock Identity Selector bar, and a Vite dev-server proxy to the backend. Verified end-to-end: clicking Admin/Student on the bar sets context and is forwarded to the backend via x-mock-role/x-mock-user-id headers.
* **Files Affected**:
  - [NEW] `frontend/package.json`
  - [NEW] `frontend/vite.config.js`
  - [NEW] `frontend/index.html`
  - [NEW] `frontend/.env`, `frontend/.env.example`, `frontend/.gitignore`, `frontend/README.md`
  - [NEW] `frontend/src/main.jsx`, `frontend/src/App.jsx`, `frontend/src/index.css`
  - [NEW] `frontend/src/api/client.js`
  - [NEW] `frontend/src/context/MockIdentityContext.jsx`
  - [NEW] `frontend/src/components/MockIdentityBar.jsx`, `frontend/src/components/MockIdentityBar.css`, `frontend/src/components/Layout.jsx`
  - [NEW] `frontend/src/pages/HomePage.jsx`, `frontend/src/pages/admin/AdminDashboard.jsx`, `frontend/src/pages/student/StudentDashboard.jsx`
  - [NEW] `frontend/src/routes/AppRoutes.jsx`
* **Verification Done**:
  - [x] Vite dev server boots on port 5173
  - [x] Mock Identity Bar visible and toggleable
  - [x] Frontend pings backend /api/health with mock identity
  - [x] `npm run build` succeeds with no critical warnings
  - [x] All mock artifacts marked with `// TODO(PHASE-8: REMOVE)` or `// TODO(PHASE-8: REPLACE WITH REAL AUTH)`
* **Impact on Existing Functionality**: None. Adds frontend skeleton alongside the existing backend from WI-102.

## [2026-06-05] - WI-102: Express API Server Setup with Mock Session Middleware
* **Work Item ID**: WI-102
* **Summary**: Set up Express server with helmet, CORS, and a Mock Session middleware that reads role and userId from request headers or query parameters. Health check endpoint exposed at /api/health.
* **Files Affected**:
  - [NEW] `backend/index.js`
  - [NEW] `backend/src/middleware/mockSession.js`
  - [NEW] `backend/README.md`
  - [MODIFIED] `backend/package.json`
* **Verification Done**:
  - [x] Server boots on PORT 5000
  - [x] `GET /api/health` returns 200 with mock user context
  - [x] Mock session reads headers and query parameters
  - [x] Nodemon hot-reload works
  - [x] Mock middleware marked for Phase 8 replacement
* **Impact on Existing Functionality**: None. Backend skeleton now functional.

## [2026-06-05] - WI-101: Repository Setup & Environment Boilerplate
* **Work Item ID**: WI-101
* **Summary**: Created baseline repository structure (backend/frontend/docs folders), configured backend package.json, .gitignore, .env.example, and root README.
* **Files Affected**:
  - [NEW] `backend/package.json`
  - [NEW] `backend/.gitignore`
  - [NEW] `backend/.env.example`
  - [NEW] `backend/.env`
  - [NEW] `docs/README.md`
  - [NEW] `.gitignore`
  - [NEW] `README.md`
* **Verification Done**:
  - [x] Folder structure confirmed
  - [x] npm packages installed
  - [x] No secrets present
* **Impact on Existing Functionality**: None. Baseline setup.

## [2026-06-05] - Initial Documentation & Planning Setup

### Setup - Project Specification Setup
* **Work Item ID**: None (Pre-development Planning)
* **Summary**: Analyzed `TARGET.txt` requirements and built the foundational planning, progress tracking, and developer handoff Markdown guides.
* **Files Affected**:
  - [NEW] `SKILLS.md`
  - [NEW] `GOALS.md`
  - [NEW] `WORKITEMS.md`
  - [NEW] `PROGRESS.md`
  - [NEW] `CHANGELOG.md`
  - [NEW] `HANDOFF.md`
  - [NEW] `ASSUMPTIONS.md`
  - [NEW] `RISKS.md`
  - [NEW] `DEPENDENCIES.md`
  - [NEW] `VALIDATION.md`
* **Verification Done**: Checked Markdown rendering structure, verified relative links, validated compliance with repo parameters, and checked mermaid diagram formatting.
* **Impact on Existing Functionality**: None. Established development framework guidelines before any code execution starts.

---

## Release Entry Template (For Future Use)

### [YYYY-MM-DD] - [Work Item Title]
* **Work Item ID**: WI-XXX
* **Summary**: [Provide a brief explanation of what was built or resolved.]
* **Files Affected**:
  - `backend/src/...`
  - `frontend/src/...`
* **Verification Done**:
  - [ ] Local build validation (`npm run build` succeeds)
  - [ ] API endpoint testing (methods, request schemas, statuses)
  - [ ] Manual role-access validation (Admin vs Student permissions)
  - [ ] Security audits (verified no secrets are stored)
* **Impact on Existing Functionality**: [Identify any potential regressions or confirm that previous features remain functional.]
