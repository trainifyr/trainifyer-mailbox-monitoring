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
