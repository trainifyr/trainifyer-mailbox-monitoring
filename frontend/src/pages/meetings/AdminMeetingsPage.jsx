import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMockIdentity } from '../../context/MockIdentityContext';
import apiClient from '../../api/client';
import { Plus, Video, Calendar, Globe, Users } from 'lucide-react';
import './AdminMeetingsPage.css';

const INITIAL_FORM = {
  title: '',
  batchId: '',
  isPublic: false,
  scheduledStart: '',
  scheduledEnd: ''
};

export default function AdminMeetingsPage() {
  const { isAdmin } = useMockIdentity();
  const navigate = useNavigate();
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);
  const [batches, setBatches] = useState([]);

  const fetchMeetings = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiClient.get('/meetings');
      setMeetings(res.data.data);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchBatches = useCallback(async () => {
    try {
      const res = await apiClient.get('/batches');
      setBatches(res.data.data);
    } catch (e) {
      console.error('Failed to fetch batches:', e);
    }
  }, []);

  useEffect(() => {
    fetchMeetings();
    fetchBatches();
  }, [fetchMeetings, fetchBatches]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
    // Clear batchId when toggling to public
    if (name === 'isPublic' && checked) {
      setForm((prev) => ({ ...prev, isPublic: true, batchId: '' }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title) {
      setFormError('Title is required.');
      return;
    }
    if (!form.isPublic && !form.batchId) {
      setFormError('Select a batch for a batch meeting, or check "Public meeting".');
      return;
    }

    const payload = {
      title: form.title,
      isPublic: form.isPublic,
      batchId: form.isPublic ? null : form.batchId,
      scheduledStart: form.scheduledStart || null,
      scheduledEnd: form.scheduledEnd || null
    };

    try {
      setSubmitting(true);
      setFormError(null);
      await apiClient.post('/meetings', payload);
      setForm(INITIAL_FORM);
      setShowForm(false);
      await fetchMeetings();
    } catch (e) {
      setFormError(e.response?.data?.message || e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'LIVE': return 'badge badge-live';
      case 'SCHEDULED': return 'badge badge-scheduled';
      case 'ENDED': return 'badge badge-ended';
      case 'CANCELLED': return 'badge badge-cancelled';
      default: return 'badge';
    }
  };

  const formatDateTime = (iso) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleString();
  };

  if (!isAdmin) {
    return (
      <div className="admin-meetings-page">
        <p className="status-message">You do not have permission to access this page.</p>
      </div>
    );
  }

  return (
    <div className="admin-meetings-page">
      <div className="page-header">
        <h2>Meetings</h2>
        <button className="btn btn-primary" onClick={() => setShowForm((v) => !v)}>
          <Plus size={16} /> {showForm ? 'Cancel' : 'Schedule Meeting'}
        </button>
      </div>

      {showForm && (
        <form className="create-form" onSubmit={handleSubmit} style={{ background: '#f9fafb', padding: '1.5rem', borderRadius: '8px', marginBottom: '2rem', border: '1px solid #e5e7eb' }}>
          <h3><Video size={16} /> Schedule New Meeting</h3>
          <div className="form-row" style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
            <label className="field-full" style={{ flex: 1 }}>
              Title
              <input
                name="title"
                value={form.title}
                onChange={handleChange}
                placeholder="e.g. Math Lecture 1"
                required
                style={{ width: '100%', padding: '8px', marginTop: '4px' }}
              />
            </label>
          </div>
          <div className="form-row" style={{ marginBottom: '1rem' }}>
            <label className="field-checkbox" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="checkbox"
                name="isPublic"
                checked={form.isPublic}
                onChange={handleChange}
              />
              <Globe size={14} /> Public meeting (anyone can join)
            </label>
          </div>
          {!form.isPublic && (
            <div className="form-row" style={{ marginBottom: '1rem' }}>
              <label className="field-full" style={{ width: '100%', display: 'block' }}>
                Batch
                <select name="batchId" value={form.batchId} onChange={handleChange} required={!form.isPublic} style={{ width: '100%', padding: '8px', marginTop: '4px' }}>
                  <option value="">Select a batch...</option>
                  {batches.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </label>
            </div>
          )}
          <div className="form-row" style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
            <label style={{ flex: 1 }}>
              Start Time
              <input
                name="scheduledStart"
                type="datetime-local"
                value={form.scheduledStart}
                onChange={handleChange}
                style={{ width: '100%', padding: '8px', marginTop: '4px' }}
              />
            </label>
            <label style={{ flex: 1 }}>
              End Time
              <input
                name="scheduledEnd"
                type="datetime-local"
                value={form.scheduledEnd}
                onChange={handleChange}
                style={{ width: '100%', padding: '8px', marginTop: '4px' }}
              />
            </label>
          </div>
          {formError && <p className="form-error" style={{ color: '#dc2626', fontSize: '14px', marginBottom: '1rem' }}>{formError}</p>}
          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Creating...' : 'Create Meeting'}
            </button>
          </div>
        </form>
      )}

      {loading && <p className="status-message">Loading meetings...</p>}
      {error && <p className="status-message error">{error}</p>}

      {!loading && !error && (
        <div className="table-wrapper">
          <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', marginTop: '1rem' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '2px solid #eee' }}>
                <th style={{ padding: '12px' }}>Title</th>
                <th style={{ padding: '12px' }}>Type</th>
                <th style={{ padding: '12px' }}>Batch</th>
                <th style={{ padding: '12px' }}>Status</th>
                <th style={{ padding: '12px' }}>Start</th>
                <th style={{ padding: '12px' }}>End</th>
                <th style={{ padding: '12px' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {meetings.length === 0 ? (
                <tr>
                  <td colSpan={7} className="empty-row" style={{ textAlign: 'center', padding: '2rem', color: '#999' }}>No meetings scheduled.</td>
                </tr>
              ) : (
                meetings.map((m) => (
                  <tr key={m.id} style={{ borderBottom: '1px solid #eee' }}>
                    <td className="meeting-title" style={{ padding: '12px' }}>{m.title}</td>
                    <td style={{ padding: '12px' }}>
                      {m.is_public ? (
                        <span className="type-badge public"><Globe size={12} /> Public</span>
                      ) : (
                        <span className="type-badge batch"><Users size={12} /> Batch</span>
                      )}
                    </td>
                    <td style={{ padding: '12px' }}>{m.batch_name || '—'}</td>
                    <td style={{ padding: '12px' }}><span className={getStatusBadgeClass(m.status)}>{m.status}</span></td>
                    <td style={{ padding: '12px' }}>{formatDateTime(m.scheduled_start)}</td>
                    <td style={{ padding: '12px' }}>{formatDateTime(m.scheduled_end)}</td>
                    <td style={{ padding: '12px' }}>
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => navigate(`/meeting/${m.id}`)}
                      >
                        <Video size={14} /> Join
                      </button>
                    </td>
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
