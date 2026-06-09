import axios from 'axios';
// Note: We'll import the identity state manager here
// Since we want to use it outside React components (in axios interceptors)
// we'll implement a simple store-like pattern or a global variable for the mock identity.

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api',
  timeout: 10000
});

// Inject mock identity headers on every request
// TODO(PHASE-8: REPLACE WITH REAL AUTH HEADERS)
apiClient.interceptors.request.use((config) => {
  // We'll read from localStorage for the mock identity to keep it simple and accessible outside hook rules
  const mockIdentity = JSON.parse(localStorage.getItem('mock_identity') || '{}');
  const { role, userId } = mockIdentity;
  
  if (role) config.headers['x-mock-role'] = role;
  if (userId) config.headers['x-mock-user-id'] = userId;
  
  return config;
});

export default apiClient;
