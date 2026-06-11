import axios from 'axios';
import { supabase } from '../lib/supabaseClient';

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api',
  timeout: 10000
});

// Inject Supabase JWT token on every request
apiClient.interceptors.request.use(async (config) => {
  const { data: { session } } = await supabase.auth.getSession();

  if (session?.access_token) {
    config.headers['Authorization'] = `Bearer ${session.access_token}`;
  }

  return config;
});

export default apiClient;
