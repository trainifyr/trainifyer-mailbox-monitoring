# Project Assumptions

This document lists the baseline assumptions establishing the scope, engineering boundaries, and design guidelines for the **Student Learning Monitoring and Internal Communication Platform** MVP.

---

## 1. User & Account Onboarding Assumptions

* **No Self-Registration**: There is no public user signup route on the frontend. The database will only receive student profiles created manually by authenticated administrators.
* **Temporary Credentials**: During student creation, the administrator sets a temporary password. The student is assumed to use this password to sign in. Change-password flows are outside the MVP.
* **Single Organization Scope**: All data models assume operations occur within a single educational organization. Cohort separation is managed via logical batch entities (`batches`), not multi-tenant databases.
* **Single Batch Assignment**: A student is assigned to exactly one batch. The database schemas support many-to-many associations for future scaling, but the application logic and UI will enforce a one-student-to-one-batch constraint for the MVP.

---

## 2. Communications & Mailbox Assumptions

* **Database-Only Delivery**: The mailbox does not send or receive external emails (SMTP/IMAP/POP3). It operates exclusively as a database table (`mail_messages`) where inserts represent messages, and reads query that table.
* **No Real-Time Sockets**: Message retrieval does not require WebSockets. Simple REST polling or manual page refresh is sufficient for the MVP.
* **Flat Message Hierarchy**: Messages are standalone documents. There are no threaded replies (Gmail style), forwarding actions, or message tags.
* **No Attachments**: The database only stores text subjects and text bodies. File storage buckets (Supabase Storage) are not configured for messages.

---

## 3. Meeting & Monitoring Assumptions

* **Public Jitsi Service**: The application embeds Jitsi Meet via `meet.jit.si` iframe API. No custom Jitsi instance or WebRTC media server hosting is required.
* **Consent is Mandatory**: Students must click to accept the privacy consent message before the Jitsi iframe loads. It is assumed that rejecting the consent blocks iframe initialization entirely.
* **Active Window Monitoring Only**: Monitoring of student participation occurs only while they are inside the active meeting room portal page. Background tracking or tracking outside of active Jitsi sessions is out of scope.
* **Camera, Mic, and Screen Permissions**: We assume that if the Admin configures a meeting to require camera/microphone, the browser will request permission, and the student will grant it. The system cannot bypass browser-level prompts or force camera activation without consent.

---

## 4. Attendance & Analytics Assumptions

* **Duration-Based Attendance**: Attendance metrics are computed strictly based on total minutes spent in a meeting (join time to leave time).
* **Constant Status Thresholds**: The Present ($\ge 75\%$), Partial ($30\% - 74\%$), and Absent ($< 30\%$) thresholds are treated as system constants in the code initially, rather than configurable user settings.
* **No Screen Recording**: Screen monitoring means admins can view active screen shares inside Jitsi's interface. Storing video recordings of student screens is out of scope.
