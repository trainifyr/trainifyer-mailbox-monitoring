# WI-901 — Multi-Role Integration & Staging Validation

> **GitHub Issue**: #22
> **Phase**: 9 — Release and Deployment
> **Priority**: High
> **Dependencies**: All previous WIs (WI-101 through WI-804)
> **Project**: Trainifyer Mailbox Monitoring Platform

---

## Context

All 23 work items across 9 phases have been implemented. Phase 8 hardened the entire system:

- **WI-801**: Supabase Auth with email/password login, `AuthContext`, JWT injection
- **WI-802**: Backend JWT validation middleware replacing mock session
- **WI-803**: Frontend route guards (`ProtectedRoute`, `AdminRoute`, `StudentRoute`), mock system removed
- **WI-804**: Row Level Security (RLS) on all 9 database tables

WI-804 was the last development work item. This work item (WI-901) is the **final validation gate** before deployment. It does **not** write new code. Instead, it runs a comprehensive end-to-end integration test suite against a staging environment to verify that all components work correctly under the real auth setup with RLS enabled.

> ⚠️ **No code changes**: WI-901 is a validation-only work item. No files should be created or modified except `PROGRESS.md`, `CHANGELOG.md`, and the test log document.

---

## Reference Documents

Before starting, read these files in the project root:

- `WORKITEMS.md` — Acceptance criteria for WI-901
- `GOALS.md` — All 8 sub-goals and success criteria
- `PROGRESS.md` — Current status tracking (WI-901 is `Not Started`)
- `RISKS.md` — Known risks and mitigations to verify
- `CHANGELOG.md` — Full change history for regression context
- `HANDOFF.md` — Architecture overview and work sequence
- `ASSESSMENT.md` — If present, pre-existing test scenarios
- `prompts/WI-801-prompt.md` — Auth integration details (login, session, JWT flow)
- `prompts/WI-802-prompt.md` — Backend JWT middleware design
- `prompts/WI-803-prompt.md` — Route guards and mock removal
- `prompts/WI-804-prompt.md` — RLS policy design and enforcement

---

## Scope of This Work Item

### Validation — No Code Changes
- **Run** the end-to-end integration test script covering all 8 sub-goals.
- **Document** all test results in a new `docs/WI-901-test-report.md` file.
- **Verify** that no regression exists after the Phase 8 security hardening.
- **Sign off** by updating `PROGRESS.md` and `CHANGELOG.md`.

### Environments Required
1. **Local development** — Backend on `localhost:5000`, Frontend on `localhost:5173`
2. **Supabase project** — Real Supabase instance with schema applied and RLS enabled

### Data Setup Required
Before testing, ensure the Supabase database has:
- At least 2 admin users in `public.users` with `supabase_user_id` linked to real Supabase Auth accounts
- At least 3 student users in `public.users` with `supabase_user_id` linked to real Supabase Auth accounts
- At least 2 batches (one active, one inactive)
- Students assigned to batches via `student_batches`
- At least 1 test mail message between users
- At least 1 meeting (SCHEDULED status)
- Consent and attendance log entries for testing reports

---

## Step-by-Step Instructions

### 1. Prepare the Staging Environment

Ensure both backend and frontend are running in development mode:

```bash
# Terminal 1: Backend
cd backend
npm run dev
# Expected: "Trainifyer backend running on port 5000"

# Terminal 2: Frontend
cd frontend
npm run dev
# Expected: Vite dev server on http://localhost:5173
```

Verify the backend is healthy and connected to Supabase:

```bash
# Health check
curl http://localhost:5000/api/health
# Expected: { "status": "healthy", "auth": { "method": "none", "user": null }, ... }

# Database health check
curl http://localhost:5000/api/health/db
# Expected: { "status": "healthy", "tables": ["users","batches","student_batches",...], ... }
```

### 2. Run End-to-End Integration Tests

Execute each test scenario below **as a manual test walkthrough** or using automated API calls. Document every result.

---

#### Test Suite 1: Authentication & Role-Based Access Control (Sub-Goal 1)

| # | Test Case | Steps | Expected Result | Pass/Fail |
|---|-----------|-------|-----------------|-----------|
| 1.1 | Admin login | Open `http://localhost:5173/login`, enter admin email/password | Redirected to home page. Header shows admin name with `ADMIN` badge. |
| 1.2 | Student login | Log out, log in with student credentials | Redirected to home page. Header shows student name with `STUDENT` badge. |
| 1.3 | Invalid credentials | Log in with wrong password | Error message displayed. No redirect. |
| 1.4 | Session persistence | Refresh the page while logged in | User remains logged in. No flash to login page. |
| 1.5 | Logout | Click "Sign Out" in header | Redirected to `/login`. Session cleared. |
| 1.6 | JWT injection | Open Network tab, make any API call | Request header includes `Authorization: Bearer <token>`. No `x-mock-role` header present. |
| 1.7 | Authenticated API access | Call `/api/mail/inbox` with valid Bearer token | Returns 200 with inbox data. |
| 1.8 | Unauthenticated API access | Call `/api/mail/inbox` with no token | Returns 401 or 403. |
| 1.9 | Admin-only API (student token) | Call `POST /api/users/students` with a student's Bearer token | Returns 403 Forbidden. |
| 1.10 | Admin-only API (admin token) | Call `POST /api/users/students` with an admin's Bearer token | Returns 201 Created. |

---

#### Test Suite 2: Cohort Management (Sub-Goal 2, WI-201 / WI-202)

| # | Test Case | Steps | Expected Result | Pass/Fail |
|---|-----------|-------|-----------------|-----------|
| 2.1 | List students | Admin logs in, navigate to `/admin/students` | Student roster table displays all students. |
| 2.2 | Create student | Click "Add Student", fill form, submit | Student appears in roster. New user created in Supabase Auth and `public.users`. |
| 2.3 | Edit student | Click edit on a student, change name | Student name updates in roster. |
| 2.4 | List batches | Navigate to `/admin/batches` | Batch list displays with student counts. |
| 2.5 | Create batch | Enter batch name, submit | Batch created. Default settings row created. |
| 2.6 | Assign student to batch | Navigate to batch detail, select unassigned student, assign | Student appears in batch roster. |
| 2.7 | Assign student to second batch | Try to assign already-assigned student to a different batch | 409 Conflict error. Student remains in original batch. |
| 2.8 | Toggle batch status | Change batch from Active to Inactive | Status updates in list. |

---

#### Test Suite 3: Feature Settings (Sub-Goal 3, WI-301 / WI-302)

| # | Test Case | Steps | Expected Result | Pass/Fail |
|---|-----------|-------|-----------------|-----------|
| 3.1 | View batch settings | Navigate to batch detail, view settings | 6 feature toggles displayed. |
| 3.2 | Toggle mailbox off | Set `mailbox_enabled` to OFF | Toggle saves. Green notification appears. |
| 3.3 | Verify mailbox block (student) | Log in as student in that batch, try accessing `/mailbox` | Mailbox shows 403 or empty state (settings enforced by backend). |
| 3.4 | Toggle mailbox on | Set `mailbox_enabled` back to ON | Toggle saves. Student can access mailbox again. |
| 3.5 | Toggle student-to-student off | Set `student_to_student_messaging` to OFF | Toggle saves. |
| 3.6 | Verify STS block | Student tries to send message to another student | 403 Forbidden. |
| 3.7 | Verify STS bypass (admin) | Admin sends message to student | 201 Created (admins bypass STS check). |
| 3.8 | Toggle meeting join off | Set `meeting_join_enabled` to OFF | Toggle saves. Student blocked from joining meetings. |

---

#### Test Suite 4: Internal Mailbox (Sub-Goal 4, WI-401 / WI-402)

| # | Test Case | Steps | Expected Result | Pass/Fail |
|---|-----------|-------|-----------------|-----------|
| 4.1 | Compose message (student→admin) | Log in as student, navigate to `/mailbox`, compose to admin, send | Message sent. Appears in Sent view. |
| 4.2 | Receive message (admin inbox) | Log in as admin, navigate to `/mailbox` | Message from student appears in Inbox. Unread badge visible. |
| 4.3 | Read message | Click on message in Inbox | Message content displayed. Marked as read (read indicator changes). |
| 4.4 | Compose message (admin→student) | Admin composes to student, send | Message sent. |
| 4.5 | Student inbox | Log in as student | Admin's message appears in Inbox. |
| 4.6 | Student-to-student (enabled) | With STS enabled, student sends to another student in same batch | 201 Created. |
| 4.7 | Student-to-student (disabled) | With STS disabled, student sends to another student | 403 Forbidden. |
| 4.8 | Mailbox disabled | With `mailbox_enabled=false`, student accesses mailbox | 403 Forbidden or mailbox shows disabled state. |
| 4.9 | RLS: Student reads other's mail | Direct Supabase REST call with student JWT to read `mail_messages` where not participant | Empty result or error (RLS blocks cross-user reads). |

---

#### Test Suite 5: Meetings & Jitsi (Sub-Goal 5, WI-501 / WI-502 / WI-503)

| # | Test Case | Steps | Expected Result | Pass/Fail |
|---|-----------|-------|-----------------|-----------|
| 5.1 | Admin creates batch meeting | Admin navigates to `/admin/meetings`, fills form, submits | Meeting created with unique Jitsi room name. |
| 5.2 | Admin creates public meeting | Create meeting with "Public" toggle | Meeting created. Visible to all users. |
| 5.3 | Student sees batch meetings | Log in as student, navigate to `/meetings` | Only meetings for their batch + public meetings visible. |
| 5.4 | Student sees no unauthorized meetings | Student tries to access a non-batch meeting directly via URL | Error or redirect. |
| 5.5 | Privacy consent: First visit | Student opens a meeting | Consent overlay appears. Jitsi does not load. |
| 5.6 | Privacy consent: Accept | Click "Agree & Proceed" | Consent recorded in DB (`meeting_consents`). Jitsi loads. |
| 5.7 | Privacy consent: Decline | Click "Cancel" | Navigate back. Jitsi never loads. |
| 5.8 | Privacy consent: Subsequent visit | Re-open the same meeting | Consent overlay skipped (already consented). Jitsi loads. |
| 5.9 | Jitsi iframe loads | After consent, verify iframe | Jitsi Meet interface visible in iframe. Config overrides applied (muted start, no watermark, no deep linking). |

---

#### Test Suite 6: Attendance Logging (Sub-Goal 6, WI-601 / WI-602)

| # | Test Case | Steps | Expected Result | Pass/Fail |
|---|-----------|-------|-----------------|-----------|
| 6.1 | Join log created | Join a meeting as a student | POST `/api/meetings/:id/join-log` fires. Attendance log row created with `ACTIVE` status. |
| 6.2 | Heartbeat fires | Stay in meeting for 60+ seconds | POST `/api/meetings/:id/heartbeat` fires every 60s. `last_heartbeat` timestamp updates. |
| 6.3 | Leave log on tab close | Close browser tab while in meeting | `beforeunload` fires POST `/api/meetings/:id/leave-log`. `left_at` set. Duration, percentage, status computed. |
| 6.4 | Leave log on navigation | Navigate away from meeting page | Leave-log fires on component unmount. |
| 6.5 | Leave log on Jitsi exit | Click "Leave Meeting" in Jitsi UI | Jitsi `readyToClose` event fires leave-log. |
| 6.6 | Attendance percentage | After leaving, check DB | `total_minutes`, `attendance_percentage`, and `status` (PRESENT/PARTIAL/ABSENT) correctly computed. |
| 6.7 | Duplicate join prevented | Same user tries to join same meeting again | Returns existing active session (200, idempotent). |

---

#### Test Suite 7: Dashboards & Reports (Sub-Goal 7, WI-701 / WI-702)

| # | Test Case | Steps | Expected Result | Pass/Fail |
|---|-----------|-------|-----------------|-----------|
| 7.1 | Admin Dashboard KPIs | Admin navigates to `/admin/dashboard` | KPI cards display: total meetings, total sessions, total minutes, average %, status breakdown. |
| 7.2 | Admin Dashboard recent sessions | View recent sessions table on dashboard | 10 most recent sessions displayed with correct data. |
| 7.3 | Student Dashboard | Student navigates to `/student/dashboard` | Personal stat cards: meetings attended, total minutes, attendance %. Status breakdown bar. |
| 7.4 | Reports: Filter by date | Navigate to `/admin/reports`, set date range | Data filtered to date range. |
| 7.5 | Reports: Filter by batch | Select batch filter | Data scoped to selected batch. |
| 7.6 | Reports: Filter by student | Select student filter | Data scoped to selected student. |
| 7.7 | Reports: Granularity | Switch granularity (daily/weekly/monthly) | Time-series cards re-bucket correctly. |
| 7.8 | Reports: Sortable table | Click column headers in details table | Table sorts ascending/descending. |
| 7.9 | Reports: CSV export | Click "Export CSV" | CSV file downloads with correct data. |
| 7.10 | Student cannot access reports | Student types `/admin/reports` in URL | Redirected to `/` (StudentRoute blocks access). |
| 7.11 | RLS: Student sees only own data | Student calls `/api/reports/attendance` | Only own attendance data returned. |

---

#### Test Suite 8: Security Hardening (Sub-Goal 1 + Phase 8)

| # | Test Case | Steps | Expected Result | Pass/Fail |
|---|-----------|-------|-----------------|-----------|
| 8.1 | Unauthenticated route guard | Open private browser, navigate to `/admin/dashboard` | Redirected to `/login`. |
| 8.2 | Student route guard | Log in as student, navigate to `/admin/dashboard` | Redirected to `/`. |
| 8.3 | Admin route guard | Log in as admin, navigate to `/student/dashboard` | Redirected to `/`. |
| 8.4 | Protected route accessible | Log in as any user, navigate to `/mailbox` | Loads successfully (any authenticated user). |
| 8.5 | RLS: Anon Supabase REST call | `curl -X GET "https://<project>.supabase.co/rest/v1/users" -H "apikey: $ANON_KEY"` | Empty result or 401. No rows returned. |
| 8.6 | RLS: Authenticated Supabase REST call | Same call with valid JWT | Only own user row returned. |
| 8.7 | RLS: Admin Supabase REST call | Same call with admin JWT | All user rows returned (via `is_admin()` policy). |
| 8.8 | RLS: Cross-user mailbox read | Student JWT calls `mail_messages` REST endpoint | Only messages where student is sender or receiver. |
| 8.9 | Backend pgPool bypasses RLS | Express API calls still work (pgPool is superuser) | All API endpoints return data as expected. RLS does not affect backend queries. |
| 8.10 | No mock identity artifacts | Check codebase for mock references | No `MockIdentityBar`, `useMockIdentity`, `x-mock-role` in frontend code. |

---

#### Test Suite 9: Error Handling & Edge Cases

| # | Test Case | Steps | Expected Result | Pass/Fail |
|---|-----------|-------|-----------------|-----------|
| 9.1 | 404 handler | Navigate to `/nonexistent` | React Router renders "/*" fallback (redirect to `/`). |
| 9.2 | API 404 | `curl http://localhost:5000/api/nonexistent` | Returns `{ "error": "Not Found", "path": "/api/nonexistent" }`. |
| 9.3 | API 500 handler | Trigger an unhandled server error | Returns `{ "error": "Internal Server Error" }`. Server does not crash. |
| 9.4 | Missing env vars | Remove `DATABASE_URL`, restart backend | Server boots but `/api/health/db` returns unhealthy. |
| 9.5 | Expired JWT | Use an expired Supabase JWT | Backend returns null `req.user`. Frontend re-authenticates. |

---

### 3. Document Results in `docs/WI-901-test-report.md`

Create a new test report file with the following structure:

```markdown
# WI-901 — Multi-Role Integration & Staging Validation Report

**Date**: YYYY-MM-DD
**Tester**: Antigravity
**Environment**: Local (localhost:5000 / localhost:5173)
**Supabase Project**: <project-ref>

---

## Summary

| Suite | Total Tests | Passed | Failed | Skipped | Pass Rate |
|-------|-------------|--------|--------|---------|-----------|
| 1. Authentication & RBAC | 10 | 0 | 0 | 0 | 0% |
| 2. Cohort Management | 8 | 0 | 0 | 0 | 0% |
| 3. Feature Settings | 8 | 0 | 0 | 0 | 0% |
| 4. Internal Mailbox | 9 | 0 | 0 | 0 | 0% |
| 5. Meetings & Jitsi | 9 | 0 | 0 | 0 | 0% |
| 6. Attendance Logging | 7 | 0 | 0 | 0 | 0% |
| 7. Dashboards & Reports | 11 | 0 | 0 | 0 | 0% |
| 8. Security Hardening | 10 | 0 | 0 | 0 | 0% |
| 9. Error Handling | 5 | 0 | 0 | 0 | 0% |
| **Total** | **77** | **0** | **0** | **0** | **0%** |

---

## Detailed Results

### Suite 1: Authentication & Role-Based Access Control

| # | Test Case | Result | Notes |
|---|-----------|--------|-------|
| 1.1 | Admin login | ⬜ | |
| 1.2 | Student login | ⬜ | |
| ... | ... | ... | ... |

...

---

## Failed Tests (if any)

| # | Test Case | Failure Reason | Fix Required | Fixed? |
|---|-----------|----------------|--------------|--------|
|   |           |                |              |        |

---

## Issues Found (if any)

| # | Severity | Description | Affected WI | Fix |
|---|----------|-------------|-------------|-----|
|   |          |             |             |     |

---

## Sign-Off

- [ ] All tests pass (or documented exceptions approved).
- [ ] No regressions in previously working functionality.
- [ ] Security hardening is effective (RLS, JWT, route guards).
- [ ] System is ready for deployment (WI-902).

**Signed**: _________________ **Date**: _______________
```

Update the placeholders (`⬜` → `✅` for pass, `❌` for fail) as tests complete.

### 4. Verify No Regressions

After running all tests, verify that no regression has been introduced:

```bash
# Frontend build
cd frontend
npm run build
# Expected: Clean build, no errors.

# Backend starts clean
cd backend
npm run dev
# Expected: Server starts, no startup errors.
```

### 5. Apply RLS Policies to Staging Database

If not already applied, run the RLS policies:

```bash
# Option 1: Via Supabase SQL Editor
# Paste contents of backend/db/rls_policies.sql into Supabase Dashboard SQL Editor

# Option 2: Via psql (if psql client is available)
psql "$DATABASE_URL" -f backend/db/rls_policies.sql
```

Verify RLS is active:

```sql
-- Run in Supabase SQL Editor
SELECT tablename, rowsecurity FROM pg_tables
WHERE schemaname = 'public' AND tablename != 'schema_migrations'
ORDER BY tablename;
-- Expected: All 9 tables have rowsecurity = true
```

---

## Expected Output (File Checklist)

### New Files
- [ ] `docs/WI-901-test-report.md` — Completed test report with all 77 test results documented

### Modified Files
- [ ] `PROGRESS.md` — WI-901 changed from `Not Started` to `Done` or `Verified`
- [ ] `CHANGELOG.md` — New entry added for WI-901

---

## Acceptance Criteria

1. All 77 integration tests across 9 suites are executed and documented.
2. All test results are recorded in `docs/WI-901-test-report.md` with pass/fail status.
3. Admin and Student login flows work correctly with real Supabase Auth credentials.
4. Backend JWT validation rejects unauthenticated requests with 401/403.
5. Frontend route guards block unauthenticated and unauthorized access.
6. RLS policies prevent unauthorized data access via direct Supabase REST API.
7. Cohort CRUD, batch settings, mailbox, meetings, attendance, and reports all function correctly under real auth.
8. No regressions: previously working functionality (Phases 1–7) still works.
9. `npm run build` (frontend) completes without errors.
10. Backend starts without errors.
11. Success criteria from `GOALS.md` are all verified.

---

## Risk / Impact

- **No code changes**: This is a validation-only work item. No risk of introducing regressions through code modifications.
- **Staging environment required**: Tests require a real Supabase project with populated data. If no staging data exists, seed data must be created before testing.
- **Jitsi iframe tests**: Tests involving Jitsi (Suite 5) require a browser environment. They cannot be automated via `curl`. Manual testing is required.
- **Attendance timer tests**: Tests requiring 60+ second wait times (heartbeat) require patience during manual testing. Consider reducing the heartbeat interval to 10s temporarily for testing, then restoring it to 60s.
- **Backend mock fallback still active**: The backend `authMiddleware.js` still accepts `x-mock-role`/`x-mock-user-id` headers as a dev fallback. This is intentional (WI-802 design). It does not affect production because the frontend no longer sends these headers.
- **Service-role key bypasses RLS**: The backend uses `pgPool` (superuser) and `supabaseClient` (service-role key), both of which bypass RLS. This is by design. RLS only protects direct Supabase REST API calls.
- **Test data dependency**: Some tests (especially mailbox and attendance) require pre-existing data. If the staging database is empty, seed data must be created as part of the test setup.

---

## Post-Implementation Steps (MANDATORY)

Once the test report is complete and all acceptance criteria are satisfied:

### 1. Update `PROGRESS.md`

Change the status of **WI-901** from `Not Started` to `Done`:
- Set the status to `Done`.
- Set the assignee to `Antigravity`.
- Set the target date to the current date.
- Update the Phase 9 progress table increment.

### 2. Update `CHANGELOG.md`

Add a new entry at the top:

```
## [YYYY-MM-DD] - WI-901: Multi-Role Integration & Staging Validation
* **Work Item ID**: WI-901
* **Summary**: Completed end-to-end integration testing across all 9 phases. Executed 77 test cases covering authentication, cohort management, feature settings, internal mailbox, meetings & Jitsi, attendance logging, dashboards & reports, security hardening, and error handling. All components verified under the real auth setup (JWT validation, route guards, RLS policies). Test report documented in docs/WI-901-test-report.md.
* **Files Affected**:
  - [NEW] `docs/WI-901-test-report.md` (77 integration test results)
  - [MODIFIED] `PROGRESS.md` (WI-901 marked Done)
* **Verification Done**:
  - [x] All 77 tests executed and documented
  - [x] Authentication flows work with real Supabase Auth
  - [x] Backend JWT validation rejects unauth requests
  - [x] Frontend route guards block unauthorized access
  - [x] RLS policies prevent unauthorized Supabase REST access
  - [x] No regressions in previously working functionality
  - [x] npm run build completes without errors
  - [x] Backend starts without errors
  - [x] All GOALS.md success criteria verified
* **Impact on Existing Functionality**: None — validation only, no code changes.
```

### 3. Stop and Wait

Do **not** begin WI-902 in the same session. Wait for the developer to verify the test report and trigger the next prompt.

---

## Notes for the AI Agent

- **This is a validation-only work item**: Do not create, modify, or delete any source code files. The only files that should be changed are `PROGRESS.md`, `CHANGELOG.md`, and the new `docs/WI-901-test-report.md`.
- **If tests fail**: Document the failure in the test report with the exact failure reason, the affected component, and the suggested fix. Do **not** attempt to fix the code yourself — that should be done as a separate work item. Flag failures clearly for the developer.
- **Backend mock fallback is intentional**: The backend `authMiddleware.js` has a fallback to `x-mock-role`/`x-mock-user-id` headers for development convenience. This is a deliberate design choice from WI-802. Do not remove or disable it. The frontend no longer sends these headers, so production traffic will always go through JWT validation.
- **RLS verification**: To test RLS, use `curl` directly against the Supabase REST API (not the Express API). The Express API uses `pgPool` (superuser) and `supabaseClient` (service-role key) — both bypass RLS. RLS only applies to requests made with the anon key directly to `https://<project>.supabase.co/rest/v1/...`.
- **Test data setup**: If the Supabase database is empty or lacks sufficient data for testing, create seed data as a prerequisite. Use the backend API endpoints (with admin JWT) to create students, batches, assignments, messages, meetings, and attendance logs. Do not insert data directly into Supabase unless absolutely necessary.
- **Manual browser testing**: Suites 5 (Meetings & Jitsi) and 6 (Attendance Logging) require a real browser environment because they involve Jitsi iframe loading and JavaScript event handlers. These cannot be fully automated with `curl`. Use a real browser session for these tests.
- **Auth context for tests**: For API-only tests (Suites 1, 2, 3, 4, 7, 8, 9), use the real JWT token from the Supabase session. To get a token: log in via the frontend, open browser DevTools, and copy the `access_token` from the Supabase session (stored in `localStorage` or `sessionStorage` under the `sb-<project-ref>-auth-token` key).
- **Heartbeat test optimization**: The heartbeat interval is 60 seconds in production (WI-602). For testing, you can temporarily reduce it to 10 seconds in `MeetingRoomPage.jsx` to avoid waiting. Remember to restore it to 60000ms (60 seconds) after testing — but since this is validation-only, you should not modify source files. Accept the 60-second wait during manual testing.
- **CSV export test**: Test 7.9 (CSV export) triggers a browser download. Verify that the downloaded file is a valid CSV with correct column headers and data rows. The export is handled entirely on the frontend (no backend CSV endpoint).
- **Test report format**: Use `✅` for passed tests, `❌` for failed tests, `⬜` for not-yet-run tests, and `⏭️` for skipped tests. Each failed test must include a "Failure Reason" and "Suggested Fix" in the Failed Tests section.
- **Do not modify backend or frontend source code**: If you encounter a bug, document it thoroughly in the test report and let the developer decide how to fix it. Your job is to validate, not to patch.
- **Respect Supabase free tier limits**: Do not create excessive test data. The free tier has row limits. Clean up test data after validation if possible.
