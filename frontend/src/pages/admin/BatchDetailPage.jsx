import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import apiClient from '../../api/client';
import { ArrowLeft, Users, Loader, Mail, BarChart3 } from 'lucide-react';

export default function BatchDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();

  const [batch, setBatch] = useState(null);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!isAdmin) { navigate('/admin/batches'); return; }
    try {
      setLoading(true);
      const [bRes, sRes] = await Promise.all([
        apiClient.get('/batches'),
        apiClient.get(`/batches/${id}/students`)
      ]);

      const found = (bRes.data.data || []).find(b => b.id === id);
      if (!found) { setError('Batch not found.'); return; }
      setBatch(found);
      setStudents(sRes.data.data || []);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  }, [id, isAdmin, navigate]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="page-container animate-fade-in">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
        <button className="btn btn-ghost" style={{ border: '1px solid var(--border)' }} onClick={() => navigate('/admin/batches')}>
          <ArrowLeft size={16} /> Back to Batches
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

      {!loading && !error && batch && (
        <>
          {/* Batch identity card */}
          <div className="card" style={{ padding: '1.5rem', marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
            <div style={{
              width: '56px', height: '56px', borderRadius: '14px',
              background: 'linear-gradient(135deg, #10b981, #059669)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0
            }}>
              <Users size={28} color="#fff" />
            </div>
            <div style={{ flex: 1 }}>
              <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.35rem' }}>{batch.name}</h1>
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <span className={`badge ${batch.status === 'active' ? 'badge-student' : 'badge-admin'}`}>
                  {batch.status}
                </span>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                  {students.length} {students.length === 1 ? 'student' : 'students'} enrolled
                </span>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                  Created {new Date(batch.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
              </div>
            </div>
            <Link to={`/admin/reports?batchId=${batch.id}`} className="btn btn-ghost" style={{ border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <BarChart3 size={16} /> View Reports
            </Link>
          </div>

          {/* Students table */}
          <section>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1.25rem' }}>
              Enrolled Students
            </h2>
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              {students.length === 0 ? (
                <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                  No students assigned to this batch yet.{' '}
                  <Link to="/admin/batches" style={{ color: 'var(--primary)' }}>Manage batch</Link>
                </div>
              ) : (
                <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Student</th>
                        <th>Email</th>
                        <th>Enrolled On</th>
                        <th style={{ textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {students.map(s => (
                        <tr key={s.id}>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                              <div style={{
                                width: '34px', height: '34px', borderRadius: '50%',
                                background: 'var(--border-light)', color: 'var(--text-muted)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontWeight: 600, fontSize: '0.875rem', flexShrink: 0
                              }}>
                                {s.full_name?.charAt(0)}
                              </div>
                              <Link
                                to={`/admin/students/${s.id}/attendance`}
                                style={{ fontWeight: 600, color: 'var(--primary)', textDecoration: 'none' }}
                              >
                                {s.full_name}
                              </Link>
                            </div>
                          </td>
                          <td style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <Mail size={13} /> {s.email}
                            </div>
                          </td>
                          <td style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                            {s.assigned_at ? new Date(s.assigned_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <Link
                              to={`/admin/students/${s.id}/attendance`}
                              className="btn btn-ghost"
                              style={{ fontSize: '0.8rem', padding: '4px 10px', border: '1px solid var(--border)' }}
                            >
                              View Attendance
                            </Link>
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
