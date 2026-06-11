import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import apiClient from '../../api/client';
import { Video, Clock, BarChart3, Calendar, Mail, CheckCircle, AlertTriangle, XCircle, ArrowRight } from 'lucide-react';
import '../admin/ReportsPage.css'; // Import shared report styles

export default function StudentDashboard() {
  const { isStudent } = useAuth();
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
      <div className="students-page">
        <p className="status-message">Student access required.</p>
      </div>
    );
  }

  const { summary } = report || {};

  const personalStats = [
    {
      label: 'Meetings Attended',
      value: summary?.total_sessions ?? '—',
      icon: <Video size={22} />,
      color: '#2563eb'
    },
    {
      label: 'Total Time',
      value: summary ? `${Math.round(summary.total_minutes)} min` : '—',
      icon: <Clock size={22} />,
      color: '#16a34a'
    },
    {
      label: 'Average Attendance',
      value: summary ? `${Math.round(summary.average_percentage)}%` : '—',
      icon: <BarChart3 size={22} />,
      color: '#d97706'
    }
  ];

  const statusBreakdown = [
    { label: 'Present', value: summary?.present_count ?? 0, color: '#16a34a', icon: <CheckCircle size={16} /> },
    { label: 'Partial', value: summary?.partial_count ?? 0, color: '#d97706', icon: <AlertTriangle size={16} /> },
    { label: 'Absent', value: summary?.absent_count ?? 0, color: '#dc2626', icon: <XCircle size={16} /> }
  ];

  return (
    <div className="students-page">
      <div className="page-header">
        <h2>My Dashboard</h2>
        <span className="badge badge-active" style={{ fontSize: '13px', padding: '4px 12px' }}>STUDENT</span>
      </div>

      {loading && <p className="status-message">Loading your stats...</p>}
      {error && <p className="status-message error">{error}</p>}

      {!loading && !error && (
        <>
          {/* Personal stats cards */}
          <div className="kpi-grid">
            {personalStats.map((stat) => (
              <div key={stat.label} className="kpi-card" style={{ borderTop: `3px solid ${stat.color}` }}>
                <div className="kpi-icon" style={{ color: stat.color }}>{stat.icon}</div>
                <div className="kpi-value">{stat.value}</div>
                <div className="kpi-label">{stat.label}</div>
              </div>
            ))}
          </div>

          {/* Status breakdown */}
          <div className="status-breakdown">
            <h3 style={{ marginBottom: '0.75rem' }}>Attendance Status</h3>
            <div className="status-bar">
              {statusBreakdown.map((s) => {
                const total = (summary?.present_count || 0) + (summary?.partial_count || 0) + (summary?.absent_count || 0);
                const pct = total > 0 ? ((s.value / total) * 100) : 0;
                return (
                  <div
                    key={s.label}
                    className="status-bar-segment"
                    style={{
                      flex: pct || 0.01,
                      background: s.color,
                      minWidth: pct > 0 ? '4px' : '0'
                    }}
                    title={`${s.label}: ${s.value} (${Math.round(pct)}%)`}
                  />
                );
              })}
            </div>
            <div className="status-legend">
              {statusBreakdown.map((s) => (
                <span key={s.label} className="status-legend-item">
                  {s.icon}
                  <span style={{ color: s.color, fontWeight: 600 }}>{s.value}</span>
                  <span>{s.label}</span>
                </span>
              ))}
            </div>
          </div>

          {/* Quick links */}
          <div className="quick-links-grid" style={{ marginTop: '2rem' }}>
            <Link to="/meetings" className="quick-link-card">
              <Calendar size={18} />
              <div>
                <div className="quick-link-label">Join a Meeting</div>
                <div className="quick-link-desc">View and join your scheduled sessions</div>
              </div>
              <ArrowRight size={16} style={{ marginLeft: 'auto', color: '#9ca3af' }} />
            </Link>
            <Link to="/mailbox" className="quick-link-card">
              <Mail size={18} />
              <div>
                <div className="quick-link-label">Mailbox</div>
                <div className="quick-link-desc">Check your messages</div>
              </div>
              <ArrowRight size={16} style={{ marginLeft: 'auto', color: '#9ca3af' }} />
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
