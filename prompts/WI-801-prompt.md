# WI-801 — Supabase Authentication Services Integration

> **GitHub Issue**: #18
> **Phase**: 8 — Authentication & Security Hardening (Blocker Phase)
> **Priority**: Critical
> **Dependencies**: WI-702
> **Project**: Trainifyer Mailbox Monitoring Platform

---

## Context

Phases 1–7 used a **Mock Session** system: a floating developer bar that sets `x-mock-role` and `x-mock-user-id` headers, allowing role simulation without real login. This was intentionally designed for early development and marked with `// TODO(PHASE-8: REMOVE)` and `// TODO(PHASE-8: REPLACE WITH REAL AUTH)` throughout the codebase.

Phase 8 replaces the mock system with real Supabase Auth. This work item (WI-801) is the **frontend authentication layer**:

1. Installs `@supabase/supabase-js` on the frontend.
2. Creates a Supabase client configured with the project URL and anon key.
3. Builds a real `AuthContext`/`AuthProvider` that manages login state, session tokens, and user profile data using Supabase Auth.
4. Creates a `LoginPage` with email/password form.
5. Updates the Axios client to inject the Supabase JWT bearer token instead of mock headers.

The mock system is **kept alongside** real auth during this phase — the MockIdentityBar remains available for development. WI-803 will add route guards that force real auth and remove the mock components.

> ⚠️ **Supabase Auth setup**: Before starting, ensure your Supabase project has **Email/Password authentication** enabled in the Supabase Dashboard (`Authentication → Providers → Email`). Ensure test user accounts exist or use the Supabase Admin API to create them. The backend's `POST /api/users/students` endpoint (WI-201) will need to create Auth users — that integration is covered in WI-802.

---

## Reference Documents

Before starting, read these files in the project root:

- `WORKITEMS.md` — Acceptance criteria for WI-801
- `GOALS.md` — Sub-Goal 1 (Authentication & Role-Based Access Control)
- `DEPENDENCIES.md` — Approved package versions, Supabase service configuration
- `frontend/.env.example` — Required environment variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`)
- `backend/.env.example` — `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` for reference
- `frontend/src/context/MockIdentityContext.jsx` — Existing mock context to model after
- `frontend/src/api/client.js` — Axios instance that currently injects mock headers
- `frontend/src/App.jsx` — Provider tree (MockIdentityProvider wraps everything)
- `frontend/src/pages/admin/StudentsPage.jsx` — Example page using `useMockIdentity`
- `frontend/src/components/MockIdentityBar.jsx` — Will coexist with real auth until WI-803

---

## Scope of This Work Item

### Frontend
- **Install** `@supabase/supabase-js` in `frontend/`.
- **Create** `frontend/src/lib/supabaseClient.js` — Supabase client initialized from `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- **Create** `frontend/src/context/AuthContext.jsx` — Auth context provider with:
  - `login(email, password)` — Calls `supabase.auth.signInWithPassword()`, fetches user profile from `public.users` table, sets auth state.
  - `logout()` — Calls `supabase.auth.signOut()`, clears auth state.
  - `signUp(email, password, fullName, role)` — Admin-only: creates Auth user + profile row. (Optional — primarily done via backend in WI-201).
  - `session` — Current Supabase Auth session (null when logged out).
  - `user` — The `public.users` profile row (null when logged out).
  - `isAuthenticated`, `isAdmin`, `isStudent` — Derived booleans matching the MockIdentityContext API surface.
  - Auto-subscribes to `supabase.auth.onAuthStateChange` to sync session state.
- **Create** `frontend/src/pages/LoginPage.jsx` — Login form with email/password inputs, submit handler, error display, loading state.
- **Create** `frontend/src/pages/LoginPage.css` — Centered card layout, branded header.
- **Update** `frontend/src/App.jsx` — Wrap with `AuthProvider` in addition to `MockIdentityProvider`. Both coexist.
- **Update** `frontend/src/api/client.js` — Replace the mock-header interceptor with a JWT bearer token interceptor that reads the Supabase access token from the auth session.
- **Update** `frontend/src/routes/AppRoutes.jsx` — Add `/login` and `/signup` routes.

---

## Step-by-Step Instructions

### 1. Install Supabase client

```bash
cd frontend
npm install @supabase/supabase-js@^2.43.0
```

### 2. Create `frontend/src/lib/supabaseClient.js`

```js
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    'Missing Supabase environment variables. ' +
    'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in frontend/.env'
  );
}

export const supabase = createClient(
  supabaseUrl || '',
  supabaseAnonKey || ''
);

/**
 * Fetch the user's profile from the public.users table.
 * Returns null if the user is not found or the session is invalid.
 */
export async function fetchUserProfile(userId) {
  if (!userId) return null;

  const { data, error } = await supabase
    .from('users')
    .select('id, email, full_name, role')
    .eq('id', userId)
    .single();

  if (error || !data) {
    console.error('Failed to fetch user profile:', error?.message);
    return null;
  }

  return data;
}

export default supabase;
```

### 3. Create `frontend/src/context/AuthContext.jsx`

```jsx
import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { supabase, fetchUserProfile } from '../lib/supabaseClient';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Sync session state with Supabase Auth
  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      setSession(initialSession);
      if (initialSession?.user) {
        fetchUserProfile(initialSession.user.id).then(setUser);
      }
      setLoading(false);
    });

    // Subscribe to auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        setSession(newSession);
        if (newSession?.user) {
          fetchUserProfile(newSession.user.id).then(setUser);
        } else {
          setUser(null);
        }
      }
    );

    return () => subscription?.unsubscribe();
  }, []);

  const login = useCallback(async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;

    // Session and user will be set by onAuthStateChange
    return data;
  }, []);

  const logout = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    // Session and user will be cleared by onAuthStateChange
  }, []);

  const value = useMemo(
    () => ({
      session,
      user,
      login,
      logout,
      loading,
      isAuthenticated: !!session?.user,
      isAdmin: user?.role === 'ADMIN',
      isStudent: user?.role === 'STUDENT',
      userId: user?.id || null
    }),
    [session, user, login, logout, loading]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
```

### 4. Create `frontend/src/pages/LoginPage.jsx`

```jsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LogIn, Loader, Eye, EyeOff } from 'lucide-react';
import './LoginPage.css';

export default function LoginPage() {
  const navigate = useNavigate();
  const { login, isAuthenticated } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // If already authenticated, redirect to dashboard
  React.useEffect(() => {
    if (isAuthenticated) {
      navigate('/', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!email.trim()) {
      setError('Email is required');
      return;
    }
    if (!password) {
      setError('Password is required');
      return;
    }

    try {
      setSubmitting(true);
      await login(email.trim(), password);
      // Navigation happens via the useEffect above
    } catch (err) {
      if (err.message === 'Invalid login credentials') {
        setError('Invalid email or password. Please try again.');
      } else {
        setError(err.message || 'Login failed. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-header">
          <h1>Trainifyer</h1>
          <p className="login-subtitle">Mailbox Monitoring Platform</p>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="form-row">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              disabled={submitting}
              autoFocus
            />
          </div>

          <div className="form-row">
            <label htmlFor="password">Password</label>
            <div className="password-input-wrapper">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                autoComplete="current-password"
                disabled={submitting}
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword((s) => !s)}
                tabIndex={-1}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {error && <div className="form-error">{error}</div>}

          <button
            type="submit"
            className="btn btn-primary login-submit"
            disabled={submitting}
          >
            {submitting ? (
              <><Loader size={18} className="spin" /> Signing in...</>
            ) : (
              <><LogIn size={18} /> Sign In</>
            )}
          </button>
        </form>

        <div className="login-footer">
          <p className="login-hint">
            Use your email and password to sign in.
          </p>
          <p className="login-hint" style={{ fontSize: '12px', marginTop: '0.5rem', color: '#9ca3af' }}>
            Need an account? Contact your administrator.
          </p>
        </div>
      </div>
    </div>
  );
}
```

### 5. Create `frontend/src/pages/LoginPage.css`

```css
.login-page {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
  padding: 2rem;
}

.login-card {
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 2.5rem;
  max-width: 400px;
  width: 100%;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1);
}

.login-header {
  text-align: center;
  margin-bottom: 2rem;
}

.login-header h1 {
  margin: 0;
  font-size: 1.75rem;
  color: #111827;
}

.login-subtitle {
  color: #6b7280;
  font-size: 14px;
  margin-top: 4px;
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.login-form .form-row {
  text-align: left;
}

.login-form .form-row label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: #374151;
  margin-bottom: 4px;
}

.login-form .form-row input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 14px;
  box-sizing: border-box;
  transition: border-color 0.2s;
}

.login-form .form-row input:focus {
  outline: none;
  border-color: #2563eb;
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.15);
}

.password-input-wrapper {
  position: relative;
}

.password-input-wrapper input {
  padding-right: 40px;
}

.password-toggle {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  color: #9ca3af;
  cursor: pointer;
  padding: 4px;
  display: flex;
}

.password-toggle:hover {
  color: #6b7280;
}

.login-submit {
  width: 100%;
  justify-content: center;
  padding: 12px;
  font-size: 15px;
  margin-top: 0.5rem;
}

.login-footer {
  text-align: center;
  margin-top: 1.5rem;
}

.login-hint {
  font-size: 13px;
  color: #6b7280;
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
```

### 6. Update `frontend/src/App.jsx`

Wrap with AuthProvider. Keep MockIdentityProvider for backward compatibility (will be removed in WI-803).

```jsx
import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { MockIdentityProvider } from './context/MockIdentityContext';
import { AuthProvider } from './context/AuthContext';
import AppRoutes from './routes/AppRoutes';

export default function App() {
  return (
    <AuthProvider>
      <MockIdentityProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </MockIdentityProvider>
    </AuthProvider>
  );
}
```

### 7. Update `frontend/src/api/client.js`

Replace the mock-header interceptor with JWT bearer token injection:

```js
import axios from 'axios';
import { supabase } from '../lib/supabaseClient';

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api',
  timeout: 10000
});

// Inject Supabase JWT token on every request
// Falls back to mock identity headers if no JWT session exists (dev mode)
apiClient.interceptors.request.use(async (config) => {
  const { data: { session } } = await supabase.auth.getSession();

  if (session?.access_token) {
    // Real auth: inject JWT bearer token
    config.headers['Authorization'] = `Bearer ${session.access_token}`;
  } else {
    // Dev fallback: use mock identity headers from localStorage
    // TODO(PHASE-8: REMOVE) - Remove mock fallback when WI-803 enforces real auth
    const mockIdentity = JSON.parse(localStorage.getItem('mock_identity') || '{}');
    const { role, userId } = mockIdentity;
    if (role) config.headers['x-mock-role'] = role;
    if (userId) config.headers['x-mock-user-id'] = userId;
  }

  return config;
});

export default apiClient;
```

### 8. Update `frontend/src/routes/AppRoutes.jsx`

Add the login route:

```jsx
import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from '../components/Layout';
import HomePage from '../pages/HomePage';
import AdminDashboard from '../pages/admin/AdminDashboard';
import StudentsPage from '../pages/admin/StudentsPage';
import BatchesPage from '../pages/admin/BatchesPage';
import MailboxPage from '../pages/mailbox/MailboxPage';
import AdminMeetingsPage from '../pages/meetings/AdminMeetingsPage';
import MeetingsListPage from '../pages/meetings/MeetingsListPage';
import MeetingRoomPage from '../pages/meetings/MeetingRoomPage';
import StudentDashboard from '../pages/student/StudentDashboard';
import ReportsPage from '../pages/admin/ReportsPage';
import LoginPage from '../pages/LoginPage';  // NEW

export default function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/admin/dashboard" element={<AdminDashboard />} />
        <Route path="/admin/students" element={<StudentsPage />} />
        <Route path="/admin/batches" element={<BatchesPage />} />
        <Route path="/admin/meetings" element={<AdminMeetingsPage />} />
        <Route path="/admin/reports" element={<ReportsPage />} />
        <Route path="/mailbox" element={<MailboxPage />} />
        <Route path="/meetings" element={<MeetingsListPage />} />
        <Route path="/meeting/:id" element={<MeetingRoomPage />} />
        <Route path="/student/dashboard" element={<StudentDashboard />} />
        <Route path="/login" element={<LoginPage />} />          {/* NEW */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
```

### 9. Update `frontend/src/pages/HomePage.jsx`

Add a login link (visible when not authenticated via real auth) and show the authenticated user info:

```jsx
import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import apiClient from '../api/client';

export default function HomePage() {
  const { isAuthenticated, user, logout } = useAuth();

  const ping = async () => {
    try {
      const res = await apiClient.get('/health');
      alert('Backend Response:\n' + JSON.stringify(res.data, null, 2));
    } catch (e) {
      console.error(e);
      alert('Backend not reachable: ' + e.message);
    }
  };

  return (
    <div className="home-page">
      <h2>Welcome</h2>

      {/* Real auth status */}
      {isAuthenticated && user ? (
        <p style={{ color: '#16a34a', marginBottom: '1rem' }}>
          Signed in as <strong>{user.full_name}</strong> ({user.email})
          {' — '}
          <button
            onClick={logout}
            style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', textDecoration: 'underline', fontSize: '14px' }}
          >
            Sign Out
          </button>
        </p>
      ) : (
        <p style={{ marginBottom: '1rem' }}>
          <Link to="/login" style={{ color: '#2563eb' }}>Sign in</Link> to access your dashboard.
        </p>
      )}

      <p>Use the Mock Identity Bar at the bottom to switch roles during development.</p>

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

      <div style={{ marginTop: '3rem', borderTop: '1px solid #eee', paddingTop: '1rem' }}>
        <button
          onClick={ping}
          style={{ padding: '8px 16px', background: '#2196f3', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
        >
          Ping /api/health
        </button>
      </div>
    </div>
  );
}
```

### 10. Verify the build

```bash
cd frontend
npm run build
```

Expected: Clean Vite build with no errors or warnings.

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

Test the auth flow:

**Login page:**
1. Navigate to `/login`.
2. **Verify**: A centered card with "Trainifyer" branding, email input, password input with show/hide toggle, and "Sign In" button.
3. Submit with empty fields. **Verify**: Validation error "Email is required".
4. Submit with an invalid email/password. **Verify**: Error message "Invalid email or password" (or Supabase error).
5. If you have a valid Supabase Auth user, log in with their credentials. **Verify**: Redirect to home page, "Signed in as [name]" message appears.

**Auth state persistence:**
1. Log in, then refresh the page.
2. **Verify**: The session persists — the "Signed in as" message is still visible.
3. Open localStorage in DevTools. **Verify**: A `supabase-auth-token` key exists (managed by Supabase).

**Axios JWT injection:**
1. Log in with real auth.
2. Open Network tab in DevTools.
3. Navigate to any page that makes an API call (e.g., `/admin/dashboard`).
4. **Verify**: The request includes `Authorization: Bearer <jwt_token>` header (not `x-mock-role`/`x-mock-user-id`).

**Mock fallback still works (dev mode):**
1. Log out (clear Supabase session).
2. Set the Mock Identity Bar to a role.
3. Navigate to any page that makes an API call.
4. **Verify**: The request includes `x-mock-role` and `x-mock-user-id` headers (fallback).

**Logout:**
1. Log in, then click "Sign Out" on the home page.
2. **Verify**: The session is cleared, Supabase token is removed from localStorage, and the "Sign in" link reappears.
3. **Verify**: Subsequent API calls fall back to mock headers (or no auth if no mock role is set).

---

## Expected Output (File Checklist)

### Frontend
- [ ] `frontend/package.json` — Added `@supabase/supabase-js` dependency
- [ ] `frontend/src/lib/supabaseClient.js` — NEW: Supabase client + fetchUserProfile helper
- [ ] `frontend/src/context/AuthContext.jsx` — NEW: Auth provider with login, logout, session management
- [ ] `frontend/src/pages/LoginPage.jsx` — NEW: Login form with email/password, validation, error handling
- [ ] `frontend/src/pages/LoginPage.css` — NEW: Login page styling (centered card, branded header, password toggle)
- [ ] `frontend/src/App.jsx` — Wrapped with AuthProvider (alongside existing MockIdentityProvider)
- [ ] `frontend/src/api/client.js` — Replaced mock headers with JWT bearer token + mock fallback
- [ ] `frontend/src/routes/AppRoutes.jsx` — Added `/login` route
- [ ] `frontend/src/pages/HomePage.jsx` — Added auth status display, login link, sign-out button

---

## Acceptance Criteria

- `@supabase/supabase-js` is installed in `frontend/package.json`.
- `supabaseClient.js` creates a Supabase client using `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- `AuthContext` provides `session`, `user`, `login()`, `logout()`, `loading`, `isAuthenticated`, `isAdmin`, `isStudent`, `userId` values.
- `AuthContext` auto-subscribes to `onAuthStateChange` and syncs session + user profile.
- `LoginPage` renders a centered card with email input, password input (with show/hide toggle), and Sign In button.
- `LoginPage` shows validation errors for empty email/password.
- `LoginPage` shows Supabase error messages on failed login.
- `LoginPage` redirects to `/` on successful login.
- `api/client.js` injects `Authorization: Bearer <token>` header when a Supabase session exists.
- `api/client.js` falls back to `x-mock-role`/`x-mock-user-id` headers when no Supabase session exists (dev mode).
- `AppRoutes.jsx` has a `/login` route pointing to `LoginPage`.
- `HomePage` shows "Signed in as [name]" with sign-out button when authenticated via real auth.
- `HomePage` shows "Sign in" link when not authenticated via real auth.
- `logout()` clears the Supabase session and resets auth state.
- Auth session persists across page refresh (Supabase manages token in localStorage).
- `npm run build` completes without errors.

---

## Auth Architecture (Phase 8)

```
┌─────────────────────────────────────────────────┐
│                  Frontend                        │
│                                                   │
│  LoginPage ──► AuthContext.login(email, pw)      │
│                  │                                │
│                  ▼                                │
│         supabase.auth.signInWithPassword()        │
│                  │                                │
│                  ▼                                │
│         onAuthStateChange fires                   │
│                  │                                │
│         ┌────────┴────────┐                      │
│         ▼                  ▼                      │
│   session set         fetchUserProfile()          │
│   (JWT token)         from public.users           │
│         │                  │                      │
│         ▼                  ▼                      │
│   api/client.js       AuthContext.user            │
│   injects JWT         (id, email, name, role)     │
│   as Bearer token                                  │
│         │                                          │
│         ▼                                          │
│   Backend (WI-802):                                │
│   Validates JWT, extracts user_id + role           │
│   Replaces mockSession middleware                  │
└─────────────────────────────────────────────────┘
```

---

## Risk / Impact

- **Mock system still active**: The `MockIdentityProvider` and `MockIdentityBar` remain functional. This means the app can operate in two auth modes simultaneously. The Axios interceptor prefers real JWT, falls back to mock headers. During development, developers can use the MockIdentityBar as before, and real auth users can log in via `/login`. This dual-mode is intentional to avoid breaking existing development workflows until WI-803 enforces real auth.
- **`fetchUserProfile` uses Supabase data client**: The `fetchUserProfile` function calls `supabase.from('users').select(...)` which uses the anon key. This works only if RLS is disabled on the `users` table (currently true — set in WI-104 `schema.sql` with `ALTER TABLE public.users DISABLE ROW LEVEL SECURITY`). When WI-804 enables RLS, this will need to be updated to use a service-role call or RLS policy that allows users to read their own row.
- **No signup page**: The MVP assumes users are created by an Admin via the backend's `POST /api/users/students` endpoint (WI-201) or directly in Supabase Auth dashboard. The `LoginPage` only handles sign-in. A self-registration page is out of scope.
- **Password recovery**: Supabase Auth supports password reset emails, but no "Forgot Password" flow is implemented in the MVP. This can be added later.
- **Session refresh**: Supabase's JS client handles token refresh automatically via the `onAuthStateChange` listener. The access token is refreshed before it expires, and the new token is used for subsequent requests.
- **Backend JWT validation**: The backend currently runs `mockSession.js` which reads `x-mock-role`/`x-mock-user-id` headers. This WI-801 sends JWT tokens from the frontend, but the backend does NOT validate them yet — that's WI-802. Until WI-802, the backend will either need to accept both mock headers and JWT, or the `mockSession.js` will need a temporary update to also extract identity from JWT. This is handled by design: WI-802 replaces mockSession entirely.

---

## Post-Implementation Steps (MANDATORY)

Once the file checklist and acceptance criteria are satisfied:

### 1. Update `PROGRESS.md`
- Change the status of **WI-801** from `Not Started` to `Done`.
- Set the assignee to `Antigravity`.
- Set the target date to the current date.
- Increment the `Done` and `Completion %` columns in the Phase 8 progress table.

### 2. Update `CHANGELOG.md`
Add a new entry at the top:

```
## [YYYY-MM-DD] - WI-801: Supabase Authentication Services Integration
* **Work Item ID**: WI-801
* **Summary**: Replaced the mock-only auth system with real Supabase Auth on the frontend. Installed @supabase/supabase-js, created Supabase client (supabaseClient.js), built AuthProvider with login/logout/session management and auto-subscription to auth state changes. Created LoginPage with email/password form, password visibility toggle, validation, and error handling. Updated Axios client to inject JWT Bearer token when authenticated (falling back to mock headers for dev mode). Added /login route. Updated HomePage to show auth status with sign-out button. MockIdentityProvider kept alongside for backward compatibility (removed in WI-803).
* **Files Affected**:
  - [NEW] `frontend/src/lib/supabaseClient.js`
  - [NEW] `frontend/src/context/AuthContext.jsx`
  - [NEW] `frontend/src/pages/LoginPage.jsx`
  - [NEW] `frontend/src/pages/LoginPage.css`
  - [MODIFIED] `frontend/package.json` (added @supabase/supabase-js)
  - [MODIFIED] `frontend/src/App.jsx` (wrapped with AuthProvider)
  - [MODIFIED] `frontend/src/api/client.js` (JWT bearer token interceptor)
  - [MODIFIED] `frontend/src/routes/AppRoutes.jsx` (added /login route)
  - [MODIFIED] `frontend/src/pages/HomePage.jsx` (auth status display, sign-out)
* **Verification Done**:
  - [x] @supabase/supabase-js installed in frontend package.json
  - [x] Supabase client configured with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
  - [x] AuthContext provides session, user, login, logout, isAuthenticated, isAdmin, isStudent
  - [x] AuthContext syncs with onAuthStateChange
  - [x] LoginPage renders with email/password inputs and show/hide toggle
  - [x] LoginPage validates empty fields
  - [x] LoginPage shows Supabase error messages on failed login
  - [x] LoginPage redirects to / on successful login
  - [x] Axios interceptor injects Authorization: Bearer <token> when authenticated
  - [x] Axios interceptor falls back to x-mock-role headers when no session (dev mode)
  - [x] Auth state persists across page refresh
  - [x] Logout clears session and resets auth state
  - [x] npm run build completes with no errors
* **Impact on Existing Functionality**: All existing pages continue to work with the MockIdentityBar. Real auth users can now log in via /login. The Axios client prefers JWT but falls back to mock headers. Existing mock-based development workflow is unchanged.
```

### 3. Stop and Wait
Do **not** begin WI-802 in the same session. Wait for the developer to verify and trigger the next prompt.

---

## Notes for the AI Agent

- **Dual auth mode**: Both `AuthProvider` and `MockIdentityProvider` wrap the app simultaneously. `AuthProvider` is the outer provider (so `useAuth` is available everywhere). `MockIdentityProvider` stays for dev fallback. The Axios interceptor in `api/client.js` decides which auth to use: JWT if available, mock headers otherwise. This ensures no existing functionality breaks.
- **`fetchUserProfile` is a separate export**: The `fetchUserProfile` function is exported from `supabaseClient.js` rather than being inside `AuthContext` to keep the context lean. It queries `public.users` using the Supabase data client with the anon key. This requires RLS to be OFF on the `users` table (which is the current state from WI-104).
- **LoginPage uses `React.useEffect` for redirect**: After successful login, the `isAuthenticated` flag becomes `true`, which triggers the `useEffect` to navigate to `/`. This avoids race conditions between `login()` resolving and the auth state change propagating.
- **Password visibility toggle**: The password input has a show/hide toggle button using `Eye`/`EyeOff` icons from lucide-react. The button is `type="button"` and has `tabIndex={-1}` to prevent form submission and tab focus.
- **CSS `.spin` animation**: The `Loader` icon in the submit button uses a CSS `spin` animation defined in `LoginPage.css`. This is used only on the login page — if needed globally, it can be moved to `index.css`. The `MeetingRoomPage.jsx` also uses `className="spin"` — ensure consistency by adding the spin keyframes to a shared location if both pages need it.
- **No changes to MockIdentityBar or MockIdentityContext**: These files are left untouched. They continue to work as before. The `// TODO(PHASE-8: REMOVE)` comments remain. WI-803 will remove them.
- **Do not modify backend files**: This is a frontend-only work item. Do not touch `backend/` files.
- **Environment variables**: The frontend `.env` must have `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` set. These are already documented in `.env.example`. Ensure they are set in the local `.env` file. Do NOT commit `.env` to git.
- **`package-lock.json` will update**: After running `npm install @supabase/supabase-js`, the `package-lock.json` will change. Commit it along with the updated `package.json`.
