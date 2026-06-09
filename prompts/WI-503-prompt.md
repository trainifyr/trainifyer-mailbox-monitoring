# WI-503 — Pre-Meeting Privacy Consent Flow

> **GitHub Issue**: #13
> **Phase**: 5 — Meetings & Privacy Consent (Slice 4)
> **Priority**: High
> **Dependencies**: WI-104, WI-502
> **Project**: Trainifyer Mailbox Monitoring Platform

---

## Context

WI-502 built the meeting room page (`/meeting/:id`) that loads the Jitsi Meet iframe directly with config overrides. The `meeting_consents` table has existed in the database since WI-104, waiting for this work item.

This work item adds a **privacy consent gatekeeper** that blocks Jitsi loading until the user explicitly agrees to be monitored. When the user clicks "Accept", a consent record is written to `meeting_consents` with the meeting ID, user ID (or external name), and timestamp. Only after that record is saved does the Jitsi iframe load.

> ⚠️ **Compliance Requirement**: Per `GOALS.md` Sub-Goal 5 and `ASSUMPTIONS.md` §3, consent is mandatory before any monitoring begins. The Jitsi iframe must NOT load until consent is recorded.

---

## Reference Documents

Before starting, read these files in the project root:

- `WORKITEMS.md` — Acceptance criteria for WI-503
- `GOALS.md` — Sub-Goal 5 (Meeting System Integration, privacy consent)
- `ASSUMPTIONS.md` — §3 Meeting & Monitoring (consent is mandatory)
- `prompts/WI-104-prompt.md` — The `meeting_consents` table DDL
- `prompts/WI-502-prompt.md` — The MeetingRoomPage component structure
- `backend/db/schema.sql` — `meeting_consents` table (lines 132-143)

---

## Scope of This Work Item

### Backend
- Create **`POST /api/meetings/:id/consent`** — Record a consent record for a meeting.
- Create **`GET /api/meetings/:id/consent`** — Check whether the current user has already consented (idempotent guard).
- Register routes in `backend/index.js`.

### Frontend
- Create a **PrivacyConsentOverlay** component with the warning message and Accept/Decline buttons.
- Modify `MeetingRoomPage.jsx` to show the overlay before loading Jitsi.
- The overlay calls the consent API on Accept, then initializes Jitsi.
- Decline navigates back.

---

## Step-by-Step Instructions

### 1. Create the consent route file

```
backend/src/routes/
├── students.js       (existing)
├── batches.js        (existing)
├── batchSettings.js  (existing)
├── mail.js           (existing)
├── meetings.js       (existing — WI-501)
└── meetingConsent.js (NEW — WI-503)
```

### 2. Write `backend/src/routes/meetingConsent.js`

```js
const { Router } = require('express');
const { z } = require('zod');
const pool = require('../lib/pgPool');

const router = Router({ mergeParams: true });

// --- Zod schemas ---

const consentBodySchema = z.object({
  externalName: z.string().min(1).max(100).optional()
});

// --- GET /api/meetings/:id/consent ---
// Check whether the current user has already consented to this meeting.
// Returns { consented: true/false, consent: {...} | null }.

router.get('/', async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.mockUserId;

    // Verify the meeting exists
    const { rows: meetingRows } = await pool.query(
      `SELECT id, status FROM public.meetings WHERE id = $1`,
      [id]
    );
    if (meetingRows.length === 0) {
      return res.status(404).json({ error: 'Not Found', message: 'Meeting not found' });
    }

    let consentRecord = null;

    if (userId) {
      const { rows } = await pool.query(
        `SELECT id, meeting_id, user_id, external_name, accepted_at, user_agent
         FROM public.meeting_consents
         WHERE meeting_id = $1 AND user_id = $2
         ORDER BY accepted_at DESC
         LIMIT 1`,
        [id, userId]
      );
      if (rows.length > 0) consentRecord = rows[0];
    }

    res.json({
      data: {
        consented: consentRecord !== null,
        consent: consentRecord
      }
    });
  } catch (err) {
    next(err);
  }
});

// --- POST /api/meetings/:id/consent ---
// Record a privacy consent for the current user.
// - Authenticated users: uses req.mockUserId.
// - Anonymous users: must provide externalName in the body.
// Idempotent: if a consent record already exists for this user+meeting,
// returns the existing record (200) instead of creating a duplicate (201).

router.post('/', async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.mockUserId;
    const body = consentBodySchema.parse(req.body);

    // Verify the meeting exists
    const { rows: meetingRows } = await pool.query(
      `SELECT id, status FROM public.meetings WHERE id = $1`,
      [id]
    );
    if (meetingRows.length === 0) {
      return res.status(404).json({ error: 'Not Found', message: 'Meeting not found' });
    }

    const meeting = meetingRows[0];

    if (meeting.status === 'CANCELLED' || meeting.status === 'ENDED') {
      return res.status(410).json({
        error: 'Gone',
        message: `This meeting has been ${meeting.status.toLowerCase()} and cannot be joined`
      });
    }

    // Determine identity
    let participantUserId = null;
    let participantExternalName = null;

    if (userId) {
      participantUserId = userId;
      // Verifiy user exists
      const { rows: userRows } = await pool.query(
        `SELECT id FROM public.users WHERE id = $1`,
        [userId]
      );
      if (userRows.length === 0) {
        return res.status(404).json({ error: 'Not Found', message: 'User not found' });
      }

      // Check for existing consent (idempotent)
      const { rows: existing } = await pool.query(
        `SELECT id, meeting_id, user_id, external_name, accepted_at, user_agent
         FROM public.meeting_consents
         WHERE meeting_id = $1 AND user_id = $2
         LIMIT 1`,
        [id, userId]
      );
      if (existing.length > 0) {
        return res.json({ data: existing[0] });
      }
    } else if (body.externalName) {
      participantExternalName = body.externalName;
    } else {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Provide a mock user ID (via headers) or an externalName in the request body'
      });
    }

    // Insert the consent record
    const { rows } = await pool.query(
      `INSERT INTO public.meeting_consents (meeting_id, user_id, external_name, user_agent)
       VALUES ($1, $2, $3, $4)
       RETURNING id, meeting_id, user_id, external_name, accepted_at, user_agent`,
      [id, participantUserId, participantExternalName, req.headers['user-agent'] || null]
    );

    res.status(201).json({ data: rows[0] });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation Error',
        details: err.errors.map((e) => ({ path: e.path.join('.'), message: e.message }))
      });
    }
    next(err);
  }
});

module.exports = router;
```

### 3. Register the consent route in `backend/index.js`

Add after the existing meeting routes:

```js
// -- Meeting routes (WI-501) --
app.use('/api/meetings', require('./src/routes/meetings'));

// -- Meeting consent routes (WI-503) --
app.use('/api/meetings/:id/consent', require('./src/routes/meetingConsent'));
```

### 4. Update `backend/README.md`

Append to the Meetings section:

```
### Meeting Consent (WI-503)
- `GET /api/meetings/:id/consent` — Check if the current user has consented
- `POST /api/meetings/:id/consent` — Record privacy consent for a meeting
```

### 5. Create the frontend PrivacyConsentOverlay component

Create `frontend/src/components/PrivacyConsentOverlay.jsx`:

```jsx
import { useState } from 'react';
import { ShieldAlert, CheckCircle, XCircle } from 'lucide-react';
import './PrivacyConsentOverlay.css';

export default function PrivacyConsentOverlay({ onAccept, onDecline, submitting }) {
  return (
    <div className="consent-overlay">
      <div className="consent-card">
        <div className="consent-icon">
          <ShieldAlert size={48} />
        </div>
        <h2>Privacy Consent</h2>
        <div className="consent-message">
          <p>
            This session may be monitored by the administrator. Your camera,
            microphone, attendance time, and screen-sharing activity may be
            tracked.
          </p>
          <p className="consent-strong">
            Please continue only if you agree.
          </p>
        </div>
        <div className="consent-actions">
          <button
            className="btn btn-primary"
            onClick={onAccept}
            disabled={submitting}
          >
            <CheckCircle size={18} />
            {submitting ? 'Please wait...' : 'Agree & Proceed'}
          </button>
          <button
            className="btn btn-secondary"
            onClick={onDecline}
            disabled={submitting}
          >
            <XCircle size={18} />
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
```

### 6. Create `frontend/src/components/PrivacyConsentOverlay.css`

```css
.consent-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  backdrop-filter: blur(2px);
}

.consent-card {
  background: white;
  border-radius: 12px;
  padding: 2.5rem;
  max-width: 480px;
  width: 90%;
  text-align: center;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.consent-icon {
  color: #d97706;
  margin-bottom: 1rem;
}

.consent-card h2 {
  margin: 0 0 1rem;
  font-size: 1.3rem;
  color: #111827;
}

.consent-message {
  font-size: 14px;
  line-height: 1.6;
  color: #6b7280;
  margin-bottom: 1.5rem;
}

.consent-strong {
  font-weight: 600;
  color: #374151;
  margin-top: 0.75rem;
}

.consent-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: center;
}

.consent-actions .btn {
  width: 100%;
  justify-content: center;
  padding: 12px;
  font-size: 15px;
}

.consent-actions .btn-secondary {
  background: none;
  border: 1px solid #d1d5db;
  color: #6b7280;
}

.consent-actions .btn-secondary:hover {
  background: #f9fafb;
}
```

### 7. Modify `frontend/src/pages/meetings/MeetingRoomPage.jsx`

Replace the existing component to add the consent gatekeeper:

```jsx
import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMockIdentity } from '../../context/MockIdentityContext';
import apiClient from '../../api/client';
import loadJitsiScript from '../../lib/loadJitsiScript';
import PrivacyConsentOverlay from '../../components/PrivacyConsentOverlay';
import { ArrowLeft, Loader } from 'lucide-react';
import './MeetingRoomPage.css';

export default function MeetingRoomPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { userId } = useMockIdentity();
  const jitsiContainerRef = useRef(null);
  const jitsiApiRef = useRef(null);

  const [meeting, setMeeting] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Consent state
  const [consentState, setConsentState] = useState('checking'); // 'checking' | 'needed' | 'accepted' | 'declined'
  const [consentSubmitting, setConsentSubmitting] = useState(false);
  const [jitsiLoading, setJitsiLoading] = useState(true);

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

    fetchMeeting();
    return () => { cancelled = true; };
  }, [id]);

  // Check existing consent status
  useEffect(() => {
    if (!meeting) return;
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
  }, [meeting, id]);

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

        jitsiApiRef.current = new JitsiAPI(domain, options);
        setJitsiLoading(false);
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
      if (jitsiApiRef.current) {
        jitsiApiRef.current.dispose();
        jitsiApiRef.current = null;
      }
    };
  }, [consentState, meeting, userId]);

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
          <h2>Consent Declined</h2>
          <p className="status-message">
            You declined the privacy consent. You cannot join this meeting
            without agreeing to the monitoring terms.
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
      </div>

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
          <p>Loading video room...</p>
        </div>
      )}

      {/* Jitsi container */}
      <div className="jitsi-container" ref={jitsiContainerRef} />
    </div>
  );
}
```

### 8. Verify the build

```bash
cd frontend
npm run build
```

Expected: Clean Vite build with no errors or warnings.

### 9. Verify the backend

```bash
cd backend
npm run dev
```

Test the consent endpoints:

```bash
# 1. Seed a meeting (created via Admin, use WI-501 approach)
curl -X POST http://localhost:5000/api/meetings \
  -H "Content-Type: application/json" \
  -H "x-mock-role: ADMIN" \
  -H "x-mock-user-id: 00000000-0000-0000-0000-000000000001" \
  -d '{"title": "Consent Test Meeting", "isPublic": true, "scheduledStart": "2026-06-15T10:00:00Z"}'

# Save the meeting ID from the response.

# 2. Check consent before any consent (should be false)
curl http://localhost:5000/api/meetings/<MEETING_ID>/consent \
  -H "x-mock-role: STUDENT" \
  -H "x-mock-user-id: 00000000-0000-0000-0000-000000000002"
# Expected: { data: { consented: false, consent: null } }

# 3. Record consent as student
curl -X POST http://localhost:5000/api/meetings/<MEETING_ID>/consent \
  -H "x-mock-role: STUDENT" \
  -H "x-mock-user-id: 00000000-0000-0000-0000-000000000002"
# Expected: 201 with consent record

# 4. Check consent again (should now be true)
curl http://localhost:5000/api/meetings/<MEETING_ID>/consent \
  -H "x-mock-role: STUDENT" \
  -H "x-mock-user-id: 00000000-0000-0000-0000-000000000002"
# Expected: { data: { consented: true, consent: { ... } } }

# 5. Record consent again (should be idempotent — return 200)
curl -X POST http://localhost:5000/api/meetings/<MEETING_ID>/consent \
  -H "x-mock-role: STUDENT" \
  -H "x-mock-user-id: 00000000-0000-0000-0000-000000000002"
# Expected: 200 (not 201)

# 6. Record consent as anonymous with externalName
curl -X POST http://localhost:5000/api/meetings/<MEETING_ID>/consent \
  -H "Content-Type: application/json" \
  -d '{"externalName": "Guest User"}'
# Expected: 201

# 7. Record consent without any identity (should fail)
curl -X POST http://localhost:5000/api/meetings/<MEETING_ID>/consent \
  -H "Content-Type: application/json" \
  -d '{}'
# Expected: 400

# 8. Consent on a non-existent meeting
curl -X POST http://localhost:5000/api/meetings/00000000-0000-0000-0000-000000000000/consent \
  -H "x-mock-role: ADMIN" \
  -H "x-mock-user-id: 00000000-0000-0000-0000-000000000001"
# Expected: 404
```

### 10. Manual frontend verification

1. Start the backend and frontend.
2. As Admin, create a meeting (via `/admin/meetings`).
3. As Student, navigate to `/meetings` and click **Join Room** on that meeting.
4. **Verify**: The privacy consent overlay blocks the Jitsi iframe. The message reads: "This session may be monitored by the administrator..."
5. Click **Cancel** → verify you are navigated back to the previous page.
6. Join the meeting again → click **Agree & Proceed**.
7. **Verify**: The Jitsi iframe loads after the API call succeeds.
8. **Verify**: The `meeting_consents` table has a row with the correct `meeting_id`, `user_id`, and `accepted_at`.
9. Leave the meeting and re-enter → **verify** the consent check returns `consented: true`, so the overlay is skipped and Jitsi loads directly.

---

## Expected Output (File Checklist)

### Backend
- [ ] `backend/src/routes/meetingConsent.js` — GET and POST handlers for `/api/meetings/:id/consent`
- [ ] `backend/index.js` — Registers the consent route group
- [ ] `backend/README.md` — Documents the new consent endpoints

### Frontend
- [ ] `frontend/src/components/PrivacyConsentOverlay.jsx` — Consent gatekeeper component
- [ ] `frontend/src/components/PrivacyConsentOverlay.css` — Overlay and card styling
- [ ] `frontend/src/pages/meetings/MeetingRoomPage.jsx` — Modified to show consent gate before Jitsi

---

## Acceptance Criteria

- `GET /api/meetings/:id/consent` returns `{ data: { consented: false, consent: null } }` before any consent is recorded.
- `GET /api/meetings/:id/consent` returns `{ data: { consented: true, consent: {...} } }` after consent is recorded.
- `POST /api/meetings/:id/consent` with a valid authenticated user creates a row in `meeting_consents` and returns `201`.
- `POST /api/meetings/:id/consent` is idempotent — calling it twice returns `200` on subsequent calls.
- `POST /api/meetings/:id/consent` with an anonymous user + `externalName` creates a row and returns `201`.
- `POST /api/meetings/:id/consent` without any identity returns `400`.
- `POST /api/meetings/:id/consent` on a cancelled/ended meeting returns `410`.
- The privacy consent overlay appears before Jitsi loads on the `/meeting/:id` page.
- The overlay shows the exact warning text: "This session may be monitored by the administrator. Your camera, microphone, attendance time, and screen-sharing activity may be tracked."
- Clicking **Agree & Proceed** calls `POST /api/meetings/:id/consent`, then loads Jitsi.
- Clicking **Cancel** navigates back without loading Jitsi.
- If the user has already consented (checked via `GET /api/meetings/:id/consent`), the overlay is skipped and Jitsi loads immediately.
- `npm run build` completes without errors.

---

## Risk / Impact

- **Consent is per-user per-meeting**: The consent check uses `user_id` + `meeting_id`. If a user leaves and re-enters, they do not need to consent again. Anonymous users (identified by `externalName`) do not have this idempotency — they will see the consent prompt each time since they have no persistent user ID.
- **Consent is not revocable**: The MVP does not include a "Withdraw Consent" endpoint. If consent needs to be revocable, a `DELETE /api/meetings/:id/consent` endpoint and corresponding UI can be added later.
- **Frontend gatekeeper enforcement**: The consent check runs client-side before Jitsi loads. If a user bypasses the frontend (e.g., by navigating directly to `meet.jit.si`), the consent is not enforced. This is an accepted MVP limitation — the platform assumes users will use the provided frontend. Phase 8 hardening can add server-side checks if needed.
- **The consent record includes user-agent**: The `user_agent` column stores `req.headers['user-agent']` for audit purposes. This is optional in the schema and may be NULL.

---

## Post-Implementation Steps (MANDATORY)

Once the file checklist and acceptance criteria are satisfied:

### 1. Update `PROGRESS.md`
- Change the status of **WI-503** from `Not Started` to `Done`.
- Set the assignee to `Antigravity`.
- Set the target date to the current date.
- Increment the `Done` and `Completion %` columns in the Phase 5 progress table.

### 2. Update `CHANGELOG.md`
Add a new entry at the top:

```
## [YYYY-MM-DD] - WI-503: Pre-Meeting Privacy Consent Flow
* **Work Item ID**: WI-503
* **Summary**: Implemented privacy consent gatekeeper. Backend: GET/POST /api/meetings/:id/consent endpoints to check and record consent in meeting_consents table. Frontend: PrivacyConsentOverlay component with Accept/Decline buttons, integrated into MeetingRoomPage to block Jitsi loading until consent is given. Idempotent consent (revisit skips overlay if already consented).
* **Files Affected**:
  - [NEW] `backend/src/routes/meetingConsent.js`
  - [NEW] `frontend/src/components/PrivacyConsentOverlay.jsx`
  - [NEW] `frontend/src/components/PrivacyConsentOverlay.css`
  - [MODIFIED] `backend/index.js` (registered /api/meetings/:id/consent)
  - [MODIFIED] `backend/README.md` (added Meeting Consent endpoints)
  - [MODIFIED] `frontend/src/pages/meetings/MeetingRoomPage.jsx` (added consent flow)
* **Verification Done**:
  - [x] GET /api/meetings/:id/consent returns consented status
  - [x] POST /api/meetings/:id/consent records consent (201) and is idempotent (200)
  - [x] Anonymous consent with externalName works
  - [x] Consent on cancelled/ended meeting returns 410
  - [x] Privacy overlay blocks Jitsi until accepted
  - [x] "Agree & Proceed" records consent then loads Jitsi
  - [x] "Cancel" navigates back without loading Jitsi
  - [x] Previously consented users skip the overlay
  - [x] `npm run build` completes with no errors
* **Impact on Existing Functionality**: The MeetingRoomPage from WI-502 now shows a consent overlay before loading Jitsi. Existing meeting list, admin scheduler, and all other features are unchanged.
```

### 3. Stop and Wait
Do **not** begin WI-601 in the same session. Wait for the developer to verify and trigger the next prompt.

---

## Notes for the AI Agent

- **Backend-first, then frontend**: The consent API must be implemented and verified before modifying the frontend, since the MeetingRoomPage depends on it.
- **Idempotent POST**: The `POST /api/meetings/:id/consent` endpoint checks for an existing consent record before inserting. If one exists, it returns `200` with the existing record. This is critical for the frontend flow — a user who refreshes the page should not get a duplicate consent entry or an error.
- **Consent state machine in the frontend**: The `consentState` variable drives the UI:
  - `'checking'` → Initial state; waiting for the GET request to complete.
  - `'needed'` → No existing consent; show the overlay.
  - `'accepted'` → Consent recorded (either just now or previously); load Jitsi.
  - `'declined'` → User clicked Cancel; show the "Consent Declined" message.
- **The overlay uses `position: fixed`**: The overlay covers the entire viewport with a semi-transparent backdrop and a centered card. It uses `z-index: 9999` to ensure it appears above the Jitsi container and all other elements.
- **No external dependencies**: The consent component is pure CSS + React. No modal libraries, no consent management platforms. This keeps the implementation lightweight.
- **Do not modify existing components**: Add the new `PrivacyConsentOverlay` component as a new file. Modify `MeetingRoomPage.jsx` to integrate it. Do not change other meeting pages, routes, or existing components.
- **The `MeetingRoomPage.jsx` from WI-502** already has the Jitsi initialization logic. You are wrapping that logic with the consent gatekeeper. The Jitsi init effect should only fire when `consentState === 'accepted'`.
- **Consent endpoint uses `mergeParams: true`**: Like the batch settings route, the consent route is nested under `:id` and requires `mergeParams: true` to inherit `req.params.id`.
