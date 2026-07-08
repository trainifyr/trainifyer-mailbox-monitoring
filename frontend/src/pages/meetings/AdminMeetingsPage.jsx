import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import apiClient from '../../api/client';
import { Plus, Video, Calendar, Globe, Users, RefreshCw } from 'lucide-react';
import './AdminMeetingsPage.css';

const INITIAL_FORM = {
  title: '',
  batchId: '',
  isPublic: false,
  scheduledStart: '',
  scheduledEnd: '',
  isRecurring: false,
  recurStartTime: '',
  recurEndTime: ''
};

export default function AdminMeetingsPage() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);
  const [batches, setBatches] = useState([]);

  const [editingMeetingId, setEditingMeetingId] = useState(null);

  const fetchMeetings = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      setError(null);
      const res = await apiClient.get('/meetings');
      setMeetings(res.data.data);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      if (!silent) setLoading(false);
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

    const interval = setInterval(() => {
      fetchMeetings(true);
    }, 30000);

    return () => clearInterval(interval);
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
    // When enabling recurring, clear one-off times
    if (name === 'isRecurring' && checked) {
      setForm((prev) => ({ ...prev, isRecurring: true, scheduledStart: '', scheduledEnd: '' }));
    }
    // When disabling recurring, clear recur times
    if (name === 'isRecurring' && !checked) {
      setForm((prev) => ({ ...prev, isRecurring: false, recurStartTime: '', recurEndTime: '' }));
    }
  };

  const handleEdit = (m) => {
    setEditingMeetingId(m.id);
    setShowForm(true);
    setForm({
      title: m.title,
      batchId: m.batch_id || '',
      isPublic: m.is_public,
      // Convert ISO back to browser local format "YYYY-MM-DDTHH:mm" for datetime-local inputs
      scheduledStart: m.scheduled_start ? new Date(m.scheduled_start).toISOString().slice(0, 16) : '',
      scheduledEnd: m.scheduled_end ? new Date(m.scheduled_end).toISOString().slice(0, 16) : '',
      isRecurring: m.is_recurring,
      recurStartTime: m.recur_start_time ? m.recur_start_time.slice(0, 5) : '',
      recurEndTime: m.recur_end_time ? m.recur_end_time.slice(0, 5) : ''
    });
  };

  const handleCancelEdit = () => {
    setEditingMeetingId(null);
    setForm(INITIAL_FORM);
    setShowForm(false);
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

    // Helper to format local datetime-local to ISO with timezone
    const toISODate = (val) => {
      if (!val) return null;
      return new Date(val).toISOString();
    };

    const payload = {
      title: form.title,
      isPublic: form.isPublic,
      batchId: form.isPublic ? null : form.batchId,
      scheduledStart: form.isRecurring ? null : toISODate(form.scheduledStart),
      scheduledEnd: form.isRecurring ? null : toISODate(form.scheduledEnd),
      isRecurring: form.isRecurring,
      recurStartTime: form.isRecurring ? form.recurStartTime : null,
      recurEndTime: form.isRecurring ? form.recurEndTime : null
    };

    try {
      setSubmitting(true);
      setFormError(null);
      if (editingMeetingId) {
        await apiClient.patch(`/meetings/${editingMeetingId}`, payload);
        setEditingMeetingId(null);
      } else {
        await apiClient.post('/meetings', payload);
      }
      setForm(INITIAL_FORM);
      setShowForm(false);
      await fetchMeetings();
    } catch (e) {
      setFormError(e.response?.data?.message || e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleEndMeeting = async (id) => {
    if (!window.confirm('Are you sure you want to end this meeting?')) return;
    try {
      await apiClient.patch(`/meetings/${id}`, { status: 'ENDED' });
      await fetchMeetings();
    } catch (e) {
      alert(e.response?.data?.message || e.message);
    }
  };

  const handleCancelMeeting = async (id) => {
    if (!window.confirm('Are you sure you want to cancel this meeting?')) return;
    try {
      await apiClient.patch(`/meetings/${id}`, { status: 'CANCELLED' });
      await fetchMeetings();
    } catch (e) {
      alert(e.response?.data?.message || e.message);
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

  const formatRecurTime = (t) => {
    if (!t) return '—';
    // t is like "09:00:00" from DB
    const [h, m] = t.split(':');
    const d = new Date();
    d.setHours(parseInt(h), parseInt(m));
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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
        <button className="btn btn-primary" onClick={editingMeetingId ? handleCancelEdit : (showForm ? () => setShowForm(false) : () => setShowForm(true))}>
          <Plus size={16} /> {showForm ? (editingMeetingId ? 'Cancel Edit' : 'Cancel') : 'Schedule Meeting'}
        </button>
      </div>

      {showForm && (
        <form className="create-form" onSubmit={handleSubmit} style={{ background: '#f9fafb', padding: '1.5rem', borderRadius: '8px', marginBottom: '2rem', border: '1px solid #e5e7eb' }}>
          <h3><Video size={16} /> {editingMeetingId ? 'Edit Meeting' : 'Schedule New Meeting'}</h3>
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
          {/* Recurring Toggle */}
          <div className="form-row" style={{ marginBottom: '1rem' }}>
            <label className="field-checkbox" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="checkbox"
                name="isRecurring"
                checked={form.isRecurring}
                onChange={handleChange}
              />
              <RefreshCw size={14} /> Daily recurring meeting (repeats every day)
            </label>
          </div>

          {form.isRecurring ? (
            <div className="form-row" style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
              <label style={{ flex: 1 }}>
                Daily Start Time
                <input
                  name="recurStartTime"
                  type="time"
                  value={form.recurStartTime}
                  onChange={handleChange}
                  required={form.isRecurring}
                  style={{ width: '100%', padding: '8px', marginTop: '4px' }}
                />
              </label>
              <label style={{ flex: 1 }}>
                Daily End Time
                <input
                  name="recurEndTime"
                  type="time"
                  value={form.recurEndTime}
                  onChange={handleChange}
                  required={form.isRecurring}
                  style={{ width: '100%', padding: '8px', marginTop: '4px' }}
                />
              </label>
            </div>
          ) : (
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
          )}
          {formError && <p className="form-error" style={{ color: '#dc2626', fontSize: '14px', marginBottom: '1rem' }}>{formError}</p>}
          <div className="form-actions" style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? (editingMeetingId ? 'Saving...' : 'Creating...') : (editingMeetingId ? 'Save Changes' : 'Create Meeting')}
            </button>
            {editingMeetingId && (
              <button type="button" className="btn btn-ghost" onClick={handleCancelEdit}>
                Cancel Edit
              </button>
            )}
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
                      <td className="meeting-title" style={{ padding: '12px' }}>
                        {m.is_recurring && <RefreshCw size={12} style={{ marginRight: '6px', color: '#6366f1', verticalAlign: 'middle' }} />}
                        {m.title}
                      </td>
                      <td style={{ padding: '12px' }}>
                        {m.is_public ? (
                          <span className="type-badge public"><Globe size={12} /> Public</span>
                        ) : (
                          <span className="type-badge batch"><Users size={12} /> Batch</span>
                        )}
                      </td>
                      <td style={{ padding: '12px' }}>{m.batch_name || '—'}</td>
                      <td style={{ padding: '12px' }}><span className={getStatusBadgeClass(m.status)}>{m.status}</span></td>
                      <td style={{ padding: '12px' }}>
                        {m.is_recurring ? formatRecurTime(m.recur_start_time) : formatDateTime(m.scheduled_start)}
                      </td>
                      <td style={{ padding: '12px' }}>
                        {m.is_recurring ? `${formatRecurTime(m.recur_end_time)} (daily)` : formatDateTime(m.scheduled_end)}
                      </td>
                      <td style={{ padding: '12px' }}>
                        <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={() => navigate(`/meeting/${m.id}`)}
                          >
                            <Video size={14} /> Join
                          </button>
                          {m.status !== 'ENDED' && m.status !== 'CANCELLED' && (
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() => handleEdit(m)}
                              style={{ border: '1px solid var(--border)' }}
                            >
                              Edit
                            </button>
                          )}
                          {m.status === 'LIVE' && (
                            <button
                              className="btn btn-sm btn-ghost"
                              onClick={() => handleEndMeeting(m.id)}
                              style={{ color: '#ef4444', border: '1px solid #fee2e2', background: '#fef2f2' }}
                            >
                              End
                            </button>
                          )}
                          {(m.status === 'LIVE' || m.status === 'SCHEDULED') && (
                            <button
                              className="btn btn-sm btn-ghost"
                              onClick={() => handleCancelMeeting(m.id)}
                              style={{ color: '#dc2626', border: '1px solid #fee2e2', background: '#fef2f2' }}
                            >
                              Cancel
                            </button>
                          )}
                        </div>
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
