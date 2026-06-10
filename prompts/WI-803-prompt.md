# WI-803 — Secure Frontend Route Guards

> **GitHub Issue**: #20
> **Phase**: 8 — Authentication & Security Hardening (Blocker Phase)
> **Priority**: Critical
> **Dependencies**: WI-802
> **Project**: Trainifyer Mailbox Monitoring Platform

---

## Context

WI-801 added Supabase Auth to the frontend (`AuthContext`, `LoginPage`, JWT interceptor). WI-802 added backend JWT validation. But the frontend still routes freely — any user (authenticated or not) can navigate to any URL directly. The `MockIdentityBar` still sits at the bottom of every page, and the mock system is still wired in.

This work item hardens the frontend:

1. **Route guards** — `ProtectedRoute`, `AdminRoute`, `StudentRoute` components that redirect unauthenticated users to `/login` and unauthorized roles away from admin pages.
2. **Remove the mock system** — Delete `MockIdentityBar`, `MockIdentityContext`, and the mock header fallback in `api/client.js`. The app is now JWT-only.
3. **Layout update** — Replace the MockIdentityBar with a user menu showing the authenticated user's name and a Sign Out button.
4. **HomePage update** — Remove mock references, show role-appropriate navigation based on real auth.

> ⚠️ **Breaking change**: After WI-803, the mock system is gone. All API calls require a valid Supabase JWT. Developers must log in via `/login` with real credentials, or use a valid Bearer token. The `x-mock-role`/`x-mock-user-id` headers are no longer accepted by the frontend Axios client (the backend still accepts them as a fallback from WI-802, but the frontend will never send them).

---

## Reference Documents

Before starting, read these files in the project root:

- `WORKITEMS.md` — Acceptance criteria for WI-803
- `GOALS.md` — Sub-Goal 1 (Authentication & Role-Based Access Control)
- `prompts/WI-801-prompt.md` — AuthContext structure (session, user, login, logout, isAuthenticated, isAdmin, isStudent)
- `prompts/WI-802-prompt.md` — Backend middleware that validates JWT (frontend sends Bearer token)
- `frontend/src/routes/AppRoutes.jsx` — Route definitions to wrap with guards
- `frontend/src/App.jsx` — Provider tree (remove MockIdentityProvider)
- `frontend/src/components/Layout.jsx` — Remove MockIdentityBar, add user menu
- `frontend/src/components/MockIdentityBar.jsx` — TO DELETE
- `frontend/src/components/MockIdentityBar.css` — TO DELETE
- `frontend/src/context/MockIdentityContext.jsx` — TO DELETE
- `frontend/src/api/client.js` — Remove mock fallback
- `frontend/src/pages/HomePage.jsx` — Remove mock references

---

## Scope of This Work Item

### Frontend — New
- **Create** `frontend/src/components/ProtectedRoute.jsx` — Route guard that redirects to `/login` if not authenticated.
- **Create** `frontend/src/components/AdminRoute.jsx` — Route guard that redirects to `/` if the user is not an Admin.
- **Create** `frontend/src/components/StudentRoute.jsx` — Route guard that redirects to `/` if the user is not a Student.

### Frontend — Modified
- **Update** `frontend/src/routes/AppRoutes.jsx` — Wrap protected routes with `ProtectedRoute`, `AdminRoute`, `StudentRoute`.
- **Update** `frontend/src/App.jsx` — Remove `MockIdentityProvider`, keep only `AuthProvider`.
- **Update** `frontend/src/components/Layout.jsx` — Remove `MockIdentityBar`, add user info and Sign Out button in the header.
- **Update** `frontend/src/api/client.js` — Remove the mock header fallback interceptor; only inject JWT Bearer token.
- **Update** `frontend/src/pages/HomePage.jsx` — Remove mock references, update to use `useAuth`.

### Frontend — Deleted
- **Delete** `frontend/src/components/MockIdentityBar.jsx`
- **Delete** `frontend/src/components/MockIdentityBar.css`
- **Delete** `frontend/src/context/MockIdentityContext.jsx`

---

## Step-by-Step Instructions

### 1. Create `frontend/src/components/ProtectedRoute.jsx`

```jsx
import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Loader } from 'lucide-react';

/**
 * Route guard: requires the user to be authenticated.
 * Redirects to /login with the intended path saved in state.
 */
export default function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '40vh' }}>
        <Loader size={32} className="spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  return children;
}
```

### 2. Create `frontend/src/components/AdminRoute.jsx`

```jsx
import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Loader } from 'lucide-react';

/**
 * Route guard: requires the user to be authenticated with ADMIN role.
 * Redirects to / if the user is not an Admin.
 */
export default function AdminRoute({ children }) {
  const { isAuthenticated, isAdmin, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '40vh' }}>
        <Loader size={32} className="spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  return children;
}
```

### 3. Create `frontend/src/components/StudentRoute.jsx`

```jsx
import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Loader } from 'lucide-react';

/**
 * Route guard: requires the user to be authenticated with STUDENT role.
 * Redirects to / if the user is not a Student.
 */
export default function StudentRoute({ children }) {
  const { isAuthenticated, isStudent, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '40vh' }}>
        <Loader size={32} className="spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  if (!isStudent) {
    return <Navigate to="/" replace />;
  }

  return children;
}
```

### 4. Update `frontend/src/App.jsx`

Remove `MockIdentityProvider`. Keep only `AuthProvider`:

```jsx
import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import AppRoutes from './routes/AppRoutes';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}
```

### 5. Update `frontend/src/components/Layout.jsx`

Remove MockIdentityBar import and usage. Add user info + Sign Out button in the header:

```jsx
import React from 'react';
import { Outlet, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LogOut, User } from 'lucide-react';

export default function Layout() {
  const { isAuthenticated, user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (e) {
      console.error('Logout failed:', e);
    }
  };

  return (
    <div className="app-layout" style={{ minHeight: '100vh' }}>
      <header
        className="app-header"
        style={{
          padding: '1rem 2rem',
          background: '#f5f5f5',
          borderBottom: '1px solid #ddd',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}
      >
        <Link to="/" style={{ textDecoration: 'none', color: 'inherit' }}>
          <h1 style={{ margin: 0, fontSize: '1.5rem' }}>Trainifyer Mailbox Monitoring</h1>
        </Link>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {isAuthenticated && user ? (
            <>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', color: '#374151' }}>
                <User size={16} />
                {user.full_name}
                <span className="badge" style={{
                  background: user.role === 'ADMIN' ? '#dbeafe' : '#dcfce7',
                  color: user.role === 'ADMIN' ? '#2563eb' : '#16a34a',
                  fontSize: '11px',
                  padding: '2px 8px',
                  borderRadius: '10px',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  marginLeft: '4px'
                }}>
                  {user.role}
                </span>
              </span>
              <button
                onClick={handleLogout}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  background: 'none',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  color: '#6b7280'
                }}
                title="Sign Out"
              >
                <LogOut size={14} /> Sign Out
              </button>
            </>
          ) : (
            <Link
              to="/login"
              style={{
                padding: '6px 14px',
                background: '#2563eb',
                color: 'white',
                borderRadius: '6px',
                textDecoration: 'none',
                fontSize: '14px'
              }}
            >
              Sign In
            </Link>
          )}
        </div>
      </header>

      <main className="app-main" style={{ padding: '2rem' }}>
        <Outlet />
      </main>
    </div>
  );
}
```

### 6. Update `frontend/src/routes/AppRoutes.jsx`

Wrap protected routes with the appropriate guards:

```jsx
import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from '../components/Layout';
import ProtectedRoute from '../components/ProtectedRoute';
import AdminRoute from '../components/AdminRoute';
import StudentRoute from '../components/StudentRoute';
import HomePage from '../pages/HomePage';
import LoginPage from '../pages/LoginPage';
import AdminDashboard from '../pages/admin/AdminDashboard';
import StudentsPage from '../pages/admin/StudentsPage';
import BatchesPage from '../pages/admin/BatchesPage';
import MailboxPage from '../pages/mailbox/MailboxPage';
import AdminMeetingsPage from '../pages/meetings/AdminMeetingsPage';
import MeetingsListPage from '../pages/meetings/MeetingsListPage';
import MeetingRoomPage from '../pages/meetings/MeetingRoomPage';
import StudentDashboard from '../pages/student/StudentDashboard';
import ReportsPage from '../pages/admin/ReportsPage';

export default function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        {/* Public routes */}
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />

        {/* Admin-only routes */}
        <Route path="/admin/dashboard" element={
          <AdminRoute><AdminDashboard /></AdminRoute>
        } />
        <Route path="/admin/students" element={
          <AdminRoute><StudentsPage /></AdminRoute>
        } />
        <Route path="/admin/batches" element={
          <AdminRoute><BatchesPage /></AdminRoute>
        } />
        <Route path="/admin/meetings" element={
          <AdminRoute><AdminMeetingsPage /></AdminRoute>
        } />
        <Route path="/admin/reports" element={
          <AdminRoute><ReportsPage /></AdminRoute>
        } />

        {/* Student-only routes */}
        <Route path="/student/dashboard" element={
          <StudentRoute><StudentDashboard /></StudentRoute>
        } />

        {/* Authenticated routes (any role) */}
        <Route path="/mailbox" element={
          <ProtectedRoute><MailboxPage /></ProtectedRoute>
        } />
        <Route path="/meetings" element={
          <ProtectedRoute><MeetingsListPage /></ProtectedRoute>
        } />
        <Route path="/meeting/:id" element={
          <ProtectedRoute><MeetingRoomPage /></ProtectedRoute>
        } />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
```

### 7. Update `frontend/src/api/client.js`

Remove the mock header fallback entirely. Only inject the JWT Bearer token:

```js
import axios from 'axios';
import { supabase } from '../lib/supabaseClient';

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api',
  timeout: 10000
});

// Inject Supabase JWT token on every request
apiClient.interceptors.request.use(async (config) => {
  const { data: { session } } = await supabase.auth.getSession();

  if (session?.access_token) {
    config.headers['Authorization'] = `Bearer ${session.access_token}`;
  }

  return config;
});

export default apiClient;
```

### 8. Update `frontend/src/pages/HomePage.jsx`

Remove mock references. Show role-appropriate navigation based on real auth:

```jsx
import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function HomePage() {
  const { isAuthenticated, user } = useAuth();

  return (
    <div className="home-page">
      <h2>Welcome</h2>

      {isAuthenticated && user ? (
        <p style={{ color: '#16a34a', marginBottom: '1rem' }}>
          Signed in as <strong>{user.full_name}</strong> ({user.email})
        </p>
      ) : (
        <p style={{ marginBottom: '1rem' }}>
          <Link to="/login" style={{ color: '#2563eb' }}>Sign in</Link> to access the platform.
        </p>
      )}

      <div style={{ margin: '2rem 0' }}>
        <h3>Admin Actions</h3>
        <nav style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <Link to="/admin/dashboard">Dashboard</Link>
          <Link to="/admin/students">Manage Students</Link>
          <Link to="/admin/batches">Manage Batches</Link>
          <Link to="/admin/meetings">Manage Meetings</Link>
          <Link to="/admin/reports">Attendance Reports</Link>
          <Link to="/mailbox">Internal Mailbox</Link>
        </nav>
      </div>

      <div style={{ margin: '2rem 0' }}>
        <h3>Student Actions</h3>
        <nav style={{ display: 'flex', gap: '1rem' }}>
          <Link to="/student/dashboard">Student Dashboard</Link>
          <Link to="/meetings">Sessions & Meetings</Link>
          <Link to="/mailbox">Internal Mailbox</Link>
        </nav>
      </div>
    </div>
  );
}
```

### 9. Delete mock files

Remove these files (or mark them for deletion):

- `frontend/src/components/MockIdentityBar.jsx`
- `frontend/src/components/MockIdentityBar.css`
- `frontend/src/context/MockIdentityContext.jsx`

### 10. Verify the build

```bash
cd frontend
npm run build
```

Expected: Clean Vite build with no errors or warnings. No references to deleted files remain.

### 11. Manual verification

Start both backend and frontend:

```bash
# Terminal 1: Backend
cd backend
npm run dev

# Terminal 2: Frontend
cd frontend
npm run dev
```

Test each scenario:

**Unauthenticated access:**
1. Open a private/incognito browser window. Navigate to `http://localhost:5173/admin/dashboard`.
2. **Verify**: Redirected to `/login`. The URL is `/login?redirect=/admin/dashboard` (via state).
3. Try `/admin/students`, `/admin/batches`, `/admin/reports`, `/mailbox`, `/meetings`, `/meeting/abc`, `/student/dashboard`.
4. **Verify**: All redirect to `/login`.

**Login redirect:**
1. From `/login`, enter valid Supabase Auth credentials.
2. **Verify**: After login, redirected to `/` (HomePage shows "Signed in as...").

**Student access control:**
1. Log in as a Student.
2. Navigate to `/admin/dashboard` directly in the URL bar.
3. **Verify**: Redirected to `/` (not the admin page).
4. Navigate to `/student/dashboard`. **Verify**: The student dashboard loads.
5. Navigate to `/mailbox`. **Verify**: Mailbox loads (any authenticated user can access).
6. Navigate to `/meetings`. **Verify**: Meeting list loads.

**Admin access control:**
1. Log in as an Admin.
2. Navigate to `/admin/dashboard`. **Verify**: Admin dashboard loads.
3. Navigate to `/admin/students`, `/admin/batches`, `/admin/meetings`, `/admin/reports`.
4. **Verify**: All admin pages load correctly.
5. Navigate to `/student/dashboard`. **Verify**: Redirected to `/` (Admin is not a Student).
6. Navigate to `/mailbox`, `/meetings`. **Verify**: Load correctly.

**Layout user menu:**
1. Log in as any user.
2. **Verify**: The header shows the user's name with a role badge (ADMIN or STUDENT).
3. **Verify**: A "Sign Out" button is visible in the header.
4. Click **Sign Out**. **Verify**: Redirected to `/login`. Session is cleared.

**API calls use JWT only:**
1. Log in as any user.
2. Open Network tab in DevTools.
3. Navigate to any page that makes API calls.
4. **Verify**: Request headers include `Authorization: Bearer <token>`. No `x-mock-role` or `x-mock-user-id` headers are present.

**No mock files remain:**
1. **Verify**: `MockIdentityBar` no longer appears at the bottom of any page.
2. **Verify**: No references to `useMockIdentity`, `MockIdentityProvider`, or `MockIdentityContext` exist in any file.
3. **Verify**: The `mock_identity` key is no longer written to `localStorage`.

---

## Expected Output (File Checklist)

### Frontend — New
- [ ] `frontend/src/components/ProtectedRoute.jsx` — Route guard for authenticated users
- [ ] `frontend/src/components/AdminRoute.jsx` — Route guard for admin-only pages
- [ ] `frontend/src/components/StudentRoute.jsx` — Route guard for student-only pages

### Frontend — Modified
- [ ] `frontend/src/routes/AppRoutes.jsx` — Routes wrapped with guards, login route added
- [ ] `frontend/src/App.jsx` — Removed MockIdentityProvider, only AuthProvider
- [ ] `frontend/src/components/Layout.jsx` — Removed MockIdentityBar, added user menu + Sign Out
- [ ] `frontend/src/api/client.js` — Removed mock header fallback
- [ ] `frontend/src/pages/HomePage.jsx` — Removed mock references, uses useAuth

### Frontend — Deleted
- [ ] `frontend/src/components/MockIdentityBar.jsx` — DELETED
- [ ] `frontend/src/components/MockIdentityBar.css` — DELETED
- [ ] `frontend/src/context/MockIdentityContext.jsx` — DELETED

---

## Acceptance Criteria

- Unauthenticated users accessing any protected route (`/admin/*`, `/student/*`, `/mailbox`, `/meetings`, `/meeting/*`) are redirected to `/login`.
- Authenticated Students accessing `/admin/*` routes are redirected to `/`.
- Authenticated Admins accessing `/student/dashboard` are redirected to `/`.
- Authenticated users (any role) can access `/mailbox`, `/meetings`, `/meeting/:id`.
- The `/login` route is publicly accessible (no redirect loop).
- The header shows the authenticated user's name with a role badge.
- A Sign Out button in the header calls `logout()` and redirects to `/login`.
- The `api/client.js` only sends `Authorization: Bearer <token>` headers (no mock fallback).
- `MockIdentityBar`, `MockIdentityContext`, and their CSS file are deleted.
- No references to `useMockIdentity` or `MockIdentityProvider` remain in the codebase.
- `npm run build` completes without errors.

---

## Route Protection Matrix

| Route | Guard | Unauth redirect | Wrong role redirect |
|-------|-------|----------------|-------------------|
| `/` | None (public) | — | — |
| `/login` | None (public) | — | — |
| `/admin/*` | AdminRoute | → `/login` | → `/` |
| `/student/dashboard` | StudentRoute | → `/login` | → `/` |
| `/mailbox` | ProtectedRoute | → `/login` | — |
| `/meetings` | ProtectedRoute | → `/login` | — |
| `/meeting/:id` | ProtectedRoute | → `/login` | — |

---

## Risk / Impact

- **Breaking change**: Mock auth is completely removed. Developers who relied on `MockIdentityBar` to bypass login must now create real Supabase Auth users or use the `/login` page. The backend still accepts `x-mock-role` headers (from WI-802's fallback), but the frontend no longer sends them. To test without real auth, developers can use `curl` with `x-mock-role` headers directly against the API.
- **All existing pages using `useMockIdentity` will break**: The pages (`MeetingRoomPage`, `MeetingsListPage`, `AdminMeetingsPage`, `MailboxPage`, `StudentsPage`, `BatchesPage`, `AdminDashboard`, `StudentDashboard`) still import `useMockIdentity` from the deleted `MockIdentityContext.jsx`. These imports must be updated to use `useAuth` from `AuthContext`. The `useAuth` hook provides the same API surface: `isAuthenticated`, `isAdmin`, `isStudent`, `userId`, `user`. Update each page:
  - Change `import { useMockIdentity } from '../../context/MockIdentityContext'` to `import { useAuth } from '../../context/AuthContext'`.
  - Change `const { isAdmin } = useMockIdentity()` to `const { isAdmin } = useAuth()`.
  - Change `const { isAuthenticated, userId } = useMockIdentity()` to `const { isAuthenticated, userId } = useAuth()`.
  - Change `const { isAuthenticated, role } = useMockIdentity()` to `const { isAuthenticated, user } = useAuth()` and use `user.role` instead of `role`.
  - In `MailboxPage.jsx`, replace `useMockIdentity().userId` with `userId` from the hook (call `useAuth()` once at the top of the component and use the destructured `userId`).
- **LoginPage redirect on mount**: The `LoginPage` component from WI-801 already checks `isAuthenticated` and redirects to `/`. This prevents the "already logged in → login page" loop.
- **ProtectedRoute loading state**: All route guards show a centered `Loader` spinner while `loading` is `true`. Without this, there's a flash of the redirect before the auth session is resolved. The loading state prevents the redirect from firing prematurely.
- **Layout header is now Link**: The header title (`Trainifyer Mailbox Monitoring`) is now a `<Link to="/">` so clicking it navigates home. The Sign Out button is styled as a ghost button with border.
- **`localStorage` cleanup**: The old `mock_identity` key remains in `localStorage` after this change. It is harmless but can be cleaned up by the user clearing browser data. No code reads it anymore.

---

## Post-Implementation Steps (MANDATORY)

Once the file checklist and acceptance criteria are satisfied:

### 1. Update `PROGRESS.md`
- Change the status of **WI-803** from `Not Started` to `Done`.
- Set the assignee to `Antigravity`.
- Set the target date to the current date.
- Increment the `Done` and `Completion %` columns in the Phase 8 progress table.

### 2. Update `CHANGELOG.md`
Add a new entry at the top:

```
## [YYYY-MM-DD] - WI-803: Secure Frontend Route Guards
* **Work Item ID**: WI-803
* **Summary**: Replaced mock routing with real React route guards. Created ProtectedRoute, AdminRoute, and StudentRoute components that redirect unauthenticated users to /login and unauthorized roles away from protected pages. Removed MockIdentityBar, MockIdentityContext, and their CSS files. Updated App.jsx to use AuthProvider only. Updated Layout to show user name with role badge and Sign Out button. Removed mock header fallback from api/client.js — now JWT-only. Updated all pages that used useMockIdentity to use useAuth instead.
* **Files Affected**:
  - [NEW] `frontend/src/components/ProtectedRoute.jsx`
  - [NEW] `frontend/src/components/AdminRoute.jsx`
  - [NEW] `frontend/src/components/StudentRoute.jsx`
  - [MODIFIED] `frontend/src/routes/AppRoutes.jsx` (routes wrapped with guards)
  - [MODIFIED] `frontend/src/App.jsx` (removed MockIdentityProvider)
  - [MODIFIED] `frontend/src/components/Layout.jsx` (user menu + Sign Out)
  - [MODIFIED] `frontend/src/api/client.js` (JWT-only interceptor)
  - [MODIFIED] `frontend/src/pages/HomePage.jsx` (uses useAuth)
  - [MODIFIED] Multiple page files (useMockIdentity → useAuth imports)
  - [DELETED] `frontend/src/components/MockIdentityBar.jsx`
  - [DELETED] `frontend/src/components/MockIdentityBar.css`
  - [DELETED] `frontend/src/context/MockIdentityContext.jsx`
* **Verification Done**:
  - [x] Unauth users redirected to /login for all protected routes
  - [x] Students redirected from /admin/* to /
  - [x] Admins redirected from /student/dashboard to /
  - [x] Authenticated users (any role) can access /mailbox, /meetings, /meeting/:id
  - [x] /login is publicly accessible
  - [x] Header shows user name with role badge
  - [x] Sign Out button logs out and redirects to /login
  - [x] api/client.js only sends Authorization: Bearer header
  - [x] No mock files remain
  - [x] npm run build completes with no errors
* **Impact on Existing Functionality**: MockIdentityBar is gone. All users must log in via /login with real Supabase Auth credentials. The dev-mode mock fallback in api/client.js is removed. Existing pages now use real auth data.
```

### 3. Stop and Wait
Do **not** begin WI-804 in the same session. Wait for the developer to verify and trigger the next prompt.

---

## Notes for the AI Agent

- **Update ALL pages that import `useMockIdentity`**: After deleting `MockIdentityContext.jsx`, every file that imports from it will cause a build error. You must update every page to import `useAuth` from `../context/AuthContext` instead. The `useAuth` hook provides the same properties: `isAuthenticated`, `isAdmin`, `isStudent`, `userId`, and `user` (which contains `user.role`, `user.email`, `user.full_name`, `user.id`). The migration is a straightforward find-and-replace in each file:
  - Find: `import { useMockIdentity } from '../../context/MockIdentityContext';`
  - Replace: `import { useAuth } from '../../context/AuthContext';`
  - Find: `const { isAdmin } = useMockIdentity();`
  - Replace: `const { isAdmin } = useAuth();`
  - For `MailboxPage.jsx`: It calls `useMockIdentity().userId` inline (not just destructured). Move the hook call to the top of the component and use the local `userId` variable.
- **`ProtectedRoute` saves redirect path**: The `ProtectedRoute` component passes `state: { from: location.pathname }` to the `Navigate` component. This allows the `LoginPage` to redirect back to the original page after login. The `LoginPage` can read this state via `useLocation().state?.from` and navigate there instead of `/`.
- **Route guard loading state**: All three guards check `loading` from `useAuth()`. While loading is true (Supabase is restoring the session from storage), a spinner is shown. This prevents a flash of the login page on refresh when the user is already authenticated.
- **`api/client.js` no longer reads `localStorage`**: The mock identity interceptor was removed. The only auth header is the JWT Bearer token from the Supabase session. If the session is null, no auth header is sent (the request will be anonymous on the backend).
- **Layout logout calls `navigate('/login')`**: After `logout()` resolves, the user is explicitly navigated to `/login`. The `onAuthStateChange` listener in `AuthContext` will clear the session state, causing the layout to re-render with the "Sign In" link — but the explicit navigation ensures the redirect happens regardless of timing.
- **Do not modify backend files**: This is a frontend-only work item. Do not touch `backend/` files.
