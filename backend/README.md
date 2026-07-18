# Trainifyer Backend API

Express API server for the Trainifyer Mailbox Monitoring Platform.

## Setup
1. Copy `.env.example` to `.env` and fill in the placeholders.
2. Install dependencies: `npm install`
3. Start in development: `npm run dev` (starts on port 5000)

## Authentication
This API is protected by **Supabase Auth**.  
All protected routes require a `Authorization: Bearer <JWT>` header. The server verifies the JWT using the `SUPABASE_JWT_SECRET` (HS256) and resolves your profile from the `public.users` table.

## Database Management
*   **Initialize**: `npm run db:init` (Applies schema and RLS policies)
*   **Verify**: `npm run db:verify` (Checks table and trigger existence)
*   **Health**: `GET /api/health` (Basic uptime check)
*   **DB Health**: `GET /api/health/db` (Confirms DB connectivity — used by Uptime Robot)

## Route Overview

### Students & Batches
*   `GET /api/users/students` — List all students (supports `?batchId=` filter)
*   `POST /api/users/students` — Create student + Supabase Auth account (Admin only)
*   `PATCH /api/users/students/:id` — Update student name/email (Admin only)
*   `DELETE /api/users/students/:id` — Delete student and Auth account (Admin only)
*   `GET /api/batches` — List all cohorts
*   `POST /api/batches` — Create batch (Admin only)
*   `PATCH /api/batches/:id` — Update batch name/status (Admin only)
*   `PATCH /api/batches/:id/archive` — Archive/restore a batch (Admin only)
*   `PATCH /api/batches/:id/settings` — Update batch feature flags (Admin only)
*   `GET /api/batches/:id/students` — List students in a batch
*   `POST /api/batches/:id/students` — Assign student to batch (Admin only)
*   `DELETE /api/batches/:id/students/:studentId` — Remove student from batch (Admin only)

### Communications & Meetings
*   `GET /api/mail/inbox` — Private messaging
*   `GET /api/meetings` — Meeting scheduler
*   `POST /api/meetings/:id/join-log` — Attendance entry
*   `POST /api/meetings/:id/heartbeat` — Activity tracking (60s interval)
*   `POST /api/meetings/:id/leave-log` — Close attendance log and compute percentage
*   `GET /api/meetings/:id/active-participants` — Lobby participant list (real-time)

### Analytics & Reports
*   `GET /api/reports/attendance` — Full metric aggregation (Admin: all; Student: self only)
*   `GET /api/reports/attendance/student/:id` — Per-student daily attendance sheet including implicit absences for missed recurring & one-off sessions

For full project details, see the root [README](../README.md).
