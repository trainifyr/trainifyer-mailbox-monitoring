import { useState, useEffect, useCallback } from 'react';
import { useMockIdentity } from '../../context/MockIdentityContext';
import apiClient from '../../api/client';
import { Plus, ChevronDown, ChevronRight, Users } from 'lucide-react';
import './BatchesPage.css';

const INITIAL_BATCH_FORM = { name: '' };
const INITIAL_ASSIGN_FORM = { studentId: '' };

export default function BatchesPage() {
  const { isAdmin } = useMockIdentity();
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [batchForm, setBatchForm] = useState(INITIAL_BATCH_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);

  // Expanded batch detail state
  const [expandedBatchId, setExpandedBatchId] = useState(null);
  const [batchStudents, setBatchStudents] = useState([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [assignForm, setAssignForm] = useState(INITIAL_ASSIGN_FORM);
  const [assignSubmitting, setAssignSubmitting] = useState(false);
  const [assignError, setAssignError] = useState(null);

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

  useEffect(() => {
    fetchBatches();
  }, [fetchBatches]);

  const fetchBatchStudents = useCallback(async (batchId) => {
    try {
      setStudentsLoading(true);
      const res = await apiClient.get(`/batches/${batchId}/students`);
      setBatchStudents(res.data.data);
    } catch (e) {
      console.error('Failed to fetch batch students:', e);
      setBatchStudents([]);
    } finally {
      setStudentsLoading(false);
    }
  }, []);

  const handleToggleExpand = (batchId) => {
    if (expandedBatchId === batchId) {
      setExpandedBatchId(null);
      setBatchStudents([]);
    } else {
      setExpandedBatchId(batchId);
      fetchBatchStudents(batchId);
      setAssignForm(INITIAL_ASSIGN_FORM);
      setAssignError(null);
    }
  };

  const handleBatchFormChange = (e) => {
    setBatchForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleCreateBatch = async (e) => {
    e.preventDefault();
    if (!batchForm.name) {
      setFormError('Batch name is required.');
      return;
    }
    try {
      setSubmitting(true);
      setFormError(null);
      await apiClient.post('/batches', { name: batchForm.name });
      setBatchForm(INITIAL_BATCH_FORM);
      setShowForm(false);
      await fetchBatches();
    } catch (e) {
      setFormError(e.response?.data?.message || e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (batch) => {
    const newStatus = batch.status === 'active' ? 'inactive' : 'active';
    try {
      await apiClient.patch(`/batches/${batch.id}`, { status: newStatus });
      await fetchBatches();
      if (expandedBatchId === batch.id) {
        setBatchStudents([]);
        await fetchBatchStudents(batch.id);
      }
    } catch (e) {
      console.error('Failed to update batch status:', e);
    }
  };

  const handleAssignFormChange = (e) => {
    setAssignForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleAssignStudent = async (e) => {
    e.preventDefault();
    if (!assignForm.studentId) {
      setAssignError('Student ID is required.');
      return;
    }
    try {
      setAssignSubmitting(true);
      setAssignError(null);
      await apiClient.post(`/batches/${expandedBatchId}/students`, {
        studentId: assignForm.studentId
      });
      setAssignForm(INITIAL_ASSIGN_FORM);
      await fetchBatchStudents(expandedBatchId);
      await fetchBatches(); // Refresh to update student counts
    } catch (e) {
      setAssignError(e.response?.data?.message || e.message);
    } finally {
      setAssignSubmitting(false);
    }
  };

  return (
    <div className="batches-page">
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
              <input
                name="name"
                value={batchForm.name}
                onChange={handleBatchFormChange}
                placeholder="e.g. Cohort-1"
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
                {isAdmin && <th style={{ width: 100 }}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {batches.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 6 : 5} className="empty-row">No batches found.</td>
                </tr>
              ) : (
                batches.map((b) => (
                  <>
                    <tr key={b.id} className="batch-row" onClick={() => handleToggleExpand(b.id)}>
                      <td>
                        <button
                          className="expand-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleExpand(b.id);
                          }}
                        >
                          {expandedBatchId === b.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        </button>
                      </td>
                      <td className="batch-name">{b.name}</td>
                      <td>
                        <span className={`badge badge-${b.status}`}>{b.status}</span>
                      </td>
                      <td>{b.student_count}</td>
                      <td>{new Date(b.created_at).toLocaleDateString()}</td>
                      {isAdmin && (
                        <td>
                          <button
                            className={`btn btn-${b.status === 'active' ? 'danger' : 'success'}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleStatus(b);
                            }}
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
                            <h4><Users size={16} /> Assigned Students</h4>

                            {isAdmin && (
                              <form className="assign-form" onSubmit={handleAssignStudent}>
                                <label>
                                  Student UUID
                                  <input
                                    name="studentId"
                                    value={assignForm.studentId}
                                    onChange={handleAssignFormChange}
                                    placeholder="Paste student UUID"
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
                  </>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
