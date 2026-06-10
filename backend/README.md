# Trainifyer Backend

Express API server for the Trainifyer Mailbox Monitoring Platform.

## Setup
1. Copy `.env.example` to `.env` and fill in the placeholders.
2. Install dependencies: `npm install`
3. Start in development mode: `npm run dev`
4. The server will start on `http://localhost:5000`.

## Health Check
`GET /api/health` returns server status and the current mock user context.

## Mock Session (Phase 1-7)
You can simulate any user by sending:
- Header: `x-mock-role: ADMIN` and `x-mock-user-id: 123`
- Or query: `?role=ADMIN&userId=123`

Example:
`curl http://localhost:5000/api/health?role=ADMIN&userId=42`

## Database

This service connects to a Supabase PostgreSQL database.

- Apply the schema: `npm run db:init`
- Verify the schema: `npm run db:verify`
- Health check (DB): `GET /api/health/db` — returns the list of public tables.

Row Level Security is **OFF** in Phase 1. It is enabled in Phase 8 (WI-804).

## Routes

### Health
- `GET /api/health` — Basic health check with mock user context
- `GET /api/health/db` — Database connectivity check (lists public tables)

### Students (WI-201)
- `GET /api/users/students` — List all students (optional `?batchId=` filter)
- `POST /api/users/students` — Create a student (Admin only)
- `PATCH /api/users/students/:id` — Update a student's name/email (Admin only)

### Batches (WI-201)
- `GET /api/batches` — List all batches with student count
- `POST /api/batches` — Create a batch + default settings (Admin only)
- `PATCH /api/batches/:id` — Update batch name/status (Admin only)
- `GET /api/batches/:id/students` — List students assigned to a batch
- `POST /api/batches/:id/students` — Assign a student to a batch (Admin only)

### Batch Settings (WI-301)
- `GET /api/batches/:id/settings` — Get settings for a batch
- `PATCH /api/batches/:id/settings` — Update settings for a batch (Admin only)

### Mailbox (WI-401)
- `GET /api/mail/inbox` — List received messages (paginated)
- `GET /api/mail/sent` — List sent messages (paginated)
- `POST /api/mail/send` — Send a message (permission-checked)
- `PATCH /api/mail/:id/read` — Mark a message as read

### Meetings (WI-501)
- `GET /api/meetings` — List visible meetings (scoped by role and batch)
- `POST /api/meetings` — Create a meeting with auto-generated Jitsi room name (Admin only)
- `POST /api/meetings/public/join` — Register to join a public meeting (authenticated or anonymous)

### Meeting Consent (WI-503)
- `GET /api/meetings/:id/consent` — Check if the current user has consented
- `POST /api/meetings/:id/consent` — Record privacy consent for a meeting

### Attendance Logs (WI-601)
- `POST /api/meetings/:id/join-log` — Record a user joining a meeting (creates attendance_log row)
- `POST /api/meetings/:id/leave-log` — Record a user leaving a meeting (computes duration, percentage, status)
