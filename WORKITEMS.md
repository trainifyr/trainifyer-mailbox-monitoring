# Sequenced Work Items (Vertically Sliced)

This document lists the step-by-step developer work items required to build the Student Learning Monitoring and Internal Communication Platform. It is organized into **vertical slices** where each slice represents a functional, testable unit of work. 

To prevent early blockage and focus on core features, **Authentication, JWT Authorization Middleware, Route Guards, and Database Hardening are deferred to the last phases**. Instead, early phases use a developer-friendly Mock Session context.

---

## Phase 1: Skeleton Setup & Mock Session Context

### WI-101: Repository Setup & Environment Boilerplate
* **ID**: WI-101
* **Title**: Repository Setup & Environment Boilerplate
* **Description**: Create the workspace folder structure (`frontend/`, `backend/`, `docs/`), initial package.json files, `.gitignore`, and `.env.example`.
* **Priority**: High
* **Dependencies**: None
* **Expected Output**: Baseline repo files checked in.
* **Acceptance Criteria**:
  - `.gitignore` ignores dependency and secret directories.
  - `.env.example` outlines parameters for local database, API server port, and Supabase hooks.
* **Risk / Impact**: None.

---

### WI-102: Express API Server Setup with Mock Session Middleware
* **ID**: WI-102
* **Title**: Express API Server Setup with Mock Session Middleware
* **Description**: Set up the Express backend skeleton. Implement a mock auth middleware that reads `role` and `userId` from request headers or query parameters (e.g. `?role=ADMIN&userId=123`), allowing developers to simulate different users without actual login.
* **Priority**: High
* **Dependencies**: WI-101
* **Expected Output**: An Express app that exposes a health check endpoint `/api/health` and logs mock user contexts.
* **Acceptance Criteria**:
  - Serving health checks and mock session statuses on `/api/health`.
  - Dev script `npm run dev` hot-reloads on changes.
* **Risk / Impact**: Temporary mock code must be marked for easy removal during security hardening in Phase 8.

---

### WI-103: React App Routing & Mock Identity Bar
* **ID**: WI-103
* **Title**: React App Routing & Mock Identity Bar
* **Description**: Set up React + Vite. Implement page layouts and a floating developer helper bar ("Mock Identity Selector") that allows switching the UI's active state between Admin (user ID X) and Student (user ID Y, Cohort Z).
* **Priority**: High
* **Dependencies**: WI-101
* **Expected Output**: A running React application with a routes config and a toggle bar for current role simulation.
* **Acceptance Criteria**:
  - App boots using Vite.
  - Selecting "Admin" or "Student" on the mock bar sets react contexts to verify UI routing.
* **Risk / Impact**: Floating mock bar is only for development and will be deactivated before release.

---

### WI-104: Base Database Schema Provisioning
* **ID**: WI-104
* **Title**: Base Database Schema Provisioning
* **Description**: Write and run SQL queries in Supabase to provision relational tables. **Disable Row Level Security (RLS) initially** to allow open REST operations during functional testing.
* **Priority**: High
* **Dependencies**: WI-102
* **Expected Output**: Database tables (`users`, `batches`, `student_batches`, `batch_settings`, `mail_messages`, `meetings`, `meeting_participants`, `meeting_consents`, `attendance_logs`) created.
* **Acceptance Criteria**:
  - Verification query returns all base tables.
  - Relational connections (foreign keys, defaults, timestamps) verify.
  - **Technical Note**: The `supabase_user_id` column in the `users` table must be nullable and not enforce a foreign key constraint to `auth.users` yet, as Supabase Auth is integrated in Phase 8.
* **Risk / Impact**: Schema changes will be verified directly. RLS is off, which is accepted for early phase development.

---

## Phase 2: Student & Batch Management (Slice 1)

### WI-201: Cohort CRUD Backend APIs
* **ID**: WI-201
* **Title**: Cohort CRUD Backend APIs
* **Description**: Create Express routes to handle student list query, student inserts, batch CRUD, and batch-student assignments. Validates roles using the Mock Session context.
* **Priority**: High
* **Dependencies**: WI-102, WI-104
* **Expected Output**: Endpoints: `GET/POST/PATCH /api/users/students` and `GET/POST/PATCH /api/batches`.
* **Acceptance Criteria**:
  - `POST` inserts a student profile into the DB (no real Auth user creation yet; inserts a mock ID).
  - Admin can update batch status (`active/inactive`).
  - Associating a student to a batch writes a row in `student_batches`.
  - **Technical Note**: Profile inserts must generate a random UUID for the student's ID since real Auth is deferred.
* **Risk / Impact**: Modifies student-batch relationships.

---

### WI-202: Student & Batch Configuration UI
* **ID**: WI-202
* **Title**: Student & Batch Configuration UI
* **Description**: Build frontend admin views to manage students and batches (list tables, creation forms, cohort assign forms).
* **Priority**: High
* **Dependencies**: WI-103, WI-201
* **Expected Output**: React routes `/admin/students` and `/admin/batches`.
* **Acceptance Criteria**:
  - Developer can toggle the Mock Identity bar to "Admin" and create a student.
  - Developer can create a batch and assign the newly created student to it.
* **Risk / Impact**: Focuses on basic CRUD layouts.

---

## Phase 3: Cohort Configuration Controls (Slice 2)

### WI-301: Feature Settings Backend Logic
* **ID**: WI-301
* **Title**: Feature Settings Backend Logic
* **Description**: Create database structures and endpoints to read and update batch permissions configurations.
* **Priority**: High
* **Dependencies**: WI-201
* **Expected Output**: Endpoints: `GET/PATCH /api/batches/:id/settings`.
* **Acceptance Criteria**:
  - Settings record is created for each batch.
  - Stores toggles: mailbox access, student-to-student messages, and meeting hardware configs.
* **Risk / Impact**: Core logic for permissions.

---

### WI-302: Settings Panel UI
* **ID**: WI-302
* **Title**: Settings Panel UI
* **Description**: Add a settings configurations panel in the Admin Batch Details screen.
* **Priority**: High
* **Dependencies**: WI-202, WI-301
* **Expected Output**: An interactive toggle card block on the Batch Detail page.
* **Acceptance Criteria**:
  - Administrator switches toggle and triggers DB update.
  - Displays notifications confirming settings saved.
* **Risk / Impact**: User interface configuration.

---

## Phase 4: Internal Mailbox System (Slice 3)

### WI-401: Internal Mailbox APIs & Permissions Check
* **ID**: WI-401
* **Title**: Internal Mailbox APIs & Permissions Check
* **Description**: Create the database-backed messaging routes. Enforce communication limits by checking the mock sender's batch configurations in the DB.
* **Priority**: High
* **Dependencies**: WI-301
* **Expected Output**: Endpoints: `GET /api/mail/inbox`, `GET /api/mail/sent`, `POST /api/mail/send`, `PATCH /api/mail/:id/read`.
* **Acceptance Criteria**:
  - If mailbox settings are toggled off in settings, students receive a `403 Forbidden` error.
  - If student-to-student messaging is off, students attempting to message other students receive `403 Forbidden`.
* **Risk / Impact**: Strict database messaging filters.

---

### WI-402: Mailbox Client UI
* **ID**: WI-402
* **Title**: Mailbox Client UI
* **Description**: Create an Outlook-style internal mailbox user dashboard (Inbox list, compose form, reading layout).
* **Priority**: High
* **Dependencies**: WI-103, WI-401
* **Expected Output**: Mailbox portal components in `/mailbox`.
* **Acceptance Criteria**:
  - Developer toggles mock bar to student user `Rahul`, writes a message to Admin, and clicks send.
  - Developer toggles mock bar to Admin and verifies the message appears in the Admin's inbox.
* **Risk / Impact**: Primary communication module.

---

## Phase 5: Meetings & Privacy Consent (Slice 4)

### WI-501: Meeting Scheduler APIs
* **ID**: WI-501
* **Title**: Meeting Scheduler APIs
* **Description**: Write Express controllers to create internal batch meetings and generate public meeting tokens.
* **Priority**: High
* **Dependencies**: WI-201
* **Expected Output**: Endpoints: `GET/POST /api/meetings`, `POST /api/meetings/public/join`.
* **Acceptance Criteria**:
  - Batch meetings must block users whose mock ID does not belong to the target batch.
  - Public links return anonymous join credentials.
* **Risk / Impact**: Meeting access control.

---

### WI-502: Meeting Scheduler & Jitsi Room Integration UI
* **ID**: WI-502
* **Title**: Meeting Scheduler & Jitsi Room Integration UI
* **Description**: Build meeting scheduling lists for admins and the Jitsi iframe loader workspace.
* **Priority**: High
* **Dependencies**: WI-103, WI-501
* **Expected Output**: scheduler forms and Jitsi iframe wrapper page `/meeting/:id`.
* **Acceptance Criteria**:
  - Admin scheduler allows scheduling batch-specific meetings.
  - Accessing the Jitsi URL mounts the public Jitsi Meet iframe with correct configuration overrides.
* **Risk / Impact**: Relies on external Jitsi API integration.

---

### WI-503: Pre-Meeting Privacy Consent flow
* **ID**: WI-503
* **Title**: Pre-Meeting Privacy Consent flow
* **Description**: Implement a gatekeeper privacy consent component that blocks Jitsi loading until approved. Saves logs in DB `meeting_consents`.
* **Priority**: High
* **Dependencies**: WI-104, WI-502
* **Expected Output**: Privacy warning card and database write hooks.
* **Acceptance Criteria**:
  - User cannot join video rooms until clicking "Accept".
  - Clicking accept writes log containing meeting ID, user ID, and timestamp.
* **Risk / Impact**: Essential compliance and privacy boundary.

---

## Phase 6: Attendance Logging Engine (Slice 5)

### WI-601: Session Lifecycle Logging API
* **ID**: WI-601
* **Title**: Session Lifecycle Logging API
* **Description**: Implement routes that record the initiation and termination of a user's meeting session. Compute attendance metrics on leave logs.
* **Priority**: High
* **Dependencies**: WI-503
* **Expected Output**: Endpoints: `POST /api/meetings/:id/join-log`, `POST /api/meetings/:id/leave-log`.
* **Acceptance Criteria**:
  - Logs join and leave events.
  - Calculates active minutes and marks status: Present ($\ge 75\%$), Partial ($30\% - 74\%$), Absent ($< 30\%$).
* **Risk / Impact**: Attendance calculation accuracy.

---

### WI-602: Frontend Join/Leave Triggers & Heartbeats
* **ID**: WI-602
* **Title**: Frontend Join/Leave Triggers & Heartbeats
* **Description**: Add iframe exit callbacks, browser window unload callbacks, and a 60-second heartbeat ping to backend.
* **Priority**: High
* **Dependencies**: WI-502, WI-601
* **Expected Output**: Active heartbeat network calls.
* **Acceptance Criteria**:
  - Closing Jitsi tab records a leave log.
  - Heartbeat checks handle database logs if connection drops.
* **Risk / Impact**: Prevents orphaned logs.

---

## Phase 7: Dashboards & Reports (Slice 6)

### WI-701: Attendance Metrics Query Engine
* **ID**: WI-701
* **Title**: Attendance Metrics Query Engine
* **Description**: Write SQL aggregator queries that sum duration statistics daily, weekly, monthly, and cohort-wise.
* **Priority**: Medium
* **Dependencies**: WI-601
* **Expected Output**: Endpoint: `GET /api/reports/attendance`.
* **Acceptance Criteria**:
  - API accepts filters: user ID, batch ID, dates.
  - Response structures numbers for active student dashboard graphs.
* **Risk / Impact**: Complex query load.

---

### WI-702: Dashboards and Analytical Reports Interface
* **ID**: WI-702
* **Title**: Dashboards and Analytical Reports Interface
* **Description**: Build the landing dashboards (KPI blocks, summaries) and filterable analytical tables.
* **Priority**: Medium
* **Dependencies**: WI-103, WI-701
* **Expected Output**: Admin dashboard, Student dashboard, and Reports page components.
* **Acceptance Criteria**:
  - Displays widgets showing total meetings attended and cumulative minutes.
  - Admin reports page sorts and displays records cleanly.
* **Risk / Impact**: UX quality and loading speeds.

---

## Phase 8: Authentication & Security Hardening (Blocker Phase)

### WI-801: Supabase Authentication Services Integration
* **ID**: WI-801
* **Title**: Supabase Authentication Services Integration
* **Description**: Configure Supabase Auth client on the frontend. Build the secure `/login` page and establish authentication hooks.
* **Priority**: Critical
* **Dependencies**: WI-702
* **Expected Output**: Secure frontend Auth Provider and user session cookies/tokens.
* **Acceptance Criteria**:
  - Replacing the mock selector bar with real password auth.
  - Logouts purge active JWT tokens from storage.
* **Risk / Impact**: Essential security gateway.

---

### WI-802: Backend JWT Validation Middleware & Role Checks
* **ID**: WI-802
* **Title**: Backend JWT Validation Middleware & Role Checks
* **Description**: Replace the Mock Session middleware with JWT validators. Backend validates tokens using Supabase libraries and verifies database roles.
* **Priority**: Critical
* **Dependencies**: WI-801
* **Expected Output**: Express JWT validation middleware.
* **Acceptance Criteria**:
  - Unauthenticated endpoints return `401 Unauthorized`.
  - Student role token accessing Admin API returns `403 Forbidden`.
* **Risk / Impact**: Security gating. Any code regressions here block api traffic.

---

### WI-803: Secure Frontend Route Guards
* **ID**: WI-803
* **Title**: Secure Frontend Route Guards
* **Description**: Convert mock routing to real React protected routes. Users are forced to log in before viewing dashboards.
* **Priority**: Critical
* **Dependencies**: WI-802
* **Expected Output**: Route guards in React Router.
* **Acceptance Criteria**:
  - Direct URL entry to `/admin` redirects unlogged users to `/login`.
  - Authenticated students trying to access admin pages are redirected.
* **Risk / Impact**: Frontend security framework.

---

### WI-804: Supabase Row Level Security (RLS) Policies
* **ID**: WI-804
* **Title**: Supabase Row Level Security (RLS) Policies
* **Description**: Write and enable PostgreSQL RLS rules on the Supabase database. Add policies for `mail_messages` (receiver/sender only) and `batch_settings`.
* **Priority**: Critical
* **Dependencies**: WI-802
* **Expected Output**: Enabled RLS on all Supabase tables.
* **Acceptance Criteria**:
  - DB client without credentials cannot read database rows.
  - Students cannot read mailbox messages not matching their ID.
* **Risk / Impact**: Critical database access restrictions.

---

## Phase 9: Release and Deployment

### WI-901: Multi-Role Integration & Staging Validation
* **ID**: WI-901
* **Title**: Multi-Role Integration & Staging Validation
* **Description**: Complete integration testing on a staging environment. Verify that all components function cleanly under the real auth setup.
* **Priority**: High
* **Dependencies**: All previous WIs
* **Expected Output**: Signed-off test log.
* **Acceptance Criteria**:
  - End-to-end user scenario passes without issues or leaks.
* **Risk / Impact**: Regression validation.

---

### WI-902: Render Free Tier Deployment Configurations
* **ID**: WI-902
* **Title**: Render Free Tier Deployment Configurations
* **Description**: Configure Render static site for the frontend and Render web service for the Express API. Apply all production environment variables.
* **Priority**: High
* **Dependencies**: WI-901
* **Expected Output**: Production deployment setup and live URLs.
* **Acceptance Criteria**:
  - Static app compiles and renders.
  - Frontend communicates with backend API using HTTPS.
* **Risk / Impact**: Production launch.
