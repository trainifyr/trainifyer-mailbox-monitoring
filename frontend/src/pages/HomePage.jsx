import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function HomePage() {
  const { isAuthenticated, user, isAdmin, isStudent } = useAuth();

  return (
    <div className="home-page">
      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>Welcome to Trainifyer</h2>
        <p style={{ color: '#6b7280' }}>Mailbox Monitoring & Meeting Management Platform</p>
      </div>

      {isAuthenticated && user ? (
        <div style={{ 
          background: '#f3f4f6', 
          padding: '1.5rem', 
          borderRadius: '12px', 
          marginBottom: '2rem',
          border: '1px solid #e5e7eb'
        }}>
          <p style={{ margin: 0, fontSize: '1.1rem' }}>
            Signed in as <strong style={{ color: '#111827' }}>{user.full_name}</strong>
          </p>
          <p style={{ color: '#6b7280', fontSize: '0.9rem', marginTop: '0.25rem' }}>{user.email}</p>
        </div>
      ) : (
        <div style={{ 
          padding: '2rem', 
          textAlign: 'center', 
          background: '#eff6ff', 
          borderRadius: '12px', 
          border: '1px border #bfdbfe',
          marginBottom: '2rem'
        }}>
          <p style={{ fontSize: '1.1rem', color: '#1e40af', marginBottom: '1rem' }}>
            Please sign in to access your personalized dashboard.
          </p>
          <Link to="/login" style={{ 
            display: 'inline-block',
            padding: '10px 24px',
            background: '#2563eb',
            color: 'white',
            borderRadius: '8px',
            textDecoration: 'none',
            fontWeight: 600
          }}>
            Sign In Now
          </Link>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem' }}>
        <div style={{ 
          padding: '1.5rem', 
          border: '1px solid #e5e7eb', 
          borderRadius: '12px',
          opacity: (isAuthenticated && (isAdmin || isStudent)) ? 1 : 0.6
        }}>
          <h3 style={{ marginTop: 0, borderBottom: '1px solid #eee', paddingBottom: '0.5rem' }}>Admin Portal</h3>
          <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '1rem' }}>
            <Link to="/admin/dashboard" style={{ color: '#2563eb', textDecoration: 'none' }}>→ Dashboard</Link>
            <Link to="/admin/students" style={{ color: '#2563eb', textDecoration: 'none' }}>→ Manage Students</Link>
            <Link to="/admin/batches" style={{ color: '#2563eb', textDecoration: 'none' }}>→ Manage Batches</Link>
            <Link to="/admin/meetings" style={{ color: '#2563eb', textDecoration: 'none' }}>→ Manage Meetings</Link>
            <Link to="/admin/reports" style={{ color: '#2563eb', textDecoration: 'none' }}>→ Attendance Reports</Link>
          </nav>
        </div>

        <div style={{ 
          padding: '1.5rem', 
          border: '1px solid #e5e7eb', 
          borderRadius: '12px',
          opacity: (isAuthenticated && (isAdmin || isStudent)) ? 1 : 0.6
        }}>
          <h3 style={{ marginTop: 0, borderBottom: '1px solid #eee', paddingBottom: '0.5rem' }}>Student Portal</h3>
          <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '1rem' }}>
            <Link to="/student/dashboard" style={{ color: '#2563eb', textDecoration: 'none' }}>→ Student Dashboard</Link>
            <Link to="/meetings" style={{ color: '#2563eb', textDecoration: 'none' }}>→ Sessions & Meetings</Link>
            <Link to="/mailbox" style={{ color: '#2563eb', textDecoration: 'none' }}>→ Internal Mailbox</Link>
          </nav>
        </div>
      </div>
    </div>
  );
}
