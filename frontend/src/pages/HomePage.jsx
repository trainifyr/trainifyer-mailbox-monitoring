import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import apiClient from '../api/client';

export default function HomePage() {
  const { isAuthenticated, user, logout } = useAuth();

  const ping = async () => {
    try {
      const res = await apiClient.get('/health');
      alert('Backend Response:\n' + JSON.stringify(res.data, null, 2));
    } catch (e) {
      console.error(e);
      alert('Backend not reachable: ' + e.message);
    }
  };

  return (
    <div className="home-page">
      <h2>Welcome</h2>

      {/* Real auth status */}
      {isAuthenticated && user ? (
        <p style={{ color: '#16a34a', marginBottom: '1rem' }}>
          Signed in as <strong>{user.full_name}</strong> ({user.email})
          {' — '}
          <button
            onClick={logout}
            style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', textDecoration: 'underline', fontSize: '14px' }}
          >
            Sign Out
          </button>
        </p>
      ) : (
        <p style={{ marginBottom: '1rem' }}>
          <Link to="/login" style={{ color: '#2563eb' }}>Sign in</Link> to access your dashboard.
        </p>
      )}

      <p>Use the Mock Identity Bar at the bottom to switch roles during development.</p>

      <div style={{ margin: '2rem 0' }}>
        <h3>Admin Actions</h3>
        <nav style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <Link to="/admin/dashboard">Dashboard</Link>
          <Link to="/admin/students">Manage Students</Link>
          <Link to="/admin/batches">Manage Batches</Link>
          <Link to="/admin/meetings">Manage Meetings</Link>
          <Link to="/admin/reports">Attendance Reports</Link>
          <Link to="/mailbox">Internal Mailbox</Link>
        </nav>
      </div>

      <div style={{ margin: '2rem 0' }}>
        <h3>Student Actions</h3>
        <nav style={{ display: 'flex', gap: '1rem' }}>
          <Link to="/student/dashboard">Student Dashboard</Link>
          <Link to="/meetings">Sessions & Meetings</Link>
          <Link to="/mailbox">Internal Mailbox</Link>
        </nav>
      </div>

      <div style={{ marginTop: '3rem', borderTop: '1px solid #eee', paddingTop: '1rem' }}>
        <button
          onClick={ping}
          style={{ padding: '8px 16px', background: '#2196f3', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
        >
          Ping /api/health
        </button>
      </div>
    </div>
  );
}
