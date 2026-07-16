import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import apiClient from '../../api/client';
import { ArrowLeft, Clock, CheckCircle, AlertTriangle, XCircle, User, Mail, Loader } from 'lucide-react';

function StatusBadge({ status }) {
  if (status === 'PRESENT') return <span className="badge badge-student">Present</span>;
  if (status === 'PARTIAL') return <span className="badge badge-admin">Partial</span>;
  if (status === 'ABSENT') return (
    <span className="badge" style={{ background: '#fee2e2', color: '#ef4444' }}>Absent</span>
  );
  return <span className="badge">{status || '—'}</span>;
}

export default function StudentAttendancePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();

  const [student, setStudent] = useState(null);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isAdmin) { navigate('/admin/students'); return; }

    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        const [sRes, rRes] = await Promise.all([
          apiClient.get('/users/students'),
          apiClient.get(`/reports/attendance/student/${id}`)
        ]);
        if (cancelled) return;

        const found = (sRes.data.data || []).find(s => s.id === id);
        if (!found) { setError('Student not found.'); return; }
        setStudent(found);
        setReport(rRes.data.data);
      } catch (e) {
        if (!cancelled) setError(e.response?.data?.error || e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [id, isAdmin, navigate]);

  const summary = report?.summary;
  const details = report?.details || [];

  return (
    <div className="page-container animate-fade-in">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
        <button className="btn btn-ghost" style={{ border: '1px solid var(--border)' }} onClick={() => navigate('/admin/students')}>
          <ArrowLeft size={16} /> Back to Students
        </button>
      </div>

      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
          <Loader size={32} className="spin" />
        </div>
      )}

      {error && (
        <div className="card" style={{ padding: '2rem', textAlign: 'center', color: '#ef4444' }}>
          <p>{error}</p>
        </div>
      )}

      {!loading && !error && student && (
        <>
          {/* Student identity card */}
          <div className="card" style={{ padding: '1.5rem', marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
            <div style={{
              width: '56px', height: '56px', borderRadius: '50%',
              background: 'linear-gradient(135deg, #10b981, #059669)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '1.5rem', fontWeight: 700, color: '#fff', flexShrink: 0
            }}>
              {student.full_name?.charAt(0) || <User size={24} />}
            </div>
            <div style={{ flex: 1 }}>
              <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.25rem' }}>{student.full_name}</h1>
              <div style={{ display: 'flex', gap: '1.5rem', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Mail size={14} /> {student.email}</span>
                {student.batch_name && (
                  <Link to={`/admin/batches/${student.batch_id}`} style={{ color: 'var(--primary)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {student.batch_name}
                  </Link>
                )}
              </div>
            </div>
          </div>

          {/* KPI Summary */}
          {summary && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem', marginBottom: '2.5rem' }}>
              {[
                { label: 'Total Sessions', value: summary.total_sessions, icon: <Clock size={20} />, color: 'var(--primary)' },
                { label: 'Avg Attendance', value: `${Math.round(summary.average_percentage)}%`, icon: <CheckCircle size={20} />, color: '#10b981' },
                { label: 'Present', value: summary.present_count, icon: <CheckCircle size={20} />, color: '#10b981' },
                { label: 'Partial', value: summary.partial_count, icon: <AlertTriangle size={20} />, color: '#f59e0b' },
                { label: 'Absent', value: summary.absent_count, icon: <XCircle size={20} />, color: '#ef4444' },
              ].map(({ label, value, icon, color }) => (
                <div key={label} className="card" style={{ padding: '1.25rem', borderLeft: `4px solid ${color}` }}>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', marginBottom: '0.5rem' }}>{label}</div>
                  <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-heading)' }}>{value}</div>
                </div>
              ))}
            </div>
          )}

          {/* Daily Attendance Log */}
          <section>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1.25rem' }}>Session History</h2>
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              {details.length === 0 ? (
                <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                  No attendance records found for this student.
                </div>
              ) : (
                <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Session</th>
                        <th>Batch</th>
                        <th>Date &amp; Time</th>
                        <th style={{ textAlign: 'center' }}>Duration</th>
                        <th style={{ textAlign: 'center' }}>Attendance %</th>
                        <th style={{ textAlign: 'right' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {details.map(d => (
                        <tr key={d.attendance_log_id}>
                          <td style={{ fontWeight: 600, color: 'var(--text-heading)' }}>{d.meeting_title}</td>
                          <td>
                            {d.batch_id ? (
                              <Link to={`/admin/batches/${d.batch_id}`}>
                                <span className="badge badge-admin" style={{ textTransform: 'none', cursor: 'pointer' }}>{d.batch_name || 'Unnamed'}</span>
                              </Link>
                            ) : (
                              <span className="badge" style={{ textTransform: 'none' }}>Public</span>
                            )}
                          </td>
                          <td style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                            {d.joined_at ? new Date(d.joined_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '—'}
                          </td>
                          <td style={{ textAlign: 'center', fontSize: '0.875rem' }}>
                            {d.total_minutes ? `${Math.round(d.total_minutes)} min` : '—'}
                          </td>
                          <td style={{ textAlign: 'center', fontWeight: 700 }}>
                            {d.attendance_percentage != null ? `${Math.round(d.attendance_percentage)}%` : '—'}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <StatusBadge status={d.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
