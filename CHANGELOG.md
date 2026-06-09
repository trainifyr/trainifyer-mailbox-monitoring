# Changelog

This document tracks all changes made to the Student Learning Monitoring and Internal Communication Platform workspace. Each entry captures the date, affected Work Item ID, change details, files affected, verification methodology, and regression assessments.

---

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
