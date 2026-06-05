# Project Goals

This document specifies the target objectives, sub-goals, and success criteria for the **Student Learning Monitoring and Internal Communication Platform** MVP.

---

## 1. Overall Goal

Build and deploy a secure, student-focused online learning monitoring and internal communication platform MVP. The system allows an organization's administrator/teacher to manage student cohorts (batches), monitor attendance and meeting duration, configure system-wide features, and enable database-backed internal mailbox messaging. 

All of this must be achieved with a **zero-cost hosting architecture** using Supabase Free Tier, Render Free Tier, and public Jitsi Meet iframe integration.

---

## 2. Sub-Goals

### Sub-Goal 1: Authentication & Role-Based Access Control (RBAC)
* Establish secure, database-backed authentication using Supabase Auth.
* Support two distinct application roles:
  1. **ADMIN**: Full administrative controls (CRUD operations on users, batches, meetings; dashboard access; permission overrides).
  2. **STUDENT**: Restricted portal (access to mailbox, joining assigned meetings, viewing own attendance logs if enabled).
* Implement Route Guards in React and JWT validation middleware in Express to secure backend APIs and frontend pages.

### Sub-Goal 2: User and Class Organization (Cohort Management)
* Enable manual registration of Student accounts by the Admin (no student self-registration).
* Build Batch/Class management to support cohort grouping (MVP supports one student in one batch).
* Establish a database design ready for future multi-batch/multi-class expansion.

### Sub-Goal 3: Feature & Permission Configuration
* Design a configuration system at the batch level, managed by the Admin.
* Admin controls:
  - Enable/disable mailbox access for students.
  - Configure mailbox scope: Student can message Admin only, or Student can message other students.
  - Enable/disable meeting join permissions for the batch.
  - Configure default meeting requirements: Camera (ON/OFF), Mic (ON/OFF), and Screen Sharing (Required/Optional).

### Sub-Goal 4: Database-Backed Mailbox System
* Create an internal Outlook-style messaging system operating completely inside the PostgreSQL database (no SMTP/email server dependency).
* Features: Inbox, Sent, Compose Message, Message reading pane, and Read/Unread indicators.
* Enforce messaging restrictions dynamically according to Admin configurations.

### Sub-Goal 5: Meeting System Integration (Jitsi iframe)
* Embed public Jitsi Meet inside the web portal using Jitsi's iframe integration.
* Support two meeting types:
  1. **Batch/Internal Meeting**: Restricted to students registered in the meeting's batch.
  2. **Public Meeting**: Accessible by external guests via a public URL who enter their name before joining.
* Enforce browser-level privacy controls: Show a prominent **Consent Screen** before entering a monitored meeting session. No secret tracking is allowed.

### Sub-Goal 6: Automated Attendance & Duration Calculation
* Track student participation duration automatically.
* Log meeting `join` and `leave` times to compute:
  $$\text{Attendance Percentage} = \frac{\text{Student Total Meeting Time}}{\text{Total Conducted Meeting Duration}} \times 100$$
* Assign attendance status thresholds:
  - **Present**: $\ge 75\%$ duration.
  - **Partial**: $30\% \le \text{duration} < 75\%$.
  - **Absent**: $< 30\%$ duration.

### Sub-Goal 7: Dashboards and Analytical Reporting
* **Admin Dashboard**: Aggregates metrics (Active students today, overall cohort statistics, mailbox activity overview, meeting attendance logs).
* **Student Dashboard**: Shows personal logs (assigned batch, upcoming meetings, personal attendance statistics, inbox snippet).
* **Reports Module**: Generates daily, weekly, monthly, student-wise, batch-wise, and meeting-wise attendance logs.

### Sub-Goal 8: Production Release & Deployment
* Deploy the React frontend and Express backend as separate services on Render.
* Configure Supabase PostgreSQL DB and Auth environments.
* Document building and starting instructions for local and cloud environments.

---

## 3. Success Criteria

The MVP is considered successfully completed and ready for release when all the following conditions are met:

### Functional Criteria
- [ ] **Admin Login**: Admin can successfully authenticate and is redirected to the Admin dashboard.
- [ ] **Student Account Creation**: Admin can manually create student accounts, resulting in rows in Supabase Auth and the database `users` table.
- [ ] **Student Login**: Students can login using admin-generated credentials.
- [ ] **Batch CRUD**: Admin can create, edit, activate/deactivate, and view students in batches.
- [ ] **Mailbox Permission Boundary**:
  - If Student-to-Student messaging is disabled: Student can only search and message Admin.
  - If disabled completely: Student cannot access mailbox.
- [ ] **Meeting Management**: Admin can generate batch meetings and public meeting links.
- [ ] **Meeting Join & Consent**:
  - Student is presented with a privacy consent message before joining Jitsi.
  - Student cannot enter the Jitsi iframe if consent is rejected.
  - Jitsi iframe initializes correctly for video/audio.
- [ ] **Attendance Log Accuracy**: System registers join time on iframe load and leave time on iframe destroy. Attendance percentage calculates correctly.
- [ ] **Analytical Reports**: Admin can view correct daily, weekly, monthly, student-wise, batch-wise, and meeting-wise attendance tables.

### Security & Architecture Criteria
- [ ] **API Security**: All Express backend endpoints (except public meeting details) validate JWT tokens. Admin APIs reject student tokens with `403 Forbidden`.
- [ ] **No Secret Exposure**: No database service role keys or sensitive passwords are committed to Git or exposed to the frontend.
- [ ] **Build Validation**: Frontend and backend build commands compile successfully without errors or lints (`npm run build` succeeds).
- [ ] **Render Deployability**: The applications run in a remote production environment using environment variables.
