import React, { useState, useEffect, useCallback } from 'react';
import { useMockIdentity } from '../../context/MockIdentityContext';
import apiClient from '../../api/client';
import { BarChart3, Clock, CheckCircle, AlertTriangle, XCircle, Download, Search } from 'lucide-react';
import './ReportsPage.css';

export default function ReportsPage() {
  const { isAdmin } = useMockIdentity();

  // Filters
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [granularity, setGranularity] = useState('daily');
  const [statusFilter, setStatusFilter] = useState('');
  const [batchId, setBatchId] = useState('');
  const [userId, setUserId] = useState('');

  // Data
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Batch/user lists for filter dropdowns
  const [batches, setBatches] = useState([]);
  const [students, setStudents] = useState([]);

  // Sort state
  const [sortField, setSortField] = useState('joined_at');
  const [sortDir, setSortDir] = useState('desc');

  // Fetch filter options (batches + students)
  useEffect(() => {
    if (!isAdmin) return;
    Promise.all([
      apiClient.get('/batches'),
      apiClient.get('/users/students')
    ]).then(([bRes, sRes]) => {
      setBatches(bRes.data.data || []);
      setStudents(sRes.data.data || []);
    }).catch(() => {});
  }, [isAdmin]);

  // Fetch report data
  const fetchReport = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = { granularity };
      if (fromDate) params.fromDate = fromDate;
      if (toDate) params.toDate = toDate;
      if (statusFilter) params.status = statusFilter;
      if (batchId) params.batchId = batchId;
      if (userId) params.userId = userId;

      const res = await apiClient.get('/reports/attendance', { params });
      setReport(res.data.data);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate, granularity, statusFilter, batchId, userId]);

  useEffect(() => {
    if (isAdmin) fetchReport();
  }, [fetchReport, isAdmin]);

  // Sort details
  const sortedDetails = report?.details
    ? [...report.details].sort((a, b) => {
        let aVal = a[sortField];
        let bVal = b[sortField];
        if (typeof aVal === 'string') {
          aVal = aVal.toLowerCase();
          bVal = (bVal || '').toLowerCase();
        }
        if (aVal == null) return 1;
        if (bVal == null) return -1;
        if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
        return 0;
      })
    : [];

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const sortArrow = (field) => {
    if (sortField !== field) return '';
    return sortDir === 'asc' ? ' ▲' : ' ▼';
  };

  const handleExport = () => {
    if (!sortedDetails.length) return;
    const headers = ['Student', 'Meeting', 'Batch', 'Joined', 'Left', 'Duration (min)', 'Attendance %', 'Status'];
    const rows = sortedDetails.map((d) => [
      d.user_name || d.external_name || '—',
      d.meeting_title,
      d.batch_name || 'Public',
      d.joined_at ? new Date(d.joined_at).toLocaleString() : '—',
      d.left_at ? new Date(d.left_at).toLocaleString() : '—',
      d.total_minutes != null ? Math.round(d.total_minutes) : '—',
      d.attendance_percentage != null ? Math.round(d.attendance_percentage) : '—',
      d.status || '—'
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.map((c) => `"${c}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `attendance-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!isAdmin) {
    return (
      <div className="students-page">
        <p className="status-message">Admin access required.</p>
      </div>
    );
  }

  const { summary, series } = report || {};

  return (
    <div className="students-page">
      <div className="page-header">
        <h2>Attendance Reports</h2>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-secondary" onClick={fetchReport} disabled={loading}>
            <Search size={16} /> Refresh
          </button>
          <button className="btn btn-primary" onClick={handleExport} disabled={!sortedDetails.length}>
            <Download size={16} /> Export CSV
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="reports-filter-bar">
        <div className="filter-group">
          <label>From</label>
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </div>
        <div className="filter-group">
          <label>To</label>
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </div>
        <div className="filter-group">
          <label>Period</label>
          <select value={granularity} onChange={(e) => setGranularity(e.target.value)}>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </div>
        <div className="filter-group">
          <label>Status</label>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All</option>
            <option value="PRESENT">Present</option>
            <option value="PARTIAL">Partial</option>
            <option value="ABSENT">Absent</option>
          </select>
        </div>
        <div className="filter-group">
          <label>Batch</label>
          <select value={batchId} onChange={(e) => setBatchId(e.target.value)}>
            <option value="">All Batches</option>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <label>Student</label>
          <select value={userId} onChange={(e) => setUserId(e.target.value)}>
            <option value="">All Students</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>{s.full_name}</option>
            ))}
          </select>
        </div>
      </div>

      {loading && <p className="status-message">Loading report...</p>}
      {error && <p className="status-message error">{error}</p>}

      {!loading && !error && report && (
        <>
          {/* Summary KPI cards */}
          <div className="kpi-grid">
            <div className="kpi-card" style={{ borderTop: '3px solid #2563eb' }}>
              <div className="kpi-icon" style={{ color: '#2563eb' }}><BarChart3 size={22} /></div>
              <div className="kpi-value">{summary.total_sessions}</div>
              <div className="kpi-label">Total Sessions</div>
            </div>
            <div className="kpi-card" style={{ borderTop: '3px solid #16a34a' }}>
              <div className="kpi-icon" style={{ color: '#16a34a' }}><Clock size={22} /></div>
              <div className="kpi-value">{Math.round(summary.total_minutes)}m</div>
              <div className="kpi-label">Total Minutes</div>
            </div>
            <div className="kpi-card" style={{ borderTop: '3px solid #d97706' }}>
              <div className="kpi-icon" style={{ color: '#d97706' }}><BarChart3 size={22} /></div>
              <div className="kpi-value">{Math.round(summary.average_percentage)}%</div>
              <div className="kpi-label">Avg Attendance</div>
            </div>
            <div className="kpi-card" style={{ borderTop: '3px solid #16a34a' }}>
              <div className="kpi-icon" style={{ color: '#16a34a' }}><CheckCircle size={22} /></div>
              <div className="kpi-value">{summary.present_count}</div>
              <div className="kpi-label">Present</div>
            </div>
            <div className="kpi-card" style={{ borderTop: '3px solid #d97706' }}>
              <div className="kpi-icon" style={{ color: '#d97706' }}><AlertTriangle size={22} /></div>
              <div className="kpi-value">{summary.partial_count}</div>
              <div className="kpi-label">Partial</div>
            </div>
            <div className="kpi-card" style={{ borderTop: '3px solid #dc2626' }}>
              <div className="kpi-icon" style={{ color: '#dc2626' }}><XCircle size={22} /></div>
              <div className="kpi-value">{summary.absent_count}</div>
              <div className="kpi-label">Absent</div>
            </div>
          </div>

          {/* Time series cards */}
          {series && series.length > 0 && (
            <>
              <h3 style={{ margin: '2rem 0 1rem' }}>
                Attendance Over Time ({granularity})
              </h3>
              <div className="series-grid">
                {series.map((s) => (
                  <div key={s.period} className="series-card">
                    <div className="series-period">{s.period}</div>
                    <div className="series-stats">
                      <span>{s.sessions} sessions</span>
                      <span>{Math.round(s.total_minutes)}m</span>
                      <span>{Math.round(s.average_percentage)}%</span>
                    </div>
                    <div className="series-bar">
                      {s.present_count > 0 && (
                        <div className="series-bar-segment present" style={{ flex: s.present_count }} title={`Present: ${s.present_count}`} />
                      )}
                      {s.partial_count > 0 && (
                        <div className="series-bar-segment partial" style={{ flex: s.partial_count }} title={`Partial: ${s.partial_count}`} />
                      )}
                      {s.absent_count > 0 && (
                        <div className="series-bar-segment absent" style={{ flex: s.absent_count }} title={`Absent: ${s.absent_count}`} />
                      )}
                    </div>
                    <div className="series-counts">
                      <span style={{ color: '#16a34a' }}>{s.present_count}</span>
                      <span style={{ color: '#d97706' }}>{s.partial_count}</span>
                      <span style={{ color: '#dc2626' }}>{s.absent_count}</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Detail table */}
          <h3 style={{ margin: '2rem 0 1rem' }}>Attendance Details</h3>
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th onClick={() => handleSort('user_name')} className="sortable">
                    Student{sortArrow('user_name')}
                  </th>
                  <th onClick={() => handleSort('meeting_title')} className="sortable">
                    Meeting{sortArrow('meeting_title')}
                  </th>
                  <th onClick={() => handleSort('batch_name')} className="sortable">
                    Batch{sortArrow('batch_name')}
                  </th>
                  <th onClick={() => handleSort('joined_at')} className="sortable">
                    Joined{sortArrow('joined_at')}
                  </th>
                  <th onClick={() => handleSort('total_minutes')} className="sortable">
                    Duration{sortArrow('total_minutes')}
                  </th>
                  <th onClick={() => handleSort('attendance_percentage')} className="sortable">
                    %{sortArrow('attendance_percentage')}
                  </th>
                  <th onClick={() => handleSort('status')} className="sortable">
                    Status{sortArrow('status')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedDetails.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="empty-row">No attendance records match the current filters.</td>
                  </tr>
                ) : (
                  sortedDetails.map((d) => (
                    <tr key={d.attendance_log_id}>
                      <td>{d.user_name || d.external_name || '—'}</td>
                      <td>{d.meeting_title}</td>
                      <td>{d.batch_name || 'Public'}</td>
                      <td>{d.joined_at ? new Date(d.joined_at).toLocaleString() : '—'}</td>
                      <td>{d.total_minutes != null ? `${Math.round(d.total_minutes)}m` : '—'}</td>
                      <td>{d.attendance_percentage != null ? `${Math.round(d.attendance_percentage)}%` : '—'}</td>
                      <td>
                        <span className={`badge badge-${(d.status || '').toLowerCase()}`}>
                          {d.status || '—'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <p className="status-message" style={{ fontSize: '13px', textAlign: 'right' }}>
            Showing {sortedDetails.length} of {report.filters ? 'filtered' : ''} records
          </p>
        </>
      )}
    </div>
  );
}
