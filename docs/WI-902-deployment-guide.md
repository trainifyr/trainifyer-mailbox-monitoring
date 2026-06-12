# WI-902: Render Deployment Guide

This guide details the steps to deploy the **Trainifyer Mailbox Monitoring Platform** to Render's Free Tier using the provided `render.yaml` blueprint.

---

## 1. Prerequisites
*   A GitHub account with the project repository synced.
*   A [Render](https://render.com) account.
*   Your **Supabase** Project URL, Anon Key, and Service Role Key.
*   Your **Supabase JWT Secret** (found in Supabase Dashboard > Settings > API).
*   Your **Supabase Connection String** (found in Supabase Dashboard > Settings > Database).

---

## 2. Deployment Steps

### Step A: Connect Repository
1.  Log in to the Render Dashboard.
2.  Click **"New +"** and select **"Blueprint"**.
3.  Connect your GitHub repository.
4.  Render will detect the `render.yaml` file automatically.

### Step B: Configure Environment Variables
Render will prompt you for the variables defined in the blueprint.

| Service | Variable | Value Source |
| :--- | :--- | :--- |
| **Backend** | `DATABASE_URL` | Supabase Transaction Pooler (port 6543) |
| **Backend** | `SUPABASE_URL` | Supabase Project URL |
| **Backend** | `SUPABASE_ANON_KEY` | Supabase `anon` public key |
| **Backend** | `SUPABASE_SERVICE_ROLE_KEY` | Supabase `service_role` secret key |
| **Backend** | `SUPABASE_JWT_SECRET` | Supabase JWT Secret |
| **Frontend** | `VITE_API_BASE_URL` | `https://trainifyer-backend.onrender.com/api` |
| **Frontend** | `VITE_SUPABASE_URL` | Supabase Project URL |
| **Frontend** | `VITE_SUPABASE_ANON_KEY` | Supabase `anon` public key |

### Step C: Monitor Build
1.  Render will first build and deploy the **Backend**.
2.  Once the Backend is "Live", the **Frontend** will build.
3.  The Frontend is a **Static Site** and includes a rewrite rule for React Router support (handling `/mailbox`, `/meetings`, etc.).

---

## 3. Post-Deployment Verification
1.  Visit your Frontend URL (e.g., `https://trainifyer-frontend.onrender.com`).
2.  Verify the Login page loads.
3.  Open the Browser Console (F12) to ensure no CORS errors or 404s on API requests.
4.  Navigate to `/api/health` on your Backend URL to confirm connectivity to Supabase.

---

## 4. Troubleshooting
*   **CORS Errors**: Ensure the backend `cors()` middleware is active. Render's default setup usually handles this, but you can explicitly whitelist your frontend URL in `backend/index.js` if needed.
*   **Database Timeout**: Free tier databases can sleep. If the first request fails, wait 30 seconds and refresh.
*   **Environment Variables**: If deployment fails with "Missing config", double-check that every key from Section 2 is defined in the Render Dashboard.
