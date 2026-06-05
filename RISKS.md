# Project Risks & Mitigations

This document outlines key technical, security, and integration risks identified for the Student Learning Monitoring and Internal Communication Platform, along with mitigation strategies.

---

## 1. Security & Privacy Risks

### Risk: Unauthorized Room Joining (Eavesdropping)
* **Description**: Since the MVP utilizes the public `meet.jit.si` service, anybody who guesses the room URL could join the video call, exposing student discussions to external actors.
* **Impact**: High
* **Mitigation**:
  1. Generate long, cryptographically secure UUIDs for meeting room names.
  2. Implement Jitsi parameter overrides (e.g. set room password programmatically during backend meeting initialization).
  3. Restrict route access: do not show the meeting URL to unauthorized students.

### Risk: Privilege Escalation via Route or API Tampering
* **Description**: A student user could tamper with frontend routes or send raw HTTP requests to backend endpoints (such as student creation or batch settings overrides) to bypass restrictions.
* **Impact**: Critical
* **Mitigation**:
  1. Never trust the user role reported by the client/frontend.
  2. Every API endpoint must parse the JWT token sent in the Authorization header, look up the user's role from the server-side database, and reject unauthorized requests with `403 Forbidden`.
  3. Apply Row Level Security (RLS) policies in Supabase on tables like `batch_settings` and `users` to restrict edits.

---

## 2. Infrastructure & Hosting Risks

### Risk: Render Free Tier Cold Starts
* **Description**: Render spin-down policy puts free-tier web services to sleep after 15 minutes of inactivity. When a user logs in, the backend may take up to 50 seconds to boot, causing UI timeouts or poor UX.
* **Impact**: Medium
* **Mitigation**:
  1. Implement a loading overlay on the frontend indicating that the server is warming up.
  2. Write a lightweight heartbeat ping on the frontend that triggers as soon as the landing/login page is visited, initiating server warm-up early.

### Risk: Supabase Database Connection Limits
* **Description**: Supabase free tiers impose limits on concurrent database connections. Express apps that establish new connections per request can quickly exhaust this pool.
* **Impact**: Medium
* **Mitigation**:
  1. Implement connection pooling using the pg-pool library or Supabase's built-in transaction pooler (port 6543).
  2. Close database clients properly inside try-finally blocks.

---

## 3. Data Integrity & Logging Risks

### Risk: Missing Leave-Meeting Triggers
* **Description**: Attendance is calculated using join and leave times. If a student loses internet connection, closes the laptop lid, or experiences a browser crash, the Jitsi iframe exit events and `beforeunload` events may not fire. This leaves the attendance record marked "active" indefinitely.
* **Impact**: High
* **Mitigation**:
  1. **Heartbeat Mechanism**: Implement a frontend heartbeat that sends a ping to the server every 60 seconds during the meeting.
  2. **Sweep Script**: Create a cron-job or cleanup script on the backend that scans `attendance_logs` where `left_at` is null. If the last heartbeat occurred more than 3 minutes ago, automatically set `left_at` to the last heartbeat timestamp.
