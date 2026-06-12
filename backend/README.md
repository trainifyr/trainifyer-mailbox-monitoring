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
*   **Health**: `GET /api/health/db` (Confirms DB connectivity)

## Route Overview

### Students & Batches
*   `GET /api/users/students` — List students
*   `POST /api/users/students` — Create student (Admin only)
*   `GET /api/batches` — List cohorts
*   `PATCH /api/batches/:id/settings` — Update features (Admin only)

### Communications & Meetings
*   `GET /api/mail/inbox` — Private messaging
*   `GET /api/meetings` — Meeting scheduler
*   `POST /api/meetings/:id/join-log` — Attendance entry
*   `POST /api/meetings/:id/heartbeat` — Activity tracking

### Analytics
*   `GET /api/reports/attendance` — Full metric aggregation (Admin see all, Student see self)

For full project details, see the root [README](../README.md).
