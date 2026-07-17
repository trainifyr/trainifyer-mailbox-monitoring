import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Link } from 'react-router-dom';
import apiClient from '../../api/client';
import { 
  Plus, 
  UserPlus, 
  Pencil, 
  X, 
  Check, 
  Trash2, 
  Mail, 
  User,
  Search,
  Filter
} from 'lucide-react';

const INITIAL_FORM = { email: '', fullName: '' };

export default function StudentsPage() {
  const { isAdmin } = useAuth();
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);
  const [notification, setNotification] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Inline edit state
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ email: '', fullName: '' });
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState(null);

  const fetchStudents = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiClient.get('/users/students');
      setStudents(res.data.data);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStudents(); }, [fetchStudents]);

  useEffect(() => {
    if (!notification) return;
    const timer = setTimeout(() => setNotification(null), 10000);
    return () => clearTimeout(timer);
  }, [notification]);

  const handleChange = (e) => setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.email || !form.fullName) { setFormError('Email and full name are required.'); return; }
    try {
      setSubmitting(true);
      setFormError(null);
      const res = await apiClient.post('/users/students', { email: form.email, fullName: form.fullName, role: 'STUDENT' });
      setForm(INITIAL_FORM);
      setShowForm(false);
      const tempPass = res.data.data.tempPassword;
      setNotification(`Student created! Temp password: ${tempPass}`);
      await fetchStudents();
    } catch (e) {
      setFormError(e.response?.data?.message || e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const startEdit = (student) => {
    setEditingId(student.id);
    setEditForm({ email: student.email, fullName: student.full_name });
    setEditError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({ email: '', fullName: '' });
    setEditError(null);
  };

  const handleEditSubmit = async (studentId) => {
    try {
      setEditSubmitting(true);
      setEditError(null);
      const res = await apiClient.patch(`/users/students/${studentId}`, {
        email: editForm.email,
        fullName: editForm.fullName,
      });
      cancelEdit();
      const updated = res.data.data;
      setNotification(updated.tempPassword ? `Updated! Credentials: ${updated.tempPassword}` : 'Updated successfully');
      await fetchStudents();
    } catch (e) {
      setEditError(e.response?.data?.message || e.message);
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleDelete = async (studentId, studentName) => {
    if (!window.confirm(`Delete ${studentName}?`)) return;
    try {
      await apiClient.delete(`/users/students/${studentId}`);
      setNotification('Student deleted');
      await fetchStudents();
    } catch (e) {
      alert(`Delete failed: ${e.response?.data?.message || e.message}`);
    }
  };

  const handleUnassign = async (studentId, batchId, studentName, batchName) => {
    if (!window.confirm(`Are you sure you want to remove ${studentName} from batch "${batchName}"?`)) return;
    try {
      await apiClient.delete(`/batches/${batchId}/students/${studentId}`);
      setNotification('Student removed from batch');
      await fetchStudents();
    } catch (e) {
      alert(`Removal failed: ${e.response?.data?.message || e.message}`);
    }
  };

  const filteredStudents = students.filter(s => 
    s.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="animate-fade-in">
      {/* Toast Notification */}
      {notification && (
        <div style={{
          position: 'fixed', top: '2rem', right: '2rem', background: 'var(--bg-sidebar)',
          color: 'white', padding: '1rem 1.5rem', borderRadius: 'var(--radius-md)', zIndex: 9999,
          display: 'flex', alignItems: 'center', gap: '12px', boxShadow: 'var(--shadow-lg)',
          borderLeft: '4px solid #10b981', animation: 'fadeIn 0.3s ease'
        }}>
          <div style={{ background: '#10b981', padding: '4px', borderRadius: '50%' }}><Check size={14} /></div>
          <span style={{ fontWeight: 500 }}>{notification}</span>
          <button onClick={() => setNotification(null)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', padding: '4px' }}><X size={16} /></button>
        </div>
      )}

      {/* Page Header */}
      <header style={{ marginBottom: '2.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '2.25rem', marginBottom: '0.25rem' }}>Student Directory</h1>
          <p style={{ color: 'var(--text-muted)' }}>Manage your training scholars and their access credentials.</p>
        </div>
        {isAdmin && (
          <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
            {showForm ? <X size={18} /> : <UserPlus size={18} />}
            {showForm ? 'Cancel' : 'Enroll Student'}
          </button>
        )}
      </header>

      {/* Enroll Form Card */}
      {showForm && isAdmin && (
        <div className="card animate-fade-in" style={{ marginBottom: '2.5rem', padding: '2rem', maxWidth: '800px' }}>
          <h2 style={{ fontSize: '1.25rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Plus size={20} color="var(--primary)" /> New Student Registration
          </h2>
          <form style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 140px', gap: '1rem', alignItems: 'flex-end' }} onSubmit={handleSubmit}>
            <div className="input-group" style={{ marginBottom: 0 }}>
              <label className="label">Full Name</label>
              <input name="fullName" className="input" value={form.fullName} onChange={handleChange} placeholder="e.g. Rahul Sharma" required />
            </div>
            <div className="input-group" style={{ marginBottom: 0 }}>
              <label className="label">Email Address</label>
              <input name="email" type="email" className="input" value={form.email} onChange={handleChange} placeholder="e.g. rahul@test.com" required />
            </div>
            <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={submitting}>
              {submitting ? 'Registering...' : 'Register'}
            </button>
          </form>
          {formError && <p style={{ color: '#ef4444', fontSize: '0.875rem', marginTop: '1rem' }}>{formError}</p>}
        </div>
      )}

      {/* Table Actions */}
      <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
        <div style={{ padding: '1.25rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--border-light)' }}>
           <div style={{ position: 'relative' }}>
              <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input 
                type="text" 
                placeholder="Search by name or email..." 
                className="input" 
                style={{ paddingLeft: '2.5rem', width: '320px', background: 'var(--bg-card)' }}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
           </div>
           <button className="btn btn-ghost" style={{ border: '1px solid var(--border)', background: 'var(--bg-card)' }}><Filter size={16} /> Filters</button>
        </div>

        {loading ? (
          <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-muted)' }}>Retrieving student records...</div>
        ) : (
          <div className="table-container" style={{ border: 'none', borderRadius: '0' }}>
            <table>
              <thead>
                <tr>
                  <th>Student Info</th>
                  <th>Status</th>
                  <th>Current Batch</th>
                  <th>Enrolled On</th>
                  {isAdmin && <th style={{ textAlign: 'right' }}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filteredStudents.length === 0 ? (
                  <tr><td colSpan="5" style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>No student records found matching your search.</td></tr>
                ) : (
                  filteredStudents.map((s) => (
                    <React.Fragment key={s.id}>
                      <tr style={editingId === s.id ? { background: 'var(--primary-glow)' } : {}}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'var(--border-light)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: '0.875rem' }}>
                              {s.full_name.charAt(0)}
                            </div>
                            <div>
                               <Link
                                  to={`/admin/students/${s.id}/attendance`}
                                  style={{ fontWeight: 600, color: 'var(--primary)', textDecoration: 'none' }}
                               >
                                  {s.full_name}
                               </Link>
                               <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}><Mail size={12} /> {s.email}</div>
                            </div>
                          </div>
                        </td>
                        <td>
                           <span className="badge badge-student">Active</span>
                        </td>
                        <td>
                           <div style={{ fontSize: '0.875rem', color: 'var(--text-heading)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              {s.batch_id ? (
                                <>
                                  <Link to={`/admin/batches/`+s.batch_id} style={{ color: 'var(--primary)', textDecoration: 'none' }}>{s.batch_name}</Link>
                                  {isAdmin && (
                                    <button
                                      onClick={() => handleUnassign(s.id, s.batch_id, s.full_name, s.batch_name)}
                                      style={{
                                        background: 'none',
                                        border: 'none',
                                        color: '#ef4444',
                                        cursor: 'pointer',
                                        padding: '2px',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        borderRadius: '4px'
                                      }}
                                      title="Remove from batch"
                                    >
                                      <X size={14} />
                                    </button>
                                  )}
                                </>
                              ) : (
                                <span style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontWeight: 400 }}>No Batch</span>
                              )}
                           </div>
                        </td>
                        <td style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>{new Date(s.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                        {isAdmin && (
                          <td style={{ textAlign: 'right' }}>
                            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                              <button className="btn btn-ghost" onClick={() => startEdit(s)} style={{ padding: '6px' }} title="Edit Profile"><Pencil size={16} /></button>
                              <button className="btn btn-ghost" onClick={() => handleDelete(s.id, s.full_name)} style={{ padding: '6px', color: '#ef4444' }} title="Delete"><Trash2 size={16} /></button>
                            </div>
                          </td>
                        )}
                      </tr>
                      {editingId === s.id && (
                        <tr>
                          <td colSpan="5" style={{ padding: '1.5rem', background: 'var(--bg-app)' }}>
                            <div className="card animate-fade-in" style={{ padding: '1.5rem', display: 'grid', gridTemplateColumns: '1fr 1.25fr auto', gap: '1rem', alignItems: 'flex-end' }}>
                               <div className="input-group" style={{ marginBottom: 0 }}>
                                 <label className="label">Full Name</label>
                                 <input className="input" value={editForm.fullName} onChange={(e) => setEditForm(p => ({ ...p, fullName: e.target.value }))} />
                               </div>
                               <div className="input-group" style={{ marginBottom: 0 }}>
                                 <label className="label">Email Address</label>
                                 <input className="input" value={editForm.email} onChange={(e) => setEditForm(p => ({ ...p, email: e.target.value }))} />
                               </div>
                               <div style={{ display: 'flex', gap: '0.5rem' }}>
                                  <button className="btn btn-primary" onClick={() => handleEditSubmit(s.id)} disabled={editSubmitting}>
                                    {editSubmitting ? 'Saving...' : 'Update Student'}
                                  </button>
                                  <button className="btn btn-ghost" style={{ border: '1px solid var(--border)' }} onClick={cancelEdit}><X size={18} /></button>
                               </div>
                               {editError && <p style={{ color: '#ef4444', fontSize: '0.875rem', gridColumn: 'span 3' }}>{editError}</p>}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
