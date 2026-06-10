import axios from 'axios';
import { supabase } from '../lib/supabaseClient';

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api',
  timeout: 10000
});

// Inject Supabase JWT token on every request
// Falls back to mock identity headers if no JWT session exists (dev mode)
apiClient.interceptors.request.use(async (config) => {
  const { data: { session } } = await supabase.auth.getSession();

  if (session?.access_token) {
    // Real auth: inject JWT bearer token
    config.headers['Authorization'] = `Bearer ${session.access_token}`;
  } else {
    // Dev fallback: use mock identity headers from localStorage
    // TODO(PHASE-8: REMOVE) - Remove mock fallback when WI-803 enforces real auth
    const mockIdentity = JSON.parse(localStorage.getItem('mock_identity') || '{}');
    const { role, userId } = mockIdentity;
    if (role) config.headers['x-mock-role'] = role;
    if (userId) config.headers['x-mock-user-id'] = userId;
  }

  return config;
});

export default apiClient;
