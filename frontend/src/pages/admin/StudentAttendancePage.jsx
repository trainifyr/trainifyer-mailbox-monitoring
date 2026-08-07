import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import apiClient from '../../api/client';
import { ArrowLeft, Clock, CheckCircle, AlertTriangle, XCircle, User, Mail, Loader, X, LogIn, LogOut } from 'lucide-react';
import AttendanceCalendar from '../../components/AttendanceCalendar';

function StatusBadge({ status }) {
  if (status === 'PRESENT') return <span className="badge badge-student">Present</span>;
  if (status === 'PARTIAL') return <span className="badge badge-partial">Partial</span>;
  if (status === 'ACTIVE')  return <span className="badge badge-active">Active</span>;
  if (status === 'ABSENT') return (
    <span className="badge" style={{ background: '#fee2e2', color: '#ef4444' }}>Absent</span>
  );
  return <span className="badge">{status || '—'}</span>;
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return `${dd}/${mm}/${yy}, ${time}`;
}

export default function StudentAttendancePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();

  const [student, setStudent] = useState(null);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedSession, setSelectedSession] = useState(null);
  const [sessionLogs, setSessionLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);

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

  async function openSessionLogs(session) {
    setSelectedSession(session);
    setLogsLoading(true);
    try {
      const res = await apiClient.get(`/reports/attendance/student/${id}/logs/${session.meeting_id}/${session.session_date}`);
      setSessionLogs(res.data.data);
    } catch (e) {
      setSessionLogs([]);
    } finally {
      setLogsLoading(false);
    }
  }

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
        <div style={{ display: 'flex', gap: '2rem', alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
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
                        <tr
                          key={d.attendance_log_id}
                          onClick={() => openSessionLogs(d)}
                          style={{ cursor: 'pointer' }}
                        >
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
                            {formatDate(d.joined_at)}
                          </td>
                          <td style={{ textAlign: 'center', fontSize: '0.875rem' }}>
                            {d.total_minutes ? `${Math.round(d.total_minutes)} min` : '—'}
                          </td>
                          <td style={{ textAlign: 'center', fontWeight: 700 }}>
                            {d.status === 'ABSENT' || d.attendance_percentage == null ? '—' : `${Math.round(d.attendance_percentage)}%`}
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
          </div>

          {/* Right sidebar */}
          <div style={{ width: '300px', flexShrink: 0, overflow: 'hidden', position: 'sticky', top: '1rem' }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>Monthly Attendance</div>
            <AttendanceCalendar details={details} />
          </div>
        </div>
      )}

      {selectedSession && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000
          }}
          onClick={() => setSelectedSession(null)}
        >
          <div
            className="card"
            style={{ width: '520px', maxHeight: '80vh', overflow: 'auto', padding: '2rem' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
              <div>
                <h3 style={{ fontSize: '1.25rem', marginBottom: '0.25rem' }}>{selectedSession.meeting_title}</h3>
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                  {new Date(selectedSession.session_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}
                </p>
              </div>
              <button className="btn btn-ghost" style={{ padding: '0.5rem' }} onClick={() => setSelectedSession(null)}>
                <X size={20} />
              </button>
            </div>

            {logsLoading ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>Loading...</div>
            ) : sessionLogs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                No detailed event logs available.
              </div>
            ) : (
              <div>
                <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Event</th>
                        <th>Timestamp</th>
                        <th>Duration</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sessionLogs.map((ev, i) => {
                        const next = sessionLogs[i + 1];
                        const isJoin = ev.event_type === 'JOIN';
                        const duration = isJoin && next && next.event_type === 'LEAVE'
                          ? Math.round((new Date(next.event_at) - new Date(ev.event_at)) / 60000) + ' min'
                          : null;
                        return (
                          <tr key={ev.id}>
                            <td>
                              <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                {isJoin ? <LogIn size={16} color="#10b981" /> : <LogOut size={16} color="#ef4444" />}
                                <span style={{ fontWeight: 600, color: isJoin ? '#10b981' : '#ef4444' }}>
                                  {isJoin ? 'Joined' : 'Left'}
                                </span>
                              </span>
                            </td>
                            <td style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                              {new Date(ev.event_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                            </td>
                            <td style={{ fontSize: '0.875rem' }}>{duration || '—'}</td>
                          </tr>
                        );
                      })}
                      <tr style={{ background: 'var(--border-light)' }}>
                        <td style={{ fontWeight: 600 }}>Total</td>
                        <td></td>
                        <td style={{ fontWeight: 700, color: 'var(--text-heading)' }}>
                          {Math.round(selectedSession.total_minutes) || '—'} min
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div className="badge" style={{ marginTop: '1rem', background: selectedSession.status === 'PRESENT' ? 'rgba(16,185,129,0.1)' : selectedSession.status === 'PARTIAL' ? 'rgba(245,158,11,0.1)' : 'rgba(239,68,68,0.1)', color: selectedSession.status === 'PRESENT' ? '#10b981' : selectedSession.status === 'PARTIAL' ? '#f59e0b' : '#ef4444' }}>
                  {selectedSession.status}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
