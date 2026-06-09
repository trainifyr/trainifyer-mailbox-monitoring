# WI-502 — Meeting Scheduler & Jitsi Room Integration UI

> **GitHub Issue**: #12
> **Phase**: 5 — Meetings & Privacy Consent (Slice 4)
> **Priority**: High
> **Dependencies**: WI-103, WI-501
> **Project**: Trainifyer Mailbox Monitoring Platform

---

## Context

WI-501 built the backend meeting API (`GET /api/meetings`, `POST /api/meetings`, `POST /api/meetings/public/join`) with role-scoped visibility, batch access control, and auto-generated Jitsi room names. The `meetings` table stores `jitsi_room_name` which is used to construct Jitsi Meet iframe URLs.

This work item builds the **frontend meeting experience**: an Admin scheduling page to create meetings, and a meeting room page that loads the Jitsi Meet iframe. Students can view their meetings and enter the room.

> ⚠️ **Mock Context-First Rule**: All API calls use the Axios client that auto-injects mock headers. The `POST /api/meetings` endpoint requires Admin role (backend-enforced). The meeting room page is accessible to any authenticated user.

---

## Reference Documents

Before starting, read these files in the project root:

- `WORKITEMS.md` — Acceptance criteria for WI-502
- `GOALS.md` — Sub-Goal 5 (Meeting System Integration)
- `ASSUMPTIONS.md` — §3 Meeting & Monitoring (public Jitsi service, consent is mandatory)
- `prompts/WI-501-prompt.md` — Backend meeting API specification
- `frontend/src/api/client.js` — Axios instance with auto-injected mock headers
- `frontend/src/context/MockIdentityContext.jsx` — Role and user identity

---

## Scope of This Work Item

- Create **`/admin/meetings`** page — Admin-only meeting list and create form.
- Create **`/meetings`** page — Student/User meeting list (visible meetings scoped by role).
- Create **`/meeting/:id`** page — Jitsi Meet iframe wrapper page that loads the meeting room.
- Add a **Jitsi Meet API script loader** utility.
- Update routing in `AppRoutes.jsx`.

---

## Step-by-Step Instructions

### 1. Create the file structure

```
frontend/src/pages/meetings/
├── AdminMeetingsPage.jsx    (NEW — admin list + create)
├── AdminMeetingsPage.css    (NEW)
├── MeetingsListPage.jsx     (NEW — user-facing meeting list)
├── MeetingsListPage.css     (NEW)
├── MeetingRoomPage.jsx      (NEW — Jitsi iframe wrapper)
└── MeetingRoomPage.css      (NEW)
```

### 2. Write the Jitsi API loader utility

Create `frontend/src/lib/loadJitsiScript.js`:

```js
// Dynamically loads the Jitsi Meet external API script.
// Returns a promise that resolves when the script is loaded.
// Subsequent calls return the already-resolved promise.

let loadPromise = null;

export default function loadJitsiScript() {
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    // Check if already loaded
    if (window.JitsiMeetExternalAPI) {
      resolve(window.JitsiMeetExternalAPI);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://meet.jit.si/external_api.js';
    script.async = true;
    script.onload = () => {
      if (window.JitsiMeetExternalAPI) {
        resolve(window.JitsiMeetExternalAPI);
      } else {
        reject(new Error('JitsiMeetExternalAPI not found after script load'));
      }
    };
    script.onerror = () => reject(new Error('Failed to load Jitsi Meet script'));
    document.head.appendChild(script);
  });

  return loadPromise;
}
```

### 3. Write `frontend/src/pages/meetings/AdminMeetingsPage.jsx`

Admin page showing all meetings with a create form:

```jsx
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMockIdentity } from '../../context/MockIdentityContext';
import apiClient from '../../api/client';
import { Plus, Video, Calendar, Globe, Users } from 'lucide-react';
import './AdminMeetingsPage.css';

const INITIAL_FORM = {
  title: '',
  batchId: '',
  isPublic: false,
  scheduledStart: '',
  scheduledEnd: ''
};

export default function AdminMeetingsPage() {
  const { isAdmin } = useMockIdentity();
  const navigate = useNavigate();
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);
  const [batches, setBatches] = useState([]);

  const fetchMeetings = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiClient.get('/meetings');
      setMeetings(res.data.data);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchBatches = useCallback(async () => {
    try {
      const res = await apiClient.get('/batches');
      setBatches(res.data.data);
    } catch (e) {
      console.error('Failed to fetch batches:', e);
    }
  }, []);

  useEffect(() => {
    fetchMeetings();
    fetchBatches();
  }, [fetchMeetings, fetchBatches]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
    // Clear batchId when toggling to public
    if (name === 'isPublic' && checked) {
      setForm((prev) => ({ ...prev, isPublic: true, batchId: '' }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title) {
      setFormError('Title is required.');
      return;
    }
    if (!form.isPublic && !form.batchId) {
      setFormError('Select a batch for a batch meeting, or check "Public meeting".');
      return;
    }

    const payload = {
      title: form.title,
      isPublic: form.isPublic,
      batchId: form.isPublic ? null : form.batchId,
      scheduledStart: form.scheduledStart || null,
      scheduledEnd: form.scheduledEnd || null
    };

    try {
      setSubmitting(true);
      setFormError(null);
      await apiClient.post('/meetings', payload);
      setForm(INITIAL_FORM);
      setShowForm(false);
      await fetchMeetings();
    } catch (e) {
      setFormError(e.response?.data?.message || e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'LIVE': return 'badge badge-live';
      case 'SCHEDULED': return 'badge badge-scheduled';
      case 'ENDED': return 'badge badge-ended';
      case 'CANCELLED': return 'badge badge-cancelled';
      default: return 'badge';
    }
  };

  const formatDateTime = (iso) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleString();
  };

  if (!isAdmin) {
    return (
      <div className="admin-meetings-page">
        <p className="status-message">You do not have permission to access this page.</p>
      </div>
    );
  }

  return (
    <div className="admin-meetings-page">
      <div className="page-header">
        <h2>Meetings</h2>
        <button className="btn btn-primary" onClick={() => setShowForm((v) => !v)}>
          <Plus size={16} /> {showForm ? 'Cancel' : 'Schedule Meeting'}
        </button>
      </div>

      {showForm && (
        <form className="create-form" onSubmit={handleSubmit}>
          <h3><Video size={16} /> Schedule New Meeting</h3>
          <div className="form-row">
            <label className="field-full">
              Title
              <input
                name="title"
                value={form.title}
                onChange={handleChange}
                placeholder="e.g. Math Lecture 1"
                required
              />
            </label>
          </div>
          <div className="form-row">
            <label className="field-checkbox">
              <input
                type="checkbox"
                name="isPublic"
                checked={form.isPublic}
                onChange={handleChange}
              />
              <Globe size={14} /> Public meeting (anyone can join)
            </label>
          </div>
          {!form.isPublic && (
            <div className="form-row">
              <label className="field-full">
                Batch
                <select name="batchId" value={form.batchId} onChange={handleChange} required={!form.isPublic}>
                  <option value="">Select a batch...</option>
                  {batches.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </label>
            </div>
          )}
          <div className="form-row">
            <label>
              Start Time
              <input
                name="scheduledStart"
                type="datetime-local"
                value={form.scheduledStart}
                onChange={handleChange}
              />
            </label>
            <label>
              End Time
              <input
                name="scheduledEnd"
                type="datetime-local"
                value={form.scheduledEnd}
                onChange={handleChange}
              />
            </label>
          </div>
          {formError && <p className="form-error">{formError}</p>}
          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Creating...' : 'Create Meeting'}
            </button>
          </div>
        </form>
      )}

      {loading && <p className="status-message">Loading meetings...</p>}
      {error && <p className="status-message error">{error}</p>}

      {!loading && !error && (
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Type</th>
                <th>Batch</th>
                <th>Status</th>
                <th>Start</th>
                <th>End</th>
                <th>Created By</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {meetings.length === 0 ? (
                <tr>
                  <td colSpan={8} className="empty-row">No meetings scheduled.</td>
                </tr>
              ) : (
                meetings.map((m) => (
                  <tr key={m.id}>
                    <td className="meeting-title">{m.title}</td>
                    <td>
                      {m.is_public ? (
                        <span className="type-badge public"><Globe size={12} /> Public</span>
                      ) : (
                        <span className="type-badge batch"><Users size={12} /> Batch</span>
                      )}
                    </td>
                    <td>{m.batch_name || '—'}</td>
                    <td><span className={getStatusBadgeClass(m.status)}>{m.status}</span></td>
                    <td>{formatDateTime(m.scheduled_start)}</td>
                    <td>{formatDateTime(m.scheduled_end)}</td>
                    <td>{m.created_by_name || '—'}</td>
                    <td>
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => navigate(`/meeting/${m.id}`)}
                      >
                        <Video size={14} /> Join
                      </button>
                    </td>
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

### 4. Write `frontend/src/pages/meetings/AdminMeetingsPage.css`

```css
.admin-meetings-page {
  text-align: left;
  max-width: 1100px;
  margin: 0 auto;
}

.meeting-title {
  font-weight: 500;
}

.type-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 4px;
  text-transform: uppercase;
}

.type-badge.public {
  background: #dbeafe;
  color: #1d4ed8;
}

.type-badge.batch {
  background: #f3e8ff;
  color: #7c3aed;
}

.badge-live {
  background: #dcfce7;
  color: #16a34a;
}

.badge-scheduled {
  background: #fef3c7;
  color: #d97706;
}

.badge-ended {
  background: #f3f4f6;
  color: #6b7280;
}

.badge-cancelled {
  background: #fee2e2;
  color: #dc2626;
}

.field-full {
  flex: 1;
  min-width: 100%;
}

.field-checkbox {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  cursor: pointer;
  color: #374151;
}

.field-checkbox input[type="checkbox"] {
  width: auto;
  margin: 0;
}

.btn-sm {
  padding: 4px 10px;
  font-size: 12px;
}
```

### 5. Write `frontend/src/pages/meetings/MeetingsListPage.jsx`

User-facing page showing meetings visible to the current role:

```jsx
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMockIdentity } from '../../context/MockIdentityContext';
import apiClient from '../../api/client';
import { Video, Calendar, Globe, Users, Clock } from 'lucide-react';
import './MeetingsListPage.css';

export default function MeetingsListPage() {
  const { isAuthenticated } = useMockIdentity();
  const navigate = useNavigate();
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchMeetings = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiClient.get('/meetings');
      setMeetings(res.data.data);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMeetings();
  }, [fetchMeetings]);

  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'LIVE': return 'badge badge-live';
      case 'SCHEDULED': return 'badge badge-scheduled';
      case 'ENDED': return 'badge badge-ended';
      case 'CANCELLED': return 'badge badge-cancelled';
      default: return 'badge';
    }
  };

  const formatDateTime = (iso) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleString();
  };

  return (
    <div className="meetings-list-page">
      <div className="page-header">
        <h2>Meetings</h2>
      </div>

      {loading && <p className="status-message">Loading meetings...</p>}
      {error && <p className="status-message error">{error}</p>}

      {!loading && !error && (
        <>
          {meetings.length === 0 ? (
            <p className="status-message">No meetings available.</p>
          ) : (
            <div className="meetings-grid">
              {meetings.map((m) => (
                <div key={m.id} className="meeting-card">
                  <div className="meeting-card-header">
                    <h3>{m.title}</h3>
                    <span className={getStatusBadgeClass(m.status)}>{m.status}</span>
                  </div>
                  <div className="meeting-card-meta">
                    <span>
                      {m.is_public ? (
                        <><Globe size={14} /> Public</>
                      ) : (
                        <><Users size={14} /> {m.batch_name || 'Batch'}</>
                      )}
                    </span>
                    {m.scheduled_start && (
                      <span><Calendar size={14} /> {formatDateTime(m.scheduled_start)}</span>
                    )}
                    {m.scheduled_end && (
                      <span><Clock size={14} /> {formatDateTime(m.scheduled_end)}</span>
                    )}
                  </div>
                  <div className="meeting-card-actions">
                    <button
                      className="btn btn-primary"
                      onClick={() => navigate(`/meeting/${m.id}`)}
                      disabled={m.status === 'ENDED' || m.status === 'CANCELLED'}
                    >
                      <Video size={16} />
                      {m.status === 'ENDED' || m.status === 'CANCELLED' ? 'Unavailable' : 'Join Room'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
```

### 6. Write `frontend/src/pages/meetings/MeetingsListPage.css`

```css
.meetings-list-page {
  text-align: left;
  max-width: 900px;
  margin: 0 auto;
}

.meetings-grid {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.meeting-card {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 1.25rem;
  background: #ffffff;
  transition: box-shadow 0.15s;
}

.meeting-card:hover {
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
}

.meeting-card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 0.75rem;
}

.meeting-card-header h3 {
  margin: 0;
  font-size: 1.1rem;
  color: #111827;
}

.meeting-card-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  font-size: 13px;
  color: #6b7280;
  margin-bottom: 1rem;
}

.meeting-card-meta span {
  display: flex;
  align-items: center;
  gap: 4px;
}

.meeting-card-actions {
  display: flex;
  gap: 8px;
}
```

### 7. Write `frontend/src/pages/meetings/MeetingRoomPage.jsx`

Jitsi iframe wrapper. Fetches meeting details and loads Jitsi Meet iframe:

```jsx
import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMockIdentity } from '../../context/MockIdentityContext';
import apiClient from '../../api/client';
import loadJitsiScript from '../../lib/loadJitsiScript';
import { ArrowLeft, Video, Loader } from 'lucide-react';
import './MeetingRoomPage.css';

export default function MeetingRoomPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated, userId } = useMockIdentity();
  const jitsiContainerRef = useRef(null);
  const jitsiApiRef = useRef(null);

  const [meeting, setMeeting] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [jitsiLoading, setJitsiLoading] = useState(true);
  const [displayName, setDisplayName] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function fetchMeeting() {
      try {
        setLoading(true);
        // Fetch all meetings and find this one (no single-meeting endpoint yet)
        const res = await apiClient.get('/meetings');
        const found = res.data.data.find((m) => m.id === id);
        if (!found) {
          throw new Error('Meeting not found');
        }
        if (!cancelled) {
          setMeeting(found);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e.response?.data?.error || e.message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchMeeting();
    return () => { cancelled = true; };
  }, [id]);

  // Load Jitsi iframe once meeting data is available
  useEffect(() => {
    if (!meeting || !jitsiContainerRef.current) return;
    if (meeting.status === 'ENDED' || meeting.status === 'CANCELLED') return;

    let cancelled = false;

    async function initJitsi() {
      try {
        const JitsiAPI = await loadJitsiScript();

        if (cancelled) return;

        // Determine user display name
        let userDisplayName = displayName;
        if (!userDisplayName && userId) {
          // Try to fetch user info
          try {
            const res = await apiClient.get('/users/students');
            const user = res.data.data.find((s) => s.id === userId);
            if (user) userDisplayName = user.full_name;
          } catch (e) {
            // Fallback: use userId prefix
          }
        }
        if (!userDisplayName) userDisplayName = `User-${userId?.substring(0, 8) || 'Guest'}`;

        const domain = 'meet.jit.si';
        const options = {
          roomName: meeting.jitsi_room_name,
          width: '100%',
          height: '100%',
          parentNode: jitsiContainerRef.current,
          userInfo: {
            displayName: userDisplayName
          },
          configOverrides: {
            startWithAudioMuted: true,
            startWithVideoMuted: false,
            disableDeepLinking: true,
            prejoinPageEnabled: false
          },
          interfaceConfigOverrides: {
            SHOW_JITSI_WATERMARK: false,
            SHOW_WATERMARK_FOR_GUESTS: false,
            TOOLBAR_ALWAYS_VISIBLE: true,
            DISABLE_JOIN_LEAVE_NOTIFICATIONS: true
          }
        };

        jitsiApiRef.current = new JitsiAPI(domain, options);
        setJitsiLoading(false);

        // Cleanup on unmount
        return () => {
          if (jitsiApiRef.current) {
            jitsiApiRef.current.dispose();
            jitsiApiRef.current = null;
          }
        };
      } catch (e) {
        if (!cancelled) {
          console.error('Jitsi init failed:', e);
          setJitsiLoading(false);
        }
      }
    }

    const cleanupPromise = initJitsi();

    return () => {
      cancelled = true;
      if (jitsiApiRef.current) {
        jitsiApiRef.current.dispose();
        jitsiApiRef.current = null;
      }
    };
  }, [meeting, userId, displayName]);

  if (loading) {
    return (
      <div className="meeting-room-page">
        <div className="meeting-room-loading">
          <Loader size={32} className="spin" />
          <p>Loading meeting...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="meeting-room-page">
        <div className="meeting-room-error">
          <p className="error">{error}</p>
          <button className="btn btn-secondary" onClick={() => navigate(-1)}>
            <ArrowLeft size={16} /> Go Back
          </button>
        </div>
      </div>
    );
  }

  if (meeting.status === 'ENDED' || meeting.status === 'CANCELLED') {
    return (
      <div className="meeting-room-page">
        <div className="meeting-room-ended">
          <h2>{meeting.title}</h2>
          <p className="status-message">
            This meeting has been <strong>{meeting.status.toLowerCase()}</strong>.
          </p>
          {meeting.status === 'ENDED' && meeting.scheduled_end && (
            <p className="status-message">Ended at: {new Date(meeting.scheduled_end).toLocaleString()}</p>
          )}
          <button className="btn btn-secondary" onClick={() => navigate(-1)}>
            <ArrowLeft size={16} /> Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="meeting-room-page">
      <div className="meeting-room-header">
        <button className="back-btn" onClick={() => navigate(-1)}>
          <ArrowLeft size={16} /> Back
        </button>
        <h2>{meeting.title}</h2>
        {meeting.batch_name && <span className="meeting-room-badge">{meeting.batch_name}</span>}
      </div>

      {jitsiLoading && (
        <div className="jitsi-loading-overlay">
          <Loader size={24} className="spin" />
          <p>Loading video room...</p>
        </div>
      )}

      <div className="jitsi-container" ref={jitsiContainerRef} />
    </div>
  );
}
```

### 8. Write `frontend/src/pages/meetings/MeetingRoomPage.css`

```css
.meeting-room-page {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 140px);
  max-width: 1200px;
  margin: 0 auto;
}

.meeting-room-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.75rem 0;
  border-bottom: 1px solid #e5e7eb;
  margin-bottom: 0;
  flex-shrink: 0;
}

.meeting-room-header h2 {
  margin: 0;
  font-size: 1.1rem;
  flex: 1;
}

.meeting-room-badge {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 4px;
  background: #f3e8ff;
  color: #7c3aed;
}

.jitsi-container {
  flex: 1;
  min-height: 0;
  border-radius: 0 0 8px 8px;
  overflow: hidden;
}

.jitsi-loading-overlay {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: #6b7280;
}

.jitsi-loading-overlay .spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.meeting-room-loading,
.meeting-room-error,
.meeting-room-ended {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  flex: 1;
  text-align: center;
  color: #6b7280;
}

.meeting-room-error .error {
  color: #dc2626;
}

.meeting-room-ended h2 {
  margin: 0;
}
```

### 9. Update `frontend/src/routes/AppRoutes.jsx`

```jsx
import AdminMeetingsPage from '../pages/meetings/AdminMeetingsPage';
import MeetingsListPage from '../pages/meetings/MeetingsListPage';
import MeetingRoomPage from '../pages/meetings/MeetingRoomPage';

// Inside <Routes> under the Layout route, add:
<Route path="/admin/meetings" element={<AdminMeetingsPage />} />
<Route path="/meetings" element={<MeetingsListPage />} />
<Route path="/meeting/:id" element={<MeetingRoomPage />} />
```

Full file after changes:

```jsx
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

export default function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/admin/dashboard" element={<AdminDashboard />} />
        <Route path="/admin/students" element={<StudentsPage />} />
        <Route path="/admin/batches" element={<BatchesPage />} />
        <Route path="/admin/meetings" element={<AdminMeetingsPage />} />
        <Route path="/meetings" element={<MeetingsListPage />} />
        <Route path="/meeting/:id" element={<MeetingRoomPage />} />
        <Route path="/mailbox" element={<MailboxPage />} />
        <Route path="/student/dashboard" element={<StudentDashboard />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
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

1. Start the backend: `cd backend && npm run dev`
2. Start the frontend: `cd frontend && npm run dev`
3. Open `http://localhost:5173`
4. Click **Admin** on the Mock Identity Bar
5. Navigate to `/admin/meetings`
6. Click **Schedule Meeting**, fill in details:
   - Title: "Math Lecture 1"
   - Select a batch from the dropdown
   - Set a start/end time
   - Submit
7. Verify the meeting appears in the table with "Batch" type and "SCHEDULED" status
8. Schedule another meeting as "Public" — verify batch selector disappears
9. Click **Join** on a meeting → should navigate to `/meeting/:id` and load the Jitsi iframe
10. Click **Student** on the Mock Identity Bar
11. Navigate to `/meetings` — verify the student sees their batch meeting(s) + public meetings
12. Click **Join Room** on a meeting → should navigate to the Jitsi room
13. Navigate to `/meetings` as anonymous (no mock role) — verify only public meetings appear
14. Verify that ended/cancelled meetings show "Unavailable" button and a message page

---

## Expected Output (File Checklist)

- [ ] `frontend/src/lib/loadJitsiScript.js` — Dynamic Jitsi Meet External API script loader
- [ ] `frontend/src/pages/meetings/AdminMeetingsPage.jsx` — Admin meeting list + create form
- [ ] `frontend/src/pages/meetings/AdminMeetingsPage.css` — Styling
- [ ] `frontend/src/pages/meetings/MeetingsListPage.jsx` — User-facing meeting list (cards)
- [ ] `frontend/src/pages/meetings/MeetingsListPage.css` — Styling
- [ ] `frontend/src/pages/meetings/MeetingRoomPage.jsx` — Jitsi iframe wrapper
- [ ] `frontend/src/pages/meetings/MeetingRoomPage.css` — Styling
- [ ] `frontend/src/routes/AppRoutes.jsx` — Added `/admin/meetings`, `/meetings`, `/meeting/:id` routes

---

## Acceptance Criteria

- Admin can create a batch meeting via the form at `/admin/meetings` — selecting a batch, setting a title and dates.
- Admin can create a public meeting (checkbox hides batch selector).
- Admin meeting list shows all meetings with type badge, status badge, batch name, dates, and creator name.
- Admin can click "Join" on any meeting (SCHEDULED or LIVE) to enter the Jitsi room at `/meeting/:id`.
- Student meeting list at `/meetings` shows batch meetings for their batch + public meetings (card layout).
- Student can click "Join Room" on a visible meeting to enter the Jitsi room.
- The Jitsi room page loads the `meet.jit.si` iframe with the correct `roomName` from the meeting record.
- The Jitsi room page uses `configOverrides` (startWithAudioMuted, startWithVideoMuted, disableDeepLinking, prejoinPageEnabled) and `interfaceConfigOverrides` (no watermark, visible toolbar).
- Ended/cancelled meetings show an "Unavailable" state on the card and a message page in the room.
- `npm run build` completes without errors.

---

## Risk / Impact

- **External Jitsi dependency**: The Jitsi Meet iframe loads from `meet.jit.si`. If the public Jitsi service is down, the room page will show a blank iframe. The script loader has a timeout and error handler, but there is no fallback service.
- **No single-meeting GET endpoint**: The room page fetches all meetings and filters client-side. This is acceptable for MVP data volumes. If the meeting count grows, a dedicated `GET /api/meetings/:id` endpoint should be added.
- **Jitsi API cleanup**: The `MeetingRoomPage` disposes the Jitsi API on unmount. This is critical to prevent memory leaks and lingering microphone/camera connections.
- **No pre-join preview**: The Jitsi configuration disables the prejoin page (`prejoinPageEnabled: false`) for simplicity. Users enter the room directly. This can be changed later.
- **No privacy consent yet**: The room page loads Jitsi directly. The privacy consent gatekeeper is added in WI-503.

---

## Post-Implementation Steps (MANDATORY)

Once the file checklist and acceptance criteria are satisfied:

### 1. Update `PROGRESS.md`
- Change the status of **WI-502** from `Not Started` to `Done`.
- Set the assignee to `Antigravity`.
- Set the target date to the current date.
- Increment the `Done` and `Completion %` columns in the Phase 5 progress table.

### 2. Update `CHANGELOG.md`
Add a new entry at the top:

```
## [YYYY-MM-DD] - WI-502: Meeting Scheduler & Jitsi Room Integration UI
* **Work Item ID**: WI-502
* **Summary**: Built three frontend meeting pages: Admin meeting scheduler (list + create form with batch/public toggle), user-facing meeting list (card layout with role-scoped visibility), and Jitsi Meet iframe wrapper page. Added dynamic Jitsi External API script loader with config overrides (muted start, no watermark, no deep linking). Ended/cancelled meetings show unavailable state.
* **Files Affected**:
  - [NEW] `frontend/src/lib/loadJitsiScript.js`
  - [NEW] `frontend/src/pages/meetings/AdminMeetingsPage.jsx`
  - [NEW] `frontend/src/pages/meetings/AdminMeetingsPage.css`
  - [NEW] `frontend/src/pages/meetings/MeetingsListPage.jsx`
  - [NEW] `frontend/src/pages/meetings/MeetingsListPage.css`
  - [NEW] `frontend/src/pages/meetings/MeetingRoomPage.jsx`
  - [NEW] `frontend/src/pages/meetings/MeetingRoomPage.css`
  - [MODIFIED] `frontend/src/routes/AppRoutes.jsx` (added /admin/meetings, /meetings, /meeting/:id)
* **Verification Done**:
  - [x] Admin can create batch and public meetings via the form
  - [x] Admin meeting list shows all meetings with correct badges and metadata
  - [x] Student meeting list shows only batch meetings (their batch) + public meetings
  - [x] Anonymous sees only public meetings
  - [x] Jitsi iframe loads with correct room name and config overrides
  - [x] Ended/cancelled meetings show unavailable state
  - [x] `npm run build` completes with no errors
* **Impact on Existing Functionality**: None. Existing admin pages (Students, Batches, Settings) and mailbox are unchanged.
```

### 3. Stop and Wait
Do **not** begin WI-503 in the same session. Wait for the developer to verify and trigger the next prompt.

---

## Notes for the AI Agent

- **Jitsi script loader**: The `loadJitsiScript.js` utility dynamically appends a `<script>` tag to load `https://meet.jit.si/external_api.js`. It caches the promise so subsequent calls don't reload the script. This is the recommended approach from the Jitsi Meet documentation.
- **Jitsi configuration overrides**: The `configOverrides` and `interfaceConfigOverrides` objects customize the Jitsi experience:
  - `startWithAudioMuted: true` — Prevents accidental microphone noise when joining.
  - `startWithVideoMuted: false` — Camera starts by default (can be toggled by the user).
  - `disableDeepLinking: true` — Prevents redirect to the Jitsi mobile app.
  - `prejoinPageEnabled: false` — Skips the pre-join preview screen.
  - `SHOW_JITSI_WATERMARK: false` — Hides the Jitsi watermark.
  - `TOOLBAR_ALWAYS_VISIBLE: true` — Keeps toolbar visible.
  - `DISABLE_JOIN_LEAVE_NOTIFICATIONS: true` — Reduces notification noise.
- **No single-meeting endpoint**: The `MeetingRoomPage` currently fetches all meetings via `GET /api/meetings` and finds the matching one in the array. This is a shortcut — if the list grows, a `GET /api/meetings/:id` endpoint should be added to the backend.
- **Jitsi cleanup**: The `MeetingRoomPage` useEffect returns a cleanup function that calls `jitsiApiRef.current.dispose()`. This is essential to release camera/microphone resources when navigating away.
- **User display name**: The Jitsi iframe uses the user's `full_name` if found in the students list, otherwise falls back to `User-<userId prefix>` or `Guest`.
- **Date/time inputs**: The create form uses `datetime-local` HTML inputs which produce browser-local datetime strings. The backend expects ISO 8601 with timezone offset. The form sends the browser-local value as-is (e.g., `"2026-06-10T09:00"`). The PostgreSQL `timestamptz` column will interpret this in the server's timezone. This is acceptable for the MVP — a more robust solution would convert to UTC on the client.
- **Admin page is role-gated**: If a non-Admin user navigates to `/admin/meetings`, they see "You do not have permission to access this page." The real security enforcement is on the backend (`requireRole('ADMIN')` on `POST /api/meetings`).
- **No privacy consent**: The `MeetingRoomPage` loads Jitsi immediately. The privacy consent gatekeeper (implemented in WI-503) will wrap the Jitsi container and block loading until the user accepts.
