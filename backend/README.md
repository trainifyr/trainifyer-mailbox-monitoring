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
