# 🎓 Trainifyer Mailbox Monitoring & Attendance Platform

> **A professional-grade, zero-cost MVP for student monitoring and internal communication.**

Trainifyer is a robust, production-ready platform designed for educational institutions to monitor student engagement, facilitate secure internal communication, and automate attendance tracking via integrated video conferencing.

---

## 🚀 Key Features

### 🛡️ Secure Infrastructure
*   **Supabase Authentication**: Real-time seat management and secure JWT-based identity.
*   **Row Level Security (RLS)**: Ironclad database privacy—students only see their own data; Admins see everything.
*   **Role-Based Access Control (RBAC)**: Dedicated dashbaords and route guards for Admin and Student roles.

### 📧 Internal Mailbox
*   **Outlook-Style UI**: Three-panel professional workspace for messaging.
*   **Dynamic Permissions**: Admins can toggle mailbox access and student-to-student messaging at the batch level.
*   **Unified Monitoring**: Administrators can monitor all internal communications for quality assurance.

### 🎥 Meetings & Jitsi Integration
*   **Embedded Video**: Seamless Jitsi Meet integration using the `meet.guifi.net` provider.
    *   *Note: We use this specialized mirror to bypass mandatory host/admin logins required by the official Jitsi server, ensuring a zero-friction experience for iframe embedding.*
*   **Privacy Consent**: Mandatory privacy gatekeeper for all participants before entering video rooms.
*   **Batch Isolation**: Meetings can be restricted to specific cohorts or marked as public.

### 📊 Attendance & Reporting
*   **Automated Tracking**: Join/Leave logs and 60-second heartbeats ensure precise attendance data.
*   **Metric Engine**: Automatically computes session duration, percentage, and participation status (Present/Partial/Absent).
*   **Rich Dashboards**: High-fidelity KPI cards, time-series distributions, and CSV data export for admins.

---

## 🛠️ Technology Stack

| Layer | Component |
| :--- | :--- |
| **Frontend** | React 18, Vite, React Router 6, Lucide Icons, Axios |
| **Backend** | Node.js, Express, Zod (Validation), pg (Pool) |
| **Database** | Supabase (PostgreSQL) with RLS enabled |
| **Auth** | Supabase Auth (JWT HS256) |
| **Video** | Jitsi External API (Provider: `meet.guifi.net`) |

---

## 🚦 Getting Started

### 1. Prerequisites
*   Node.js (v18+)
*   A Supabase Project (Database + Auth enabled)

### 2. Environment Setup
Both `backend/` and `frontend/` require a `.env` file. Copy the provided `.env.example` templates in each folder.

**Backend (.env):**
```env
PORT=5000
DATABASE_URL=your_direct_postgres_url
SUPABASE_URL=your_project_url
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
SUPABASE_JWT_SECRET=your_jwt_secret
```

**Frontend (.env):**
```env
VITE_API_URL=http://localhost:5000/api
VITE_SUPABASE_URL=your_project_url
VITE_SUPABASE_ANON_KEY=your_anon_key
```

### 3. Installation & Database Init
```bash
# Install all dependencies
npm install

# Initialize the database schema and RLS policies
cd backend
npm run db:init
npm run db:verify
```

### 4. Running Locally
```bash
# Terminal 1: Backend
cd backend
npm run dev

# Terminal 2: Frontend
cd frontend
npm run dev
```

---

## 🧪 Validation & Quality
The platform includes a **77-point end-to-end validation suite** covering every major workflow. Detailed results and the security audit report can be found in:
👉 [`docs/WI-901-test-report.md`](./docs/WI-901-test-report.md)

---

## 📁 Repository Structure
*   `backend/` - Express API server and database migrations.
*   `frontend/` - React client application.
*   `docs/` - Technical reports and validation audits.
*   `prompts/` - Original requirement specifications and design patterns.

---

## ⚖️ License
Released under the MIT License. Built for **Trainifyer**.
