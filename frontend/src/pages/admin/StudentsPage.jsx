import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import apiClient from '../../api/client';
import { Plus, UserPlus, Pencil, X, Check } from 'lucide-react';
import './StudentsPage.css';

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
    const timer = setTimeout(() => setNotification(null), 2500);
    return () => clearTimeout(timer);
  }, [notification]);

  const handleChange = (e) => setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.email || !form.fullName) { setFormError('Email and full name are required.'); return; }
    try {
      setSubmitting(true);
      setFormError(null);
      await apiClient.post('/users/students', { email: form.email, fullName: form.fullName, role: 'STUDENT' });
      setForm(INITIAL_FORM);
      setShowForm(false);
      setNotification('Student created successfully');
      await fetchStudents();
    } catch (e) {
      setFormError(e.response?.data?.message || e.message);
    } finally {
      setSubmitting(false);
    }
  };

  // --- Inline Edit ---
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
    if (!editForm.email && !editForm.fullName) { setEditError('Provide at least one field to update.'); return; }
    try {
      setEditSubmitting(true);
      setEditError(null);
      await apiClient.patch(`/users/students/${studentId}`, {
        email: editForm.email,
        fullName: editForm.fullName,
      });
      cancelEdit();
      setNotification('Student updated successfully');
      await fetchStudents();
    } catch (e) {
      setEditError(e.response?.data?.message || e.message);
    } finally {
      setEditSubmitting(false);
    }
  };

  return (
    <div className="students-page">
      {notification && (
        <div style={{
          position: 'fixed', top: '1rem', right: '1rem', background: '#10b981',
          color: '#fff', padding: '10px 18px', borderRadius: '8px', zIndex: 9999,
          display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
        }}>
          <Check size={16} /> {notification}
        </div>
      )}

      <div className="page-header">
        <h2>Students</h2>
        {isAdmin && (
          <button className="btn btn-primary" onClick={() => setShowForm((v) => !v)}>
            <UserPlus size={16} /> {showForm ? 'Cancel' : 'Create Student'}
          </button>
        )}
      </div>

      {showForm && isAdmin && (
        <form className="create-form" onSubmit={handleSubmit}>
          <h3><Plus size={16} /> New Student</h3>
          <div className="form-row">
            <label>
              Full Name
              <input name="fullName" value={form.fullName} onChange={handleChange} placeholder="e.g. Rahul Sharma" required />
            </label>
            <label>
              Email
              <input name="email" type="email" value={form.email} onChange={handleChange} placeholder="e.g. rahul@test.com" required />
            </label>
          </div>
          {formError && <p className="form-error">{formError}</p>}
          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={submitting}>{submitting ? 'Creating...' : 'Create'}</button>
          </div>
        </form>
      )}

      {loading && <p className="status-message">Loading students...</p>}
      {error && <p className="status-message error">{error}</p>}

      {!loading && !error && (
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Batch</th>
                <th>Created</th>
                {isAdmin && <th style={{ width: 80 }}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {students.length === 0 ? (
                <tr><td colSpan={isAdmin ? 5 : 4} className="empty-row">No students found.</td></tr>
              ) : (
                students.map((s) => (
                  <React.Fragment key={s.id}>
                    <tr>
                      <td>{s.full_name}</td>
                      <td>{s.email}</td>
                      <td>{s.batch_id ? s.batch_id.substring(0, 8) + '...' : '—'}</td>
                      <td>{new Date(s.created_at).toLocaleDateString()}</td>
                      {isAdmin && (
                        <td>
                          <button className="btn" title="Edit student" onClick={() => startEdit(s)} style={{ padding: '4px 8px' }}>
                            <Pencil size={14} />
                          </button>
                        </td>
                      )}
                    </tr>
                    {editingId === s.id && (
                      <tr style={{ background: '#1e1b4b' }}>
                        <td colSpan={isAdmin ? 5 : 4}>
                          <div style={{ padding: '12px 16px', display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                            <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.85rem', color: '#a5b4fc' }}>
                              Full Name
                              <input
                                value={editForm.fullName}
                                onChange={(e) => setEditForm((p) => ({ ...p, fullName: e.target.value }))}
                                style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #4f46e5', background: '#0f0a1e', color: '#fff', fontSize: '0.9rem', width: '200px' }}
                              />
                            </label>
                            <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.85rem', color: '#a5b4fc' }}>
                              Email
                              <input
                                type="email"
                                value={editForm.email}
                                onChange={(e) => setEditForm((p) => ({ ...p, email: e.target.value }))}
                                style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #4f46e5', background: '#0f0a1e', color: '#fff', fontSize: '0.9rem', width: '220px' }}
                              />
                            </label>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <button className="btn btn-primary" style={{ padding: '6px 14px' }} onClick={() => handleEditSubmit(s.id)} disabled={editSubmitting}>
                                {editSubmitting ? 'Saving...' : 'Save'}
                              </button>
                              <button className="btn" style={{ padding: '6px 10px' }} onClick={cancelEdit}><X size={14} /></button>
                            </div>
                            {editError && <p className="form-error" style={{ width: '100%', margin: 0 }}>{editError}</p>}
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
  );
}
