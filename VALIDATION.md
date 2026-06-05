# Project Validation Plan

This document establishes the testing, audit, and quality assurance procedures used to verify features before they are marked as completed.

---

## 1. Automated Verification Checks

To declare a work item complete, developers or coding agents must run the following validation scripts:

### Backend Build & Test Runs
* **Command**: Run from `backend/` directory:
  ```bash
  npm run test
  ```
* **Verify**: Confirm that Express mock tests, JWT decoder tests, and permission validator helper assertions return successful codes.

### Frontend Compile Check
* **Command**: Run from `frontend/` directory:
  ```bash
  npm run build
  ```
* **Verify**: Verify that the Vite compiler compiles components successfully, checks types/syntaxes, and leaves no critical warnings.

---

## 2. Manual Test Procedures (Verification Scenarios)

The following matrix lists step-by-step user-testing flows that must be executed to verify specific deliverables.

### Scenario A: Admin Access & Student Registration Flow
1. Open the local frontend server landing page (`http://localhost:5173`).
2. Log in using configured **ADMIN** credentials.
3. Verify that navigation points to `/admin/dashboard` (confirm user is blocked from student portal).
4. Navigate to the **Students** tab, click "Create Student".
5. Enter a test email, temporary password, name, and click submit.
6. Verify that a new student appears in the roster list.
7. Open a private browser tab, log in as the newly created student, and confirm successful redirect to the student dashboard.

### Scenario B: Mailbox Permission Boundary Verification
1. Log in as an **ADMIN**.
2. Go to **Batches**, open the details panel for Cohort-1.
3. Toggle "Student-to-Student Messaging" to **OFF** and save.
4. Log in as a **STUDENT** belonging to Cohort-1.
5. Open the **Mailbox** workspace, click "Compose".
6. In the search box, type the name of another student in Cohort-1. Confirm no results are found.
7. Type the name of the Admin, select it, type a message, and click Send. Confirm success.
8. Log in as the other student and verify that they did not receive any unauthorized message in their database logs.

### Scenario C: Monitored Meeting Consent Flow
1. Log in as a **STUDENT** and open the student dashboard.
2. In the "Upcoming Meetings" panel, click "Join Room" for an active session.
3. Confirm that the page intercepts with a modal saying:
   > "This session may be monitored by the admin. Your camera, microphone, attendance time, and screen-sharing activity may be tracked. Please continue only if you agree."
4. Click "Cancel". Verify that the modal closes and return back to the student dashboard.
5. Click "Join Room" again and click "Agree & Proceed".
6. Verify that the Jitsi Meet iframe loads.

### Scenario D: Attendance Log Validation
1. Log in as a **STUDENT**, accept the privacy consent, and enter a meeting at exactly `12:00 PM`.
2. Check the database `attendance_logs` and verify that a record was inserted with `joined_at = 12:00 PM` and `left_at = null`.
3. Remain in the meeting for exactly 10 minutes.
4. Click the "Leave Meeting" button (or close the browser window).
5. Verify that `left_at` in the database updates to `12:10 PM`.
6. Confirm that:
   - `total_minutes` equals `10`.
   - `attendance_percentage` calculates accurately based on meeting duration.
   - Status transitions to **Present**, **Partial**, or **Absent** according to configured thresholds.
