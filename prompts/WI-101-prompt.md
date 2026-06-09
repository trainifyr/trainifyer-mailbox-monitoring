# WI-101 — Repository Setup & Environment Boilerplate

> **GitHub Issue**: #1
> **Phase**: 1 — Skeleton Setup & Mock Session Context
> **Priority**: High
> **Dependencies**: None
> **Project**: Trainifyer Mailbox Monitoring Platform

---

## Context

You are starting **Phase 1** of the Trainifyer Mailbox Monitoring Platform. The project is a zero-cost student learning monitoring and internal communication tool. This work item establishes the baseline repository structure that every subsequent work item depends on.

> ⚠️ **Mock Context-First Rule**: Phases 1–7 use a Mock Session context. Real Supabase Auth, JWT validation, and RLS are **out of scope** until Phase 8 (WI-801 → WI-804).
>
> ⚠️ **No Secret Commits Rule**: All environment values must live in `.env` and be ignored by git. Never hardcode keys, tokens, or passwords.

---

## Reference Documents

Before starting, read these files in the project root:
- `WORKITEMS.md` — Acceptance criteria for WI-101
- `GOALS.md` — Project sub-goals and success criteria
- `DEPENDENCIES.md` — Approved package versions (Express, Supabase, etc.)
- `HANDOFF.md` — Engineering discipline and rules
- `AI_DEVELOPMENT_GUIDE.md` — AI development loop and rules

---

## Scope of This Work Item

Create the workspace folder structure and baseline configuration files. **No application logic is written in this WI** — that comes in WI-102.

---

## Step-by-Step Instructions

### 1. Create the folder structure
At the project root, create:
```
backend/
frontend/
docs/
```

### 2. Initialize the backend package
Navigate into `backend/` and run:
```bash
npm init -y
```

### 3. Configure `backend/package.json`
Edit the generated `package.json` so that:
- `"name"` is `"trainifyer-mailbox-backend"`
- `"version"` is `"1.0.0"`
- `"description"` is `"Express API server for the Trainifyer Mailbox Monitoring Platform"`
- `"main"` is `"index.js"`
- `"scripts"` contains:
  - `"start": "node index.js"`
  - `"dev": "nodemon index.js"`
  - `"test": "jest --passWithNoTests"`
- Add `"type": "commonjs"` (default)

### 4. Install dependencies
From the `backend/` directory:
```bash
npm install express dotenv cors helmet
npm install --save-dev nodemon
```
Use the versions specified in `DEPENDENCIES.md`.

### 5. Create `backend/.gitignore`
Include at minimum:
```
node_modules/
.env
.env.local
*.log
coverage/
.DS_Store
```

### 6. Create `backend/.env.example`
Document the variables the backend will need. Use placeholder values only — never real secrets:
```
# Server
PORT=5000

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# PostgreSQL Direct Connection
DATABASE_URL=postgresql://user:password@host:6543/postgres
```

### 7. Create `backend/.env`
Create a local development `.env` file with safe placeholder values (this is git-ignored). Example:
```
PORT=5000
SUPABASE_URL=https://placeholder.supabase.co
SUPABASE_ANON_KEY=placeholder
SUPABASE_SERVICE_ROLE_KEY=placeholder
DATABASE_URL=postgresql://placeholder
```

### 8. Create the docs folder
Add a `docs/README.md` placeholder:
```
# Trainifyer Mailbox Monitoring — Documentation

This folder will hold architecture decisions, API references, and deployment notes.

## Phases
- Phase 1: Skeleton Setup (in progress)
```

### 9. Create a top-level `.gitignore` at the project root
```
node_modules/
.env
.env.local
*.log
.DS_Store
dist/
build/
coverage/
.vscode/
.idea/
```

### 10. Create a top-level `README.md`
```
# Trainifyer Mailbox Monitoring Platform

Student learning monitoring and internal communication platform — zero-cost MVP.

## Stack
- Frontend: React + Vite
- Backend: Node.js + Express
- Database: Supabase (PostgreSQL)
- Auth: Supabase Auth (Phase 8)
- Video: Jitsi Meet iframe
- Hosting: Render Free Tier

## Folder Structure
- `backend/` — Express API server
- `frontend/` — React + Vite client (added in WI-103)
- `docs/` — Project documentation
- `prompts/` — AI prompt design files

## Quick Start
See `backend/README.md` once WI-102 is complete.
```

---

## Expected Output (File Checklist)

After completion, the following files must exist:
- [ ] `backend/package.json` (configured scripts and metadata)
- [ ] `backend/package-lock.json`
- [ ] `backend/.gitignore`
- [ ] `backend/.env.example`
- [ ] `backend/.env` (git-ignored)
- [ ] `docs/README.md`
- [ ] `.gitignore` (root)
- [ ] `README.md` (root)
- [ ] `node_modules/` inside `backend/` (not committed)

---

## Acceptance Criteria

- `.gitignore` ignores `node_modules` and `.env` at both the root and the `backend/` level.
- `.env.example` clearly documents the four environment variables the backend will need.
- `npm run dev` from `backend/` will start `nodemon index.js` (will fail until WI-102 adds `index.js` — this is expected).
- `npm run start` is configured but will not work until WI-102.
- No secrets, real API keys, or production credentials are present in any committed file.

---

## Risk / Impact

None. This is baseline setup.

---

## Post-Implementation Steps (MANDATORY)

Once the file checklist above is complete:

### 1. Update `PROGRESS.md`
- Change the status of **WI-101** from `Not Started` to `Done`.
- Increment the `Done` and `Completion %` columns in the Phase 1 progress table.

### 2. Update `CHANGELOG.md`
Add a new entry at the top:
```
## [YYYY-MM-DD] - WI-101: Repository Setup & Environment Boilerplate
* **Work Item ID**: WI-101
* **Summary**: Created baseline repository structure (backend/frontend/docs folders), configured backend package.json, .gitignore, .env.example, and root README.
* **Files Affected**:
  - [NEW] `backend/package.json`
  - [NEW] `backend/.gitignore`
  - [NEW] `backend/.env.example`
  - [NEW] `backend/.env`
  - [NEW] `docs/README.md`
  - [NEW] `.gitignore`
  - [NEW] `README.md`
* **Verification Done**:
  - [x] Folder structure confirmed
  - [x] npm packages installed
  - [x] No secrets present
* **Impact on Existing Functionality**: None. Baseline setup.
```

### 3. Stop and Wait
Do **not** begin WI-102 in the same session. Wait for the developer to verify and trigger the next prompt.

---

## Notes for the AI Agent

- Do not write any application code (`index.js`, routes, controllers) — that is **WI-102**.
- Do not initialize the frontend — that is **WI-103**.
- Do not run `git init` or create commits unless explicitly instructed.
- Use the exact dependency versions from `DEPENDENCIES.md`.
