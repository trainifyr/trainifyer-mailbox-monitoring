# Trainifyer Frontend Client

React + Vite frontend for the Trainifyer Mailbox Monitoring Platform.

## Setup
1. Copy `.env.example` to `.env` and configure your Supabase URL/Key.
2. Install dependencies: `npm install`
3. Start development server: `npm run dev` (starts on port 5173)

## Authentication
This application uses **Supabase Auth** and a centralized `AuthContext`. 
*   **Role-Based Access**: The app uses `AdminRoute` and `StudentRoute` guards to protect specific views.
*   **API Client**: The specialized Axios client at `src/api/client.js` automatically injects the active JWT into every request to the backend.

## Building for Production
```bash
npm run build
```
The production bundle will be output to the `dist/` directory, ready for deployment to Render or any static host.

## Project Structure
*   `src/components/` — Shared UI elements and Auth guards.
*   `src/context/` — Auth and State management providers.
*   `src/pages/` — Feature-specific views (Mailbox, Meetings, Dashboards).
*   `src/api/` — API client and central request logic.

For full project details, see the root [README](../README.md).
