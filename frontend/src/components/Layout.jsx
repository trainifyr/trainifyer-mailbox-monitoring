import React, { useState, useEffect } from 'react';
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import apiClient from '../api/client';
import { 
  LogOut, 
  User, 
  LayoutDashboard, 
  Users, 
  Layers, 
  Video, 
  BarChart3, 
  Mail,
  ChevronRight
} from 'lucide-react';

export default function Layout() {
  const { isAuthenticated, user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [hasUnreadMail, setHasUnreadMail] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    const fetchUnread = async () => {
      try {
        const res = await apiClient.get('/mail/inbox', { params: { limit: 10 } });
        if (!cancelled && res.data.data) {
          setHasUnreadMail(res.data.data.some((m) => !m.is_read));
        }
      } catch (e) {}
    };
    fetchUnread();
    const int = setInterval(fetchUnread, 30000);
    return () => { cancelled = true; clearInterval(int); };
  }, [isAuthenticated, location.pathname]);

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (e) {
      console.error('Logout failed:', e);
    }
  };

  const isActive = (path) => location.pathname === path;

  const NavLink = ({ to, icon: Icon, children, hasBadge }) => (
    <Link to={to} className={`nav-link ${isActive(to) ? 'active' : ''}`}>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={18} />
        {hasBadge && (
          <div style={{ 
            position: 'absolute', top: '-4px', right: '-4px', width: '8px', height: '8px', 
            background: 'var(--danger, #ef4444)', borderRadius: '50%', border: '2px solid var(--surface-light, #1e293b)' 
          }} />
        )}
      </div>
      <span>{children}</span>
    </Link>
  );

  return (
    <div className="app-container">
      {isAuthenticated && !location.pathname.startsWith('/meeting/') && (
        <aside className="sidebar">
          <div className="sidebar-logo">
            <Link to={user?.role === 'ADMIN' ? '/admin/dashboard' : '/student/dashboard'} style={{ color: 'white', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '32px', height: '32px', background: 'var(--primary)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyCenter: 'center', fontWeight: 'bold' }}>T</div>
              Trainifyer
            </Link>
          </div>
          
          <nav style={{ flex: 1, paddingTop: '1rem', overflowY: 'auto', overflowX: 'hidden' }}>
            {user?.role === 'ADMIN' && (
              <>
                <div style={{ padding: '1.5rem 1.5rem 0.5rem', fontSize: '0.7rem', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', fontWeight: 700, letterSpacing: '0.1em' }}>Management</div>
                <NavLink to="/admin/dashboard" icon={LayoutDashboard}>Dashboard</NavLink>
                <NavLink to="/admin/students" icon={Users}>Students</NavLink>
                <NavLink to="/admin/batches" icon={Layers}>Batches</NavLink>
                <NavLink to="/admin/meetings" icon={Video}>Meetings</NavLink>
                <NavLink to="/admin/reports" icon={BarChart3}>Reports</NavLink>
              </>
            )}

            {user?.role === 'STUDENT' && (
              <>
                <div style={{ padding: '1.5rem 1.5rem 0.5rem', fontSize: '0.7rem', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', fontWeight: 700, letterSpacing: '0.1em' }}>Student Area</div>
                <NavLink to="/student/dashboard" icon={LayoutDashboard}>Dashboard</NavLink>
                <NavLink to="/meetings" icon={Video}>My Meetings</NavLink>
              </>
            )}

            <div style={{ padding: '1.5rem 1.5rem 0.5rem', fontSize: '0.7rem', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', fontWeight: 700, letterSpacing: '0.1em' }}>Communication</div>
            <NavLink to="/mailbox" icon={Mail} hasBadge={hasUnreadMail}>Mailbox</NavLink>
          </nav>

          <div style={{ padding: '1rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
             <NavLink to="/profile" icon={User}>Profile</NavLink>
          </div>
        </aside>
      )}

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {isAuthenticated ? (
          <header className="top-bar">
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', paddingLeft: '1rem' }}>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-heading)' }}>{user?.full_name}</div>
                  <div className={`badge ${user?.role === 'ADMIN' ? 'badge-admin' : 'badge-student'}`} style={{ fontSize: '0.65rem' }}>{user?.role}</div>
                </div>
                <button 
                  onClick={handleLogout}
                  className="btn-ghost" 
                  style={{ color: '#ef4444', padding: '8px' }} 
                  title="Sign Out"
                >
                  <LogOut size={20} />
                </button>
              </div>
          </header>
        ) : (
          <header className="top-bar">
             <Link to="/" style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-heading)' }}>Trainifyer</Link>
             <Link to="/login" className="btn btn-primary">Sign In</Link>
          </header>
        )}

        <main key={location.pathname} className="main-content page-transition">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
