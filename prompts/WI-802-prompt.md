# WI-802 — Backend JWT Validation Middleware & Role Checks

> **GitHub Issue**: #19
> **Phase**: 8 — Authentication & Security Hardening (Blocker Phase)
> **Priority**: Critical
> **Dependencies**: WI-801
> **Project**: Trainifyer Mailbox Monitoring Platform

---

## Context

WI-801 added real Supabase Auth on the frontend — the Axios client now injects an `Authorization: Bearer <JWT>` header when the user is signed in. But the backend still runs the Phase 1–7 `mockSession.js` middleware, which reads `x-mock-role` and `x-mock-user-id` headers from the request. JWT tokens are completely ignored.

This work item replaces the mock session middleware with a real JWT validation middleware that:

1. Extracts the Bearer token from the `Authorization` header.
2. Verifies the JWT using `jsonwebtoken` and the Supabase project's JWT secret.
3. Looks up the user's profile (including role) from the `public.users` table.
4. Sets `req.user` with the authenticated user's info.
5. Falls back to mock headers when no JWT is present (dev mode — removed in WI-803).

The `requireRole` middleware is updated to check `req.user.role` instead of `req.mockUserRole`.

> ⚠️ **Supabase JWT Secret**: You need the Supabase JWT Secret to verify tokens locally. Find it in your Supabase Dashboard: Project Settings → API → JWT Secret. Add it as `SUPABASE_JWT_SECRET` in `backend/.env`. Without it, JWT verification will fail and the middleware will reject requests.

---

## Reference Documents

Before starting, read these files in the project root:

- `WORKITEMS.md` — Acceptance criteria for WI-802
- `GOALS.md` — Sub-Goal 1 (Authentication & Role-Based Access Control)
- `DEPENDENCIES.md` — Approved package versions (`jsonwebtoken`)
- `backend/.env.example` — Environment variables
- `backend/src/middleware/mockSession.js` — The middleware being replaced
- `backend/src/lib/requireRole.js` — The role-check middleware being updated
- `backend/index.js` — Where middleware is registered
- `backend/db/schema.sql` — `public.users` table structure
- `prompts/WI-801-prompt.md` — Frontend auth context (sends JWT as Bearer token)

---

## Scope of This Work Item

### Backend
- **Install** `jsonwebtoken` in `backend/`.
- **Add** `SUPABASE_JWT_SECRET` to `backend/.env.example`.
- **Replace** `backend/src/middleware/mockSession.js` with a JWT validation middleware that:
  - Reads `Authorization: Bearer <token>` header.
  - Verifies the JWT using `jsonwebtoken.verify()` with `SUPABASE_JWT_SECRET`.
  - Extracts `sub` (user UUID) from the decoded token.
  - Queries `public.users` for the user's profile (id, email, full_name, role).
  - Sets `req.user` with the profile object (or `null` if unauthenticated).
  - Falls back to `x-mock-role`/`x-mock-user-id` headers when no JWT is present (dev mode).
  - Sets `req.mockUserRole` and `req.mockUserId` for backward compatibility with existing routes.
- **Update** `backend/src/lib/requireRole.js` to check `req.user?.role` instead of `req.mockUserRole`.
- **Update** `backend/index.js`:
  - Replace `mockSession` import/usage with the new JWT middleware.
  - Update the `/api/health` endpoint to return `req.user` instead of `req.mockUserRole`/`req.mockUserId`.

---

## Step-by-Step Instructions

### 1. Install `jsonwebtoken`

```bash
cd backend
npm install jsonwebtoken
```

### 2. Update `backend/.env.example`

Add the JWT secret configuration:

```
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Supabase JWT Secret (find in Supabase Dashboard: Project Settings → API → JWT Secret)
# Used to verify auth tokens on the server.
SUPABASE_JWT_SECRET=your-jwt-secret
```

### 3. Replace `backend/src/middleware/mockSession.js`

```js
const { verify } = require('jsonwebtoken');
const { Pool } = require('pg');

// Lazy-init pool so the server boots even if DATABASE_URL is missing
let pool = null;
function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL?.includes('localhost')
        ? false
        : { rejectUnauthorized: false }
    });
  }
  return pool;
}

const JWT_SECRET = process.env.SUPABASE_JWT_SECRET;

/**
 * JWT Auth Middleware
 *
 * Extracts user identity from:
 *   1. Authorization: Bearer <JWT> (Supabase real auth)
 *   2. x-mock-role / x-mock-user-id headers (dev mode — TODO(PHASE-8: REMOVE))
 *
 * Sets req.user = { id, email, full_name, role } | null
 * Also sets req.mockUserRole and req.mockUserId for backward compat.
 */
async function authMiddleware(req, res, next) {
  try {
    const authHeader = req.header('Authorization');

    // --- Strategy 1: JWT Bearer token ---
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);

      if (!JWT_SECRET) {
        console.error('[AUTH] SUPABASE_JWT_SECRET is not configured. JWT verification disabled.');
        // Fall through to mock fallback
      } else {
        try {
          const decoded = verify(token, JWT_SECRET, {
            algorithms: ['HS256']
          });

          const userId = decoded.sub;

          if (userId) {
            // Fetch user profile from database
            const db = getPool();
            const { rows } = await db.query(
              `SELECT id, email, full_name, role FROM public.users WHERE id = $1`,
              [userId]
            );

            if (rows.length > 0) {
              const user = rows[0];
              req.user = user;
              req.mockUserRole = user.role;
              req.mockUserId = user.id;

              console.log(
                `[AUTH] ${req.method} ${req.originalUrl} -> JWT user=${user.full_name} role=${user.role}`
              );

              return next();
            } else {
              console.warn(`[AUTH] JWT user ${userId} not found in public.users table`);
            }
          }
        } catch (jwtErr) {
          console.warn('[AUTH] JWT verification failed:', jwtErr.message);
          // Fall through to mock fallback
        }
      }
    }

    // --- Strategy 2: Mock headers (dev mode) ---
    // TODO(PHASE-8: REMOVE) - Remove this fallback when WI-803 enforces real auth
    const mockRole = req.header('x-mock-role') || req.query.role || null;
    const mockUserId = req.header('x-mock-user-id') || req.query.userId || null;

    if (mockRole && mockUserId) {
      req.user = {
        id: mockUserId,
        email: `${mockUserId}@mock.local`,
        full_name: `Mock ${mockRole}`,
        role: mockRole
      };
      req.mockUserRole = mockRole;
      req.mockUserId = mockUserId;

      console.log(
        `[AUTH] ${req.method} ${req.originalUrl} -> MOCK role=${mockRole} userId=${mockUserId}`
      );

      return next();
    }

    // --- Unauthenticated ---
    req.user = null;
    req.mockUserRole = null;
    req.mockUserId = null;

    console.log(
      `[AUTH] ${req.method} ${req.originalUrl} -> anonymous`
    );

    next();
  } catch (err) {
    next(err);
  }
}

module.exports = authMiddleware;
```

### 4. Update `backend/src/lib/requireRole.js`

```js
/**
 * Middleware that rejects requests when req.user.role does not match
 * the required role. Works with both JWT auth and mock session.
 */

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: `Requires one of the following roles: ${roles.join(', ')}`
      });
    }
    next();
  };
}

module.exports = requireRole;
```

### 5. Update `backend/index.js`

Replace mockSession with the JWT auth middleware and update the health endpoint:

```js
// Load env FIRST
require('dotenv').config();

const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');

const authMiddleware = require('./src/middleware/authMiddleware');

const app  = express();
const PORT = process.env.PORT || 5000;

// Security & parsing
app.use(helmet());
app.use(cors());
app.use(express.json());

// Auth middleware (JWT + mock fallback)
app.use(authMiddleware);

// -- Health check: basic
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    auth: req.user
      ? { method: req.user.email?.includes('@mock.local') ? 'mock' : 'jwt', user: req.user }
      : { method: 'none', user: null },
    timestamp: new Date().toISOString()
  });
});

// -- Health check: database connectivity
app.get('/api/health/db', async (req, res) => {
  try {
    const supabase = require('./src/lib/supabaseClient');
    const { data, error } = await supabase.rpc('list_public_tables');
    if (error) throw error;
    res.status(200).json({
      status: 'healthy',
      tables: data.map((r) => r.tablename),
      timestamp: new Date().toISOString()
    });
  } catch (e) {
    res.status(500).json({
      status: 'unhealthy',
      error: e.message,
      timestamp: new Date().toISOString()
    });
  }
});

// -- Cohort CRUD routes (WI-201) --
app.use('/api/users/students', require('./src/routes/students'));
app.use('/api/batches',        require('./src/routes/batches'));
app.use('/api/batches/:id/settings', require('./src/routes/batchSettings'));
app.use('/api/mail',           require('./src/routes/mail'));
app.use('/api/meetings',       require('./src/routes/meetings'));
app.use('/api/meetings/:id/consent', require('./src/routes/meetingConsent'));

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
  console.log(`[INFO] Health check:    http://localhost:${PORT}/api/health`);
  console.log(`[INFO] DB health check: http://localhost:${PORT}/api/health/db`);
});
```

### 6. Verify the backend starts

```bash
cd backend
npm run dev
```

Expected: Server starts on port 5000 without errors.

### 7. Manual verification — JWT auth

```bash
# --- Setup: Get a valid JWT token from Supabase ---
# Option A: Use the frontend login page, then copy the JWT from DevTools
#   (Application → Local Storage → supabase-auth-token)
#
# Option B: Use the Supabase API directly (replace with your project ref)
curl -X POST https://<PROJECT_REF>.supabase.co/auth/v1/token?grant_type=password \
  -H "Content-Type: application/json" \
  -H "apikey: <SUPABASE_ANON_KEY>" \
  -d '{"email": "admin@test.com", "password": "your-password"}'
# Save the access_token from the response.

# --- 1. Health check without auth ---
curl http://localhost:5000/api/health
# Expected: 200, auth.method = "none", auth.user = null

# --- 2. Health check with mock headers (dev fallback) ---
curl http://localhost:5000/api/health \
  -H "x-mock-role: ADMIN" \
  -H "x-mock-user-id: 00000000-0000-0000-0000-000000000001"
# Expected: 200, auth.method = "mock", auth.user has the mock identity

# --- 3. Health check with real JWT ---
curl http://localhost:5000/api/health \
  -H "Authorization: Bearer <YOUR_JWT_TOKEN>"
# Expected: 200, auth.method = "jwt", auth.user has the real user profile
# The response should include id, email, full_name, and role from public.users

# --- 4. Admin route with valid JWT ---
curl http://localhost:5000/api/batches \
  -H "Authorization: Bearer <ADMIN_JWT_TOKEN>"
# Expected: 200 with batch list (Admin has access)

# --- 5. Admin route with student JWT (should fail) ---
curl http://localhost:5000/api/batches \
  -H "Authorization: Bearer <STUDENT_JWT_TOKEN>"
# Expected: 403 Forbidden (requireRole rejects non-Admin)

# --- 6. Admin route without auth ---
curl http://localhost:5000/api/batches
# Expected: 403 Forbidden (no req.user, requireRole rejects)

# --- 7. Invalid JWT ---
curl http://localhost:5000/api/health \
  -H "Authorization: Bearer invalid-token"
# Expected: 200 (health is public), auth.method = "none", auth.user = null
# The JWT fails verification, falls through to anonymous

# --- 8. Tampered JWT ---
curl http://localhost:5000/api/health \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkZhZGUifQ.invalid-signature"
# Expected: 200 (health is public), auth.method = "none"
# JWT verification throws, falls through to anonymous
```

### 8. Verify all existing routes still work with mock headers

Test that the mock fallback still works for all existing development workflows:

```bash
# 1. List students (no auth gate)
curl http://localhost:5000/api/users/students
# Expected: 200 with student list (or empty array)

# 2. Create batch (Admin mock)
curl -X POST http://localhost:5000/api/batches \
  -H "Content-Type: application/json" \
  -H "x-mock-role: ADMIN" \
  -H "x-mock-user-id: 00000000-0000-0000-0000-000000000001" \
  -d '{"name": "Test Batch"}'
# Expected: 201

# 3. Student list meetings
curl http://localhost:5000/api/meetings \
  -H "x-mock-role: STUDENT" \
  -H "x-mock-user-id: 00000000-0000-0000-0000-000000000002"
# Expected: 200 with meetings (student-scoped)

# 4. Consent endpoint
curl -X POST http://localhost:5000/api/meetings/<MEETING_ID>/consent \
  -H "x-mock-role: STUDENT" \
  -H "x-mock-user-id: 00000000-0000-0000-0000-000000000002"
# Expected: 201 (or 200 if already consented)
```

---

## Expected Output (File Checklist)

### Backend
- [ ] `backend/package.json` — Added `jsonwebtoken` dependency
- [ ] `backend/.env.example` — Added `SUPABASE_JWT_SECRET`
- [ ] `backend/src/middleware/authMiddleware.js` — NEW: JWT validation + mock fallback
- [ ] `backend/src/middleware/mockSession.js` — REPLACED (now unused, kept for reference or deleted)
- [ ] `backend/src/lib/requireRole.js` — Updated to check `req.user?.role`
- [ ] `backend/index.js` — Uses `authMiddleware` instead of `mockSession`, updated health endpoint

---

## Acceptance Criteria

- `Authorization: Bearer <valid_jwt>` header is verified using `jsonwebtoken.verify()` with `SUPABASE_JWT_SECRET` (HS256 algorithm).
- The decoded JWT's `sub` claim is used to look up the user in `public.users`.
- If the user exists, `req.user` is set to `{ id, email, full_name, role }`.
- If the JWT is missing, invalid, or the user is not found in `public.users`, the middleware falls back to `x-mock-role`/`x-mock-user-id` headers (dev mode).
- If neither JWT nor mock headers are present, `req.user` is `null` (anonymous).
- `req.mockUserRole` and `req.mockUserId` are still set for backward compatibility with all existing route handlers.
- `requireRole()` checks `req.user?.role` and returns `403` if the role doesn't match (or if `req.user` is null).
- All existing routes continue to work with mock headers (no regressions).
- Health check returns `auth.method` (`jwt`/`mock`/`none`) and `auth.user` info.
- `SUPABASE_JWT_SECRET` is documented in `.env.example`.
- `npm run dev` starts without errors.

---

## JWT Verification Flow

```
Request with Authorization: Bearer <token>
  │
  ▼
authMiddleware.js
  │
  ├── Extract token from header
  │
  ├── Verify JWT with jsonwebtoken.verify(token, SUPABASE_JWT_SECRET, { algorithms: ['HS256'] })
  │     │
  │     ├── Valid ──► Extract sub (user UUID)
  │     │               │
  │     │               ▼
  │     │          Query public.users WHERE id = sub
  │     │               │
  │     │               ├── Found ──► req.user = { id, email, full_name, role }
  │     │               │              req.mockUserRole = user.role
  │     │               │              req.mockUserId = user.id
  │     │               │
  │     │               └── Not found ──► Log warning, fall through
  │     │
  │     └── Invalid/expired ──► Log warning, fall through
  │
  ├── Fallback: x-mock-role / x-mock-user-id headers (dev mode)
  │     │
  │     ├── Present ──► req.user = { id, email, full_name, role } (mock)
  │     │                 req.mockUserRole = mockRole
  │     │                 req.mockUserId = mockUserId
  │     │
  │     └── Absent ──► req.user = null (anonymous)
  │                      req.mockUserRole = null
  │                      req.mockUserId = null
  │
  └── next()
```

---

## Risk / Impact

- **`SUPABASE_JWT_SECRET` is critical**: If this env var is missing or wrong, JWT verification fails silently and the middleware falls back to mock headers (or anonymous). The server logs a warning on startup. For production, this must be set correctly.
- **JWT fallback to mock**: The mock header fallback is kept for development convenience. Routes that don't require auth (health check, public meetings list) work anonymously. Admin-only routes reject with 403 when no valid auth is present. This ensures the app doesn't break for developers who are still using the MockIdentityBar.
- **Database query on every request**: The middleware makes a `SELECT` query to `public.users` on every authenticated request. This adds latency. For high-traffic deployments, consider adding a `redis` cache layer. For the MVP with < 100 concurrent users, the direct query is acceptable.
- **No Supabase `auth.users` sync**: The middleware queries `public.users`, not `auth.users`. If a user is deleted from `auth.users` (Supabase Auth) but their row remains in `public.users`, the JWT will still verify but the middleware will set `req.user` with stale data. This is acceptable because user deletion is an admin-only operation and the `public.users` row should also be deleted.
- **Query parameter auth removed**: The old `mockSession.js` supported `?role=ADMIN&userId=123` query parameters. The new middleware does NOT support this — only headers (`Authorization: Bearer` or `x-mock-role`/`x-mock-user-id`). This is intentional: query parameter auth is a security risk (URLs get logged, cached, shared). Update any test scripts or documentation that relied on query params.
- **`authMiddleware.js` is async**: Unlike the synchronous `mockSession.js`, the new middleware is `async` because it awaits the database query. The Express error handler handles any rejections via `next(err)`.
- **`jsonwebtoken` package**: This package is listed in `DEPENDENCIES.md` but was not yet in `package.json`. After installing, run `npm install` to update `package-lock.json`.

---

## Post-Implementation Steps (MANDATORY)

Once the file checklist and acceptance criteria are satisfied:

### 1. Update `PROGRESS.md`
- Change the status of **WI-802** from `Not Started` to `Done`.
- Set the assignee to `Antigravity`.
- Set the target date to the current date.
- Increment the `Done` and `Completion %` columns in the Phase 8 progress table.

### 2. Update `CHANGELOG.md`
Add a new entry at the top:

```
## [YYYY-MM-DD] - WI-802: Backend JWT Validation Middleware & Role Checks
* **Work Item ID**: WI-802
* **Summary**: Replaced mockSession middleware with real JWT validation. Created authMiddleware.js that verifies Supabase JWTs using jsonwebtoken (HS256) and SUPABASE_JWT_SECRET, looks up user profile from public.users, and falls back to x-mock-role/x-mock-user-id headers for dev mode. Updated requireRole.js to check req.user.role. Updated index.js and health endpoint to reflect new auth structure. Added SUPABASE_JWT_SECRET to .env.example.
* **Files Affected**:
  - [NEW] `backend/src/middleware/authMiddleware.js`
  - [MODIFIED] `backend/src/middleware/mockSession.js` (replaced — kept for reference)
  - [MODIFIED] `backend/src/lib/requireRole.js` (checks req.user.role)
  - [MODIFIED] `backend/index.js` (uses authMiddleware, updated health endpoint)
  - [MODIFIED] `backend/.env.example` (added SUPABASE_JWT_SECRET)
  - [MODIFIED] `backend/package.json` (added jsonwebtoken)
* **Verification Done**:
  - [x] JWT Bearer token verified with jsonwebtoken.verify() using HS256 algorithm
  - [x] Decoded sub claim used to look up user in public.users
  - [x] req.user set with { id, email, full_name, role } for authenticated requests
  - [x] req.user is null for requests with no auth
  - [x] Mock headers (x-mock-role, x-mock-user-id) still work as dev fallback
  - [x] requireRole() rejects non-matching roles with 403
  - [x] All existing routes work with mock headers (no regressions)
  - [x] Health check returns auth.method and auth.user
  - [x] Query parameter auth (role/userId) removed for security
  - [x] npm run dev starts without errors
* **Impact on Existing Functionality**: All existing routes continue to work. MockIdentityBar still works for development. Health endpoint response shape changed (now returns auth.method + auth.user instead of mockUser.role + mockUser.id). Query parameter auth (?role=&userId=) is no longer supported.
```

### 3. Stop and Wait
Do **not** begin WI-803 in the same session. Wait for the developer to verify and trigger the next prompt.

---

## Notes for the AI Agent

- **File naming**: The new middleware file is `authMiddleware.js` (not `jwtMiddleware.js`) to keep the name generic. The old `mockSession.js` can be deleted or kept as reference. The prompt suggests replacing its contents — either approach works.
- **`req.user` is the canonical identity**: All route handlers should be updated over time to use `req.user` directly. The `req.mockUserRole` and `req.mockUserId` properties are maintained for backward compatibility but are deprecated. New code should use `req.user`.
- **`requireRole` uses `req.user?.role`**: The optional chaining handles both `req.user = null` (anonymous) and `req.user = { role: 'ADMIN' }` (authenticated). Anonymous requests always fail role checks with 403.
- **JWT verification silently falls through on error**: If `verify()` throws (expired token, invalid signature, wrong secret), the error is logged and the middleware falls through to the mock header check. This prevents a single bad token from breaking the entire request — the request either authenticates via mock headers or proceeds as anonymous.
- **Database pool is lazy-initialized**: The `pg.Pool` is created inside the middleware file (not via `require('../lib/pgPool')`) to avoid circular dependencies and to keep the middleware self-contained. The pool is created once and reused. This is the same pattern used by `pgPool.js` in the existing codebase.
- **SSL for non-local connections**: The pool config sets `ssl: { rejectUnauthorized: false }` for non-localhost connections (Supabase's hosted PostgreSQL requires SSL). For local development, SSL is disabled.
- **Query parameter auth is removed**: The old `mockSession.js` supported `?role=ADMIN&userId=123` in the URL query string. The new middleware does NOT support this. Update any test scripts or documentation that relied on query parameters. The `x-mock-role`/`x-mock-user-id` headers still work.
- **Health endpoint response shape changed**: The `/api/health` endpoint now returns `auth.method` (one of `'jwt'`, `'mock'`, `'none'`) and `auth.user` (the user object or null). The old `mockUser` field is removed. Any monitoring or dev scripts that parse the health check response need to be updated.
- **Do not modify route handlers**: Do not change any existing route files (`students.js`, `batches.js`, `meetings.js`, etc.). They all use `req.mockUserRole` and `req.mockUserId`, which are still set by the new middleware. Route handler changes are out of scope for this work item.
