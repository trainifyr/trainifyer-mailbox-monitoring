import React from 'react';
import { Link } from 'react-router-dom';
import apiClient from '../api/client';

export default function HomePage() {
  const ping = async () => {
    try {
      // Axios client will auto-inject mock headers
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
      <p>Use the Mock Identity Bar at the bottom to switch roles.</p>
      
      <div style={{ margin: '2rem 0' }}>
        <h3>Admin Actions</h3>
        <nav style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
          <Link to="/admin/dashboard">Dashboard</Link>
          <Link to="/admin/students">Manage Students</Link>
          <Link to="/admin/batches">Manage Batches</Link>
          <Link to="/admin/meetings">Manage Meetings</Link>
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
