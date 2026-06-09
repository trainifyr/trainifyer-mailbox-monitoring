# WI-402 — Mailbox Client UI

> **GitHub Issue**: #10
> **Phase**: 4 — Internal Mailbox System (Slice 3)
> **Priority**: High
> **Dependencies**: WI-103, WI-401
> **Project**: Trainifyer Mailbox Monitoring Platform

---

## Context

WI-103 set up the React + Vite frontend with routing, Layout, and Mock Identity Bar. WI-401 built the backend mailbox API (`GET /api/mail/inbox`, `GET /api/mail/sent`, `POST /api/mail/send`, `PATCH /api/mail/:id/read`) with batch-level permission enforcement.

This work item builds the **mailbox client UI** — an Outlook-style messaging interface accessible to both Admin and Student roles. You will create a Mailbox page at `/mailbox` with three panels:

- **Sidebar** — Navigation between Inbox, Sent, and Compose views.
- **Message list** — A paginated list of messages (inbox or sent) with sender/receiver name, subject, date, and read/unread indicator.
- **Message detail / Compose form** — Reading a message shows the full subject, body, sender, and timestamp. Compose shows a form with receiver, subject, and body fields.

> ⚠️ **Mock Context-First Rule**: The Axios client auto-injects `x-mock-role` and `x-mock-user-id` headers. The mailbox UI is available to both Admin and Student roles (as long as the batch settings permit it). The backend enforces permission checks; the frontend just shows error messages from the API.

---

## Reference Documents

Before starting, read these files in the project root:

- `WORKITEMS.md` — Acceptance criteria for WI-402
- `ASSUMPTIONS.md` — §2 Communications & Mailbox Assumptions (no attachments, no real-time, flat messages)
- `prompts/WI-401-prompt.md` — Backend mailbox API specification (endpoint shapes, pagination, response format)
- `prompts/WI-103-prompt.md` — Frontend baseline (routing, Axios client, Mock Identity Bar)
- `frontend/src/api/client.js` — Axios instance with auto-injected mock headers

---

## Scope of This Work Item

- Create **`frontend/src/pages/mailbox/MailboxPage.jsx`** — The main mailbox component with sidebar, message list, and detail/compose panes.
- Create **`frontend/src/pages/mailbox/MailboxPage.css`** — Styling for the three-panel layout, message list, compose form, and reading pane.
- Update **`frontend/src/routes/AppRoutes.jsx`** — Add the `/mailbox` route.

---

## Step-by-Step Instructions

### 1. Create the file structure

```
frontend/src/pages/mailbox/
├── MailboxPage.jsx    (NEW)
└── MailboxPage.css    (NEW)
```

### 2. Write `frontend/src/pages/mailbox/MailboxPage.jsx`

```jsx
import { useState, useEffect, useCallback } from 'react';
import { useMockIdentity } from '../../context/MockIdentityContext';
import apiClient from '../../api/client';
import {
  Inbox, Send, PenSquare, ChevronLeft, Mail, MailOpen,
  Paperclip, Eye, Clock, User, ArrowLeft
} from 'lucide-react';
import './MailboxPage.css';

const PAGE_SIZE = 20;

export default function MailboxPage() {
  const { isAuthenticated } = useMockIdentity();

  // View state: 'inbox' | 'sent' | 'compose' | 'detail'
  const [activeView, setActiveView] = useState('inbox');
  const [selectedMessage, setSelectedMessage] = useState(null);

  // Inbox state
  const [inboxMessages, setInboxMessages] = useState([]);
  const [inboxPagination, setInboxPagination] = useState(null);
  const [inboxPage, setInboxPage] = useState(1);
  const [inboxLoading, setInboxLoading] = useState(false);

  // Sent state
  const [sentMessages, setSentMessages] = useState([]);
  const [sentPagination, setSentPagination] = useState(null);
  const [sentPage, setSentPage] = useState(1);
  const [sentLoading, setSentLoading] = useState(false);

  // Compose state
  const [composeForm, setComposeForm] = useState({ receiverId: '', subject: '', body: '' });
  const [composeSending, setComposeSending] = useState(false);
  const [composeError, setComposeError] = useState(null);
  const [composeSuccess, setComposeSuccess] = useState(false);

  // Detail state
  const [detailLoading, setDetailLoading] = useState(false);

  // Error / notification
  const [error, setError] = useState(null);

  const fetchInbox = useCallback(async (page) => {
    try {
      setInboxLoading(true);
      setError(null);
      const res = await apiClient.get(`/mail/inbox?page=${page}&limit=${PAGE_SIZE}`);
      if (page === 1) {
        setInboxMessages(res.data.data);
      } else {
        setInboxMessages((prev) => [...prev, ...res.data.data]);
      }
      setInboxPagination(res.data.pagination);
    } catch (e) {
      const msg = e.response?.data?.message || e.message;
      setError(msg === 'Forbidden' ? e.response?.data?.message : msg);
      if (page === 1) setInboxMessages([]);
    } finally {
      setInboxLoading(false);
    }
  }, []);

  const fetchSent = useCallback(async (page) => {
    try {
      setSentLoading(true);
      setError(null);
      const res = await apiClient.get(`/mail/sent?page=${page}&limit=${PAGE_SIZE}`);
      if (page === 1) {
        setSentMessages(res.data.data);
      } else {
        setSentMessages((prev) => [...prev, ...res.data.data]);
      }
      setSentPagination(res.data.pagination);
    } catch (e) {
      const msg = e.response?.data?.message || e.message;
      setError(msg === 'Forbidden' ? e.response?.data?.message : msg);
      if (page === 1) setSentMessages([]);
    } finally {
      setSentLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    if (activeView === 'inbox') {
      setInboxPage(1);
      fetchInbox(1);
    }
  }, [activeView, isAuthenticated, fetchInbox]);

  useEffect(() => {
    if (activeView === 'sent') {
      setSentPage(1);
      fetchSent(1);
    }
  }, [activeView, fetchSent]);

  const handleViewInbox = () => {
    setActiveView('inbox');
    setSelectedMessage(null);
    setComposeSuccess(false);
  };

  const handleViewSent = () => {
    setActiveView('sent');
    setSelectedMessage(null);
    setComposeSuccess(false);
  };

  const handleViewCompose = () => {
    setActiveView('compose');
    setSelectedMessage(null);
    setComposeForm({ receiverId: '', subject: '', body: '' });
    setComposeError(null);
    setComposeSuccess(false);
  };

  const handleLoadMoreInbox = () => {
    const nextPage = inboxPage + 1;
    setInboxPage(nextPage);
    fetchInbox(nextPage);
  };

  const handleLoadMoreSent = () => {
    const nextPage = sentPage + 1;
    setSentPage(nextPage);
    fetchSent(nextPage);
  };

  const handleOpenMessage = async (msg) => {
    setSelectedMessage(msg);
    setActiveView('detail');

    // If unread, mark as read
    if (!msg.is_read) {
      try {
        await apiClient.patch(`/mail/${msg.id}/read`);
        // Update the read status locally
        const markRead = (list) =>
          list.map((m) => m.id === msg.id ? { ...m, is_read: true, read_at: new Date().toISOString() } : m);
        setInboxMessages((prev) => markRead(prev));
        setSelectedMessage((prev) => prev ? { ...prev, is_read: true, read_at: new Date().toISOString() } : prev);
      } catch (e) {
        // Non-critical; ignore
      }
    }
  };

  const handleComposeChange = (e) => {
    setComposeForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!composeForm.receiverId || !composeForm.subject || !composeForm.body) {
      setComposeError('All fields are required.');
      return;
    }
    try {
      setComposeSending(true);
      setComposeError(null);
      await apiClient.post('/mail/send', {
        receiverId: composeForm.receiverId,
        subject: composeForm.subject,
        body: composeForm.body
      });
      setComposeSuccess(true);
      setComposeForm({ receiverId: '', subject: '', body: '' });
    } catch (e) {
      const msg = e.response?.data?.message || e.message;
      setComposeError(msg);
    } finally {
      setComposeSending(false);
    }
  };

  // --- Render helpers ---

  const formatDate = (iso) => {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now - d;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString();
  };

  const renderSidebar = () => (
    <div className="mailbox-sidebar">
      <button
        className={`sidebar-btn ${activeView === 'inbox' ? 'active' : ''}`}
        onClick={handleViewInbox}
      >
        <Inbox size={16} /> Inbox
        {inboxPagination && inboxPagination.total > 0 && (
          <span className="sidebar-count">{inboxPagination.total}</span>
        )}
      </button>
      <button
        className={`sidebar-btn ${activeView === 'sent' ? 'active' : ''}`}
        onClick={handleViewSent}
      >
        <Send size={16} /> Sent
      </button>
      <button
        className={`sidebar-btn ${activeView === 'compose' ? 'active' : ''}`}
        onClick={handleViewCompose}
      >
        <PenSquare size={16} /> Compose
      </button>
    </div>
  );

  const renderMessageList = (messages, loading, pagination, onLoadMore) => (
    <div className="message-list">
      {loading && messages.length === 0 ? (
        <p className="status-message">Loading messages...</p>
      ) : messages.length === 0 ? (
        <p className="status-message">No messages.</p>
      ) : (
        <>
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`message-row ${!msg.is_read ? 'unread' : ''} ${selectedMessage?.id === msg.id ? 'selected' : ''}`}
              onClick={() => handleOpenMessage(msg)}
            >
              <div className="message-row-icon">
                {msg.is_read ? <MailOpen size={16} /> : <Mail size={16} />}
              </div>
              <div className="message-row-content">
                <span className="message-row-name">
                  {activeView === 'inbox' ? msg.sender_name : msg.receiver_name}
                </span>
                <span className="message-row-subject">{msg.subject}</span>
              </div>
              <span className="message-row-date">{formatDate(msg.created_at)}</span>
            </div>
          ))}
          {pagination && pagination.page < pagination.totalPages && (
            <button className="load-more-btn" onClick={onLoadMore} disabled={loading}>
              {loading ? 'Loading...' : 'Load more'}
            </button>
          )}
        </>
      )}
    </div>
  );

  const renderDetail = () => {
    if (!selectedMessage) return null;

    const msg = selectedMessage;
    const isIncoming = activeView === 'inbox' || (activeView !== 'sent' && true);

    return (
      <div className="message-detail">
        <button className="back-btn" onClick={() => setActiveView('inbox')}>
          <ArrowLeft size={16} /> Back to Inbox
        </button>
        <div className="detail-header">
          <h3>{msg.subject}</h3>
          <div className="detail-meta">
            <div className="detail-meta-row">
              <User size={14} />
              <span className="meta-label">{isIncoming ? 'From:' : 'To:'}</span>
              <span className="meta-value">{isIncoming ? msg.sender_name : msg.receiver_name}</span>
              <span className="meta-email">
                ({isIncoming ? msg.sender_email : msg.receiver_email})
              </span>
            </div>
            <div className="detail-meta-row">
              <Clock size={14} />
              <span className="meta-label">Date:</span>
              <span className="meta-value">{new Date(msg.created_at).toLocaleString()}</span>
            </div>
            <div className="detail-meta-row">
              {msg.is_read ? <Eye size={14} /> : <Mail size={14} />}
              <span className="meta-label">Status:</span>
              <span className="meta-value">
                {msg.is_read
                  ? `Read ${msg.read_at ? `(${new Date(msg.read_at).toLocaleString()})` : ''}`
                  : 'Unread'}
              </span>
            </div>
          </div>
        </div>
        <div className="detail-body">
          {msg.body.split('\n').map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </div>
      </div>
    );
  };

  const renderCompose = () => (
    <div className="compose-form">
      <h3><PenSquare size={16} /> New Message</h3>
      {composeSuccess ? (
        <div className="compose-success">
          <p>Message sent successfully!</p>
          <button className="btn btn-primary" onClick={handleViewInbox}>
            Go to Inbox
          </button>
          <button className="btn btn-secondary" style={{ marginLeft: 8 }} onClick={() => {
            setComposeSuccess(false);
            setComposeForm({ receiverId: '', subject: '', body: '' });
          }}>
            Send Another
          </button>
        </div>
      ) : (
        <form onSubmit={handleSend}>
          <div className="compose-field">
            <label>Receiver UUID</label>
            <input
              name="receiverId"
              value={composeForm.receiverId}
              onChange={handleComposeChange}
              placeholder="Paste the receiver's user UUID"
              required
            />
          </div>
          <div className="compose-field">
            <label>Subject</label>
            <input
              name="subject"
              value={composeForm.subject}
              onChange={handleComposeChange}
              placeholder="Message subject"
              required
              maxLength={200}
            />
          </div>
          <div className="compose-field">
            <label>Body</label>
            <textarea
              name="body"
              value={composeForm.body}
              onChange={handleComposeChange}
              placeholder="Write your message here..."
              required
              rows={10}
            />
          </div>
          {composeError && <p className="form-error">{composeError}</p>}
          <div className="compose-actions">
            <button type="submit" className="btn btn-primary" disabled={composeSending}>
              {composeSending ? 'Sending...' : 'Send Message'}
            </button>
          </div>
        </form>
      )}
    </div>
  );

  const renderMainContent = () => {
    if (!isAuthenticated) {
      return (
        <div className="mailbox-empty">
          <p>Select a role using the Mock Identity Bar at the bottom to access the mailbox.</p>
        </div>
      );
    }

    if (error && error !== 'Forbidden') {
      return (
        <div className="mailbox-empty">
          <p className="error">{error}</p>
        </div>
      );
    }

    switch (activeView) {
      case 'inbox':
        return renderMessageList(inboxMessages, inboxLoading, inboxPagination, handleLoadMoreInbox);
      case 'sent':
        return renderMessageList(sentMessages, sentLoading, sentPagination, handleLoadMoreSent);
      case 'detail':
        return renderDetail();
      case 'compose':
        return renderCompose();
      default:
        return null;
    }
  };

  return (
    <div className="mailbox-page">
      {renderSidebar()}
      <div className="mailbox-main">
        {renderMainContent()}
      </div>
    </div>
  );
}
```

### 3. Write `frontend/src/pages/mailbox/MailboxPage.css`

```css
.mailbox-page {
  display: flex;
  gap: 0;
  text-align: left;
  min-height: 60vh;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  overflow: hidden;
  background: #ffffff;
}

/* --- Sidebar --- */

.mailbox-sidebar {
  width: 180px;
  flex-shrink: 0;
  background: #f9fafb;
  border-right: 1px solid #e5e7eb;
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.sidebar-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border: none;
  background: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  color: #374151;
  width: 100%;
  text-align: left;
  transition: background 0.15s;
}

.sidebar-btn:hover {
  background: #e5e7eb;
}

.sidebar-btn.active {
  background: #2563eb;
  color: white;
}

.sidebar-count {
  margin-left: auto;
  background: #d1d5db;
  color: #374151;
  font-size: 11px;
  font-weight: 600;
  padding: 1px 7px;
  border-radius: 10px;
}

.sidebar-btn.active .sidebar-count {
  background: rgba(255,255,255,0.25);
  color: white;
}

/* --- Main content area --- */

.mailbox-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.message-list {
  display: flex;
  flex-direction: column;
}

/* --- Message row --- */

.message-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid #f3f4f6;
  cursor: pointer;
  transition: background 0.1s;
}

.message-row:hover {
  background: #f9fafb;
}

.message-row.selected {
  background: #eff6ff;
}

.message-row.unread {
  background: #f0f7ff;
}

.message-row.unread:hover {
  background: #e5f0ff;
}

.message-row-icon {
  flex-shrink: 0;
  color: #9ca3af;
  display: flex;
  align-items: center;
}

.message-row.unread .message-row-icon {
  color: #2563eb;
}

.message-row-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.message-row-name {
  font-size: 13px;
  font-weight: 600;
  color: #111827;
}

.message-row.unread .message-row-name {
  font-weight: 700;
}

.message-row-subject {
  font-size: 13px;
  color: #6b7280;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.message-row-date {
  font-size: 11px;
  color: #9ca3af;
  flex-shrink: 0;
  white-space: nowrap;
}

/* --- Load more --- */

.load-more-btn {
  padding: 12px;
  border: none;
  background: none;
  color: #2563eb;
  font-size: 13px;
  cursor: pointer;
  text-align: center;
}

.load-more-btn:hover {
  background: #f9fafb;
}

.load-more-btn:disabled {
  color: #9ca3af;
  cursor: not-allowed;
}

/* --- Message detail --- */

.message-detail {
  padding: 1.5rem;
  overflow-y: auto;
}

.back-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  border: none;
  background: none;
  color: #2563eb;
  font-size: 13px;
  cursor: pointer;
  border-radius: 4px;
  margin-bottom: 1rem;
}

.back-btn:hover {
  background: #eff6ff;
}

.detail-header {
  margin-bottom: 1.5rem;
}

.detail-header h3 {
  margin: 0 0 1rem;
  font-size: 1.25rem;
  color: #111827;
}

.detail-meta {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  color: #6b7280;
}

.detail-meta-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.meta-label {
  font-weight: 500;
  color: #9ca3af;
  min-width: 40px;
}

.meta-value {
  color: #374151;
}

.meta-email {
  color: #9ca3af;
  font-size: 12px;
}

.detail-body {
  border-top: 1px solid #e5e7eb;
  padding-top: 1.5rem;
  font-size: 14px;
  line-height: 1.7;
  color: #374151;
}

.detail-body p {
  margin: 0 0 0.5rem;
}

/* --- Compose form --- */

.compose-form {
  padding: 1.5rem;
}

.compose-form h3 {
  margin: 0 0 1.25rem;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 1rem;
  color: #111827;
}

.compose-field {
  margin-bottom: 1rem;
}

.compose-field label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: #374151;
  margin-bottom: 4px;
}

.compose-field input,
.compose-field textarea {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 14px;
  box-sizing: border-box;
  font-family: inherit;
}

.compose-field input:focus,
.compose-field textarea:focus {
  outline: none;
  border-color: #2563eb;
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.15);
}

.compose-field textarea {
  resize: vertical;
  min-height: 120px;
}

.compose-actions {
  display: flex;
  gap: 8px;
}

.compose-success {
  text-align: center;
  padding: 3rem 1rem;
}

.compose-success p {
  font-size: 16px;
  color: #16a34a;
  font-weight: 500;
  margin-bottom: 1.5rem;
}

/* --- Shared / reused --- */

.mailbox-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  padding: 2rem;
  color: #9ca3af;
  font-size: 14px;
}

.mailbox-empty .error {
  color: #dc2626;
}

.status-message {
  text-align: center;
  color: #9ca3af;
  padding: 2rem;
  font-size: 14px;
}

.form-error {
  color: #dc2626;
  font-size: 13px;
  margin: 0.5rem 0;
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
```

### 4. Update `frontend/src/routes/AppRoutes.jsx`

Add the MailboxPage import and route:

```jsx
import MailboxPage from '../pages/mailbox/MailboxPage';

// Inside <Routes> under the Layout route, add:
<Route path="/mailbox" element={<MailboxPage />} />
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
import StudentDashboard from '../pages/student/StudentDashboard';

export default function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/admin/dashboard" element={<AdminDashboard />} />
        <Route path="/admin/students" element={<StudentsPage />} />
        <Route path="/admin/batches" element={<BatchesPage />} />
        <Route path="/mailbox" element={<MailboxPage />} />
        <Route path="/student/dashboard" element={<StudentDashboard />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
```

### 5. Add a navigation link on the HomePage (optional but recommended)

Update `frontend/src/pages/HomePage.jsx` to add a link to the mailbox:

```jsx
<nav style={{ margin: '1rem 0', display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center' }}>
  <Link to="/admin/dashboard">Admin Dashboard</Link>
  <Link to="/student/dashboard">Student Dashboard</Link>
  <Link to="/mailbox">Mailbox</Link>
</nav>
```

### 6. Verify the build

```bash
cd frontend
npm run build
```

Expected: Clean Vite build with no errors or warnings.

### 7. Manual verification

1. Start the backend: `cd backend && npm run dev`
2. Start the frontend: `cd frontend && npm run dev`
3. Open `http://localhost:5173`
4. Click the **Student** button on the Mock Identity Bar (e.g., student UUID `00000000-0000-0000-0000-000000000002`)
5. Navigate to `http://localhost:5173/mailbox`
6. Click **Compose** in the sidebar
7. Fill in:
   - Receiver UUID: `00000000-0000-0000-0000-000000000001` (Admin's UUID)
   - Subject: "Question about assignment"
   - Body: "Hi Admin, I have a question about the homework."
8. Click **Send Message** → verify success message appears
9. Click **Go to Inbox** → verify the message appears in Sent view (if you switch to Sent) and not in Inbox (you sent it, so it's in your sent folder)
10. Click the **Admin** button on the Mock Identity Bar (UUID `00000000-0000-0000-0000-000000000001`)
11. Navigate to `/mailbox`
12. Click **Inbox** → verify the message from the student appears
13. Click the message row → verify the detail pane shows subject, body, sender name, date, and unread→read transition
14. Click **Sent** → verify Admin's sent messages appear
15. Click **Compose** as Admin, send a reply to the student's UUID
16. Switch back to **Student** role, check Inbox → verify the reply appears

---

## Expected Output (File Checklist)

- [ ] `frontend/src/pages/mailbox/MailboxPage.jsx` — Three-panel mailbox UI with inbox, sent, compose, and detail views
- [ ] `frontend/src/pages/mailbox/MailboxPage.css` — Styling for the mailbox layout, message list, detail, and compose form
- [ ] `frontend/src/routes/AppRoutes.jsx` — Added `/mailbox` route

---

## Acceptance Criteria

- Navigating to `/mailbox` shows a three-panel layout: sidebar (Inbox / Sent / Compose), message list, and detail/compose pane.
- Clicking **Inbox** in the sidebar fetches `GET /api/mail/inbox` and displays received messages with sender name, subject, date, and unread indicator.
- Clicking **Sent** fetches `GET /api/mail/sent` and displays sent messages with receiver name, subject, and date.
- Unread messages show a blue highlight and bold sender name.
- Clicking an unread message calls `PATCH /api/mail/:id/read` and updates the read status locally.
- Clicking a message opens the **detail view** showing subject, full body, sender/receiver name and email, date, and read status.
- The detail view has a "Back to Inbox" button.
- Clicking **Compose** shows a form with receiver UUID, subject, and body fields.
- Submitting the compose form calls `POST /api/mail/send` and shows a success message on completion.
- If the API returns a 403 error (mailbox disabled, STS disabled), the error message is displayed in the compose form or as a page error.
- Messages that are too long to migrate to older formats scroll naturally (the detail body wraps text).
- The "Load more" button at the bottom of the message list fetches the next page and appends results.
- The page does not crash when no mock role is selected (shows "Select a role" message).
- `npm run build` completes without errors.

---

## Risk / Impact

- **UUID-based receiver selection**: The compose form requires the user to paste a receiver's UUID. There is no search or autocomplete. This is acceptable for the MVP — the admin knows their own UUID and the student UUIDs. A future enhancement could add a user search endpoint and a typeahead component.
- **No real-time updates**: Per `ASSUMPTIONS.md` §2, there are no WebSockets. Users must navigate between Inbox/Sent or refresh to see new messages. This is documented as an MVP constraint.
- **No message deletion or threading**: Per `ASSUMPTIONS.md` §2, messages are flat, standalone documents. There is no delete, archive, forward, or reply action in this work item. Reply could be added as a future enhancement by pre-filling the compose form with the original sender's UUID and a "Re: " subject.
- **Pagination via "Load more"**: Rather than traditional page numbers, the UI uses a "Load more" button that appends the next page to the current list. This keeps the UX simple and matches how most email clients handle large lists (infinite scroll pattern).

---

## Post-Implementation Steps (MANDATORY)

Once the file checklist and acceptance criteria are satisfied:

### 1. Update `PROGRESS.md`
- Change the status of **WI-402** from `Not Started` to `Done`.
- Set the assignee to `Antigravity`.
- Set the target date to the current date.
- Increment the `Done` and `Completion %` columns in the Phase 4 progress table.

### 2. Update `CHANGELOG.md`
Add a new entry at the top:

```
## [YYYY-MM-DD] - WI-402: Mailbox Client UI
* **Work Item ID**: WI-402
* **Summary**: Built a three-panel Outlook-style mailbox UI at /mailbox with Inbox, Sent, and Compose views. Inbox and Sent display paginated message lists with sender/receiver name, subject, date, and read/unread indicators. Clicking a message opens a detail pane with full body and metadata. Compose form sends messages via POST /api/mail/send. Unread messages are auto-marked as read on open. "Load more" button appends paginated results.
* **Files Affected**:
  - [NEW] `frontend/src/pages/mailbox/MailboxPage.jsx`
  - [NEW] `frontend/src/pages/mailbox/MailboxPage.css`
  - [MODIFIED] `frontend/src/routes/AppRoutes.jsx` (added /mailbox route)
* **Verification Done**:
  - [x] Inbox displays received messages with sender info
  - [x] Sent displays sent messages with receiver info
  - [x] Unread messages visually distinct (blue highlight, bold)
  - [x] Clicking unread message marks it read via PATCH API
  - [x] Detail view shows subject, body, date, sender, read status
  - [x] Compose form sends message successfully
  - [x] Error messages from API (403, validation) displayed to user
  - [x] "Load more" fetches next page of messages
  - [x] Works for both Admin and Student roles
  - [x] `npm run build` completes with no errors
* **Impact on Existing Functionality**: None. Existing admin pages (Students, Batches) and student dashboard are unchanged.
```

### 3. Stop and Wait
Do **not** begin WI-501 in the same session. Wait for the developer to verify and trigger the next prompt.

---

## Notes for the AI Agent

- **Three-panel layout**: The mailbox uses a flex layout with a fixed-width (180px) sidebar on the left and a flexible main content area on the right. The message list and detail/compose views share the main area; only one is shown at a time based on `activeView` state.
- **State management**: All state is local to `MailboxPage.jsx`. There is no Redux, Zustand, or context for mailbox data. The inbox and sent lists are fetched independently and cached in local state. This is sufficient for the MVP.
- **Message read status**: The `PATCH /api/mail/:id/read` endpoint is called optimistically when a message is opened. The local state is updated immediately to reflect the read status so the UI does not need to refetch the entire list. If the API call fails, the error is silently ignored (non-critical — the read will sync on next fetch).
- **"Load more" pagination**: Each view tracks its current page. Clicking "Load more" increments the page and fetches the next batch, appending results to the existing array. The API returns a `pagination` object with `page`, `limit`, `total`, and `totalPages`. The "Load more" button is hidden when `page >= totalPages`.
- **Date formatting**: The `formatDate` helper shows relative dates for recent messages (time for today, "Yesterday", "Nd ago" for this week) and absolute dates for older messages. This matches common email client behavior.
- **No attachments**: Per `ASSUMPTIONS.md` §2, there is no file upload or attachment UI. The compose form has subject and body fields only.
- **No rich text**: The message body is plain text. The compose form uses a `<textarea>`, not a rich text editor. The detail view renders the body as paragraphs split by newlines.
- **Use `lucide-react` icons**: The project already has this dependency. Use `Inbox`, `Send`, `PenSquare`, `Mail`, `MailOpen`, `Eye`, `Clock`, `User`, `ArrowLeft`, `ChevronLeft` as appropriate.
- **Do not modify backend files**: This is a frontend-only work item. The backend mailbox API is already implemented in WI-401.
- **Do not modify existing page components**: Leave `AdminDashboard.jsx`, `StudentDashboard.jsx`, `StudentsPage.jsx`, `BatchesPage.jsx`, and their CSS files unchanged. Only add the new mailbox files and update `AppRoutes.jsx`.
