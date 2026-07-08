import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import apiClient from '../../api/client';
import { 
  Users, 
  Layers, 
  Video, 
  BarChart3, 
  Calendar, 
  Mail, 
  Clock, 
  CheckCircle, 
  AlertTriangle, 
  XCircle,
  ArrowUpRight,
  Plus,
  Download
} from 'lucide-react';

export default function AdminDashboard() {
  const { isAdmin, user } = useAuth();
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

  const handleExportCSV = async () => {
    try {
      const res = await apiClient.get('/reports/attendance/csv', {
        responseType: 'blob'
      });
      const blob = new Blob([res.data], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `attendance-report-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Failed to export CSV:', e);
    }
  };

  useEffect(() => {
    if (isAdmin) fetchReport();
  }, [fetchReport, isAdmin]);

  if (!isAdmin) {
    return (
      <div className="card animate-fade-in" style={{ textAlign: 'center', padding: '4rem' }}>
        <AlertTriangle size={48} color="#f59e0b" style={{ marginBottom: '1rem' }} />
        <h2>Admin access required.</h2>
        <p>You do not have permission to view this dashboard.</p>
      </div>
    );
  }

  const { summary, details } = report || {};

  const kpis = [
    { label: 'Total Sessions', value: summary?.total_sessions ?? '0', icon: Video, color: 'var(--primary)' },
    { label: 'Total Minutes', value: summary ? `${Math.round(summary.total_minutes)}m` : '0m', icon: Clock, color: '#10b981' },
    { label: 'Avg Attendance', value: summary ? `${Math.round(summary.average_percentage)}%` : '0%', icon: BarChart3, color: '#f59e0b' },
    { label: 'Present Today', value: summary?.present_count ?? '0', icon: CheckCircle, color: '#10b981' },
  ];

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <header style={{ marginBottom: '2.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h1 style={{ fontSize: '2.25rem', marginBottom: '0.5rem' }}>Welcome back, {user?.full_name?.split(' ')[0]}!</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem' }}>Here's what's happening with your training batches today.</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
           <Link to="/admin/meetings" className="btn btn-ghost" style={{ border: '1px solid var(--border)' }}>Schedule Meeting</Link>
           <Link to="/admin/students" className="btn btn-primary"><Plus size={18} /> Add Student</Link>
        </div>
      </header>

      {loading ? (
        <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-muted)' }}>Loading live data...</div>
      ) : error ? (
        <div className="card" style={{ border: '1px solid #fee2e2', background: '#fef2f2', color: '#dc2626' }}>{error}</div>
      ) : (
        <>
          {/* KPI Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem', marginBottom: '2.5rem' }}>
            {kpis.map((kpi, i) => (
              <div key={kpi.label} className="card" style={{ borderLeft: `4px solid ${kpi.color}`, padding: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                  <div style={{ padding: '8px', background: `${kpi.color}15`, color: kpi.color, borderRadius: '8px' }}>
                    <kpi.icon size={20} />
                  </div>
                  <ArrowUpRight size={16} color="var(--text-muted)" />
                </div>
                <div style={{ fontSize: '1.875rem', fontWeight: 700, color: 'var(--text-heading)', marginBottom: '0.25rem' }}>{kpi.value}</div>
                <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', fontWeight: 500 }}>{kpi.label}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '2rem' }}>
            {/* Recent Sessions */}
            <section>
               <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                  <h2 style={{ fontSize: '1.5rem' }}>Recent Attendance</h2>
                  <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    <button 
                      className="btn btn-ghost" 
                      onClick={handleExportCSV} 
                      style={{ padding: '0.25rem 0.5rem', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.875rem', fontWeight: 600, height: 'auto', border: '1px solid var(--border)' }}
                    >
                      <Download size={14} /> Export CSV
                    </button>
                    <Link to="/admin/reports" style={{ fontSize: '0.875rem', fontWeight: 600 }}>View All Reports</Link>
                  </div>
               </div>
               
               <div className="table-container">
                  <table>
                    <thead>
                      <tr>
                        <th>Student</th>
                        <th>Meeting</th>
                        <th>Status</th>
                        <th>%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {details?.slice(0, 6).map((d) => (
                        <tr key={d.attendance_log_id}>
                          <td style={{ fontWeight: 500, color: 'var(--text-heading)' }}>{d.user_name || d.external_name}</td>
                          <td>{d.meeting_title}</td>
                          <td>
                            <span className={`badge ${
                              d.status === 'PRESENT' ? 'badge-student' : 
                              d.status === 'PARTIAL' ? 'badge-admin' : ''
                            }`} style={{ 
                              background: d.status === 'ABSENT' ? '#fee2e2' : '',
                              color: d.status === 'ABSENT' ? '#ef4444' : ''
                            }}>
                              {d.status}
                            </span>
                          </td>
                          <td style={{ fontWeight: 600 }}>{d.attendance_percentage != null ? `${Math.round(d.attendance_percentage)}%` : '—'}</td>
                        </tr>
                      ))}
                      {(!details || details.length === 0) && (
                        <tr><td colSpan="4" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No recent sessions recorded.</td></tr>
                      )}
                    </tbody>
                  </table>
               </div>
            </section>

            {/* Quick Stats / Secondary info */}
            <section>
               <h2 style={{ fontSize: '1.5rem', marginBottom: '1.5rem' }}>Batch Distribution</h2>
               <div className="card" style={{ padding: '2rem', textAlign: 'center' }}>
                  <div style={{ marginBottom: '1.5rem' }}>
                     <div style={{ fontSize: '2.5rem', fontWeight: 700, color: 'var(--text-heading)' }}>{summary?.present_count ?? 0}</div>
                     <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Total Active Students Today</p>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', height: '8px', background: 'var(--border-light)', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ flex: summary?.present_count ?? 0, background: '#10b981' }}></div>
                    <div style={{ flex: summary?.partial_count ?? 0, background: '#f59e0b' }}></div>
                    <div style={{ flex: summary?.absent_count ?? 0, background: '#ef4444' }}></div>
                  </div>
                  <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase' }}>
                    <div style={{ color: '#10b981' }}>● Present</div>
                    <div style={{ color: '#f59e0b' }}>● Partial</div>
                    <div style={{ color: '#ef4444' }}>● Absent</div>
                  </div>
               </div>

               <div style={{ marginTop: '2rem' }}>
                  <h3 style={{ fontSize: '1.125rem', marginBottom: '1rem' }}>Quick Links</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <Link to="/admin/students" className="btn btn-ghost" style={{ justifyContent: 'flex-start', border: '1px solid var(--border)' }}><Users size={18} /> Manage Student Roster</Link>
                    <Link to="/admin/batches" className="btn btn-ghost" style={{ justifyContent: 'flex-start', border: '1px solid var(--border)' }}><Layers size={18} /> Configure Batches</Link>
                    <Link to="/mailbox" className="btn btn-ghost" style={{ justifyContent: 'flex-start', border: '1px solid var(--border)' }}><Mail size={18} /> Internal Comms</Link>
                  </div>
               </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
