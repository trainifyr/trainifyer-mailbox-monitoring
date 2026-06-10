# WI-602 — Frontend Join/Leave Triggers & Heartbeats

> **GitHub Issue**: #15
> **Phase**: 6 — Attendance Logging Engine (Slice 5)
> **Priority**: High
> **Dependencies**: WI-502, WI-601
> **Project**: Trainifyer Mailbox Monitoring Platform

---

## Context

WI-601 built the backend session lifecycle API (`POST /api/meetings/:id/join-log`, `/leave-log`) but with no frontend to call it. The `MeetingRoomPage.jsx` from WI-502 currently loads Jitsi after consent but never records when the user joins or leaves.

This work item wires the frontend to the attendance logging API. When the user joins a meeting, a join-log call is fired. While they are in the meeting, a heartbeat ping keeps the session alive every 60 seconds. When they leave (via Jitsi disconnect, browser tab close, or navigation away), a leave-log call records the departure.

A small backend addition is also included: a heartbeat endpoint that updates `last_heartbeat` on the active attendance log, so the system can detect stale sessions.

> ⚠️ **Compliance Requirement**: Per `ASSUMPTIONS.md` §3, monitoring occurs only while the user is in the active meeting room portal page. The join-log fires after Jitsi initializes; the leave-log fires on any exit. No background tracking outside the meeting room page.

---

## Reference Documents

Before starting, read these files in the project root:

- `WORKITEMS.md` — Acceptance criteria for WI-602
- `GOALS.md` — Sub-Goal 6 (Automated Attendance & Duration Calculation)
- `prompts/WI-601-prompt.md` — The backend attendance API (join-log, leave-log)
- `backend/src/routes/attendanceLogs.js` — The route file to extend with heartbeat
- `frontend/src/pages/meetings/MeetingRoomPage.jsx` — The page to modify
- `frontend/src/pages/meetings/MeetingRoomPage.css` — Add heartbeat indicator styles
- `frontend/src/lib/loadJitsiScript.js` — Jitsi script loader

---

## Scope of This Work Item

### Backend (minor)
- Add **`POST /api/meetings/:id/heartbeat`** to `attendanceLogs.js` — Updates `last_heartbeat` to `now()` on the active attendance log for this user+meeting.

### Frontend
- Modify `MeetingRoomPage.jsx` to:
  - Call `POST /api/meetings/:id/join-log` when Jitsi initializes (after consent + iframe load).
  - Start a **60-second heartbeat interval** that calls `POST /api/meetings/:id/heartbeat`.
  - Call `POST /api/meetings/:id/leave-log` on every exit path:
    - Jitsi's `readyToClose` event (user clicks "Leave" in Jitsi UI).
    - React component cleanup (user navigates away, back button).
    - Browser `beforeunload` event (tab/window close, refresh).
  - Guard leave-log with a `sessionEndedRef` to fire exactly once.
  - Show a subtle live indicator when heartbeat is active.
- Modify `MeetingRoomPage.css` to style the heartbeat indicator.

---

## Step-by-Step Instructions

### 1. Add heartbeat endpoint to `backend/src/routes/attendanceLogs.js`

Insert after the `leave-log` POST handler (before `module.exports`):

```js
// --- POST /api/meetings/:id/heartbeat ---
// Update the last_heartbeat timestamp on the active attendance log.
// This allows the system to detect stale/disconnected sessions.
// Returns the updated attendance log row.
// 404 if no active session found.

router.post('/heartbeat', async (req, res, next) => {
  try {
    const { id } = req.params;
    const identity = requireIdentity(req, res);
    if (!identity) return;
    const { userId, externalName } = identity;

    let result;
    if (userId) {
      result = await pool.query(
        `UPDATE public.attendance_logs
         SET last_heartbeat = now()
         WHERE meeting_id = $1 AND user_id = $2 AND left_at IS NULL
         RETURNING id, meeting_id, user_id, external_name, joined_at, left_at, last_heartbeat,
                   total_minutes, attendance_percentage, status`,
        [id, userId]
      );
    } else {
      result = await pool.query(
        `UPDATE public.attendance_logs
         SET last_heartbeat = now()
         WHERE meeting_id = $1 AND external_name = $2 AND left_at IS NULL
         RETURNING id, meeting_id, user_id, external_name, joined_at, left_at, last_heartbeat,
                   total_minutes, attendance_percentage, status`,
        [id, externalName]
      );
    }

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'No active session found for this user in this meeting'
      });
    }

    res.json({ data: result.rows[0] });
  } catch (err) {
    next(err);
  }
});
```

### 2. Update `backend/README.md`

Append to the Attendance Logs section:

```
- `POST /api/meetings/:id/heartbeat` — Update the last_heartbeat timestamp on the active attendance log
```

### 3. Modify `frontend/src/pages/meetings/MeetingRoomPage.jsx`

Replace the entire component with the attendance-logging-aware version:

```jsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMockIdentity } from '../../context/MockIdentityContext';
import apiClient from '../../api/client';
import loadJitsiScript from '../../lib/loadJitsiScript';
import PrivacyConsentOverlay from '../../components/PrivacyConsentOverlay';
import { ArrowLeft, Loader, Activity } from 'lucide-react';
import './MeetingRoomPage.css';

const HEARTBEAT_INTERVAL_MS = 60000; // 60 seconds

export default function MeetingRoomPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated, userId } = useMockIdentity();
  const jitsiContainerRef = useRef(null);
  const jitsiApiRef = useRef(null);
  const heartbeatIntervalRef = useRef(null);
  const sessionEndedRef = useRef(false); // Guard: fire leave-log exactly once
  const attendanceLogIdRef = useRef(null); // Store the attendance log row ID

  const [meeting, setMeeting] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Consent state
  const [consentState, setConsentState] = useState('checking');
  const [consentSubmitting, setConsentSubmitting] = useState(false);
  const [jitsiLoading, setJitsiLoading] = useState(true);

  // Heartbeat indicator
  const [heartbeatActive, setHeartbeatActive] = useState(false);

  // --- Shared leave-log sender ---
  const sendLeaveLog = useCallback(async () => {
    // Guard: fire only once per session
    if (sessionEndedRef.current) return;
    sessionEndedRef.current = true;

    // Stop heartbeat
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
    setHeartbeatActive(false);

    // Only send leave-log if we have a known attendance log
    if (!attendanceLogIdRef.current) return;

    try {
      await apiClient.post(`/meetings/${id}/leave-log`);
    } catch (e) {
      console.error('Failed to record leave-log:', e);
    }
  }, [id]);

  // --- Start heartbeat ---
  const startHeartbeat = useCallback(() => {
    if (heartbeatIntervalRef.current) return;

    const ping = async () => {
      try {
        await apiClient.post(`/meetings/${id}/heartbeat`);
        setHeartbeatActive(true);
      } catch (e) {
        // If 404 (session already closed), stop heartbeat
        if (e.response?.status === 404) {
          clearInterval(heartbeatIntervalRef.current);
          heartbeatIntervalRef.current = null;
          setHeartbeatActive(false);
        }
      }
    };

    // Ping immediately, then every 60s
    ping();
    heartbeatIntervalRef.current = setInterval(ping, HEARTBEAT_INTERVAL_MS);
  }, [id]);

  // --- Stop heartbeat ---
  const stopHeartbeat = useCallback(() => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
    setHeartbeatActive(false);
  }, []);

  // --- Record join-log ---
  const sendJoinLog = useCallback(async () => {
    try {
      const res = await apiClient.post(`/meetings/${id}/join-log`);
      attendanceLogIdRef.current = res.data.data.id;
      startHeartbeat();
    } catch (e) {
      console.error('Failed to record join-log:', e);
    }
  }, [id, startHeartbeat]);

  // Fetch meeting data
  useEffect(() => {
    let cancelled = false;

    async function fetchMeeting() {
      try {
        setLoading(true);
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

    if (isAuthenticated) {
      fetchMeeting();
    }
    return () => { cancelled = true; };
  }, [id, isAuthenticated]);

  // Check existing consent status
  useEffect(() => {
    if (!meeting || !isAuthenticated) return;
    if (meeting.status === 'ENDED' || meeting.status === 'CANCELLED') return;

    let cancelled = false;

    async function checkConsent() {
      try {
        const res = await apiClient.get(`/meetings/${id}/consent`);
        if (!cancelled && res.data.data.consented) {
          setConsentState('accepted');
        } else if (!cancelled) {
          setConsentState('needed');
        }
      } catch (e) {
        if (!cancelled) {
          console.error('Failed to check consent:', e);
          setConsentState('needed');
        }
      }
    }

    checkConsent();
    return () => { cancelled = true; };
  }, [meeting, id, isAuthenticated]);

  // Initialize Jitsi once consent is accepted
  useEffect(() => {
    if (consentState !== 'accepted' || !meeting || !jitsiContainerRef.current) return;

    let cancelled = false;

    async function initJitsi() {
      try {
        const JitsiAPI = await loadJitsiScript();
        if (cancelled) return;

        let userDisplayName = `User-${userId?.substring(0, 8) || 'Guest'}`;
        try {
          const res = await apiClient.get('/users/students');
          const user = res.data.data.find((s) => s.id === userId);
          if (user) userDisplayName = user.full_name;
        } catch (e) {}

        const domain = 'meet.jit.si';
        const options = {
          roomName: meeting.jitsi_room_name,
          width: '100%',
          height: '100%',
          parentNode: jitsiContainerRef.current,
          userInfo: { displayName: userDisplayName },
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

        const jitsiApi = new JitsiAPI(domain, options);
        jitsiApiRef.current = jitsiApi;
        setJitsiLoading(false);

        // Record join-log once Jitsi has loaded
        await sendJoinLog();

        // Listen for Jitsi "readyToClose" (user clicked Leave in Jitsi UI)
        jitsiApi.addListener('readyToClose', () => {
          sendLeaveLog();
        });
      } catch (e) {
        if (!cancelled) {
          console.error('Jitsi init failed:', e);
          setJitsiLoading(false);
        }
      }
    }

    initJitsi();

    return () => {
      cancelled = true;
      // Fire leave-log on component unmount (navigation, back button)
      sendLeaveLog();
      if (jitsiApiRef.current) {
        jitsiApiRef.current.dispose();
        jitsiApiRef.current = null;
      }
    };
  }, [consentState, meeting, userId, sendJoinLog, sendLeaveLog]);

  // --- Browser beforeunload handler ---
  useEffect(() => {
    const handleBeforeUnload = () => {
      sendLeaveLog();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [sendLeaveLog]);

  // Handlers
  const handleAccept = useCallback(async () => {
    try {
      setConsentSubmitting(true);
      await apiClient.post(`/meetings/${id}/consent`);
      setConsentState('accepted');
    } catch (e) {
      console.error('Failed to record consent:', e);
      alert('Failed to record consent. Please try again.');
    } finally {
      setConsentSubmitting(false);
    }
  }, [id]);

  const handleDecline = useCallback(() => {
    setConsentState('declined');
  }, []);

  // --- Render logic ---

  if (!isAuthenticated) {
    return (
      <div className="meeting-room-page">
        <div className="meeting-room-error">
          <p>Please select a role in the Mock Identity Bar to join this meeting.</p>
          <button className="btn btn-secondary" onClick={() => navigate('/')}>
            Go Home
          </button>
        </div>
      </div>
    );
  }

  if (loading || (consentState === 'checking' && !error)) {
    return (
      <div className="meeting-room-page">
        <div className="meeting-room-loading">
          <Loader size={32} className="spin" />
          <p>Preparing session...</p>
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
          <button className="btn btn-secondary" onClick={() => navigate(-1)}>
            <ArrowLeft size={16} /> Go Back
          </button>
        </div>
      </div>
    );
  }

  if (consentState === 'declined') {
    return (
      <div className="meeting-room-page">
        <div className="meeting-room-ended">
          <h2>Access Denied</h2>
          <p className="status-message">
            You must agree to the privacy terms to join the session.
            Monitoring is mandatory for this training platform.
          </p>
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

        {/* Heartbeat indicator */}
        {heartbeatActive && (
          <span className="heartbeat-indicator" title="Attendance logging active">
            <Activity size={14} />
            <span className="heartbeat-dot" />
          </span>
        )}
      </div>

      <div className="jitsi-wrapper" style={{ flex: 1, position: 'relative', background: '#111', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
        {/* Consent overlay — blocks Jitsi until accepted */}
        {consentState === 'needed' && (
          <PrivacyConsentOverlay
            onAccept={handleAccept}
            onDecline={handleDecline}
            submitting={consentSubmitting}
          />
        )}

        {/* Jitsi loading indicator */}
        {consentState === 'accepted' && jitsiLoading && (
          <div className="jitsi-loading-overlay">
            <Loader size={24} className="spin" />
            <p>Connecting to secure stream...</p>
          </div>
        )}

        {/* Jitsi container */}
        <div
          className="jitsi-container"
          ref={jitsiContainerRef}
          style={{ width: '100%', height: '100%', display: consentState === 'accepted' ? 'block' : 'none' }}
        />
      </div>
    </div>
  );
}
```

### 4. Update `frontend/src/pages/meetings/MeetingRoomPage.css`

Append styles for the heartbeat indicator:

```css
/* Heartbeat indicator */
.heartbeat-indicator {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
  padding: 4px 10px;
  background: rgba(34, 197, 94, 0.1);
  border: 1px solid rgba(34, 197, 94, 0.3);
  border-radius: 20px;
  font-size: 12px;
  color: #16a34a;
}

.heartbeat-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #22c55e;
  animation: heartbeat-pulse 2s ease-in-out infinite;
}

@keyframes heartbeat-pulse {
  0%, 100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.5;
    transform: scale(0.8);
  }
}
```

### 5. Verify the build

```bash
cd frontend
npm run build
```

Expected: Clean Vite build with no errors or warnings.

### 6. Manual verification (backend + frontend)

```bash
# Start backend
cd backend
npm run dev

# In another terminal, start frontend
cd frontend
npm run dev
```

Test the attendance logging flow:

1. As Admin, create a meeting with scheduled start/end via `/admin/meetings`.
2. As Student, navigate to `/meetings` and click **Join Room** on that meeting.
3. Accept the privacy consent.
4. **Verify**: Jitsi iframe loads. A green heartbeat indicator with pulsing dot appears in the header bar.
5. **Verify**: Check the backend logs — a join-log POST was fired. Check `attendance_logs` table: a row exists with `joined_at` set, `left_at` NULL, `status` = `ACTIVE`, and `last_heartbeat` being updated.
6. Wait 60 seconds (or check network tab). **Verify**: heartbeat POST calls are visible in the network tab every 60 seconds.
7. Navigate back (click **Back** button). **Verify**: A leave-log POST is fired. `attendance_logs` row now has `left_at`, `total_minutes`, `attendance_percentage`, and `status` set.
8. Join again. **Verify**: A new attendance log row is created (since the previous one was closed).
9. Test browser tab close: Join a meeting, then close the tab. **Verify**: The `beforeunload` event fires the leave-log. On reopen, the previous session is ended and a new one can start.

### 7. Manual verification — Jitsi "Leave" button

1. Join a meeting as Student.
2. Click the **Leave** button inside the Jitsi UI (not the browser Back button).
3. **Verify**: The `readyToClose` event fires `sendLeaveLog()`, recording the departure.
4. **Verify**: The heartbeat stops. The indicator disappears.

### 8. Verify idempotency

1. Join a meeting. Verify join-log returns 201.
2. Quickly navigate back and re-join. Verify:
   - The first leave-log fires (from the cleanup).
   - A new join-log fires with a new attendance row (201).
3. Check `attendance_logs` table: two rows, first one closed, second one active.

---

## Expected Output (File Checklist)

### Backend
- [ ] `backend/src/routes/attendanceLogs.js` — Added POST /api/meetings/:id/heartbeat
- [ ] `backend/README.md` — Documents the heartbeat endpoint

### Frontend
- [ ] `frontend/src/pages/meetings/MeetingRoomPage.jsx` — Modified with join-log, heartbeat, leave-log triggers
- [ ] `frontend/src/pages/meetings/MeetingRoomPage.css` — Added heartbeat indicator styles

---

## Acceptance Criteria

- `POST /api/meetings/:id/join-log` is called from the frontend after Jitsi initializes (post-consent).
- A 60-second heartbeat interval pings `POST /api/meetings/:id/heartbeat` while the user is in the meeting room.
- The heartbeat indicator (green pulsing dot with `Activity` icon) appears in the header when heartbeat is active.
- `POST /api/meetings/:id/leave-log` is called when:
  - The Jitsi `readyToClose` event fires (user clicks Leave inside Jitsi).
  - The component unmounts (user navigates away, clicks Back).
  - The `beforeunload` event fires (browser tab close, refresh).
- `sendLeaveLog()` fires **exactly once** per session, guarded by `sessionEndedRef`.
- `sendJoinLog()` stores the returned `attendance_logs.id` in `attendanceLogIdRef` so leave-log is only sent if join-log succeeded.
- `npm run build` completes without errors.
- Backend `POST /api/meetings/:id/heartbeat` updates `last_heartbeat` on the active attendance log and returns the updated row; returns `404` if no active session.

---

## Session Lifecycle Flow

```
User clicks "Join Room"
  → MeetingRoomPage renders
  → Consent check (WI-503)
  → User accepts consent
  → Jitsi iframe loads
  → sendJoinLog()  → POST /api/meetings/:id/join-log  → 201, row created (ACTIVE)
  → startHeartbeat() → every 60s: POST /api/meetings/:id/heartbeat
     ↓
User leaves (any path):
  → sendLeaveLog()  → POST /api/meetings/:id/leave-log
  → Row updated: left_at, total_minutes, %, status
  → Heartbeat stopped
```

### Exit paths covered:

| Exit Trigger | Mechanism | fires leave-log? |
|---|---|---|
| User clicks **Leave** in Jitsi UI | `jitsiApi.addListener('readyToClose')` | Yes |
| User clicks **Back** button | Component unmount effect cleanup | Yes |
| User navigates to another route | Component unmount effect cleanup | Yes |
| User closes browser tab | `window.addEventListener('beforeunload')` | Yes |
| User refreshes the page | `beforeunload` fires, then remount | Yes |

---

## Risk / Impact

- **`beforeunload` reliability**: The `beforeunload` event is not 100% guaranteed on mobile browsers or under certain browser crashes. The heartbeat helps detect stale sessions server-side — if `last_heartbeat` is older than e.g. 5 minutes, an admin or future job can auto-close the session.
- **Network errors on leave-log**: If the leave-log POST fails (network drops during tab close), the attendance row remains ACTIVE with no `left_at`. This is handled by the future auto-close mechanism (heartbeat staleness). For the MVP, the session stays open and can be manually closed.
- **Double leave-log prevention**: The `sessionEndedRef` ensures leave-log fires exactly once even if multiple exit paths trigger simultaneously (e.g., user clicks Jitsi Leave while `beforeunload` is also firing).
- **Wasted heartbeat calls**: If the user leaves via Jitsi's Leave button, the heartbeat is stopped immediately. But if the user simply navigates away without Jitsi interaction, there may be one extra heartbeat call before the cleanup effect runs. This is acceptable — it's a lightweight POST that returns 404 (since the leave-log already closed the session), and the heartbeat interval is cleared.
- **No offline queue**: If the browser goes offline during a meeting, heartbeat calls will fail. The current implementation silently catches the error. When the browser comes back online, the next heartbeat will succeed (assuming the session is still active). If the offline period exceeds the heartbeat gap, the server may consider the session stale.
- **Anonymous users**: The join/leave/heartbeat endpoints all accept `?externalName=`. The MeetingRoomPage currently requires `isAuthenticated` (mock role) — anonymous Jitsi joining is deferred. If added later, the attendance logging will work the same way via `externalName`.

---

## Post-Implementation Steps (MANDATORY)

Once the file checklist and acceptance criteria are satisfied:

### 1. Update `PROGRESS.md`
- Change the status of **WI-602** from `Not Started` to `Done`.
- Set the assignee to `Antigravity`.
- Set the target date to the current date.
- Increment the `Done` and `Completion %` columns in the Phase 6 progress table.

### 2. Update `CHANGELOG.md`
Add a new entry at the top:

```
## [YYYY-MM-DD] - WI-602: Frontend Join/Leave Triggers & Heartbeats
* **Work Item ID**: WI-602
* **Summary**: Wired the MeetingRoomPage to the attendance logging API. On Jitsi load, fires POST /api/meetings/:id/join-log. A 60-second heartbeat interval pings POST /api/meetings/:id/heartbeat to update last_heartbeat. On exit (Jitsi readyToClose, component unmount, beforeunload), fires POST /api/meetings/:id/leave-log once per session. Added green pulsing heartbeat indicator in the header bar. Backend: added POST /api/meetings/:id/heartbeat endpoint to attendanceLogs.js.
* **Files Affected**:
  - [MODIFIED] `frontend/src/pages/meetings/MeetingRoomPage.jsx` (added attendace logging, heartbeat, exit triggers)
  - [MODIFIED] `frontend/src/pages/meetings/MeetingRoomPage.css` (added .heartbeat-indicator and .heartbeat-dot styles)
  - [MODIFIED] `backend/src/routes/attendanceLogs.js` (added POST /api/meetings/:id/heartbeat)
  - [MODIFIED] `backend/README.md` (added heartbeat endpoint documentation)
* **Verification Done**:
  - [x] Join-log fires after Jitsi initializes
  - [x] Heartbeat pings every 60 seconds via POST /api/meetings/:id/heartbeat
  - [x] Green heartbeat indicator appears in header when active
  - [x] Leave-log fires on Jitsi readyToClose event
  - [x] Leave-log fires on component unmount (navigation, back button)
  - [x] Leave-log fires on browser beforeunload (tab close, refresh)
  - [x] sessionEndedRef prevents duplicate leave-log calls
  - [x] attendanceLogIdRef prevents leave-log if join-log never succeeded
  - [x] npm run build completes with no errors
  - [x] Backend heartbeat endpoint returns 404 if no active session
* **Impact on Existing Functionality**: The MeetingRoomPage now records attendance automatically. Existing meeting list, admin scheduler, consent flow, and all other features are unchanged.
```

### 3. Stop and Wait
Do **not** begin WI-701 in the same session. Wait for the developer to verify and trigger the next prompt.

---

## Notes for the AI Agent

- **Three layers of exit tracking**: WI-602 covers three distinct exit paths because no single browser or Jitsi event covers all scenarios:
  1. **Jitsi API `readyToClose`** — Fires when the user clicks the Leave button inside the Jitsi iframe. This is the "clean" exit.
  2. **React cleanup effect** — Fires when the component unmounts (user navigates away, clicks Back, or the route changes). This catches React-router-driven exits.
  3. **`window.beforeunload`** — Fires when the browser tab is closed or the page is refreshed. This catches the "tab slam" scenario.
- **The `sessionEndedRef` guard**: All three exit paths call `sendLeaveLog()`, but `sessionEndedRef` ensures the POST fires only once. The ref is checked at the top of `sendLeaveLog()` and set to `true` immediately.
- **`attendanceLogIdRef`**: The join-log response includes the new attendance log row ID. This is stored in `attendanceLogIdRef`. The leave-log only fires if this ref is set, preventing a leave-log call if the join-log never succeeded.
- **Heartbeat on join-log success**: The heartbeat interval starts only after `sendJoinLog()` succeeds (HTTP 201). This prevents heartbeats for a session that was never recorded.
- **Jitsi `readyToClose` listener**: Added after Jitsi API object creation, inside `initJitsi()`. The listener calls `sendLeaveLog()` directly. Important: do NOT call `jitsiApi.dispose()` inside the listener — the React cleanup effect handles disposal.
- **Heartbeat silent failure**: If a heartbeat POST fails (network error, 404), the error is silently logged and the interval continues (unless 404, which means the session was closed server-side — then the interval is cleared).
- **Do not modify other files**: Only touch `MeetingRoomPage.jsx`, `MeetingRoomPage.css`, `attendanceLogs.js`, and `backend/README.md`. Leave other routes, components, and pages unchanged.
- **Import `Activity` from lucide-react**: The heartbeat indicator uses the `Activity` icon (a pulse/signal icon). Add it to the existing import from `lucide-react`.
