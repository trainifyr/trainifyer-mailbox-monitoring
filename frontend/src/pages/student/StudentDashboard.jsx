import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import apiClient from '../../api/client';
import { 
  Video, 
  Clock, 
  BarChart3, 
  Calendar, 
  Mail, 
  CheckCircle, 
  AlertTriangle, 
  XCircle, 
  ArrowRight,
  User,
  ExternalLink
} from 'lucide-react';

export default function StudentDashboard() {
  const { isStudent, user } = useAuth();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchReport = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiClient.get('/reports/attendance', {
        params: { granularity: 'daily' }
      });
      setReport(res.data.data);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isStudent) fetchReport();
  }, [fetchReport, isStudent]);

  if (!isStudent) {
    return (
      <div className="card animate-fade-in" style={{ textAlign: 'center', padding: '4rem' }}>
        <AlertTriangle size={48} color="#f59e0b" style={{ marginBottom: '1rem' }} />
        <h2>Student access required.</h2>
      </div>
    );
  }

  const { summary } = report || {};

  const stats = [
    { label: 'Meetings Attended', value: summary?.total_sessions ?? '0', icon: Video, color: 'var(--primary)' },
    { label: 'Training Time', value: summary ? `${Math.round(summary.total_minutes)}m` : '0m', icon: Clock, color: '#10b981' },
    { label: 'Core Attendance', value: summary ? `${Math.round(summary.average_percentage)}%` : '0%', icon: BarChart3, color: '#f59e0b' },
  ];

  const breakdown = [
    { label: 'Present', count: summary?.present_count ?? 0, color: '#10b981' },
    { label: 'Partial', count: summary?.partial_count ?? 0, color: '#f59e0b' },
    { label: 'Absent', count: summary?.absent_count ?? 0, color: '#ef4444' },
  ];

  return (
    <div className="animate-fade-in">
      {/* Welcome Header */}
      <header style={{ marginBottom: '3rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
           <div style={{ padding: '0.5rem 1rem', background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', borderRadius: '12px', fontSize: '0.875rem', fontWeight: 600 }}>Active Student Session</div>
        </div>
        <h1 style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>Good day, {user?.full_name?.split(' ')[0]}</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '1.125rem' }}>Track your progress and access your training sessions below.</p>
      </header>

      {loading ? (
        <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-muted)' }}>Synching your stats...</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '3fr 1.5fr', gap: '2rem' }}>
          
          {/* Main Content Area */}
          <section>
             <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem', marginBottom: '2.5rem' }}>
               {stats.map((s) => (
                 <div key={s.label} className="card" style={{ padding: '1.5rem' }}>
                    <div style={{ width: '40px', height: '40px', background: `${s.color}15`, color: s.color, borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem' }}>
                      <s.icon size={20} />
                    </div>
                    <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-heading)', marginBottom: '0.25rem' }}>{s.value}</div>
                    <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.025em' }}>{s.label}</div>
                 </div>
               ))}
             </div>

             <div className="card" style={{ padding: '2rem' }}>
               <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem' }}>
                 <div>
                   <h2 style={{ fontSize: '1.25rem', marginBottom: '0.25rem' }}>Attendance Breakdown</h2>
                   <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Summary of your presence in scheduled sessions</p>
                 </div>
                 <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Target Rate</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#10b981' }}>75% +</div>
                 </div>
               </div>

               <div style={{ display: 'flex', height: '12px', background: 'var(--border-light)', borderRadius: '6px', overflow: 'hidden', marginBottom: '2rem' }}>
                  {breakdown.map((b) => {
                    const total = breakdown.reduce((acc, curr) => acc + curr.count, 0);
                    const pct = total > 0 ? (b.count / total) * 100 : 0;
                    return (
                      <div key={b.label} style={{ width: `${pct}%`, background: b.color, transition: 'width 0.5s ease' }} />
                    );
                  })}
               </div>

               <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
                  {breakdown.map((b) => (
                    <div key={b.label} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: b.color }} />
                      <div style={{ fontSize: '0.875rem' }}>
                        <span style={{ fontWeight: 700, color: 'var(--text-heading)' }}>{b.count}</span> <span style={{ color: 'var(--text-muted)' }}>{b.label}</span>
                      </div>
                    </div>
                  ))}
               </div>
             </div>
          </section>

          {/* Sidebar Area */}
          <aside>
             <div style={{ marginBottom: '2rem' }}>
                <h3 style={{ fontSize: '1rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem' }}>Quick Actions</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                   <Link to="/meetings" className="btn btn-primary" style={{ justifyContent: 'space-between', padding: '1rem 1.25rem' }}>
                      <span>Browse Meetings</span>
                      <Video size={18} />
                   </Link>
                   <Link to="/mailbox" className="btn btn-ghost" style={{ justifyContent: 'space-between', padding: '1rem 1.25rem', border: '1px solid var(--border)' }}>
                      <span>Check Mailbox</span>
                      <Mail size={18} />
                   </Link>
                </div>
             </div>

             <div className="card" style={{ background: 'linear-gradient(to bottom, var(--bg-card), var(--border-light))', padding: '1.5rem' }}>
                <h3 style={{ fontSize: '1rem', marginBottom: '1rem' }}>Learning Profile</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
                  <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'var(--primary)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <User size={24} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, color: 'var(--text-heading)' }}>{user?.full_name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{user?.email}</div>
                  </div>
                </div>
                <Link to="/profile" className="btn btn-ghost" style={{ width: '100%', fontSize: '0.875rem', border: '1px solid var(--border)' }}>
                  View Full Profile <ExternalLink size={14} />
                </Link>
             </div>
          </aside>

        </div>
      )}
    </div>
  );
}
