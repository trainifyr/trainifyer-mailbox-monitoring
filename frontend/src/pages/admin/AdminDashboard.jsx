import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import apiClient from '../../api/client';
import { Users, FolderOpen, Video, BarChart3, Calendar, Mail, Clock, CheckCircle, AlertTriangle, XCircle } from 'lucide-react';
import './ReportsPage.css'; // Shared dashboard styles

export default function AdminDashboard() {
  const { isAdmin } = useAuth();
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
    if (isAdmin) fetchReport();
  }, [fetchReport, isAdmin]);

  if (!isAdmin) {
    return (
      <div className="students-page">
        <p className="status-message">Admin access required.</p>
      </div>
    );
  }

  const { summary, details } = report || {};

  // --- KPI card data (static + from API) ---
  const kpiCards = [
    {
      label: 'Total Sessions',
      value: summary?.total_sessions ?? '—',
      icon: <Video size={22} />,
      color: '#2563eb'
    },
    {
      label: 'Total Minutes',
      value: summary ? `${Math.round(summary.total_minutes)}m` : '—',
      icon: <Clock size={22} />,
      color: '#16a34a'
    },
    {
      label: 'Avg Attendance',
      value: summary ? `${Math.round(summary.average_percentage)}%` : '—',
      icon: <BarChart3 size={22} />,
      color: '#d97706'
    },
    {
      label: 'Present',
      value: summary?.present_count ?? '—',
      icon: <CheckCircle size={22} />,
      color: '#16a34a'
    },
    {
      label: 'Partial',
      value: summary?.partial_count ?? '—',
      icon: <AlertTriangle size={22} />,
      color: '#d97706'
    },
    {
      label: 'Absent',
      value: summary?.absent_count ?? '—',
      icon: <XCircle size={22} />,
      color: '#dc2626'
    }
  ];

  // --- Quick links ---
  const quickLinks = [
    { to: '/admin/students', label: 'Manage Students', icon: <Users size={18} />, desc: 'Add, edit, and view student profiles' },
    { to: '/admin/batches', label: 'Manage Batches', icon: <FolderOpen size={18} />, desc: 'Create cohorts and assign students' },
    { to: '/admin/meetings', label: 'Schedule Meetings', icon: <Calendar size={18} />, desc: 'Create batch and public meetings' },
    { to: '/admin/reports', label: 'Attendance Reports', icon: <BarChart3 size={18} />, desc: 'Detailed analytics and filters' },
    { to: '/mailbox', label: 'Mailbox', icon: <Mail size={18} />, desc: 'Internal messaging system' }
  ];

  return (
    <div className="students-page">
      <div className="page-header">
        <h2>Admin Dashboard</h2>
        <span className="badge badge-active" style={{ fontSize: '13px', padding: '4px 12px' }}>ADMIN</span>
      </div>

      {loading && <p className="status-message">Loading dashboard data...</p>}
      {error && <p className="status-message error">{error}</p>}

      {!loading && !error && (
        <>
          {/* KPI cards grid */}
          <div className="kpi-grid">
            {kpiCards.map((kpi) => (
              <div key={kpi.label} className="kpi-card" style={{ borderTop: `3px solid ${kpi.color}` }}>
                <div className="kpi-icon" style={{ color: kpi.color }}>{kpi.icon}</div>
                <div className="kpi-value">{kpi.value}</div>
                <div className="kpi-label">{kpi.label}</div>
              </div>
            ))}
          </div>

          {/* Quick links */}
          <h3 style={{ margin: '2rem 0 1rem' }}>Quick Actions</h3>
          <div className="quick-links-grid">
            {quickLinks.map((link) => (
              <Link key={link.to} to={link.to} className="quick-link-card">
                <div className="quick-link-icon">{link.icon}</div>
                <div>
                  <div className="quick-link-label">{link.label}</div>
                  <div className="quick-link-desc">{link.desc}</div>
                </div>
              </Link>
            ))}
          </div>

          {/* Recent attendance table */}
          {details && details.length > 0 && (
            <>
              <h3 style={{ margin: '2rem 0 1rem' }}>Recent Sessions</h3>
              <div className="table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Meeting</th>
                      <th>Batch</th>
                      <th>Duration</th>
                      <th>%</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {details.slice(0, 10).map((d) => (
                      <tr key={d.attendance_log_id}>
                        <td>{d.user_name || d.external_name || '—'}</td>
                        <td>{d.meeting_title}</td>
                        <td>{d.batch_name || 'Public'}</td>
                        <td>{d.total_minutes ? `${Math.round(d.total_minutes)}m` : '—'}</td>
                        <td>{d.attendance_percentage != null ? `${Math.round(d.attendance_percentage)}%` : '—'}</td>
                        <td>
                          <span className={`badge badge-${(d.status || '').toLowerCase()}`}>
                            {d.status || '—'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
