# Project Dependencies

This document catalog-lists the external software, libraries, and services required to run and deploy the **Student Learning Monitoring and Internal Communication Platform**.

---

## 1. Third-Party Services

| Service | Tier / Version | Purpose |
| :--- | :--- | :--- |
| **Supabase Database** | Free Tier | Relational PostgreSQL data storage. |
| **Supabase Auth** | Free Tier | User identity authentication and session management. |
| **Jitsi Meet API** | Public Server (`meet.jit.si`) | WebRTC iframe video, audio, and screen-sharing integration. |
| **Render** | Free Tier | Multi-service web app hosting (frontend static site & backend Express API). |

---

## 2. Backend Packages (Node.js/Express)

```json
{
  "dependencies": {
    "express": "^4.19.0",
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "helmet": "^7.1.0",
    "@supabase/supabase-js": "^2.43.0",
    "jsonwebtoken": "^9.0.2",
    "pg": "^8.11.5",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "nodemon": "^3.1.0",
    "supertest": "^7.0.0",
    "jest": "^29.7.0"
  }
}
```

* **helmet**: Adds security headers to Express responses to mitigate clickjacking and injection risks.
* **zod**: Used for runtime schema validation on incoming API requests.
* **supertest**: Used for API integration testing.

---

## 3. Frontend Packages (React/Vite)

```json
{
  "dependencies": {
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "react-router-dom": "^6.23.0",
    "axios": "^1.7.0",
    "lucide-react": "^0.379.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.0",
    "vite": "^5.2.0"
  }
}
```

* **lucide-react**: Lightweight icon set for building the clean, Outlook-style dashboard and mailbox interface.
* **axios**: HTTP client for communicating with the Node.js API backend.

---

## 4. Environment Variables Configuration

The following variables must be defined in the development `.env` files and bound in the Render control panel.

### Backend Configurations (`backend/.env`)
* `PORT`: The local port where the Express server listens (default: `5000`).
* `SUPABASE_URL`: The URL of the Supabase project.
* `SUPABASE_ANON_KEY`: The public anonymous key for general DB client operations.
* `SUPABASE_SERVICE_ROLE_KEY`: **CRITICAL** - The secret service role bypass key used by the backend to register students inside Supabase Auth. **Must never be checked into git.**
* `DATABASE_URL`: Direct PostgreSQL connection string (with transaction pooler settings).

### Frontend Configurations (`frontend/.env`)
* `VITE_API_BASE_URL`: The API URL of the Express server (e.g. `http://localhost:5000/api` or `https://api.yourdomain.com/api`).
* `VITE_SUPABASE_URL`: The URL of the Supabase project.
* `VITE_SUPABASE_ANON_KEY`: The public anonymous key for client-side Auth operations.
