import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { MockIdentityProvider } from './context/MockIdentityContext';
import { AuthProvider } from './context/AuthContext';
import AppRoutes from './routes/AppRoutes';

export default function App() {
  return (
    <AuthProvider>
      <MockIdentityProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </MockIdentityProvider>
    </AuthProvider>
  );
}
