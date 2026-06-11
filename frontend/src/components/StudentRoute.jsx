import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Loader } from 'lucide-react';

/**
 * Route guard: requires the user to be authenticated with STUDENT role.
 * Redirects to / if the user is not a Student.
 */
export default function StudentRoute({ children }) {
  const { isAuthenticated, isStudent, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '40vh' }}>
        <Loader size={32} className="animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  if (!isStudent) {
    return <Navigate to="/" replace />;
  }

  return children;
}
