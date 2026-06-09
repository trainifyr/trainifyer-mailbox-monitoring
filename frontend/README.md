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
