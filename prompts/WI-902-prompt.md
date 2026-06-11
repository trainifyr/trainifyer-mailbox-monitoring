# WI-902 — Render Free Tier Deployment Configurations

> **GitHub Issue**: #23
> **Phase**: 9 — Release and Deployment
> **Priority**: High
> **Dependencies**: WI-901
> **Project**: Trainifyer Mailbox Monitoring Platform

---

## Context

WI-901 validated that all components work correctly under the real auth setup. The final step is deploying to production on **Render Free Tier**.

The architecture for production:

- **Frontend**: React + Vite static app hosted on Render Static Sites
- **Backend**: Express API hosted on Render Web Service
- **Database**: Supabase PostgreSQL (already provisioned through all phases)
- **Auth**: Supabase Auth (already configured through WI-801 / WI-802)
- **Media**: Jitsi Meet iframe (external, no hosting needed)

Render is chosen because:
1. **Free tier** — Static Sites and Web Services both have free plans
2. **GitHub integration** — Auto-deploys from the repository
3. **SSL/TLS** — Automatic HTTPS for both services
4. **No Docker required** — Works with Node.js natively

> ⚠️ **Production launch**: After this work item, the application will be live on the public internet. Ensure WI-901 validation passed and all known issues are resolved before proceeding.

---

## Reference Documents

Before starting, read these files in the project root:

- `WORKITEMS.md` — Acceptance criteria for WI-902
- `GOALS.md` — Sub-Goal 8 (Production Release & Deployment)
- `PROGRESS.md` — Current status tracking (WI-902 is `Not Started`)
- `RISKS.md` — Known risks (Render cold starts, connection limits)
- `prompts/WI-901-prompt.md` — Validation test report confirming readiness
- `backend/.env.example` — All backend env vars with descriptions
- `frontend/.env.example` — All frontend env vars with descriptions
- `backend/index.js` — Entry point (uses `process.env.PORT`)
- `frontend/vite.config.js` — Vite config (proxy only for dev, not used in production)
- `backend/package.json` — `"start": "node index.js"` script
- `frontend/package.json` — `"build": "vite build"` script

---

## Scope of This Work Item

### New Files
- **Create** `backend/render.yaml` — Render Blueprint defining both services (infrastructure as code)
- **Create** `backend/Procfile` — Render start command for the web service
- **Create** `backend/.renderignore` — Files to exclude from Render deployment
- **Create** `frontend/render.yaml` — (Optional, but better to have single `render.yaml` at root)

### Backend — Modified
- **Update** `backend/package.json` — Ensure `engines` field specifies Node version for Render
- **Update** `backend/README.md` — Add production deployment section

### Frontend — Modified
- **Update** `frontend/README.md` — Add production deployment section
- **Update** `frontend/src/api/client.js` — Ensure `VITE_API_BASE_URL` handles production origin correctly (no hardcoded `localhost`)

### Infrastructure (New Files)
- **Create** `render.yaml` (root) — Single Render Bluepoint with 2 services

---

## Step-by-Step Instructions

### 1. Create Root `render.yaml` Blueprint

Render Blueprint (`render.yaml`) is infrastructure-as-code. It defines both services and their environment variables in a single file at the repo root.

Create `render.yaml` in the project root:

```yaml
# render.yaml — Render Blueprint for Trainifyer Mailbox Monitoring Platform
# Deploys both the Express API backend and React + Vite frontend.
# https://render.com/docs/blueprint-spec

services:
  # ── Backend: Express API Web Service ──────────────────────────
  - type: web
    name: trainifyer-mailbox-api
    env: node
    region: oregon  # Free tier available in Oregon
    plan: free
    buildCommand: npm install
    startCommand: node index.js
    healthCheckPath: /api/health
    envVars:
      - key: NODE_ENV
        value: production
      - key: PORT
        value: "10000"
      - key: SUPABASE_URL
        sync: false      # Set manually in Render Dashboard
      - key: SUPABASE_ANON_KEY
        sync: false
      - key: SUPABASE_SERVICE_ROLE_KEY
        sync: false
      - key: SUPABASE_JWT_SECRET
        sync: false
      - key: DATABASE_URL
        sync: false
    disk:
      name: node-modules-cache
      mountPath: /opt/render/project/src/node_modules
      sizeGB: 1

  # ── Frontend: React + Vite Static Site ────────────────────────
  - type: static_site
    name: trainifyer-mailbox-ui
    env: node
    region: oregon
    plan: free
    buildCommand: npm run build
    staticPublishPath: ./dist
    pullRequestPreviewsEnabled: false
    envVars:
      - key: VITE_API_BASE_URL
        value: https://trainifyer-mailbox-api.onrender.com/api
      - key: VITE_SUPABASE_URL
        sync: false
      - key: VITE_SUPABASE_ANON_KEY
        sync: false
    headers:
      - path: /*
        name: X-Content-Type-Options
        value: nosniff
      - path: /*
        name: X-Frame-Options
        value: DENY
      - path: /*
        name: Referrer-Policy
        value: strict-origin-when-cross-origin
```

> **Important**: `render.yaml` syncs env vars from the Render Dashboard. The `sync: false` vars must be set **manually** in the Render Dashboard after the first deploy. Never commit secrets to this file.

### 2. Create `backend/Procfile`

Render uses a Procfile to determine the start command when present (optional if `startCommand` is in `render.yaml`):

```
web: node index.js
```

### 3. Create `backend/.renderignore`

Prevent unnecessary files from being uploaded to Render:

```
.env
.env.local
*.log
coverage/
node_modules/
test/
tests/
__tests__/
```

### 4. Update `backend/package.json` — Add Node Engine

Add an `engines` field so Render knows which Node version to use:

```json
"engines": {
  "node": ">=18.0.0"
}
```

Place this near the top of `package.json`, after the `description` field, before `main`.

### 5. Update `frontend/src/api/client.js` — Production API URL

Ensure the frontend Axios client correctly resolves the API URL in production. Render Static Sites do not support a dev proxy — the frontend must call the backend directly.

The current code already uses `VITE_API_BASE_URL`:

```js
baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api',
```

This works as-is for production. The `VITE_API_BASE_URL` env var (set in `render.yaml`) will point to the live backend URL. In development, the fallback `localhost:5000` is used.

**No change needed** — verify the line exists and is correct:

```js
// Should look like this (already implemented in WI-103/WI-801):
const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api',
  timeout: 10000
});
```

If the fallback is hardcoded differently, adjust it.

### 6. Verify Vite Config for Production Build

The `vite.config.js` proxy (`/api` → `localhost:5000`) is only used during development with `vite dev`. In production (static build), Vite does not use the proxy — the frontend calls the real backend URL via `VITE_API_BASE_URL`. No changes needed.

```bash
# Verify production build works
cd frontend
npm run build
# Expected: Clean build output in frontend/dist/
```

### 7. Push to GitHub

Render deploys from a GitHub repository. Ensure the repository is pushed:

```bash
git add .
git commit -m "WI-902: Add Render deployment configuration (render.yaml, Procfile, .renderignore, engine pin)"
git push origin main
```

> If the repository is not yet connected to a GitHub remote, create the repository first:
> ```bash
> # Create a new repository on GitHub (via browser or gh CLI)
> gh repo create trainifyer-mailbox-monitoring --public --source=. --remote=origin --push
> ```

### 8. Configure Render Dashboard (Manual Steps)

These steps are done in the Render Dashboard (https://dashboard.render.com):

#### 8a. Create Backend Web Service

1. Click **New +** → **Web Service**
2. Connect your GitHub repository
3. Configure:
   - **Name**: `trainifyer-mailbox-api`
   - **Region**: `Oregon`
   - **Branch**: `main`
   - **Root Directory**: `backend`
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node index.js`
   - **Plan**: `Free`
4. Add environment variables (click **Advanced** → **Add Environment Variable**):

| Key | Value | Notes |
|-----|-------|-------|
| `NODE_ENV` | `production` | |
| `PORT` | `10000` | Must match what Express listens on |
| `SUPABASE_URL` | `https://<project>.supabase.co` | From Supabase Dashboard → Settings → API → Project URL |
| `SUPABASE_ANON_KEY` | `<anon-key>` | From Supabase Dashboard → Settings → API → `anon public` key |
| `SUPABASE_SERVICE_ROLE_KEY` | `<service-role-key>` | From Supabase Dashboard → Settings → API → `service_role` key |
| `SUPABASE_JWT_SECRET` | `<jwt-secret>` | From Supabase Dashboard → Settings → API → JWT Secret |
| `DATABASE_URL` | `postgresql://...` | Use Transaction Pooler URL (port 6543) |

5. Click **Create Web Service**

Wait for the initial deploy to complete. Verify health endpoint:

```bash
curl https://trainifyer-mailbox-api.onrender.com/api/health
# Expected: { "status": "healthy", "auth": { "method": "none", "user": null }, ... }

curl https://trainifyer-mailbox-api.onrender.com/api/health/db
# Expected: { "status": "healthy", "tables": ["users","batches",...], ... }
```

#### 8b. Create Frontend Static Site

1. Click **New +** → **Static Site**
2. Connect your GitHub repository
3. Configure:
   - **Name**: `trainifyer-mailbox-ui`
   - **Branch**: `main`
   - **Root Directory**: `frontend`
   - **Build Command**: `npm run build`
   - **Publish Directory**: `dist`
4. Add environment variables:

| Key | Value | Notes |
|-----|-------|-------|
| `VITE_API_BASE_URL` | `https://trainifyer-mailbox-api.onrender.com/api` | Points to deployed backend |
| `VITE_SUPABASE_URL` | `https://<project>.supabase.co` | Same as backend's `SUPABASE_URL` |
| `VITE_SUPABASE_ANON_KEY` | `<anon-key>` | Same as backend's `SUPABASE_ANON_KEY` (safe for client) |

5. Click **Create Static Site**

Wait for the deploy to complete. Verify the UI loads:

```bash
# Open in browser
open https://trainifyer-mailbox-ui.onrender.com
# Expected: App loads. Login page renders.
```

### 9. Verify Production End-to-End

Run a smoke test against the live production URLs:

```bash
# 1. Health check
curl https://trainifyer-mailbox-api.onrender.com/api/health

# 2. Database check
curl https://trainifyer-mailbox-api.onrender.com/api/health/db

# 3. CORS check (frontend can reach backend)
curl -H "Origin: https://trainifyer-mailbox-ui.onrender.com" \
  -H "Access-Control-Request-Method: GET" \
  -X OPTIONS \
  https://trainifyer-mailbox-api.onrender.com/api/health
# Expected: 204 with CORS headers (Access-Control-Allow-Origin: *)

# 4. Authenticated flow (manual — open browser)
# - Navigate to https://trainifyer-mailbox-ui.onrender.com
# - Log in with admin credentials
# - Navigate through admin pages
# - Log out, log in as student
# - Navigate through student pages
```

### 10. Test Production-Specific Scenarios

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 1 | HTTPS enforced | Visit frontend URL with `http://` | Redirect to `https://` |
| 2 | Cold start | Wait 15+ minutes, then load the app | App loads (may take 30-50s for backend wake-up) |
| 3 | CORS | Frontend API calls | No CORS errors in browser console |
| 4 | Static file serving | Visit `https://trainifyer-mailbox-ui.onrender.com/favicon.svg` | Returns the favicon file |
| 5 | SPA fallback | Refresh on `/admin/dashboard` | App loads correctly (no 404 from static server) |
| 6 | API 404 | `curl https://trainifyer-mailbox-api.onrender.com/api/nonexistent` | `{ "error": "Not Found" }` |
| 7 | Secret check | `curl https://trainifyer-mailbox-api.onrender.com/.env` | 404 (file not in public dir) |

> **Important**: SPA fallback (test 5): Render Static Sites do not automatically support SPA routing. If refreshing on a sub-route returns a 404, add a redirect rule in Render Dashboard:
> 1. Go to your Static Site → **Settings** → **Redirects/Rewrites**
> 2. Add rule: **Source** `/*`, **Destination** `/index.html`, **Action** `Rewrite`
> 3. This ensures all paths serve `index.html` for React Router to handle.

### 11. Configure Custom Domain (Optional)

If a custom domain is available:

1. **Render Web Service (Backend)**: Settings → Custom Domain → Add `api.yourdomain.com`
2. **Render Static Site (Frontend)**: Settings → Custom Domain → Add `app.yourdomain.com`
3. Update `VITE_API_BASE_URL` in the Static Site env vars to the custom backend domain
4. Update CORS in `backend/index.js` if needed (currently `app.use(cors())` allows all origins, which is fine for MVP)

### 12. Document Production URLs

Add the production URLs to `README.md` files:

#### Update `backend/README.md`

Append a Production Deployment section:

```markdown
## Production Deployment

The application is deployed on Render Free Tier:

- **Backend API**: https://trainifyer-mailbox-api.onrender.com
- **Health Check**: https://trainifyer-mailbox-api.onrender.com/api/health

### Environment Variables
Set these in Render Dashboard → Web Service → Environment:

| Variable | Source |
|----------|--------|
| `SUPABASE_URL` | Supabase Dashboard → Settings → API |
| `SUPABASE_ANON_KEY` | Supabase Dashboard → Settings → API (anon public) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard → Settings → API (service_role) |
| `SUPABASE_JWT_SECRET` | Supabase Dashboard → Settings → API → JWT Secret |
| `DATABASE_URL` | Supabase Dashboard → Database → Connection string (Transaction pooler) |
```

#### Update `frontend/README.md`

```markdown
## Production Deployment

The application is deployed on Render Free Tier:

- **Frontend UI**: https://trainifyer-mailbox-ui.onrender.com
- **Backend API**: https://trainifyer-mailbox-api.onrender.com

### Environment Variables
Set these in Render Dashboard → Static Site → Environment:

| Variable | Value |
|----------|-------|
| `VITE_API_BASE_URL` | `https://trainifyer-mailbox-api.onrender.com/api` |
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon public key |
```

---

## Expected Output (File Checklist)

### New Files
- [ ] `render.yaml` — Render Blueprint with backend web service and frontend static site
- [ ] `backend/Procfile` — Start command for Render web service
- [ ] `backend/.renderignore` — Files excluded from Render deployment

### Modified Files
- [ ] `backend/package.json` — Added `engines.node` field
- [ ] `backend/README.md` — Added Production Deployment section
- [ ] `frontend/README.md` — Added Production Deployment section

### Infrastructure (Render Dashboard)
- [ ] Backend Web Service created and running (`trainifyer-mailbox-api`)
- [ ] Frontend Static Site created and running (`trainifyer-mailbox-ui`)
- [ ] All environment variables configured in Render Dashboard
- [ ] SPA redirect rule added (`/*` → `/index.html`)
- [ ] Backend health and database endpoints respond on production URL
- [ ] Frontend loads and communicates with backend via HTTPS

---

## Acceptance Criteria

1. Frontend builds successfully (`npm run build` in `frontend/`) with no errors.
2. Backend starts without errors on Render with production env vars.
3. Health check endpoint (`/api/health`) returns `200` with `"status": "healthy"`.
4. Database health check (`/api/health/db`) returns `200` with list of tables.
5. Frontend serves as a static site and loads in the browser via HTTPS.
6. Frontend API calls reach the backend via `VITE_API_BASE_URL` (no CORS errors).
7. Login flow works (Supabase Auth communicates with the production Supabase project).
8. SPA routing works: refresh on `/login`, `/admin/dashboard`, `/mailbox` — all render correctly.
9. No `.env` files or secrets are committed to the repository.
10. The app is accessible at the production URLs.

---

## Risk / Impact

- **Render Free Tier Cold Starts**: The backend spins down after 15 minutes of inactivity. First request after idle may take 30-50 seconds. This is an accepted limitation of the free tier. The frontend should show a loading state during this time. Mitigation ideas (for future): use a cron-job service (e.g., cron-job.org) to ping the health endpoint every 10 minutes.
- **Supabase Free Tier Connection Limits**: The transaction pooler (port 6543) should be used in `DATABASE_URL` to stay within free-tier connection limits. Render free-tier web services may have up to 2 concurrent instances, each maintaining a connection pool.
- **CORS**: The backend currently uses `app.use(cors())` (allows all origins). This is acceptable for the MVP but should be restricted in production to the specific frontend domain for security hardening.
- **Jitsi iframe**: The Jitsi Meet iframe loads from `meet.jit.si` (an external, third-party service). No hosting or configuration changes needed. The iframe is embedded client-side by the frontend.
- **No secrets in render.yaml**: All sensitive env vars are set to `sync: false` in `render.yaml`, meaning they must be configured manually in the Render Dashboard. The `render.yaml` file is safe to commit.
- **SPA routing**: Render Static Sites do not natively support SPA fallback routing. A redirect/rewrite rule must be added in the Render Dashboard settings (`/*` → `/index.html`, action: Rewrite). Without this, refreshing on `/admin/dashboard` will return a 404.
- **Root directory in render.yaml**: The `render.yaml` Blueprint does not support per-service root directories for monorepos. If the Blueprint approach fails, use the Render Dashboard to create services manually with the correct root directory (`backend/` and `frontend/` respectively). The `render.yaml` is provided as documentation/as-code, but manual setup is the fallback.
- **Database URL**: Use the Transaction Pooler connection string (port 6543) instead of the direct connection (port 5432). The pooler manages connection limits for the free tier. Find it in Supabase Dashboard → Project Settings → Database → Connection string → Transaction pooler.

---

## Post-Implementation Steps (MANDATORY)

Once the deployment is verified and all acceptance criteria are satisfied:

### 1. Update `PROGRESS.md`

Change the status of **WI-902** from `Not Started` to `Done`:
- Set the status to `Done`.
- Set the assignee to `Antigravity`.
- Set the target date to the current date.
- Update the Phase 9 progress table.
- If WI-901 is still `In Progress`, mark it `Done` as well (WI-902 depends on WI-901).

### 2. Update `CHANGELOG.md`

Add a new entry at the top:

```
## [YYYY-MM-DD] - WI-902: Render Free Tier Deployment Configurations
* **Work Item ID**: WI-902
* **Summary**: Deployed the application to Render Free Tier. Created render.yaml Blueprint defining the backend Web Service and frontend Static Site. Added Procfile and .renderignore for backend. Set Node engine >=18. Added production deployment documentation to READMEs. Configured environment variables in Render Dashboard (SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_JWT_SECRET, DATABASE_URL, VITE_API_BASE_URL). Added SPA redirect rule for client-side routing. Verified health endpoints, CORS, and end-to-end login flow on production URLs.
* **Files Affected**:
  - [NEW] `render.yaml` (Render Bluepoint — 2 services)
  - [NEW] `backend/Procfile` (Render start command)
  - [NEW] `backend/.renderignore` (deployment exclusions)
  - [MODIFIED] `backend/package.json` (engines.node >=18.0.0)
  - [MODIFIED] `backend/README.md` (Production Deployment section)
  - [MODIFIED] `frontend/README.md` (Production Deployment section)
* **Verification Done**:
  - [x] Frontend builds without errors (npm run build)
  - [x] Backend starts on Render with production env vars
  - [x] /api/health returns 200
  - [x] /api/health/db returns 200 with table list
  - [x] Frontend loads via HTTPS on Render
  - [x] Frontend API calls reach backend (no CORS errors)
  - [x] Login flow works with production Supabase Auth
  - [x] SPA routing works on sub-routes (refresh on /admin/dashboard)
  - [x] No secrets committed to repository
  - [x] Production URLs accessible
* **Impact on Existing Functionality**: None — files added/deployed, no existing logic changed. The dev proxy in vite.config.js still works for local development.
```

### 3. Final Status Update

Both Phase 9 work items are now complete:

```
| **Phase 9: Release & Deployment** | 2 | 0 | 0 | 0 | 2 | 0 | 100% |
| **Total** | **23** | **0** | **0** | **0** | **23** | **0** | **100%** |
```

The project is fully implemented and deployed. All 23 work items across 9 phases are `Done`.

### 4. Stop

This is the final work item in the project. No further prompts to generate.

---

## Notes for the AI Agent

- **Render Blueprint vs Dashboard**: The `render.yaml` file defines services declaratively, but the free tier has some limitations with Blueprints (monorepo root directory handling). If the Blueprint-based deployment fails, fall back to creating services manually in the Render Dashboard. The `render.yaml` file is still valuable as documentation even if not used for automated provisioning.
- **Root directory matters**: When creating services manually, set the Root Directory to `backend/` for the API service and `frontend/` for the static site. This tells Render where to find `package.json` and the build/start commands.
- **SPA rewrite rule**: This is critical. Without it, refreshing any page other than `/` will return a 404 from Render's static file server. Add the rule in Static Site → Settings → Redirects/Rewrites: source `/*`, destination `/index.html`, action `Rewrite`. This is a one-time manual step in the Dashboard (not in render.yaml).
- **Connection pooling**: The backend uses `pg` with a connection pool (set up in `backend/src/lib/pgPool.js`). In production, set `DATABASE_URL` to the Supabase Transaction Pooler URL (port 6543) to stay within free-tier connection limits. The pool max connections default is 10 — this is fine for the free tier.
- **Health check endpoint**: Render uses the `/api/health` endpoint to monitor the web service. If it returns non-200, Render may restart the service. Ensure the health endpoint is stable before considering the deployment complete.
- **Cold start mitigation**: The Render free tier spins down after 15 minutes of inactivity. The first request after spin-down takes 30-50s. Consider adding a cron-job.org ping to the health endpoint every 10 minutes to keep the service warm. This is optional for the MVP but recommended for active use.
- **Supabase JWT Secret**: Find this in Supabase Dashboard → Project Settings → API → JWT Secret. It's used by `jsonwebtoken` in `authMiddleware.js` (WI-802). Without this env var, JWT validation will fall back to mock headers (which won't be sent by the production frontend, so all requests will be anonymous).
- **Environment variable naming**: Vite requires `VITE_` prefix for client-exposed env vars. Variables without the prefix are not bundled into the static build. `VITE_API_BASE_URL`, `VITE_SUPABASE_URL`, and `VITE_SUPABASE_ANON_KEY` are all correctly prefixed.
- **Security headers**: The `render.yaml` includes security headers (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`). These are added via the `headers` section of the static site definition. They help mitigate common web vulnerabilities.
- **No Docker needed**: The Node native deployment on Render does not require a Dockerfile. The `render.yaml` specifies `env: node`, which uses Render's default Node.js buildpack. This is simpler and faster for Node.js projects.
- **Verify SPA routing on Render**: After configuring the rewrite rule, test by navigating directly to `https://trainifyer-mailbox-ui.onrender.com/admin/dashboard` in a new browser tab (not from the home page). It should render the dashboard (and redirect to login if not authenticated). If it returns a 404, the rewrite rule is not active.
- **Do not add paid add-ons**: Render free tier has limitations (e.g., no custom domains on free static sites, 500 build minutes/month, PostgreSQL not included — we use external Supabase). Do not upgrade to paid plans without explicit approval.
- **Backend CORS in production**: The current `app.use(cors())` allows all origins, which is fine for the MVP. If you want to restrict it, update `backend/index.js` to:
  ```js
  app.use(cors({
    origin: process.env.NODE_ENV === 'production'
      ? 'https://trainifyer-mailbox-ui.onrender.com'
      : '*',
    credentials: true
  }));
  ```
  This is optional — leaving it permissive (`*`) avoids issues if custom domains are added later.
