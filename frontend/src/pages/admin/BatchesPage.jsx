import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import apiClient from '../../api/client';
import { Plus, ChevronDown, ChevronRight, Users, Settings, Check, Pencil, X } from 'lucide-react';
import './BatchesPage.css';

const INITIAL_BATCH_FORM = { name: '' };
const INITIAL_ASSIGN_FORM = { email: '' };

const SETTINGS_LABELS = {
  mailbox_enabled: 'Mailbox Access',
  student_to_student_messaging: 'Student-to-Student Messaging',
  meeting_join_enabled: 'Meeting Join',
  require_camera: 'Require Camera',
  require_microphone: 'Require Microphone',
  require_screen_share: 'Screen Share Mode'
};

const SETTINGS_DESCRIPTIONS = {
  mailbox_enabled: 'Allow students to access the internal mailbox',
  student_to_student_messaging: 'Allow students to message each other',
  meeting_join_enabled: 'Allow students to join batch meetings',
  require_camera: 'Require camera to be ON during meetings',
  require_microphone: 'Require microphone to be ON during meetings',
  require_screen_share: 'Screen sharing requirement for meetings'
};

export default function BatchesPage() {
  const { isAdmin } = useAuth();
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [batchForm, setBatchForm] = useState(INITIAL_BATCH_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);

  // Inline rename state
  const [renamingBatchId, setRenamingBatchId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameSubmitting, setRenameSubmitting] = useState(false);

  // Expanded batch detail state
  const [expandedBatchId, setExpandedBatchId] = useState(null);
  const [batchStudents, setBatchStudents] = useState([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [assignForm, setAssignForm] = useState(INITIAL_ASSIGN_FORM);
  const [assignSubmitting, setAssignSubmitting] = useState(false);
  const [assignError, setAssignError] = useState(null);

  // Settings state
  const [settings, setSettings] = useState(null);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(null);
  const [notification, setNotification] = useState(null);

  const fetchBatches = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiClient.get('/batches');
      setBatches(res.data.data);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchBatches(); }, [fetchBatches]);

  useEffect(() => {
    if (!notification) return;
    const timer = setTimeout(() => setNotification(null), 2000);
    return () => clearTimeout(timer);
  }, [notification]);

  const fetchBatchStudents = useCallback(async (batchId) => {
    try {
      setStudentsLoading(true);
      const res = await apiClient.get(`/batches/${batchId}/students`);
      setBatchStudents(res.data.data);
    } catch (e) {
      setBatchStudents([]);
    } finally {
      setStudentsLoading(false);
    }
  }, []);

  const fetchSettings = useCallback(async (batchId) => {
    try {
      setSettingsLoading(true);
      const res = await apiClient.get(`/batches/${batchId}/settings`);
      setSettings(res.data.data);
    } catch (e) {
      setSettings(null);
    } finally {
      setSettingsLoading(false);
    }
  }, []);

  const handleToggleExpand = (batchId) => {
    if (expandedBatchId === batchId) {
      setExpandedBatchId(null);
      setBatchStudents([]);
      setSettings(null);
    } else {
      setExpandedBatchId(batchId);
      fetchBatchStudents(batchId);
      fetchSettings(batchId);
      setAssignForm(INITIAL_ASSIGN_FORM);
      setAssignError(null);
    }
  };

  const handleCreateBatch = async (e) => {
    e.preventDefault();
    if (!batchForm.name.trim()) { setFormError('Batch name is required.'); return; }
    try {
      setSubmitting(true);
      setFormError(null);
      await apiClient.post('/batches', { name: batchForm.name.trim() });
      setBatchForm(INITIAL_BATCH_FORM);
      setShowForm(false);
      await fetchBatches();
    } catch (e) {
      setFormError(e.response?.data?.message || e.message);
    } finally {
      setSubmitting(false);
    }
  };

  // --- Rename batch ---
  const startRename = (e, batch) => {
    e.stopPropagation();
    setRenamingBatchId(batch.id);
    setRenameValue(batch.name);
  };

  const cancelRename = (e) => {
    e?.stopPropagation();
    setRenamingBatchId(null);
    setRenameValue('');
  };

  const handleRename = async (e, batchId) => {
    e.stopPropagation();
    if (!renameValue.trim()) return;
    try {
      setRenameSubmitting(true);
      await apiClient.patch(`/batches/${batchId}`, { name: renameValue.trim() });
      setRenamingBatchId(null);
      setNotification('Batch renamed');
      await fetchBatches();
    } catch (err) {
      setNotification('Failed to rename batch');
    } finally {
      setRenameSubmitting(false);
    }
  };

  const handleToggleStatus = async (batch) => {
    const newStatus = batch.status === 'active' ? 'inactive' : 'active';
    try {
      await apiClient.patch(`/batches/${batch.id}`, { status: newStatus });
      await fetchBatches();
    } catch (e) {
      console.error('Failed to update batch status:', e);
    }
  };

  // --- Assign student by email ---
  const handleAssignStudent = async (e) => {
    e.preventDefault();
    if (!assignForm.email.trim()) { setAssignError('Email is required.'); return; }
    try {
      setAssignSubmitting(true);
      setAssignError(null);

      // Step 1: find student by email
      const lookup = await apiClient.get('/users/students');
      const all = lookup.data.data;
      const found = all.find(s => s.email.toLowerCase() === assignForm.email.trim().toLowerCase());

      if (!found) {
        setAssignError(`No student found with email "${assignForm.email}". Create the student first under Manage Students.`);
        return;
      }

      // Step 2: assign by UUID
      await apiClient.post(`/batches/${expandedBatchId}/students`, { studentId: found.id });
      setAssignForm(INITIAL_ASSIGN_FORM);
      await fetchBatchStudents(expandedBatchId);
      await fetchBatches();
      setNotification(`${found.full_name} added to batch`);
    } catch (e) {
      setAssignError(e.response?.data?.message || e.message);
    } finally {
      setAssignSubmitting(false);
    }
  };

  // --- Settings handlers ---
  const handleToggleSetting = async (field, currentValue) => {
    try {
      setSettingsSaving(field);
      const res = await apiClient.patch(`/batches/${expandedBatchId}/settings`, { [field]: !currentValue });
      setSettings(res.data.data);
      setNotification('Settings saved');
    } catch (e) {
      console.error('Failed to update setting:', e);
    } finally {
      setSettingsSaving(null);
    }
  };

  const handleScreenShareChange = async (e) => {
    try {
      setSettingsSaving('require_screen_share');
      const res = await apiClient.patch(`/batches/${expandedBatchId}/settings`, { require_screen_share: e.target.value });
      setSettings(res.data.data);
      setNotification('Settings saved');
    } catch (e) {
      console.error('Failed to update screen share setting:', e);
    } finally {
      setSettingsSaving(null);
    }
  };

  const renderSettingsPanel = () => {
    if (settingsLoading) return <p className="status-message">Loading settings...</p>;
    if (!settings) return <p className="status-message">Settings not available.</p>;

    const booleanFields = ['mailbox_enabled', 'student_to_student_messaging', 'meeting_join_enabled', 'require_camera', 'require_microphone'];

    return (
      <div className="settings-panel">
        <h4 className="section-title"><Settings size={16} /> Batch Settings</h4>
        <div className="settings-grid">
          {booleanFields.map((field) => (
            <div key={field} className="setting-row">
              <div className="setting-info">
                <span className="setting-label">{SETTINGS_LABELS[field]}</span>
                <span className="setting-desc">{SETTINGS_DESCRIPTIONS[field]}</span>
              </div>
              <div className="setting-control">
                {isAdmin ? (
                  <button className={`toggle-switch ${settings[field] ? 'active' : ''}`} onClick={() => handleToggleSetting(field, settings[field])} disabled={settingsSaving === field}>
                    <span className="toggle-knob" />
                  </button>
                ) : (
                  <span className={`toggle-readonly ${settings[field] ? 'on' : 'off'}`}>{settings[field] ? 'ON' : 'OFF'}</span>
                )}
              </div>
            </div>
          ))}
          <div className="setting-row">
            <div className="setting-info">
              <span className="setting-label">{SETTINGS_LABELS.require_screen_share}</span>
              <span className="setting-desc">{SETTINGS_DESCRIPTIONS.require_screen_share}</span>
            </div>
            <div className="setting-control">
              {isAdmin ? (
                <select className="setting-select" value={settings.require_screen_share} onChange={handleScreenShareChange} disabled={settingsSaving === 'require_screen_share'}>
                  <option value="OPTIONAL">Optional</option>
                  <option value="REQUIRED">Required</option>
                  <option value="OFF">Off</option>
                </select>
              ) : (
                <span className="toggle-readonly on">{settings.require_screen_share}</span>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="batches-page">
      {notification && (
        <div className="notification"><Check size={14} /> {notification}</div>
      )}

      <div className="page-header">
        <h2>Batches</h2>
        {isAdmin && (
          <button className="btn btn-primary" onClick={() => setShowForm((v) => !v)}>
            <Plus size={16} /> {showForm ? 'Cancel' : 'Create Batch'}
          </button>
        )}
      </div>

      {showForm && isAdmin && (
        <form className="create-form" onSubmit={handleCreateBatch}>
          <h3><Plus size={16} /> New Batch</h3>
          <div className="form-row">
            <label>
              Batch Name
              <input name="name" value={batchForm.name} onChange={(e) => setBatchForm({ name: e.target.value })} placeholder="e.g. Cohort-1" required />
            </label>
          </div>
          {formError && <p className="form-error">{formError}</p>}
          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={submitting}>{submitting ? 'Creating...' : 'Create'}</button>
          </div>
        </form>
      )}

      {loading && <p className="status-message">Loading batches...</p>}
      {error && <p className="status-message error">{error}</p>}

      {!loading && !error && (
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 32 }}></th>
                <th>Name</th>
                <th>Status</th>
                <th>Students</th>
                <th>Created</th>
                {isAdmin && <th style={{ width: 160 }}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {batches.length === 0 ? (
                <tr><td colSpan={isAdmin ? 6 : 5} className="empty-row">No batches found.</td></tr>
              ) : (
                batches.map((b) => (
                  <React.Fragment key={b.id}>
                    <tr className="batch-row" onClick={() => renamingBatchId !== b.id && handleToggleExpand(b.id)}>
                      <td>
                        <button className="expand-btn" onClick={(e) => { e.stopPropagation(); handleToggleExpand(b.id); }}>
                          {expandedBatchId === b.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        </button>
                      </td>
                      <td className="batch-name">
                        {renamingBatchId === b.id ? (
                          <span style={{ display: 'flex', gap: '6px', alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
                            <input
                              value={renameValue}
                              onChange={(e) => setRenameValue(e.target.value)}
                              onKeyDown={(e) => { if (e.key === 'Enter') handleRename(e, b.id); if (e.key === 'Escape') cancelRename(); }}
                              autoFocus
                              style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #4f46e5', fontSize: '0.9rem' }}
                            />
                            <button className="btn btn-primary" style={{ padding: '4px 10px', fontSize: '0.8rem' }} onClick={(e) => handleRename(e, b.id)} disabled={renameSubmitting}>Save</button>
                            <button className="btn" style={{ padding: '4px 8px', fontSize: '0.8rem' }} onClick={cancelRename}><X size={14} /></button>
                          </span>
                        ) : b.name}
                      </td>
                      <td><span className={`badge badge-${b.status}`}>{b.status}</span></td>
                      <td>{b.student_count}</td>
                      <td>{new Date(b.created_at).toLocaleDateString()}</td>
                      {isAdmin && (
                        <td style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                          <button className="btn" title="Rename" onClick={(e) => startRename(e, b)}>
                            <Pencil size={14} />
                          </button>
                          <button
                            className={`btn btn-${b.status === 'active' ? 'danger' : 'success'}`}
                            style={{ fontSize: '0.75rem', padding: '4px 8px' }}
                            onClick={(e) => { e.stopPropagation(); handleToggleStatus(b); }}
                          >
                            {b.status === 'active' ? 'Deactivate' : 'Activate'}
                          </button>
                        </td>
                      )}
                    </tr>
                    {expandedBatchId === b.id && (
                      <tr key={`${b.id}-detail`}>
                        <td colSpan={isAdmin ? 6 : 5}>
                          <div className="batch-detail">
                            {renderSettingsPanel()}

                            <h4 className="section-title" style={{ marginTop: '1.5rem' }}>
                              <Users size={16} /> Assigned Students
                            </h4>

                            {isAdmin && (
                              <form className="assign-form" onSubmit={handleAssignStudent}>
                                <label>
                                  Student Email
                                  <input
                                    name="email"
                                    type="email"
                                    value={assignForm.email}
                                    onChange={(e) => setAssignForm({ email: e.target.value })}
                                    placeholder="student@example.com"
                                  />
                                </label>
                                <button type="submit" className="btn btn-primary" disabled={assignSubmitting}>
                                  {assignSubmitting ? 'Assigning...' : 'Assign'}
                                </button>
                                {assignError && <p className="form-error">{assignError}</p>}
                              </form>
                            )}

                            {studentsLoading ? (
                              <p className="status-message">Loading students...</p>
                            ) : batchStudents.length === 0 ? (
                              <p className="status-message">No students assigned to this batch.</p>
                            ) : (
                              <table className="data-table inner-table">
                                <thead>
                                  <tr>
                                    <th>Name</th>
                                    <th>Email</th>
                                    <th>Assigned At</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {batchStudents.map((s) => (
                                    <tr key={s.id}>
                                      <td>{s.full_name}</td>
                                      <td>{s.email}</td>
                                      <td>{new Date(s.assigned_at).toLocaleString()}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
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
