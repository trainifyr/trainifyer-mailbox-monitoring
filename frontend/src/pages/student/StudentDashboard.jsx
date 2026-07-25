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

  const fetchReport = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      setError(null);
      const res = await apiClient.get('/reports/attendance', {
        params: { granularity: 'daily' }
      });
      setReport(res.data.data);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isStudent) {
      fetchReport();
      const interval = setInterval(() => fetchReport(true), 30000);
      return () => clearInterval(interval);
    }
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
        <div style={{ display: 'grid', gridTemplateColumns: '3fr 1.5fr', gap: '2rem' }}>
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem', marginBottom: '2.5rem' }}>
              {[1, 2, 3].map((i) => (
                <div key={i} className="card" style={{ padding: '1.5rem' }}>
                  <div className="skeleton-block" style={{ width: '40%', marginBottom: '1rem', height: '1.25rem' }}></div>
                  <div className="skeleton-block" style={{ width: '60%', height: '1.75rem' }}></div>
                </div>
              ))}
            </div>
            <div className="card" style={{ padding: '2rem' }}>
              <div className="skeleton-block" style={{ width: '25%', marginBottom: '1.5rem', height: '1.25rem' }}></div>
              <div className="skeleton-block" style={{ marginBottom: '0.75rem', height: '2.25rem' }}></div>
              <div className="skeleton-block" style={{ height: '2.25rem' }}></div>
            </div>
          </div>
          <div className="card" style={{ padding: '1.5rem' }}>
            <div className="skeleton-block" style={{ width: '40%', marginBottom: '1.5rem', height: '1.25rem' }}></div>
            <div className="skeleton-block" style={{ marginBottom: '0.75rem', height: '2rem' }}></div>
            <div className="skeleton-block" style={{ marginBottom: '0.75rem', height: '2rem' }}></div>
            <div className="skeleton-block" style={{ height: '2rem' }}></div>
          </div>
        </div>
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

           {/* Attendance Log Table */}
           {report?.details && report.details.length > 0 && (
             <div className="card" style={{ padding: '2rem', marginTop: '2rem' }}>
               <h2 style={{ fontSize: '1.25rem', marginBottom: '0.25rem' }}>Recent Attendance Logs</h2>
               <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>Your session-by-session attendance history.</p>
               <div className="table-container" style={{ border: 'none', borderRadius: 0, padding: 0 }}>
                 <table>
                   <thead>
                     <tr>
                       <th>Session</th>
                       <th>Date</th>
                       <th style={{ textAlign: 'center' }}>Duration</th>
                       <th style={{ textAlign: 'center' }}>Attendance %</th>
                       <th style={{ textAlign: 'right' }}>Status</th>
                     </tr>
                   </thead>
                   <tbody>
                      {report.details.slice(0, 15).map((d) => (
                        <tr key={d.attendance_log_id}>
                          <td style={{ fontWeight: 600, color: 'var(--text-heading)' }}>{d.meeting_title}</td>
                          <td style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                            {d.joined_at ? new Date(d.joined_at).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', '') : '—'}
                          </td>
                          <td style={{ textAlign: 'center', fontSize: '0.875rem' }}>
                            {d.total_minutes != null ? `${Math.round(d.total_minutes)}m` : '—'}
                          </td>
                          <td style={{ textAlign: 'center', fontWeight: 700 }}>
                            {d.attendance_percentage != null ? `${Math.round(d.attendance_percentage)}%` : '—'}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <span className={`badge ${d.status === 'PRESENT' ? 'badge-student' : d.status === 'PARTIAL' ? 'badge-admin' : ''}`} style={{ background: d.status === 'ABSENT' ? '#fee2e2' : '', color: d.status === 'ABSENT' ? '#ef4444' : '' }}>
                              {d.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                 </table>
               </div>
             </div>
           )}
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
