import React, { useState, useEffect, useCallback } from 'react';
import { useMockIdentity } from '../../context/MockIdentityContext';
import apiClient from '../../api/client';
import { Plus, UserPlus } from 'lucide-react';
import './StudentsPage.css';

const INITIAL_FORM = { email: '', fullName: '' };

export default function StudentsPage() {
  const { isAdmin } = useMockIdentity();
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);

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

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.email || !form.fullName) {
      setFormError('Email and full name are required.');
      return;
    }
    try {
      setSubmitting(true);
      setFormError(null);
      await apiClient.post('/users/students', {
        email: form.email,
        fullName: form.fullName,
        role: 'STUDENT'
      });
      setForm(INITIAL_FORM);
      setShowForm(false);
      await fetchStudents();
    } catch (e) {
      setFormError(e.response?.data?.message || e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="students-page">
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
              <input
                name="fullName"
                value={form.fullName}
                onChange={handleChange}
                placeholder="e.g. Rahul Sharma"
                required
              />
            </label>
            <label>
              Email
              <input
                name="email"
                type="email"
                value={form.email}
                onChange={handleChange}
                placeholder="e.g. rahul@test.com"
                required
              />
            </label>
          </div>
          {formError && <p className="form-error">{formError}</p>}
          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Creating...' : 'Create'}
            </button>
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
              </tr>
            </thead>
            <tbody>
              {students.length === 0 ? (
                <tr>
                  <td colSpan={4} className="empty-row">No students found.</td>
                </tr>
              ) : (
                students.map((s) => (
                  <tr key={s.id}>
                    <td>{s.full_name}</td>
                    <td>{s.email}</td>
                    <td>{s.batch_id ? s.batch_id.substring(0, 8) + '...' : '—'}</td>
                    <td>{new Date(s.created_at).toLocaleDateString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
