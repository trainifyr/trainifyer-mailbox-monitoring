# WI-103 — React App Routing & Mock Identity Bar

> **GitHub Issue**: #3
> **Phase**: 1 — Skeleton Setup & Mock Session Context
> **Priority**: High
> **Dependencies**: WI-101, WI-102
> **Project**: Trainifyer Mailbox Monitoring Platform

---

## Context

WI-101 created the folder structure and WI-102 brought the Express backend online. This work item scaffolds the **React + Vite frontend** and introduces the **Mock Identity Selector** — a floating developer helper bar that lets the team simulate Admin and Student users without real authentication.

> ⚠️ **Mock Context-First Rule**: The Mock Identity Selector is **temporary**. It exists only for Phases 1–7 so that UI can be tested without a real login flow. In **Phase 8 (WI-803)**, it will be removed and replaced with real React Router protected routes backed by JWT.
>
> ⚠️ **Mark for Removal**: Add a clear `// TODO(PHASE-8: REPLACE WITH REAL AUTH)` comment on the selector and its provider, so the security-hardening phase can find and remove it cleanly.
>
> ⚠️ **No Secret Commits Rule**: All environment values must live in `frontend/.env` and be ignored by git. Never hardcode API URLs, Supabase keys, or tokens.

---

## Reference Documents

Before starting, read these files in the project root:
- `WORKITEMS.md` — Acceptance criteria for WI-103
- `GOALS.md` — Sub-Goal 1 (RBAC), Sub-Goal 2 (Cohort Management), Sub-Goal 7 (Dashboards)
- `DEPENDENCIES.md` — Approved React, Vite, React Router, axios, lucide-react versions
- `HANDOFF.md` — Mock session discipline and rules
- `prompts/WI-101-prompt.md` and `WI-102-prompt.md` — To understand the foundation
- `VALIDATION.md` — Manual verification scenarios

---

## Scope of This Work Item

- Initialize the `frontend/` workspace with Vite + React.
- Install React Router, axios, and lucide-react.
- Create a minimal page layout (placeholder routes for Admin and Student areas).
- Implement a **Mock Identity Context** that holds the current simulated `role`, `userId`, and `cohortId`.
- Build a floating **Mock Identity Selector** bar at the bottom of the screen with quick-toggle buttons.
- Wire the frontend `axios` instance to forward the mock identity to the backend via the `x-mock-role` and `x-mock-user-id` headers.
- Verify the frontend talks to the backend `/api/health` endpoint using the mock identity.

---

## Step-by-Step Instructions

### 1. Initialize the frontend workspace
From the project root:
```bash
cd frontend
npm create vite@latest . -- --template react
```
When prompted, choose "Ignore files and continue" since `frontend/` is not empty (it has the placeholder from WI-101).

Then install dependencies:
```bash
npm install react-router-dom axios lucide-react
npm install --save-dev @vitejs/plugin-react
```
Use the versions specified in `DEPENDENCIES.md`.

### 2. Configure `frontend/vite.config.js`
Ensure it has the React plugin and a dev server proxy for backend calls:
```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true
      }
    }
  }
});
```

### 3. Create `frontend/.env`, `frontend/.env.example`, `frontend/.gitignore`

**`.env.example`**:
```
VITE_API_BASE_URL=http://localhost:5000/api
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

**`.env`** (git-ignored, placeholders only):
```
VITE_API_BASE_URL=http://localhost:5000/api
VITE_SUPABASE_URL=https://placeholder.supabase.co
VITE_SUPABASE_ANON_KEY=placeholder
```

**`.gitignore`** (in addition to defaults Vite provides):
```
node_modules/
dist/
.env
.env.local
*.log
```

### 4. Create the folder structure
```
frontend/
├── public/
├── src/
│   ├── main.jsx
│   ├── App.jsx
│   ├── index.css
│   ├── api/
│   │   └── client.js              # axios instance
│   ├── context/
│   │   └── MockIdentityContext.jsx # TODO(PHASE-8: REMOVE)
│   ├── components/
│   │   ├── MockIdentityBar.jsx     # TODO(PHASE-8: REMOVE)
│   │   └── Layout.jsx
│   ├── pages/
│   │   ├── HomePage.jsx
│   │   ├── admin/
│   │   │   └── AdminDashboard.jsx
│   │   └── student/
│   │       └── StudentDashboard.jsx
│   └── routes/
│       └── AppRoutes.jsx
├── package.json
├── vite.config.js
└── .env.example
```

### 5. Create the axios client — `frontend/src/api/client.js`
```js
import axios from 'axios';
import { useMockIdentity } from '../context/MockIdentityContext';

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api',
  timeout: 10000
});

// Inject mock identity headers on every request
// TODO(PHASE-8: REPLACE WITH REAL AUTH HEADERS)
apiClient.interceptors.request.use((config) => {
  const { role, userId } = useMockIdentity.getState();
  if (role) config.headers['x-mock-role'] = role;
  if (userId) config.headers['x-mock-user-id'] = userId;
  return config;
});

export default apiClient;
```

> Note: Use a tiny module-level `useMockIdentity.getState()` accessor (or a direct import of the context value) so the axios interceptor can read the current mock identity without React hook rules. If you prefer a different pattern, document it in a comment.

### 6. Create the Mock Identity Context — `frontend/src/context/MockIdentityContext.jsx`
```jsx
// TODO(PHASE-8: REMOVE) - This provider simulates authenticated users during
// Phases 1-7. In Phase 8 (WI-803), it will be deleted and replaced with a
// real auth provider backed by Supabase.

import { createContext, useContext, useState, useMemo } from 'react';

const MockIdentityContext = createContext(null);

export function MockIdentityProvider({ children }) {
  const [identity, setIdentity] = useState({
    role: null,        // 'ADMIN' | 'STUDENT' | null
    userId: null,
    cohortId: null
  });

  const value = useMemo(
    () => ({
      ...identity,
      setIdentity,
      isAdmin: identity.role === 'ADMIN',
      isStudent: identity.role === 'STUDENT',
      isAuthenticated: !!identity.role
    }),
    [identity]
  );

  return (
    <MockIdentityContext.Provider value={value}>
      {children}
    </MockIdentityContext.Provider>
  );
}

export function useMockIdentity() {
  const ctx = useContext(MockIdentityContext);
  if (!ctx) {
    throw new Error('useMockIdentity must be used within MockIdentityProvider');
  }
  return ctx;
}
```

### 7. Create the floating Mock Identity Bar — `frontend/src/components/MockIdentityBar.jsx`
```jsx
// TODO(PHASE-8: REMOVE) - Floating developer helper. Will be deleted in WI-803.

import { useMockIdentity } from '../context/MockIdentityContext';
import { UserCog, GraduationCap, LogOut } from 'lucide-react';
import './MockIdentityBar.css';

export default function MockIdentityBar() {
  const { role, userId, cohortId, setIdentity } = useMockIdentity();

  const setAdmin = () => setIdentity({ role: 'ADMIN', userId: 'admin-001', cohortId: null });
  const setStudent = () => setIdentity({ role: 'STUDENT', userId: 'student-001', cohortId: 'cohort-1' });
  const clear = () => setIdentity({ role: null, userId: null, cohortId: null });

  return (
    <div className="mock-identity-bar" data-testid="mock-identity-bar">
      <span className="mock-label">MOCK IDENTITY</span>
      <button
        className={`mock-btn ${role === 'ADMIN' ? 'active' : ''}`}
        onClick={setAdmin}
      >
        <UserCog size={14} /> Admin (admin-001)
      </button>
      <button
        className={`mock-btn ${role === 'STUDENT' ? 'active' : ''}`}
        onClick={setStudent}
      >
        <GraduationCap size={14} /> Student (student-001, cohort-1)
      </button>
      <button className="mock-btn clear" onClick={clear}>
        <LogOut size={14} /> Clear
      </button>
      {role && (
        <span className="mock-status">
          Active: {role} / {userId} / {cohortId || '—'}
        </span>
      )}
    </div>
  );
}
```

Create `frontend/src/components/MockIdentityBar.css` with a fixed-position bar at the bottom of the screen, high z-index, monospaced font, and clear visual distinction (e.g. yellow warning background) so it is obvious it is a dev tool.

### 8. Create a minimal layout — `frontend/src/components/Layout.jsx`
```jsx
import { Outlet } from 'react-router-dom';
import MockIdentityBar from './MockIdentityBar';

export default function Layout() {
  return (
    <div className="app-layout">
      <header className="app-header">
        <h1>Trainifyer Mailbox Monitoring</h1>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
      <MockIdentityBar />
    </div>
  );
}
```

### 9. Create placeholder pages

`frontend/src/pages/HomePage.jsx`:
```jsx
import { Link } from 'react-router-dom';
import apiClient from '../api/client';

export default function HomePage() {
  const ping = async () => {
    try {
      const res = await apiClient.get('/health');
      alert(JSON.stringify(res.data, null, 2));
    } catch (e) {
      alert('Backend not reachable: ' + e.message);
    }
  };

  return (
    <div className="home-page">
      <h2>Welcome</h2>
      <p>Use the Mock Identity Bar at the bottom to switch roles.</p>
      <nav>
        <Link to="/admin/dashboard">Admin Dashboard</Link> |{' '}
        <Link to="/student/dashboard">Student Dashboard</Link>
      </nav>
      <button onClick={ping}>Ping /api/health</button>
    </div>
  );
}
```

`frontend/src/pages/admin/AdminDashboard.jsx`:
```jsx
export default function AdminDashboard() {
  return <h2>Admin Dashboard (placeholder)</h2>;
}
```

`frontend/src/pages/student/StudentDashboard.jsx`:
```jsx
export default function StudentDashboard() {
  return <h2>Student Dashboard (placeholder)</h2>;
}
```

### 10. Create routes — `frontend/src/routes/AppRoutes.jsx`
```jsx
import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from '../components/Layout';
import HomePage from '../pages/HomePage';
import AdminDashboard from '../pages/admin/AdminDashboard';
import StudentDashboard from '../pages/student/StudentDashboard';

export default function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/admin/dashboard" element={<AdminDashboard />} />
        <Route path="/student/dashboard" element={<StudentDashboard />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
```

### 11. Wire it all together — `frontend/src/App.jsx`
```jsx
import { BrowserRouter } from 'react-router-dom';
import { MockIdentityProvider } from './context/MockIdentityContext';
import AppRoutes from './routes/AppRoutes';

export default function App() {
  return (
    <MockIdentityProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </MockIdentityProvider>
  );
}
```

### 12. Replace `frontend/src/main.jsx`
```jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

### 13. Replace `frontend/index.html`
Make sure the `<title>` is "Trainifyer Mailbox Monitoring" and the root `<div id="root"></div>` is present.

### 14. Update `frontend/README.md`
```
# Trainifyer Frontend

React + Vite client for the Trainifyer Mailbox Monitoring Platform.

## Setup
1. Copy `.env.example` to `.env` and adjust values.
2. Install: `npm install`
3. Start dev server: `npm run dev`
4. Open: http://localhost:5173

## Mock Identity (Phase 1-7)
A floating bar at the bottom of the screen lets you switch between:
- Admin (userId: admin-001)
- Student (userId: student-001, cohortId: cohort-1)
- Clear (anonymous)

The selected role is sent to the backend as `x-mock-role` and `x-mock-user-id` headers.

This bar will be removed in Phase 8 once real authentication is integrated.
```

### 15. Verify the app boots
From the `frontend/` directory:
```bash
npm run dev
```
You should see the Vite server start on `http://localhost:5173`.

### 16. Verify the integration end-to-end
1. Start the backend: `cd backend && npm run dev`
2. Start the frontend: `cd frontend && npm run dev`
3. Open `http://localhost:5173`.
4. Click the **Admin** button on the floating Mock Identity Bar.
5. Click **Ping /api/health**.
6. The browser alert should show:
   ```json
   {
     "status": "healthy",
     "mockUser": { "role": "ADMIN", "id": "admin-001" },
     "timestamp": "..."
   }
   ```
7. Click **Student**, ping again — `role` should now be `STUDENT` and `id` should be `student-001`.
8. Check the backend console — you should see `[MOCK SESSION]` log lines for each request.

### 17. Verify the build compiles
```bash
cd frontend
npm run build
```
The Vite build must complete without errors or critical warnings.

---

## Expected Output (File Checklist)

- [ ] `frontend/package.json` (with react, react-dom, react-router-dom, axios, lucide-react, vite, @vitejs/plugin-react)
- [ ] `frontend/vite.config.js` (with API proxy to backend)
- [ ] `frontend/index.html`
- [ ] `frontend/.env.example`
- [ ] `frontend/.env` (git-ignored)
- [ ] `frontend/.gitignore`
- [ ] `frontend/README.md`
- [ ] `frontend/src/main.jsx`
- [ ] `frontend/src/App.jsx`
- [ ] `frontend/src/index.css`
- [ ] `frontend/src/api/client.js`
- [ ] `frontend/src/context/MockIdentityContext.jsx`
- [ ] `frontend/src/components/MockIdentityBar.jsx`
- [ ] `frontend/src/components/MockIdentityBar.css`
- [ ] `frontend/src/components/Layout.jsx`
- [ ] `frontend/src/pages/HomePage.jsx`
- [ ] `frontend/src/pages/admin/AdminDashboard.jsx`
- [ ] `frontend/src/pages/student/StudentDashboard.jsx`
- [ ] `frontend/src/routes/AppRoutes.jsx`

---

## Acceptance Criteria

- `npm run dev` boots the Vite dev server on `http://localhost:5173` without errors.
- The floating Mock Identity Bar is visible at the bottom of the screen and is visually distinct (e.g. yellow background) to signal it is a dev-only tool.
- Clicking the **Admin** button sets the role context to `ADMIN`, userId to `admin-001`.
- Clicking the **Student** button sets the role context to `STUDENT`, userId to `student-001`, cohortId to `cohort-1`.
- Clicking **Clear** resets the identity to anonymous.
- The axios client automatically forwards the current mock identity as `x-mock-role` and `x-mock-user-id` headers on every request.
- The frontend can reach the backend `/api/health` endpoint and the response reflects the currently selected mock user.
- The mock context, bar, and axios interceptor are all marked with `// TODO(PHASE-8: REPLACE WITH REAL AUTH)` or `// TODO(PHASE-8: REMOVE)` for easy cleanup.
- `npm run build` completes successfully with no critical warnings.
- `frontend/.env` is git-ignored and contains no real secrets.

---

## Risk / Impact

- The Mock Identity Selector is a **temporary dev tool**. If it ships to production, anyone could grant themselves Admin access. The TODO comments and visual warning are essential safeguards.
- The Vite dev-server proxy assumes the backend runs on `http://localhost:5000`. If the backend port changes, both `vite.config.js` and `frontend/.env` must be updated.
- This is a placeholder UI — no real dashboards are built yet. The Admin and Student dashboard pages are intentional stubs to be expanded in later work items (WI-202, WI-302, WI-402, etc.).

---

## Post-Implementation Steps (MANDATORY)

Once the file checklist and acceptance criteria are satisfied:

### 1. Update `PROGRESS.md`
- Change the status of **WI-103** from `Not Started` to `Done`.
- Increment the `Done` and `Completion %` columns in the Phase 1 progress table.

### 2. Update `CHANGELOG.md`
Add a new entry at the top:
```
## [YYYY-MM-DD] - WI-103: React App Routing & Mock Identity Bar
* **Work Item ID**: WI-103
* **Summary**: Scaffolded React + Vite frontend with React Router, axios, and lucide-react. Added a Mock Identity Context, a floating Mock Identity Selector bar, and a Vite dev-server proxy to the backend. Verified end-to-end: clicking Admin/Student on the bar sets context and is forwarded to the backend via x-mock-role/x-mock-user-id headers.
* **Files Affected**:
  - [NEW] `frontend/package.json`
  - [NEW] `frontend/vite.config.js`
  - [NEW] `frontend/index.html`
  - [NEW] `frontend/.env`, `frontend/.env.example`, `frontend/.gitignore`, `frontend/README.md`
  - [NEW] `frontend/src/main.jsx`, `frontend/src/App.jsx`, `frontend/src/index.css`
  - [NEW] `frontend/src/api/client.js`
  - [NEW] `frontend/src/context/MockIdentityContext.jsx`
  - [NEW] `frontend/src/components/MockIdentityBar.jsx`, `frontend/src/components/MockIdentityBar.css`, `frontend/src/components/Layout.jsx`
  - [NEW] `frontend/src/pages/HomePage.jsx`, `frontend/src/pages/admin/AdminDashboard.jsx`, `frontend/src/pages/student/StudentDashboard.jsx`
  - [NEW] `frontend/src/routes/AppRoutes.jsx`
* **Verification Done**:
  - [x] Vite dev server boots on port 5173
  - [x] Mock Identity Bar visible and toggleable
  - [x] Frontend pings backend /api/health with mock identity
  - [x] Backend logs reflect mock user
  - [x] `npm run build` succeeds
  - [x] All mock artifacts marked for Phase 8 removal
* **Impact on Existing Functionality**: None. Adds frontend skeleton alongside the existing backend from WI-102.
```

### 3. Stop and Wait
Do **not** begin WI-104 in the same session. Wait for the developer to verify and trigger the next prompt.

---

## Notes for the AI Agent

- Do not implement real authentication, route guards, or login pages — that is **Phase 8 (WI-801 / WI-803)**.
- Do not add Supabase clients or environment-driven Supabase code yet — that is WI-104 / WI-801.
- Do not write any Admin or Student feature UIs beyond the placeholders — those are added in WI-202, WI-302, WI-402, etc.
- Use plain CSS (or CSS modules) for the Mock Identity Bar. Do not pull in Tailwind, Material UI, or other heavy UI libraries — keep the dependency footprint aligned with `DEPENDENCIES.md`.
- The bar's `z-index` should be high (e.g. `9999`) so it always floats above page content.
- Every mock-related file must carry a `// TODO(PHASE-8: REMOVE)` or `// TODO(PHASE-8: REPLACE WITH REAL AUTH)` comment at the top.
