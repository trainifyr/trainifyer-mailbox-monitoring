import React from 'react';
import { Outlet, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LogOut, User } from 'lucide-react';

export default function Layout() {
  const { isAuthenticated, user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (e) {
      console.error('Logout failed:', e);
    }
  };

  return (
    <div className="app-layout" style={{ minHeight: '100vh' }}>
      <header
        className="app-header"
        style={{
          padding: '1rem 2rem',
          background: '#f5f5f5',
          borderBottom: '1px solid #ddd',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}
      >
        <Link to="/" style={{ textDecoration: 'none', color: 'inherit' }}>
          <h1 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700 }}>Trainifyer</h1>
        </Link>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {isAuthenticated && user ? (
            <>
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: '#374151' }}>
                <User size={16} />
                {user.full_name}
                <span className="badge" style={{
                  background: user.role === 'ADMIN' ? '#dbeafe' : '#dcfce7',
                  color: user.role === 'ADMIN' ? '#2563eb' : '#16a34a',
                  fontSize: '10px',
                  padding: '2px 8px',
                  borderRadius: '10px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  marginLeft: '4px'
                }}>
                  {user.role}
                </span>
              </span>
              <button
                onClick={handleLogout}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  background: 'none',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  color: '#6b7280',
                  transition: 'all 0.2s'
                }}
                onMouseOver={(e) => { e.currentTarget.style.background = '#f9fafb'; e.currentTarget.style.color = '#ef4444'; }}
                onMouseOut={(e) => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#6b7280'; }}
                title="Sign Out"
              >
                <LogOut size={14} /> Sign Out
              </button>
            </>
          ) : (
            <Link
              to="/login"
              style={{
                padding: '6px 14px',
                background: '#2563eb',
                color: 'white',
                borderRadius: '6px',
                textDecoration: 'none',
                fontSize: '14px',
                fontWeight: 600
              }}
            >
              Sign In
            </Link>
          )}
        </div>
      </header>

      <main className="app-main" style={{ padding: '2rem' }}>
        <Outlet />
      </main>
    </div>
  );
}
