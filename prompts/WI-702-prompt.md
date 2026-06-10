# WI-702 — Dashboards and Analytical Reports Interface

> **GitHub Issue**: #17
> **Phase**: 7 — Dashboards & Reports (Slice 6)
> **Priority**: Medium
> **Dependencies**: WI-103, WI-701
> **Project**: Trainifyer Mailbox Monitoring Platform

---

## Context

WI-701 built the backend attendance reports API (`GET /api/reports/attendance`) with summary KPIs, time-bucketed series, and detail rows. WI-103 created the React skeleton with routing and the Mock Identity Bar. But the dashboards are still placeholder components:

- `AdminDashboard.jsx` — Just says "Admin Dashboard (placeholder)"
- `StudentDashboard.jsx` — Just says "Student Dashboard (placeholder)"
- No reports page exists at all

This work item replaces the placeholders with real, data-driven dashboards and adds a new analytical reports page. The Admin gets KPI widgets, attendance overview, and quick links. The Student gets personal stats, meeting history, and attendance summary. The Reports page provides a filterable, sortable table view of all attendance data with chart-friendly summary cards.

> ⚠️ **Data Source**: All dashboard data comes from `GET /api/reports/attendance` (WI-701), which is role-scoped — Admin sees all, Student sees only their own data.

---

## Reference Documents

Before starting, read these files in the project root:

- `WORKITEMS.md` — Acceptance criteria for WI-702
- `GOALS.md` — Sub-Goal 7 (Dashboards and Analytical Reporting)
- `prompts/WI-701-prompt.md` — The backend reports API (response shape, filters)
- `frontend/src/pages/admin/AdminDashboard.jsx` — Current placeholder (replace)
- `frontend/src/pages/student/StudentDashboard.jsx` — Current placeholder (replace)
- `frontend/src/pages/admin/BatchesPage.jsx` — Existing page patterns (data fetching, loading/error states)
- `frontend/src/pages/admin/StudentsPage.css` — Shared CSS patterns (`.btn`, `.data-table`, `.badge`, `.card`)
- `frontend/src/pages/meetings/MeetingsListPage.jsx` — Card-based layout pattern
- `frontend/src/routes/AppRoutes.jsx` — Route registration pattern
- `frontend/src/pages/HomePage.jsx` — Navigation links

---

## Scope of This Work Item

### Frontend
- **Replace `AdminDashboard.jsx`** — Real dashboard with KPI cards (total students, active batches, total meetings, overall attendance %), attendance summary table (recent sessions), and quick-link navigation cards.
- **Replace `StudentDashboard.jsx`** — Personal dashboard with stats (meetings attended, total minutes, average attendance %), recent activity list, and quick links to meetings/mailbox.
- **Create `ReportsPage.jsx`** — Full analytical reports page with:
  - Summary KPI bar at top (total sessions, minutes, avg %, status breakdown).
  - Filter bar (date range, granularity toggle, status filter).
  - Sortable data table of attendance detail rows.
  - Time-series data displayed as a summary card per period.
- **Create `ReportsPage.css`** — Styling for the reports page (filter bar, KPI cards, data table).
- **Update `AppRoutes.jsx`** — Add `/admin/reports` route for the Reports page.
- **Update `HomePage.jsx`** — Add "Attendance Reports" link under Admin actions.

This is a **frontend-only** work item. No backend changes.

---

## Step-by-Step Instructions

### 1. Replace `frontend/src/pages/admin/AdminDashboard.jsx`

```jsx
import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useMockIdentity } from '../../context/MockIdentityContext';
import apiClient from '../../api/client';
import { Users, FolderOpen, Video, BarChart3, Calendar, Mail, Clock, CheckCircle, AlertTriangle, XCircle } from 'lucide-react';

// CSS is inline via the shared StudentsPage.css + page-specific styles at the bottom

export default function AdminDashboard() {
  const { isAdmin } = useMockIdentity();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchReport = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiClient.get('/reports/attendance', {
        params: { granularity: 'daily' }
      });
      setReport(res.data.data);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) fetchReport();
  }, [fetchReport, isAdmin]);

  if (!isAdmin) {
    return (
      <div className="students-page">
        <p className="status-message">Admin access required.</p>
      </div>
    );
  }

  const { summary, series, details } = report || {};

  // --- KPI card data (static + from API) ---
  const kpiCards = [
    {
      label: 'Total Sessions',
      value: summary?.total_sessions ?? '—',
      icon: <Video size={22} />,
      color: '#2563eb'
    },
    {
      label: 'Total Minutes',
      value: summary ? `${Math.round(summary.total_minutes)}m` : '—',
      icon: <Clock size={22} />,
      color: '#16a34a'
    },
    {
      label: 'Avg Attendance',
      value: summary ? `${Math.round(summary.average_percentage)}%` : '—',
      icon: <BarChart3 size={22} />,
      color: '#d97706'
    },
    {
      label: 'Present',
      value: summary?.present_count ?? '—',
      icon: <CheckCircle size={22} />,
      color: '#16a34a'
    },
    {
      label: 'Partial',
      value: summary?.partial_count ?? '—',
      icon: <AlertTriangle size={22} />,
      color: '#d97706'
    },
    {
      label: 'Absent',
      value: summary?.absent_count ?? '—',
      icon: <XCircle size={22} />,
      color: '#dc2626'
    }
  ];

  // --- Quick links ---
  const quickLinks = [
    { to: '/admin/students', label: 'Manage Students', icon: <Users size={18} />, desc: 'Add, edit, and view student profiles' },
    { to: '/admin/batches', label: 'Manage Batches', icon: <FolderOpen size={18} />, desc: 'Create cohorts and assign students' },
    { to: '/admin/meetings', label: 'Schedule Meetings', icon: <Calendar size={18} />, desc: 'Create batch and public meetings' },
    { to: '/admin/reports', label: 'Attendance Reports', icon: <BarChart3 size={18} />, desc: 'Detailed analytics and filters' },
    { to: '/mailbox', label: 'Mailbox', icon: <Mail size={18} />, desc: 'Internal messaging system' }
  ];

  return (
    <div className="students-page">
      <div className="page-header">
        <h2>Admin Dashboard</h2>
        <span className="badge badge-active" style={{ fontSize: '13px', padding: '4px 12px' }}>ADMIN</span>
      </div>

      {loading && <p className="status-message">Loading dashboard data...</p>}
      {error && <p className="status-message error">{error}</p>}

      {!loading && !error && (
        <>
          {/* KPI cards grid */}
          <div className="kpi-grid">
            {kpiCards.map((kpi) => (
              <div key={kpi.label} className="kpi-card" style={{ borderTop: `3px solid ${kpi.color}` }}>
                <div className="kpi-icon" style={{ color: kpi.color }}>{kpi.icon}</div>
                <div className="kpi-value">{kpi.value}</div>
                <div className="kpi-label">{kpi.label}</div>
              </div>
            ))}
          </div>

          {/* Quick links */}
          <h3 style={{ margin: '2rem 0 1rem' }}>Quick Actions</h3>
          <div className="quick-links-grid">
            {quickLinks.map((link) => (
              <Link key={link.to} to={link.to} className="quick-link-card">
                <div className="quick-link-icon">{link.icon}</div>
                <div>
                  <div className="quick-link-label">{link.label}</div>
                  <div className="quick-link-desc">{link.desc}</div>
                </div>
              </Link>
            ))}
          </div>

          {/* Recent attendance table */}
          {details && details.length > 0 && (
            <>
              <h3 style={{ margin: '2rem 0 1rem' }}>Recent Sessions</h3>
              <div className="table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Meeting</th>
                      <th>Batch</th>
                      <th>Duration</th>
                      <th>%</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {details.slice(0, 10).map((d) => (
                      <tr key={d.attendance_log_id}>
                        <td>{d.user_name || d.external_name || '—'}</td>
                        <td>{d.meeting_title}</td>
                        <td>{d.batch_name || 'Public'}</td>
                        <td>{d.total_minutes ? `${Math.round(d.total_minutes)}m` : '—'}</td>
                        <td>{d.attendance_percentage != null ? `${Math.round(d.attendance_percentage)}%` : '—'}</td>
                        <td>
                          <span className={`badge badge-${(d.status || '').toLowerCase()}`}>
                            {d.status || '—'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
```

### 2. Replace `frontend/src/pages/student/StudentDashboard.jsx`

```jsx
import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useMockIdentity } from '../../context/MockIdentityContext';
import apiClient from '../../api/client';
import { Video, Clock, BarChart3, Calendar, Mail, CheckCircle, AlertTriangle, XCircle, ArrowRight } from 'lucide-react';

export default function StudentDashboard() {
  const { isStudent } = useMockIdentity();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchReport = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiClient.get('/reports/attendance', {
        params: { granularity: 'daily' }
      });
      setReport(res.data.data);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isStudent) fetchReport();
  }, [fetchReport, isStudent]);

  if (!isStudent) {
    return (
      <div className="students-page">
        <p className="status-message">Student access required.</p>
      </div>
    );
  }

  const { summary, series, details } = report || {};

  const personalStats = [
    {
      label: 'Meetings Attended',
      value: summary?.total_sessions ?? '—',
      icon: <Video size={22} />,
      color: '#2563eb'
    },
    {
      label: 'Total Time',
      value: summary ? `${Math.round(summary.total_minutes)} min` : '—',
      icon: <Clock size={22} />,
      color: '#16a34a'
    },
    {
      label: 'Average Attendance',
      value: summary ? `${Math.round(summary.average_percentage)}%` : '—',
      icon: <BarChart3 size={22} />,
      color: '#d97706'
    }
  ];

  const statusBreakdown = [
    { label: 'Present', value: summary?.present_count ?? 0, color: '#16a34a', icon: <CheckCircle size={16} /> },
    { label: 'Partial', value: summary?.partial_count ?? 0, color: '#d97706', icon: <AlertTriangle size={16} /> },
    { label: 'Absent', value: summary?.absent_count ?? 0, color: '#dc2626', icon: <XCircle size={16} /> }
  ];

  return (
    <div className="students-page">
      <div className="page-header">
        <h2>My Dashboard</h2>
        <span className="badge badge-active" style={{ fontSize: '13px', padding: '4px 12px' }}>STUDENT</span>
      </div>

      {loading && <p className="status-message">Loading your stats...</p>}
      {error && <p className="status-message error">{error}</p>}

      {!loading && !error && (
        <>
          {/* Personal stats cards */}
          <div className="kpi-grid">
            {personalStats.map((stat) => (
              <div key={stat.label} className="kpi-card" style={{ borderTop: `3px solid ${stat.color}` }}>
                <div className="kpi-icon" style={{ color: stat.color }}>{stat.icon}</div>
                <div className="kpi-value">{stat.value}</div>
                <div className="kpi-label">{stat.label}</div>
              </div>
            ))}
          </div>

          {/* Status breakdown */}
          <div className="status-breakdown">
            <h3 style={{ marginBottom: '0.75rem' }}>Attendance Status</h3>
            <div className="status-bar">
              {statusBreakdown.map((s) => {
                const total = (summary?.present_count || 0) + (summary?.partial_count || 0) + (summary?.absent_count || 0);
                const pct = total > 0 ? ((s.value / total) * 100) : 0;
                return (
                  <div
                    key={s.label}
                    className="status-bar-segment"
                    style={{
                      flex: pct || 0.01,
                      background: s.color,
                      minWidth: pct > 0 ? '4px' : '0'
                    }}
                    title={`${s.label}: ${s.value} (${Math.round(pct)}%)`}
                  />
                );
              })}
            </div>
            <div className="status-legend">
              {statusBreakdown.map((s) => (
                <span key={s.label} className="status-legend-item">
                  {s.icon}
                  <span style={{ color: s.color, fontWeight: 600 }}>{s.value}</span>
                  <span>{s.label}</span>
                </span>
              ))}
            </div>
          </div>

          {/* Quick links */}
          <div className="quick-links-grid" style={{ marginTop: '2rem' }}>
            <Link to="/meetings" className="quick-link-card">
              <Calendar size={18} />
              <div>
                <div className="quick-link-label">Join a Meeting</div>
                <div className="quick-link-desc">View and join your scheduled sessions</div>
              </div>
              <ArrowRight size={16} style={{ marginLeft: 'auto', color: '#9ca3af' }} />
            </Link>
            <Link to="/mailbox" className="quick-link-card">
              <Mail size={18} />
              <div>
                <div className="quick-link-label">Mailbox</div>
                <div className="quick-link-desc">Check your messages</div>
              </div>
              <ArrowRight size={16} style={{ marginLeft: 'auto', color: '#9ca3af' }} />
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
```

### 3. Create `frontend/src/pages/admin/ReportsPage.jsx`

```jsx
import React, { useState, useEffect, useCallback } from 'react';
import { useMockIdentity } from '../../context/MockIdentityContext';
import apiClient from '../../api/client';
import { BarChart3, Clock, CheckCircle, AlertTriangle, XCircle, Download, Search } from 'lucide-react';

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
```

### 4. Create `frontend/src/pages/admin/ReportsPage.css`

```css
/* Reports filter bar */
.reports-filter-bar {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 1rem;
  margin-bottom: 1.5rem;
}

.filter-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.filter-group label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #6b7280;
}

.filter-group input,
.filter-group select {
  padding: 6px 10px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  font-size: 13px;
  min-width: 140px;
}

.filter-group input:focus,
.filter-group select:focus {
  outline: none;
  border-color: #2563eb;
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.15);
}

/* KPI grid */
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 12px;
  margin-bottom: 1rem;
}

.kpi-card {
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 1rem;
  text-align: center;
}

.kpi-icon {
  margin-bottom: 6px;
}

.kpi-value {
  font-size: 1.5rem;
  font-weight: 700;
  color: #111827;
  line-height: 1.2;
}

.kpi-label {
  font-size: 11px;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-top: 4px;
}

/* Quick links */
.quick-links-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
}

.quick-link-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 1rem;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  text-decoration: none;
  color: inherit;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.quick-link-card:hover {
  border-color: #2563eb;
  box-shadow: 0 1px 3px rgba(37, 99, 235, 0.1);
}

.quick-link-icon {
  color: #2563eb;
  display: flex;
}

.quick-link-label {
  font-weight: 600;
  font-size: 14px;
  color: #111827;
}

.quick-link-desc {
  font-size: 12px;
  color: #6b7280;
  margin-top: 2px;
}

/* Sortable table headers */
.sortable {
  cursor: pointer;
  user-select: none;
}

.sortable:hover {
  background: #e5e7eb;
}

/* Status breakdown (student dashboard) */
.status-breakdown {
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 1.25rem;
  margin: 1.5rem 0;
}

.status-bar {
  display: flex;
  height: 8px;
  border-radius: 4px;
  overflow: hidden;
  background: #e5e7eb;
}

.status-bar-segment {
  transition: flex 0.3s;
}

.status-legend {
  display: flex;
  gap: 1.5rem;
  margin-top: 0.75rem;
  font-size: 13px;
}

.status-legend-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

/* Time series cards */
.series-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px;
  margin-bottom: 1.5rem;
}

.series-card {
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 1rem;
}

.series-period {
  font-weight: 600;
  font-size: 14px;
  color: #111827;
  margin-bottom: 6px;
}

.series-stats {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: #6b7280;
  margin-bottom: 8px;
}

.series-bar {
  display: flex;
  height: 6px;
  border-radius: 3px;
  overflow: hidden;
  gap: 2px;
}

.series-bar-segment.present {
  background: #16a34a;
}

.series-bar-segment.partial {
  background: #d97706;
}

.series-bar-segment.absent {
  background: #dc2626;
}

.series-counts {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  font-weight: 600;
  margin-top: 4px;
}

/* Badge colors for attendance status */
.badge-present {
  background: #dcfce7;
  color: #16a34a;
}

.badge-partial {
  background: #fef3c7;
  color: #d97706;
}

.badge-absent {
  background: #fee2e2;
  color: #dc2626;
}

.badge-active {
  background: #dbeafe;
  color: #2563eb;
}

.badge-scheduled {
  background: #f3e8ff;
  color: #9333ea;
}

.badge-ended {
  background: #f3f4f6;
  color: #6b7280;
}

.badge-cancelled {
  background: #fee2e2;
  color: #dc2626;
}
```

### 5. Update `frontend/src/routes/AppRoutes.jsx`

Add the ReportsPage import and route:

```jsx
import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from '../components/Layout';
import HomePage from '../pages/HomePage';
import AdminDashboard from '../pages/admin/AdminDashboard';
import StudentsPage from '../pages/admin/StudentsPage';
import BatchesPage from '../pages/admin/BatchesPage';
import MailboxPage from '../pages/mailbox/MailboxPage';
import AdminMeetingsPage from '../pages/meetings/AdminMeetingsPage';
import MeetingsListPage from '../pages/meetings/MeetingsListPage';
import MeetingRoomPage from '../pages/meetings/MeetingRoomPage';
import StudentDashboard from '../pages/student/StudentDashboard';
import ReportsPage from '../pages/admin/ReportsPage';   // NEW

export default function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/admin/dashboard" element={<AdminDashboard />} />
        <Route path="/admin/students" element={<StudentsPage />} />
        <Route path="/admin/batches" element={<BatchesPage />} />
        <Route path="/admin/meetings" element={<AdminMeetingsPage />} />
        <Route path="/admin/reports" element={<ReportsPage />} />      {/* NEW */}
        <Route path="/mailbox" element={<MailboxPage />} />
        <Route path="/meetings" element={<MeetingsListPage />} />
        <Route path="/meeting/:id" element={<MeetingRoomPage />} />
        <Route path="/student/dashboard" element={<StudentDashboard />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
```

### 6. Update `frontend/src/pages/HomePage.jsx`

Add the Attendance Reports link under Admin Actions:

```jsx
import React from 'react';
import { Link } from 'react-router-dom';
import apiClient from '../api/client';

export default function HomePage() {
  const ping = async () => {
    try {
      const res = await apiClient.get('/health');
      alert('Backend Response:\n' + JSON.stringify(res.data, null, 2));
    } catch (e) {
      console.error(e);
      alert('Backend not reachable: ' + e.message);
    }
  };

  return (
    <div className="home-page">
      <h2>Welcome</h2>
      <p>Use the Mock Identity Bar at the bottom to switch roles.</p>
      
      <div style={{ margin: '2rem 0' }}>
        <h3>Admin Actions</h3>
        <nav style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <Link to="/admin/dashboard">Dashboard</Link>
          <Link to="/admin/students">Manage Students</Link>
          <Link to="/admin/batches">Manage Batches</Link>
          <Link to="/admin/meetings">Manage Meetings</Link>
          <Link to="/admin/reports">Attendance Reports</Link>
          <Link to="/mailbox">Internal Mailbox</Link>
        </nav>
      </div>

      <div style={{ margin: '2rem 0' }}>
        <h3>Student Actions</h3>
        <nav style={{ display: 'flex', gap: '1rem' }}>
          <Link to="/student/dashboard">Student Dashboard</Link>
          <Link to="/meetings">Sessions & Meetings</Link>
          <Link to="/mailbox">Internal Mailbox</Link>
        </nav>
      </div>

      <div style={{ marginTop: '3rem', borderTop: '1px solid #eee', paddingTop: '1rem' }}>
        <button 
          onClick={ping}
          style={{ padding: '8px 16px', background: '#2196f3', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
        >
          Ping /api/health
        </button>
      </div>
    </div>
  );
}
```

### 7. Verify the build

```bash
cd frontend
npm run build
```

Expected: Clean Vite build with no errors or warnings.

### 8. Manual verification

Start both backend and frontend:

```bash
# Terminal 1: Backend
cd backend
npm run dev

# Terminal 2: Frontend
cd frontend
npm run dev
```

Test each scenario:

**Admin Dashboard:**
1. Set Mock Identity Bar to **Admin**.
2. Navigate to `/admin/dashboard`.
3. **Verify**: Six KPI cards are visible (Total Sessions, Total Minutes, Avg Attendance, Present, Partial, Absent) with correct numbers from the attendance data.
4. **Verify**: Five Quick Action cards link to the correct pages.
5. **Verify**: Recent Sessions table shows the most recent attendance log rows.

**Student Dashboard:**
1. Set Mock Identity Bar to **Student**.
2. Navigate to `/student/dashboard`.
3. **Verify**: Three personal stat cards (Meetings Attended, Total Time, Average Attendance).
4. **Verify**: Status breakdown bar and legend show Present/Partial/Absent distribution.
5. **Verify**: Quick links for "Join a Meeting" and "Mailbox" are present.

**Reports Page:**
1. Set Mock Identity Bar to **Admin**.
2. Navigate to `/admin/reports`.
3. **Verify**: Filter bar shows date range, granularity, status, batch, and student dropdowns.
4. **Verify**: Six KPI summary cards match the current data.
5. **Verify**: Time-series cards (one per period) show session counts, minutes, and stacked status bars.
6. **Verify**: Attendance Details table is sortable by clicking column headers.
7. **Verify**: Apply filters and click **Refresh** — the data updates accordingly.
8. **Verify**: Click **Export CSV** — a CSV file downloads with the current filtered data.
9. Test edge case: Set date range to a period with no data. **Verify**: "No attendance records match the current filters" is shown.

---

## Expected Output (File Checklist)

### Frontend
- [ ] `frontend/src/pages/admin/AdminDashboard.jsx` — Replaced with KPI cards, quick links, recent sessions table
- [ ] `frontend/src/pages/student/StudentDashboard.jsx` — Replaced with personal stats, status breakdown, quick links
- [ ] `frontend/src/pages/admin/ReportsPage.jsx` — NEW: filterable, sortable reports page with KPI bar, time series, data table, CSV export
- [ ] `frontend/src/pages/admin/ReportsPage.css` — NEW: styling for reports page (filter bar, KPI grid, series cards, status badges, sortable headers)
- [ ] `frontend/src/routes/AppRoutes.jsx` — Added `/admin/reports` route pointing to ReportsPage
- [ ] `frontend/src/pages/HomePage.jsx` — Added "Attendance Reports" link in Admin Actions

---

## Acceptance Criteria

- Admin Dashboard shows KPI cards with `total_sessions`, `total_minutes`, `average_percentage`, and status counts from `GET /api/reports/attendance`.
- Admin Dashboard shows a table of recent attendance sessions (up to 10 rows).
- Admin Dashboard has Quick Action cards linking to Students, Batches, Meetings, Reports, and Mailbox.
- Student Dashboard shows personal stat cards (meetings attended, total minutes, average %).
- Student Dashboard shows a visual status breakdown bar with Present/Partial/Absent counts.
- Student Dashboard has quick links to Join a Meeting and Mailbox.
- Reports Page has a filter bar with: from/to date, granularity (daily/weekly/monthly), status (all/present/partial/absent), batch dropdown, student dropdown.
- Reports Page shows KPI summary cards that update when filters change.
- Reports Page shows time-series cards (one per period) with session counts and status bar.
- Reports Page shows a sortable data table (click column header to sort asc/desc).
- Reports Page "Export CSV" button downloads a CSV file of the current filtered data.
- Reports Page shows "No attendance records match the current filters" when no data matches.
- `/admin/reports` route is registered in `AppRoutes.jsx`.
- HomePage has an "Attendance Reports" link under Admin Actions.
- `npm run build` completes without errors.

---

## Component Overview

| Page | Route | Role | Key Features |
|------|-------|------|-------------|
| AdminDashboard | `/admin/dashboard` | Admin | 6 KPI cards, 5 quick-link cards, recent sessions table |
| StudentDashboard | `/student/dashboard` | Student | 3 stat cards, status breakdown bar, 2 quick links |
| ReportsPage | `/admin/reports` | Admin | Filter bar (6 controls), 6 KPI cards, time-series cards, sortable data table, CSV export |

---

## Risk / Impact

- **No pagination on details**: The ReportsPage shows all detail rows returned by the API (max 500 per WI-701). If there are more than 500 rows, only the 500 most recent are shown. Pagination (page/pageSize) can be added later.
- **CSV export is client-side**: The export function builds a CSV from the current sorted/filtered `sortedDetails` array. It does NOT fetch additional rows from the server — it only exports what's currently displayed. For large datasets with pagination, only the current page would be exported. This is acceptable for the MVP.
- **Date input uses native `<input type="date">`**: The date filter inputs use the native HTML5 date picker. The format is `YYYY-MM-DD`, which matches the API's expected `fromDate`/`toDate` format. No additional date parsing is needed.
- **Filter state is client-side only**: The selected filter values are held in React state and passed as query params to the API on Refresh. The filter state is NOT persisted in the URL query string — refreshing the browser resets filters. URL-synced filters can be added later.
- **Student Dashboard only shows attendance data**: The Student Dashboard does not show mailbox unread counts, upcoming meetings, or other personalized widgets. Those can be added in future enhancements. The MVP focuses on attendance data as specified in the acceptance criteria.
- **Admin Dashboard does not show student counts or batch counts**: The current scope only pulls data from `GET /api/reports/attendance`. Additional API calls for student/batch counts could be added but are not required by the acceptance criteria.

---

## Post-Implementation Steps (MANDATORY)

Once the file checklist and acceptance criteria are satisfied:

### 1. Update `PROGRESS.md`
- Change the status of **WI-702** from `Not Started` to `Done`.
- Set the assignee to `Antigravity`.
- Set the target date to the current date.
- Increment the `Done` and `Completion %` columns in the Phase 7 progress table.

### 2. Update `CHANGELOG.md`
Add a new entry at the top:

```
## [YYYY-MM-DD] - WI-702: Dashboards and Analytical Reports Interface
* **Work Item ID**: WI-702
* **Summary**: Built three frontend pages: Admin Dashboard (KPI cards for sessions/minutes/percentage/status, quick-link navigation cards, recent sessions table), Student Dashboard (personal stat cards, status breakdown bar with Present/Partial/Absent distribution, quick links to meetings and mailbox), and Reports Page (filterable by date range/granularity/status/batch/student, KPI summary bar, time-series period cards, sortable detail data table, CSV export). Added /admin/reports route and home page navigation link.
* **Files Affected**:
  - [MODIFIED] `frontend/src/pages/admin/AdminDashboard.jsx` (full replacement — KPI cards, quick links, recent sessions)
  - [MODIFIED] `frontend/src/pages/student/StudentDashboard.jsx` (full replacement — personal stats, status breakdown)
  - [NEW] `frontend/src/pages/admin/ReportsPage.jsx` (filterable reports with sortable table and CSV export)
  - [NEW] `frontend/src/pages/admin/ReportsPage.css` (filter bar, KPI grid, series cards, status badges, sortable headers)
  - [MODIFIED] `frontend/src/routes/AppRoutes.jsx` (added /admin/reports route)
  - [MODIFIED] `frontend/src/pages/HomePage.jsx` (added Attendance Reports link)
* **Verification Done**:
  - [x] Admin Dashboard displays 6 KPI cards with correct data
  - [x] Admin Dashboard shows recent sessions table (10 rows)
  - [x] Admin Dashboard quick links navigate correctly
  - [x] Student Dashboard displays 3 personal stat cards
  - [x] Student Dashboard shows status breakdown bar with legend
  - [x] Reports page filter bar works (date, granularity, status, batch, student)
  - [x] Reports page KPI cards update on filter refresh
  - [x] Reports page time-series cards render per period
  - [x] Reports page data table is sortable by clicking column headers
  - [x] Reports page CSV export downloads valid CSV
  - [x] Reports page shows empty state message when no data matches
  - [x] /admin/reports route works
  - [x] HomePage has Attendance Reports link
  - [x] `npm run build` completes with no errors
* **Impact on Existing Functionality**: None. Existing meeting, mailbox, student, and batch pages are unchanged.
```

### 3. Stop and Wait
Do **not** begin WI-801 in the same session. Wait for the developer to verify and trigger the next prompt.

---

## Notes for the AI Agent

- **Shared CSS classes**: The admin pages use shared CSS from `StudentsPage.css` (`.btn`, `.data-table`, `.badge`, `.status-message`, `.page-header`, `.table-wrapper`, `.form-row`, etc.). The new `ReportsPage.css` adds page-specific styles (`.reports-filter-bar`, `.kpi-grid`, `.kpi-card`, `.series-grid`, `.quick-links-grid`, `.status-breakdown`). Both CSS files are imported by their respective components.
- **`StudentsPage.css` is already imported by BatchesPage**: The shared styles are accessible globally once any component imports `StudentsPage.css` (which `BatchesPage.jsx` already does). However, to be safe, import `./ReportsPage.css` in the new `ReportsPage.jsx` — it's a separate file with its own class names.
- **KPI grid is responsive**: The `grid-template-columns: repeat(auto-fill, minmax(150px, 1fr))` pattern ensures cards wrap gracefully on smaller screens. Each card has a `minmax` of 150px.
- **Reports page fetches batch + student lists for filter dropdowns**: On mount, the component makes two initial API calls: `GET /api/batches` and `GET /api/users/students` to populate the filter dropdown options. These are fetched once (not on every filter change).
- **Filters are applied on "Refresh" click**: Unlike a "live filter" pattern that refetches on every dropdown change, this implementation requires clicking the **Refresh** button (or the Export button resets). This avoids excessive API calls when the user is adjusting multiple filters. The filter state is held in React state and passed as params only when `fetchReport` is called.
- **Sort is client-side**: The `sortedDetails` array is derived from `report.details` using `Array.sort()`. Sorting is client-side only — it does not re-fetch from the API. This is efficient for up to 500 rows (the API's limit). For larger datasets, server-side sorting would be needed.
- **CSV export uses Blob + download link**: The `handleExport` function builds a CSV string, creates a `Blob` with `text/csv` MIME type, generates an object URL, creates a temporary `<a>` element, triggers a click, then revokes the URL. The filename includes the current date: `attendance-report-YYYY-MM-DD.csv`.
- **Badge classes for attendance status**: The ReportsPage and AdminDashboard use `badge-present`, `badge-partial`, `badge-absent` CSS classes defined in `ReportsPage.css`. These match the `attendance_status` enum values in lowercase.
- **Student Dashboard `isStudent` check**: The StudentDashboard uses `isStudent` from `useMockIdentity()`. This is `identity.role === 'STUDENT'`. If a non-student accesses `/student/dashboard`, they see "Student access required."
- **Do not modify backend files**: This is a frontend-only work item. Do not touch `backend/` files.
