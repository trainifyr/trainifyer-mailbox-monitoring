# Developer Handoff Guide (Vertically Sliced)

Welcome to the **Student Learning Monitoring and Internal Communication Platform** repository. This document serves as the entry-point handoff for any developer or AI coding agent taking over the implementation of this project.

---

## 1. Project Context

The product is a tailored web application designed for student cohort management, communication monitoring, and class session tracking. It is intended for a single organization initial launch (batch-based routing and permissions). Key features include:
* Manual administrative onboarding of students (no open registration).
* A database-only, mock email/mailbox system with admin-controlled student messaging scope (e.g. disable student-to-student messages).
* Jitsi Meet iframe rooms for batch-exclusive and public meetings.
* Attendance tracking determined by Jitsi session join and leave time durations.
* Complete visual dashboards for cohort performance reporting.

To allow developers to focus on core features and get immediate testable results, **the early development phases use a Mock Session Context (toggles role and user ID)**. All real security boundaries, Supabase Auth integration, JWT verification, and Database Row Level Security (RLS) are deferred to Phase 8.

---

## 2. Core Project Documents

Please refer to these dedicated planning files before starting work:
* **[GOALS.md](file:///d:/AiSoft/Code/trainifyer-mailbox-monitoring/GOALS.md)**: Product scope, roles, sub-goals, and final success criteria.
* **[SKILLS.md](file:///d:/AiSoft/Code/trainifyer-mailbox-monitoring/SKILLS.md)**: Grouped required developer competencies and technical assumptions.
* **[WORKITEMS.md](file:///d:/AiSoft/Code/trainifyer-mailbox-monitoring/WORKITEMS.md)**: The sequential backlog of 23 distinct developer tasks organized by vertical slices.
* **[PROGRESS.md](file:///d:/AiSoft/Code/trainifyer-mailbox-monitoring/PROGRESS.md)**: Live tracking file to trace item states (`Not Started` -> `Verified`).
* **[CHANGELOG.md](file:///d:/AiSoft/Code/trainifyer-mailbox-monitoring/CHANGELOG.md)**: Records updates, affected files, and regression assessments.

---

## 3. Work Sequence

Development must proceed in a strict linear order to ensure each phase is testable and functional.

1. **Skeleton Setup & Mock context**: Establish directories, Express mock session middleware, React routes with a Mock Identity selector, and database provisioning with RLS turned off (`WI-101` to `WI-104`).
2. **Student & Batch CRUD (Slice 1)**: Build CRUD screens and database relationships for student lists and cohort allocations (`WI-201` to `WI-202`).
3. **Cohort Configuration (Slice 2)**: Toggle features (e.g., mailboxes, meetings) dynamically per batch (`WI-301` to `WI-302`).
4. **Internal Mailbox (Slice 3)**: Write database-backed mock mailing system and build compose/inbox UIs (`WI-401` to `WI-402`).
5. **Meeting Space & Consent (Slice 4)**: Set up Jitsi iframe embeds, scheduling interfaces, and pre-meeting consent checkups (`WI-501` to `WI-503`).
6. **Attendance Tracking (Slice 5)**: Track join/leave timestamps, calculate duration percentages, and code client pings (`WI-601` to `WI-602`).
7. **Dashboards & Reports (Slice 6)**: Implement KPI summary views and filterable analytical progress tables (`WI-701` to `WI-702`).
8. **Authentication & Hardening (Blocker Gate)**: Integrate Supabase Auth on the frontend, replace mock API controllers with JWT validations, set React Router guards, and turn on DB Row Level Security (RLS) policies (`WI-801` to `WI-804`).
9. **Final Staging & Production Deployment**: Perform regression testing under real security permissions and launch on Render (`WI-901` to `WI-902`).

---

## 4. Engineering Discipline and Rules

To maintain the safety and integrity of the repository:
1. **Strict Zero-Cost Constraints**: Do not add paid libraries, database extensions, or video hosting APIs. Stick to Supabase Free Tier limits and the Jitsi Meet iframe library.
2. **No Silent Changes**: If a requirement seems ambiguous or if you wish to adjust a database table, you must draft a clarification/change-request and await project approval. Do not write ad-hoc logic.
3. **No Secret Exposures**: Never commit API keys, Supabase Service Role keys, or development credentials. Ensure the `.env` is ignored by git.
4. **Verify Slices Independently**: Developers should use the "Mock Identity Selector" bar on the frontend to swap between Admin and Student roles to immediately test and verify if permission changes in Slice 2 affect Mailbox visibility in Slice 3.

---

## 5. Next Steps

To begin developing:
1. Initialize the repository structure by carrying out **WI-101**.
2. Run `npm init` setups to create `frontend/` and `backend/` packages.
3. Transition **WI-101**, **WI-102**, and **WI-103** to `In Progress` in the `PROGRESS.md` sheet as you start working.
