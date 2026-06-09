# WI-202 — Student & Batch Configuration UI

> **GitHub Issue**: #6
> **Phase**: 2 — Student & Batch Management (Slice 1)
> **Priority**: High
> **Dependencies**: WI-103, WI-201
> **Project**: Trainifyer Mailbox Monitoring Platform

---

## Context

WI-103 set up the React + Vite frontend with routing, a Layout component, a Mock Identity Bar (role/userId selector), and placeholder dashboard pages. WI-201 built the backend API endpoints for student CRUD and batch CRUD with role-based access.

This work item builds the **frontend admin views** that consume those APIs. You will create two feature pages under the admin section:

- **`/admin/students`** — A student roster page with a table listing all students and a form to create new students.
- **`/admin/batches`** — A batch management page with a table listing all batches, a form to create new batches, and a drill-down detail view where students can be assigned to a batch.

> ⚠️ **Mock Context-First Rule**: The Axios client (`frontend/src/api/client.js`) automatically reads `mock_identity` from `localStorage` and injects `x-mock-role` and `x-mock-user-id` headers on every request. The developer uses the Mock Identity Bar at the bottom of the page to switch roles. All mutations require the `ADMIN` role — the backend enforces this via the `requireRole` middleware from WI-201. The frontend should also disable action buttons when the role is not Admin.
>
> ⚠️ **No Real Auth**: All identity flows go through the Mock Identity Bar. Supabase Auth, JWT, and route guards are deferred to Phase 8.

---

## Reference Documents

Before starting, read these files in the project root:

- `WORKITEMS.md` — Acceptance criteria for WI-202
- `ASSUMPTIONS.md` — Single-batch-per-student rule, no self-registration
- `prompts/WI-103-prompt.md` — Frontend baseline (Mock Identity Bar, Layout, routing, Axios client)
- `prompts/WI-201-prompt.md` — Backend API endpoints this UI consumes
- `frontend/src/api/client.js` — Axios instance with auto-injected mock headers

---

## Scope of This Work Item

- Create **`/admin/students`** page:
  - Student roster table (columns: name, email, assigned batch, created date)
  - "Create Student" form (inline or modal overlay)
  - Form fields: email, full name
  - Auto-refresh the table after creation
- Create **`/admin/batches`** page:
  - Batch list table (columns: name, status, student count, created date)
  - "Create Batch" form (inline)
  - Click a batch row to expand/drill into a **batch detail view** showing:
    - Batch name and status (with an inline toggle to switch active/inactive)
    - Student roster for this batch
    - "Assign Student" form (dropdown or text input for student UUID)
- Register both routes in `AppRoutes.jsx`.
- Write CSS files for each page alongside the component.

This is a **frontend-only** work item. The backend APIs are already implemented in WI-201. Do not modify any backend routes or database schema.

---

## Step-by-Step Instructions

### 1. Create the frontend page structure

```
frontend/src/pages/admin/
├── AdminDashboard.jsx     (existing — placeholder, leave as-is)
├── StudentsPage.jsx       (NEW — student roster + create form)
├── StudentsPage.css       (NEW)
├── BatchesPage.jsx        (NEW — batch list + create + detail + assign)
└── BatchesPage.css        (NEW)
```

### 2. Write `frontend/src/pages/admin/StudentsPage.jsx`

This page fetches the student list from `GET /api/users/students`, displays it in a table, and provides an inline form to create new students.

```jsx
import { useState, useEffect, useCallback } from 'react';
import { useMockIdentity } from '../../context/MockIdentityContext';
import apiClient from '../../api/client';
import { Plus, UserPlus } from 'lucide-react';
import './StudentsPage.css';

const INITIAL_FORM = { email: '', fullName: '' };

export default function StudentsPage() {
  const { isAdmin } = useMockIdentity();
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);

  const fetchStudents = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiClient.get('/users/students');
      setStudents(res.data.data);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.email || !form.fullName) {
      setFormError('Email and full name are required.');
      return;
    }
    try {
      setSubmitting(true);
      setFormError(null);
      await apiClient.post('/users/students', {
        email: form.email,
        fullName: form.fullName,
        role: 'STUDENT'
      });
      setForm(INITIAL_FORM);
      setShowForm(false);
      await fetchStudents();
    } catch (e) {
      setFormError(e.response?.data?.message || e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="students-page">
      <div className="page-header">
        <h2>Students</h2>
        {isAdmin && (
          <button className="btn btn-primary" onClick={() => setShowForm((v) => !v)}>
            <UserPlus size={16} /> {showForm ? 'Cancel' : 'Create Student'}
          </button>
        )}
      </div>

      {showForm && isAdmin && (
        <form className="create-form" onSubmit={handleSubmit}>
          <h3><Plus size={16} /> New Student</h3>
          <div className="form-row">
            <label>
              Full Name
              <input
                name="fullName"
                value={form.fullName}
                onChange={handleChange}
                placeholder="e.g. Rahul Sharma"
                required
              />
            </label>
            <label>
              Email
              <input
                name="email"
                type="email"
                value={form.email}
                onChange={handleChange}
                placeholder="e.g. rahul@test.com"
                required
              />
            </label>
          </div>
          {formError && <p className="form-error">{formError}</p>}
          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      )}

      {loading && <p className="status-message">Loading students...</p>}
      {error && <p className="status-message error">{error}</p>}

      {!loading && !error && (
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Batch</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {students.length === 0 ? (
                <tr>
                  <td colSpan={4} className="empty-row">No students found.</td>
                </tr>
              ) : (
                students.map((s) => (
                  <tr key={s.id}>
                    <td>{s.full_name}</td>
                    <td>{s.email}</td>
                    <td>{s.batch_id ? s.batch_id.substring(0, 8) + '...' : '—'}</td>
                    <td>{new Date(s.created_at).toLocaleDateString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

### 3. Write `frontend/src/pages/admin/StudentsPage.css`

```css
.students-page {
  text-align: left;
  max-width: 960px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
}

.page-header h2 {
  margin: 0;
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  transition: background 0.2s;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-primary {
  background: #2563eb;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: #1d4ed8;
}

.btn-secondary {
  background: #e5e7eb;
  color: #374151;
}

.btn-secondary:hover:not(:disabled) {
  background: #d1d5db;
}

.btn-success {
  background: #16a34a;
  color: white;
}

.btn-success:hover:not(:disabled) {
  background: #15803d;
}

.btn-danger {
  background: #dc2626;
  color: white;
  border: none;
  padding: 4px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}

.btn-danger:hover {
  background: #b91c1c;
}

.create-form {
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 1.25rem;
  margin-bottom: 1.5rem;
}

.create-form h3 {
  margin: 0 0 1rem;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 1rem;
}

.form-row {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
}

.form-row label {
  flex: 1;
  min-width: 200px;
  font-size: 13px;
  font-weight: 500;
  color: #374151;
}

.form-row input,
.form-row select {
  display: block;
  width: 100%;
  margin-top: 4px;
  padding: 8px 10px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  font-size: 14px;
  box-sizing: border-box;
}

.form-row input:focus,
.form-row select:focus {
  outline: none;
  border-color: #2563eb;
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.15);
}

.form-error {
  color: #dc2626;
  font-size: 13px;
  margin: 0.5rem 0;
}

.form-actions {
  margin-top: 1rem;
}

.status-message {
  text-align: center;
  color: #6b7280;
  padding: 2rem;
}

.status-message.error {
  color: #dc2626;
}

.table-wrapper {
  overflow-x: auto;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}

.data-table th,
.data-table td {
  text-align: left;
  padding: 10px 12px;
  border-bottom: 1px solid #e5e7eb;
}

.data-table th {
  background: #f9fafb;
  font-weight: 600;
  color: #374151;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.data-table tbody tr:hover {
  background: #f3f4f6;
}

.data-table .empty-row {
  text-align: center;
  color: #9ca3af;
  padding: 2rem;
}

.badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
}

.badge-active {
  background: #dcfce7;
  color: #16a34a;
}

.badge-inactive {
  background: #fef3c7;
  color: #d97706;
}
```

### 4. Write `frontend/src/pages/admin/BatchesPage.jsx`

This page shows a list of batches and a create form. Clicking a batch row expands to show its detail: batch info, student roster, and an assign-student form.

```jsx
import { useState, useEffect, useCallback } from 'react';
import { useMockIdentity } from '../../context/MockIdentityContext';
import apiClient from '../../api/client';
import { Plus, ChevronDown, ChevronRight, Users } from 'lucide-react';
import './BatchesPage.css';

const INITIAL_BATCH_FORM = { name: '' };
const INITIAL_ASSIGN_FORM = { studentId: '' };

export default function BatchesPage() {
  const { isAdmin } = useMockIdentity();
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [batchForm, setBatchForm] = useState(INITIAL_BATCH_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);

  // Expanded batch detail state
  const [expandedBatchId, setExpandedBatchId] = useState(null);
  const [batchStudents, setBatchStudents] = useState([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [assignForm, setAssignForm] = useState(INITIAL_ASSIGN_FORM);
  const [assignSubmitting, setAssignSubmitting] = useState(false);
  const [assignError, setAssignError] = useState(null);

  const fetchBatches = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiClient.get('/batches');
      setBatches(res.data.data);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBatches();
  }, [fetchBatches]);

  const fetchBatchStudents = useCallback(async (batchId) => {
    try {
      setStudentsLoading(true);
      const res = await apiClient.get(`/batches/${batchId}/students`);
      setBatchStudents(res.data.data);
    } catch (e) {
      console.error('Failed to fetch batch students:', e);
      setBatchStudents([]);
    } finally {
      setStudentsLoading(false);
    }
  }, []);

  const handleToggleExpand = (batchId) => {
    if (expandedBatchId === batchId) {
      setExpandedBatchId(null);
      setBatchStudents([]);
    } else {
      setExpandedBatchId(batchId);
      fetchBatchStudents(batchId);
      setAssignForm(INITIAL_ASSIGN_FORM);
      setAssignError(null);
    }
  };

  const handleBatchFormChange = (e) => {
    setBatchForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleCreateBatch = async (e) => {
    e.preventDefault();
    if (!batchForm.name) {
      setFormError('Batch name is required.');
      return;
    }
    try {
      setSubmitting(true);
      setFormError(null);
      await apiClient.post('/batches', { name: batchForm.name });
      setBatchForm(INITIAL_BATCH_FORM);
      setShowForm(false);
      await fetchBatches();
    } catch (e) {
      setFormError(e.response?.data?.message || e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (batch) => {
    const newStatus = batch.status === 'active' ? 'inactive' : 'active';
    try {
      await apiClient.patch(`/batches/${batch.id}`, { status: newStatus });
      await fetchBatches();
      if (expandedBatchId === batch.id) {
        setBatchStudents([]);
        await fetchBatchStudents(batch.id);
      }
    } catch (e) {
      console.error('Failed to update batch status:', e);
    }
  };

  const handleAssignFormChange = (e) => {
    setAssignForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleAssignStudent = async (e) => {
    e.preventDefault();
    if (!assignForm.studentId) {
      setAssignError('Student ID is required.');
      return;
    }
    try {
      setAssignSubmitting(true);
      setAssignError(null);
      await apiClient.post(`/batches/${expandedBatchId}/students`, {
        studentId: assignForm.studentId
      });
      setAssignForm(INITIAL_ASSIGN_FORM);
      await fetchBatchStudents(expandedBatchId);
      await fetchBatches(); // Refresh to update student counts
    } catch (e) {
      setAssignError(e.response?.data?.message || e.message);
    } finally {
      setAssignSubmitting(false);
    }
  };

  return (
    <div className="batches-page">
      <div className="page-header">
        <h2>Batches</h2>
        {isAdmin && (
          <button className="btn btn-primary" onClick={() => setShowForm((v) => !v)}>
            <Plus size={16} /> {showForm ? 'Cancel' : 'Create Batch'}
          </button>
        )}
      </div>

      {showForm && isAdmin && (
        <form className="create-form" onSubmit={handleCreateBatch}>
          <h3><Plus size={16} /> New Batch</h3>
          <div className="form-row">
            <label>
              Batch Name
              <input
                name="name"
                value={batchForm.name}
                onChange={handleBatchFormChange}
                placeholder="e.g. Cohort-1"
                required
              />
            </label>
          </div>
          {formError && <p className="form-error">{formError}</p>}
          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      )}

      {loading && <p className="status-message">Loading batches...</p>}
      {error && <p className="status-message error">{error}</p>}

      {!loading && !error && (
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 32 }}></th>
                <th>Name</th>
                <th>Status</th>
                <th>Students</th>
                <th>Created</th>
                {isAdmin && <th style={{ width: 100 }}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {batches.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 6 : 5} className="empty-row">No batches found.</td>
                </tr>
              ) : (
                batches.map((b) => (
                  <tr key={b.id} className="batch-row">
                    <td>
                      <button
                        className="expand-btn"
                        onClick={() => handleToggleExpand(b.id)}
                      >
                        {expandedBatchId === b.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      </button>
                    </td>
                    <td className="batch-name">{b.name}</td>
                    <td>
                      <span className={`badge badge-${b.status}`}>{b.status}</span>
                    </td>
                    <td>{b.student_count}</td>
                    <td>{new Date(b.created_at).toLocaleDateString()}</td>
                    {isAdmin && (
                      <td>
                        <button
                          className={`btn btn-${b.status === 'active' ? 'danger' : 'success'}`}
                          onClick={() => handleToggleStatus(b)}
                        >
                          {b.status === 'active' ? 'Deactivate' : 'Activate'}
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {expandedBatchId && (
            <div className="batch-detail">
              <h4><Users size={16} /> Assigned Students</h4>

              {isAdmin && (
                <form className="assign-form" onSubmit={handleAssignStudent}>
                  <label>
                    Student UUID
                    <input
                      name="studentId"
                      value={assignForm.studentId}
                      onChange={handleAssignFormChange}
                      placeholder="Paste student UUID"
                    />
                  </label>
                  <button type="submit" className="btn btn-primary" disabled={assignSubmitting}>
                    {assignSubmitting ? 'Assigning...' : 'Assign'}
                  </button>
                  {assignError && <p className="form-error">{assignError}</p>}
                </form>
              )}

              {studentsLoading ? (
                <p className="status-message">Loading students...</p>
              ) : batchStudents.length === 0 ? (
                <p className="status-message">No students assigned to this batch.</p>
              ) : (
                <table className="data-table inner-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Assigned At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batchStudents.map((s) => (
                      <tr key={s.id}>
                        <td>{s.full_name}</td>
                        <td>{s.email}</td>
                        <td>{new Date(s.assigned_at).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

### 5. Write `frontend/src/pages/admin/BatchesPage.css`

```css
.batches-page {
  text-align: left;
  max-width: 960px;
  margin: 0 auto;
}

.batch-row {
  cursor: pointer;
}

.batch-name {
  font-weight: 500;
}

.expand-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  color: #6b7280;
  border-radius: 4px;
}

.expand-btn:hover {
  background: #f3f4f6;
}

.batch-detail {
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-top: none;
  border-radius: 0 0 8px 8px;
  padding: 1.25rem;
  margin-top: -1px;
}

.batch-detail h4 {
  margin: 0 0 1rem;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  color: #374151;
}

.assign-form {
  display: flex;
  align-items: flex-end;
  gap: 0.75rem;
  margin-bottom: 1rem;
  flex-wrap: wrap;
}

.assign-form label {
  flex: 1;
  min-width: 250px;
  font-size: 13px;
  font-weight: 500;
  color: #374151;
}

.assign-form input {
  display: block;
  width: 100%;
  margin-top: 4px;
  padding: 8px 10px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  font-size: 14px;
  box-sizing: border-box;
}

.assign-form input:focus {
  outline: none;
  border-color: #2563eb;
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.15);
}

.inner-table {
  font-size: 13px;
}

.inner-table th {
  font-size: 11px;
}
```

### 6. Update `frontend/src/routes/AppRoutes.jsx`

Add imports and routes for the two new pages:

```jsx
import AdminDashboard from '../pages/admin/AdminDashboard';
import StudentsPage from '../pages/admin/StudentsPage';
import BatchesPage from '../pages/admin/BatchesPage';

// Inside <Routes> under the Layout route, add:
<Route path="/admin/students" element={<StudentsPage />} />
<Route path="/admin/batches" element={<BatchesPage />} />
```

The full file after changes:

```jsx
import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from '../components/Layout';
import HomePage from '../pages/HomePage';
import AdminDashboard from '../pages/admin/AdminDashboard';
import StudentsPage from '../pages/admin/StudentsPage';
import BatchesPage from '../pages/admin/BatchesPage';
import StudentDashboard from '../pages/student/StudentDashboard';

export default function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/admin/dashboard" element={<AdminDashboard />} />
        <Route path="/admin/students" element={<StudentsPage />} />
        <Route path="/admin/batches" element={<BatchesPage />} />
        <Route path="/student/dashboard" element={<StudentDashboard />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
```

### 7. Verify the build

```bash
cd frontend
npm run build
```

Expected: Clean Vite build with no errors or warnings.

### 8. Manual verification

1. Start the backend: `cd backend && npm run dev`
2. Start the frontend: `cd frontend && npm run dev`
3. Open `http://localhost:5173`
4. Click the **Admin** button on the Mock Identity Bar (sets role to ADMIN)
5. Navigate to `http://localhost:5173/admin/students`
   - Click "Create Student", fill in a name and email, submit
   - Verify the student appears in the table
6. Navigate to `http://localhost:5173/admin/batches`
   - Click "Create Batch", enter a name, submit
   - Verify the batch appears in the table with student count 0
7. Click the expand arrow on the batch row
   - Paste the student UUID from step 5 into the "Student UUID" field
   - Click "Assign"
   - Verify the student appears in the assigned roster
   - Verify the student count on the batch row updates
8. Click "Deactivate" / "Activate" to toggle batch status
9. Click the **Student** button on the Mock Identity Bar
   - Navigate to `/admin/students` — verify the "Create Student" button is hidden
   - Navigate to `/admin/batches` — verify the "Create Batch" button and action buttons are hidden; expand a batch row and verify the "Assign" form is hidden

---

## Expected Output (File Checklist)

- [ ] `frontend/src/pages/admin/StudentsPage.jsx` — Student roster table + create form
- [ ] `frontend/src/pages/admin/StudentsPage.css` — Styling for the students page
- [ ] `frontend/src/pages/admin/BatchesPage.jsx` — Batch list + create form + detail view + assign form
- [ ] `frontend/src/pages/admin/BatchesPage.css` — Styling for the batches page
- [ ] `frontend/src/routes/AppRoutes.jsx` — Added routes for `/admin/students` and `/admin/batches`

---

## Acceptance Criteria

- `POST /api/users/students` is called when the "Create Student" form is submitted (Admin role only).
- `GET /api/users/students` is called on mount to populate the student table.
- `POST /api/batches` is called when the "Create Batch" form is submitted (Admin role only).
- `GET /api/batches` is called on mount to populate the batch table.
- `GET /api/batches/:id/students` is called when a batch row is expanded.
- `POST /api/batches/:id/students` is called when a student UUID is submitted in the assign form (Admin role only).
- `PATCH /api/batches/:id` is called with `{ status }` when the toggle button is clicked (Admin role only).
- The "Create" and action buttons are **hidden/disabled** when the Mock Identity Bar is set to Student or no role.
- The assign form is **hidden** when the Mock Identity Bar is not in Admin mode.
- The Vite build completes without errors (`npm run build`).
- All API calls use the existing `apiClient` from `frontend/src/api/client.js` (which auto-injects mock headers).

---

## Risk / Impact

- **Mock-dependent behavior**: Action buttons rely on `isAdmin` from `useMockIdentity()`. In Phase 8, when the Mock Identity Bar is removed, these checks must be replaced with real role checks from Supabase Auth. The `TODO(PHASE-8: REMOVE)` pattern from WI-103 should be applied to the Mock Identity Bar usage (the bar itself is already marked).
- **Student UUID copied manually**: The assign form requires the user to copy/paste a student UUID. This is intentional for the MVP — an autocomplete/search component is out of scope but could be added in a future iteration.
- **No pagination**: Student and batch lists load all records. This is acceptable for the MVP (single org, small cohorts). Pagination can be added server-side and client-side when needed.
- **No delete operations**: The MVP does not include delete endpoints for students or batches. Deletion would require cascade handling and is not in scope for Phase 2.

---

## Post-Implementation Steps (MANDATORY)

Once the file checklist and acceptance criteria are satisfied:

### 1. Update `PROGRESS.md`
- Change the status of **WI-202** from `Not Started` to `Done`.
- Set the assignee to `Antigravity`.
- Set the target date to the current date.
- Add a note summarizing what was implemented.
- Increment the `Done` and `Completion %` columns in the Phase 2 progress table.

### 2. Update `CHANGELOG.md`
Add a new entry at the top:

```
## [YYYY-MM-DD] - WI-202: Student & Batch Configuration UI
* **Work Item ID**: WI-202
* **Summary**: Built two admin frontend pages: Students page (roster table + inline create form) and Batches page (list table with expandable detail view showing assigned student roster, status toggle, and student assignment form). Both pages respect Admin role from the Mock Identity context by hiding mutation controls for non-Admin users.
* **Files Affected**:
  - [NEW] `frontend/src/pages/admin/StudentsPage.jsx`
  - [NEW] `frontend/src/pages/admin/StudentsPage.css`
  - [NEW] `frontend/src/pages/admin/BatchesPage.jsx`
  - [NEW] `frontend/src/pages/admin/BatchesPage.css`
  - [MODIFIED] `frontend/src/routes/AppRoutes.jsx` (added /admin/students and /admin/batches routes)
* **Verification Done**:
  - [x] Admin can create a student via the form
  - [x] Admin can create a batch via the form
  - [x] Admin can expand a batch to see its student roster
  - [x] Admin can assign a student to a batch by UUID
  - [x] Admin can toggle batch status (active/inactive)
  - [x] Student-role users see read-only views (no create/assign/toggle buttons)
  - [x] `npm run build` completes with no errors
  - [x] All API calls go through the mock-header-injecting apiClient
* **Impact on Existing Functionality**: None. The existing Admin Dashboard and Student Dashboard placeholders are unchanged. Existing HomePage routing is unchanged.
```

### 3. Stop and Wait
Do **not** begin WI-301 in the same session. Wait for the developer to verify and trigger the next prompt.

---

## Notes for the AI Agent

- **Use `apiClient` for all API calls**: The existing Axios instance in `frontend/src/api/client.js` already reads `mock_identity` from `localStorage` and injects `x-mock-role` and `x-mock-user-id` headers. Do not create a new Axios instance or use raw `fetch`.
- **Use `useMockIdentity()` for role checks**: Import the hook from `../../context/MockIdentityContext`. The `isAdmin` and `isStudent` booleans are provided. Use `isAdmin` to conditionally render create buttons, assign forms, and action buttons.
- **Role-gating is frontend-only UX**: The buttons are hidden for non-Admin users as a courtesy. The real authorization enforcement is on the backend (WI-201's `requireRole` middleware). An Admin user could theoretically change their mock role to Student via localStorage and see the buttons, but the backend would return 403.
- **Follow existing CSS conventions**: Use the shared button classes (`.btn`, `.btn-primary`, `.btn-danger`, `.btn-success`) from the CSS files you create. Keep table styling consistent with `.data-table` patterns. Add new CSS to page-specific files, not `App.css` or `index.css`.
- **Lucide icons**: The project already has `lucide-react` as a dependency. Use icons like `Plus`, `UserPlus`, `ChevronDown`, `ChevronRight`, `Users` where appropriate. Import them at the top of each component.
- **Do not modify backend files**: This is a frontend-only work item. Do not touch `backend/`, `backend/index.js`, route files, database files, or any prompt files in `prompts/`.
- **Do not modify existing frontend files beyond `AppRoutes.jsx`**: Leave `AdminDashboard.jsx`, `StudentDashboard.jsx`, `HomePage.jsx`, `Layout.jsx`, `MockIdentityBar.jsx`, and the context files unchanged.
- **No modals or overlays unless described**: The create forms are inline sections that toggle open/closed when the button is clicked. This keeps the implementation simple and avoids modal dependencies.
- **Error handling**: Display error messages from API responses (e.g., duplicate email → "A user with this email already exists") in the form error area. Show network errors in the status message area.
- **No data transformation in the UI**: The backend returns snake_case fields (`full_name`, `created_at`, `assigned_at`). Display them as-is in the table. The frontend does not need to convert to camelCase.
