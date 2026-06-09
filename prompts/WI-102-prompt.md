# WI-102 — Express API Server Setup with Mock Session Middleware

> **GitHub Issue**: #2
> **Phase**: 1 — Skeleton Setup & Mock Session Context
> **Priority**: High
> **Dependencies**: WI-101
> **Project**: Trainifyer Mailbox Monitoring Platform

---

## Context

WI-101 created the baseline folder structure and configuration. This work item brings the **backend to life** by setting up the Express server and a **Mock Session Middleware** that simulates authenticated users without real login.

> ⚠️ **Mock Context-First Rule**: This middleware is **temporary**. It reads `role` and `userId` from headers/query parameters so that frontend developers and the AI agent can simulate Admin and Student users during Phases 1–7. In **Phase 8 (WI-802)**, this mock will be replaced with real JWT validation.
>
> ⚠️ **Mark for Removal**: Add clear `// TODO(PHASE-8: REPLACE WITH JWT)` comments wherever the mock is used, so the security-hardening phase can find and replace it.
>
> ⚠️ **No Secret Commits Rule**: All environment values must live in `.env` and be ignored by git.

---

## Reference Documents

Before starting, read these files in the project root:
- `WORKITEMS.md` — Acceptance criteria for WI-102
- `GOALS.md` — Sub-Goal 1 (Authentication/RBAC) and Sub-Goal 2 (Cohort Management)
- `DEPENDENCIES.md` — Approved Express, helmet, dotenv, cors versions
- `HANDOFF.md` — Mock session discipline and rules
- `prompts/WI-101-prompt.md` — To understand the baseline you are building on
- `VALIDATION.md` — Verification approach for the health check

---

## Scope of This Work Item

- Create the main Express entrypoint `backend/index.js`.
- Load environment variables from `.env` via `dotenv`.
- Apply security headers via `helmet`.
- Enable CORS for local frontend development.
- Implement the **Mock Session Middleware**.
- Expose a health check endpoint at `GET /api/health`.
- Confirm hot-reload works in development.

---

## Step-by-Step Instructions

### 1. Create `backend/index.js`
This is the main entrypoint. Structure it cleanly:

```js
// Load env FIRST
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const mockSession = require('./src/middleware/mockSession');

const app = express();
const PORT = process.env.PORT || 5000;

// Security & parsing
app.use(helmet());
app.use(cors());
app.use(express.json());

// Mock session (PHASE 1-7 only)
app.use(mockSession);

// Health check
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    mockUser: {
      role: req.mockUserRole || null,
      id: req.mockUserId || null
    },
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found', path: req.originalUrl });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('[ERROR]', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error'
  });
});

app.listen(PORT, () => {
  console.log(`[INFO] Trainifyer backend running on port ${PORT}`);
  console.log(`[INFO] Health check: http://localhost:${PORT}/api/health`);
});
```

### 2. Create the Mock Session Middleware
Create `backend/src/middleware/mockSession.js`:

```js
// TODO(PHASE-8: REPLACE WITH JWT): This mock middleware reads user identity
// from request headers/query parameters. In Phase 8 (WI-802), it will be
// replaced with real Supabase JWT validation.

module.exports = function mockSession(req, res, next) {
  // Prefer headers, fall back to query parameters
  const role =
    req.header('x-mock-role') ||
    req.query.role ||
    null;

  const userId =
    req.header('x-mock-user-id') ||
    req.query.userId ||
    null;

  req.mockUserRole = role;
  req.mockUserId = userId;

  console.log(
    `[MOCK SESSION] ${req.method} ${req.originalUrl} -> role=${role || 'anonymous'} userId=${userId || 'anonymous'}`
  );

  next();
};
```

### 3. Create the folder structure for the backend
```
backend/
├── index.js
├── package.json
├── .env
├── .env.example
├── .gitignore
└── src/
    └── middleware/
        └── mockSession.js
```

### 4. Confirm scripts in `package.json`
Verify these scripts are present:
- `"start": "node index.js"`
- `"dev": "nodemon index.js"`
- `"test": "jest --passWithNoTests"`

### 5. Update `backend/README.md`
Create `backend/README.md` with:
```
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
```

### 6. Verify the server boots
From the `backend/` directory:
```bash
npm run dev
```
You should see:
```
[MOCK SESSION] GET /api/health -> role=anonymous userId=anonymous
[INFO] Trainifyer backend running on port 5000
```

### 7. Verify the health check responds
With the server running, test:
```bash
# Without mock user
curl http://localhost:5000/api/health

# With header
curl -H "x-mock-role: ADMIN" -H "x-mock-user-id: 123" http://localhost:5000/api/health

# With query
curl "http://localhost:5000/api/health?role=STUDENT&userId=999"
```
The first should return `null` for `role` and `id`. The second and third should echo the values.

### 8. Verify hot-reload
- Edit a console log line in `index.js`.
- Save the file.
- Confirm nodemon restarts the server automatically.

---

## Expected Output (File Checklist)

- [ ] `backend/index.js` — Express entrypoint
- [ ] `backend/src/middleware/mockSession.js` — Mock session middleware
- [ ] `backend/README.md` — Backend documentation
- [ ] `backend/.env` — Local env (git-ignored)
- [ ] `backend/.env.example` — Env template
- [ ] `backend/package.json` — Updated with `helmet` dependency

---

## Acceptance Criteria

- `GET /api/health` returns `200` with `status: "healthy"` and the mock user context.
- Mock session reads `x-mock-role` and `x-mock-user-id` headers first, then falls back to `role` and `userId` query parameters.
- Every request logs a `[MOCK SESSION]` line with method, path, role, and userId.
- `npm run dev` uses nodemon and hot-reloads on file changes.
- `helmet` is applied globally for security headers.
- CORS is enabled for local frontend development.
- The mock middleware is clearly marked `// TODO(PHASE-8: REPLACE WITH JWT)` for easy removal later.

---

## Risk / Impact

- The mock middleware is a **temporary placeholder**. If accidentally left in production in Phase 8, it would expose a critical security hole. The TODO comment is essential.
- Do not connect this server to Supabase or real Auth yet — those integrations are Phase 8 work items.

---

## Post-Implementation Steps (MANDATORY)

Once the file checklist and acceptance criteria are satisfied:

### 1. Update `PROGRESS.md`
- Change the status of **WI-102** from `Not Started` to `Done`.
- Increment the `Done` and `Completion %` columns in the Phase 1 progress table.

### 2. Update `CHANGELOG.md`
Add a new entry at the top:
```
## [YYYY-MM-DD] - WI-102: Express API Server Setup with Mock Session Middleware
* **Work Item ID**: WI-102
* **Summary**: Set up Express server with helmet, CORS, and a Mock Session middleware that reads role and userId from request headers or query parameters. Health check endpoint exposed at /api/health.
* **Files Affected**:
  - [NEW] `backend/index.js`
  - [NEW] `backend/src/middleware/mockSession.js`
  - [NEW] `backend/README.md`
  - [MODIFIED] `backend/package.json` (added helmet, mockSession require path)
* **Verification Done**:
  - [x] Server boots on PORT 5000
  - [x] `GET /api/health` returns 200 with mock user context
  - [x] Mock session reads headers and query parameters
  - [x] Nodemon hot-reload works
  - [x] Mock middleware marked for Phase 8 replacement
* **Impact on Existing Functionality**: None. Backend skeleton now functional.
```

### 3. Stop and Wait
Do **not** begin WI-103 in the same session. Wait for the developer to verify and trigger the next prompt.

---

## Notes for the AI Agent

- Do not write any route handlers beyond `/api/health` — those are added in WI-201, WI-401, etc.
- Do not initialize Supabase clients yet — that is WI-104.
- Do not create the frontend — that is WI-103.
- Always emit a `// TODO(PHASE-8: REPLACE WITH JWT)` comment on any code that uses the mock context, so the security phase has a clear hit list.
- Use CommonJS (`require`) syntax to match the sample entrypoint.
