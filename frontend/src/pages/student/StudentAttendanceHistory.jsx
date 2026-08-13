import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import apiClient from '../../api/client';
import { ArrowLeft, Calendar, Filter } from 'lucide-react';

export default function StudentAttendanceHistory() {
  const { isStudent } = useAuth();
  const [details, setDetails] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const fetchHistory = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = { granularity: 'daily' };
      if (fromDate) params.fromDate = fromDate;
      if (toDate)   params.toDate   = toDate;
      const res = await apiClient.get('/reports/attendance', { params });
      setDetails(res.data.data?.details || []);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate]);

  useEffect(() => {
    if (isStudent) fetchHistory();
  }, [fetchHistory, isStudent]);

  const statusBadgeClass = (s) =>
    s === 'PRESENT' ? 'badge-student'
    : s === 'PARTIAL' ? 'badge-partial'
    : s === 'ACTIVE'  ? 'badge-active'
    : '';

  return (
    <div className="animate-fade-in">
      <header style={{ marginBottom: '2rem' }}>
        <Link to="/student/dashboard" className="btn btn-ghost btn-sm" style={{ marginBottom: '1rem', display: 'inline-flex', border: '1px solid var(--border)' }}>
          <ArrowLeft size={14} /> Back to Dashboard
        </Link>
        <h1 style={{ fontSize: '2rem', marginBottom: '0.25rem' }}>Attendance History</h1>
        <p style={{ color: 'var(--text-muted)' }}>All your session records across time.</p>
      </header>

      {/* Filters */}
      <div className="card" style={{ padding: '1.25rem', marginBottom: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <Calendar size={16} style={{ color: 'var(--text-muted)', alignSelf: 'center' }} />
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.875rem' }}>
          <span style={{ color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '0.75rem' }}>From</span>
          <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} style={{ padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text)', fontSize: '0.875rem' }} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.875rem' }}>
          <span style={{ color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '0.75rem' }}>To</span>
          <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} style={{ padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text)', fontSize: '0.875rem' }} />
        </label>
        <button className="btn btn-ghost btn-sm" style={{ border: '1px solid var(--border)' }} onClick={() => { setFromDate(''); setToDate(''); }}>
          Clear
        </button>
      </div>

      {loading ? (
        <div className="card" style={{ padding: '2rem' }}>
          {[1,2,3,4,5].map(i => <div key={i} className="skeleton-block" style={{ marginBottom: '0.75rem', height: '2.25rem' }} />)}
        </div>
      ) : error ? (
        <div className="card" style={{ padding: '2rem', color: '#ef4444' }}>{error}</div>
      ) : details.length === 0 ? (
        <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          No attendance records found for the selected period.
        </div>
      ) : (
        <div className="card" style={{ padding: '0' }}>
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
                {details.map((d, i) => (
                  <tr key={d.meeting_title + d.session_date + i}>
                    <td style={{ fontWeight: 600, color: 'var(--text-heading)' }}>{d.meeting_title}</td>
                    <td style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                      {d.joined_at
                        ? new Date(d.joined_at).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', '')
                        : new Date(d.session_date).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                    </td>
                    <td style={{ textAlign: 'center', fontSize: '0.875rem' }}>
                      {d.total_minutes ? `${Math.round(d.total_minutes)}m` : '—'}
                    </td>
                    <td style={{ textAlign: 'center', fontWeight: 700 }}>
                      {d.status === 'ACTIVE' ? 'Live' : d.attendance_percentage != null ? `${Math.round(d.attendance_percentage)}%` : '—'}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <span
                        className={`badge ${statusBadgeClass(d.status)}`}
                        style={{ background: d.status === 'ABSENT' ? '#fee2e2' : '', color: d.status === 'ABSENT' ? '#ef4444' : '' }}
                      >
                        {d.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ padding: '1rem 1.5rem', fontSize: '0.8125rem', color: 'var(--text-muted)', borderTop: '1px solid var(--border)' }}>
            {details.length} record{details.length !== 1 ? 's' : ''} total
          </p>
        </div>
      )}
    </div>
  );
}
