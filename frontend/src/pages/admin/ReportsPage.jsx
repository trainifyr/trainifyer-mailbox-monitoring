import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import apiClient from '../../api/client';
import { Link } from 'react-router-dom';
import { 
  BarChart3, 
  Clock, 
  CheckCircle, 
  AlertTriangle, 
  XCircle, 
  Download, 
  Search, 
  RefreshCcw,
  Calendar,
  Filter,
  ChevronDown,
  ChevronUp,
  FileSpreadsheet
} from 'lucide-react';

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return `${dd}/${mm}/${yy}, ${time}`;
}

export default function ReportsPage() {
  const { isAdmin } = useAuth();

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

  // Filter options
  const [batches, setBatches] = useState([]);
  const [students, setStudents] = useState([]);

  // Sort state
  const [sortField, setSortField] = useState('joined_at');
  const [sortDir, setSortDir] = useState('desc');

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

  const SortIcon = ({ field }) => {
    if (sortField !== field) return <ChevronDown size={14} style={{ opacity: 0.3 }} />;
    return sortDir === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />;
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

  if (!isAdmin) return <div className="card" style={{ padding: '4rem', textAlign: 'center' }}>Admin access required.</div>;

  const { summary, series } = report || {};

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <header style={{ marginBottom: '2.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '2.25rem', marginBottom: '0.25rem' }}>Attendance Intelligence</h1>
          <p style={{ color: 'var(--text-muted)' }}>Deep dive into participant engagement across your training ecosystem.</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
           <button className="btn btn-ghost" onClick={fetchReport} style={{ border: '1px solid var(--border)' }}>
             <RefreshCcw size={18} /> Sync Data
           </button>
           <button className="btn btn-primary" onClick={handleExport} disabled={!sortedDetails.length}>
             <FileSpreadsheet size={18} /> Export Results
           </button>
        </div>
      </header>

      {/* Advanced Filter Panel */}
      <div className="card" style={{ padding: '1.5rem', marginBottom: '2.5rem', background: 'var(--border-light)', border: '1px solid var(--border)' }}>
         <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem', color: 'var(--text-heading)', fontWeight: 600, fontSize: '0.875rem' }}>
            <Filter size={16} /> Filters & Parameters
         </div>
         <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1.25rem' }}>
            <div className="input-group" style={{ marginBottom: 0 }}>
               <label className="label" style={{ fontSize: '0.7rem' }}>From Date</label>
               <input type="date" className="input" style={{ background: 'var(--bg-card)', fontSize: '0.8125rem' }} value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            </div>
            <div className="input-group" style={{ marginBottom: 0 }}>
               <label className="label" style={{ fontSize: '0.7rem' }}>To Date</label>
               <input type="date" className="input" style={{ background: 'var(--bg-card)', fontSize: '0.8125rem' }} value={toDate} onChange={(e) => setToDate(e.target.value)} />
            </div>
            <div className="input-group" style={{ marginBottom: 0 }}>
               <label className="label" style={{ fontSize: '0.7rem' }}>Time Scale</label>
               <select className="input" style={{ background: 'var(--bg-card)', fontSize: '0.8125rem' }} value={granularity} onChange={(e) => setGranularity(e.target.value)}>
                 <option value="daily">Daily View</option>
                 <option value="weekly">Weekly Rollup</option>
                 <option value="monthly">Monthly Aggregate</option>
               </select>
            </div>
            <div className="input-group" style={{ marginBottom: 0 }}>
               <label className="label" style={{ fontSize: '0.7rem' }}>Status</label>
               <select className="input" style={{ background: 'var(--bg-card)', fontSize: '0.8125rem' }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                 <option value="">All Statuses</option>
                 <option value="PRESENT">Present</option>
                 <option value="PARTIAL">Partial</option>
                 <option value="ABSENT">Absent</option>
               </select>
            </div>
            <div className="input-group" style={{ marginBottom: 0 }}>
               <label className="label" style={{ fontSize: '0.7rem' }}>Batch</label>
               <select className="input" style={{ background: 'var(--bg-card)', fontSize: '0.8125rem' }} value={batchId} onChange={(e) => setBatchId(e.target.value)}>
                 <option value="">All Batches</option>
                 {batches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
               </select>
            </div>
         </div>
      </div>

      {loading && (
        <div style={{ marginTop: '2rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.25rem', marginBottom: '3rem' }}>
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="card" style={{ padding: '1.25rem' }}>
                <div className="skeleton-block" style={{ width: '35%', marginBottom: '1.25rem', height: '0.85rem' }}></div>
                <div className="skeleton-block" style={{ width: '55%', height: '1.75rem' }}></div>
              </div>
            ))}
          </div>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '1.5rem' }}>
              <div className="skeleton-block" style={{ width: '15%', marginBottom: '1.5rem', height: '1.25rem' }}></div>
              <div className="skeleton-block" style={{ marginBottom: '0.75rem', height: '2.25rem' }}></div>
              <div className="skeleton-block" style={{ marginBottom: '0.75rem', height: '2.25rem' }}></div>
              <div className="skeleton-block" style={{ height: '2.25rem' }}></div>
            </div>
          </div>
        </div>
      )}
      
      {!loading && !error && report && (
        <>
          {/* Summary KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.25rem', marginBottom: '3rem' }}>
            <div className="card" style={{ padding: '1.25rem', borderLeft: '4px solid var(--primary)' }}>
               <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', marginBottom: '0.5rem' }}>Active Sessions</div>
               <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-heading)' }}>{summary.total_sessions}</div>
            </div>
            <div className="card" style={{ padding: '1.25rem', borderLeft: '4px solid #10b981' }}>
               <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', marginBottom: '0.5rem' }}>Engagement Level</div>
               <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-heading)' }}>{Math.round(summary.average_percentage)}%</div>
            </div>
            <div className="card" style={{ padding: '1.25rem', borderLeft: '4px solid #10b981' }}>
               <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', marginBottom: '0.5rem' }}>Present</div>
               <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-heading)' }}>{summary.present_count}</div>
            </div>
            <div className="card" style={{ padding: '1.25rem', borderLeft: '4px solid #f59e0b' }}>
               <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', marginBottom: '0.5rem' }}>Partial / Away</div>
               <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-heading)' }}>{summary.partial_count}</div>
            </div>
            <div className="card" style={{ padding: '1.25rem', borderLeft: '4px solid #ef4444' }}>
               <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', marginBottom: '0.5rem' }}>No Show</div>
               <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-heading)' }}>{summary.absent_count}</div>
            </div>
          </div>

          {/* Time Analysis Area */}
          {series && series.length > 0 && (
            <div style={{ marginBottom: '3.5rem' }}>
               <h2 style={{ fontSize: '1.5rem', marginBottom: '1.5rem' }}>Temporal Trends ({granularity})</h2>
               <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
                  {series.map((s) => (
                    <div key={s.period} className="card" style={{ padding: '1.25rem' }}>
                       <div style={{ fontWeight: 700, color: 'var(--text-heading)', marginBottom: '1rem', paddingBottom: '0.5rem', borderBottom: '1px solid var(--border)' }}>{s.period}</div>
                       <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                         <span>{s.sessions} Sessions</span>
                         <span style={{ fontWeight: 600, color: '#10b981' }}>{Math.round(s.average_percentage)}% Enrolled</span>
                       </div>
                       <div style={{ display: 'flex', height: '6px', borderRadius: '3px', overflow: 'hidden', background: 'var(--border-light)' }}>
                          <div style={{ flex: s.present_count, background: '#10b981' }} />
                          <div style={{ flex: s.partial_count, background: '#f59e0b' }} />
                          <div style={{ flex: s.absent_count, background: '#ef4444' }} />
                       </div>
                    </div>
                  ))}
               </div>
            </div>
          )}

          {/* Master Detail Table */}
          <section>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
               <h2 style={{ fontSize: '1.5rem' }}>Detailed Audit Log</h2>
               <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Showing {sortedDetails.length} validated records</div>
            </div>
            
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
               <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
                  <table>
                    <thead>
                      <tr>
                        <th onClick={() => handleSort('user_name')} style={{ cursor: 'pointer' }}>Student <SortIcon field="user_name" /></th>
                        <th onClick={() => handleSort('meeting_title')} style={{ cursor: 'pointer' }}>Session <SortIcon field="meeting_title" /></th>
                        <th onClick={() => handleSort('batch_name')} style={{ cursor: 'pointer' }}>Context <SortIcon field="batch_name" /></th>
                        <th onClick={() => handleSort('joined_at')} style={{ cursor: 'pointer' }}>Timestamp <SortIcon field="joined_at" /></th>
                        <th onClick={() => handleSort('attendance_percentage')} style={{ cursor: 'pointer', textAlign: 'center' }}>% <SortIcon field="attendance_percentage" /></th>
                        <th onClick={() => handleSort('status')} style={{ cursor: 'pointer', textAlign: 'right' }}>Status <SortIcon field="status" /></th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedDetails.map((d) => (
                        <tr key={d.attendance_log_id}>
                          <td>
                            {d.user_id ? (
                              <Link to={`/admin/students/${d.user_id}/attendance`} style={{ fontWeight: 600, color: 'var(--primary)', textDecoration: 'none' }}>
                                {d.user_name || d.external_name}
                              </Link>
                            ) : (
                              <span style={{ fontWeight: 600, color: 'var(--text-heading)' }}>{d.external_name || '—'}</span>
                            )}
                          </td>
                          <td style={{ fontSize: '0.875rem' }}>{d.meeting_title}</td>
                          <td>
                            {d.batch_id ? (
                              <Link to={`/admin/batches/${d.batch_id}`} style={{ textDecoration: 'none' }}>
                                <span className="badge badge-admin" style={{ textTransform: 'none', cursor: 'pointer' }}>{d.batch_name || 'Unnamed'}</span>
                              </Link>
                            ) : (
                              <span className="badge badge-admin" style={{ textTransform: 'none' }}>{d.batch_name || 'Public'}</span>
                            )}
                          </td>
                          <td style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>{formatDate(d.joined_at)}</td>
                          <td style={{ textAlign: 'center', fontWeight: 700 }}>
                            {d.status === 'ABSENT' || !d.attendance_percentage ? '—' : `${Math.round(d.attendance_percentage)}%`}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <span className={`badge ${
                              d.status === 'PRESENT' ? 'badge-student' : 
                              d.status === 'PARTIAL' ? 'badge-admin' : ''
                            }`} style={{ 
                              background: d.status === 'ABSENT' ? '#fee2e2' : '',
                              color: d.status === 'ABSENT' ? '#ef4444' : ''
                            }}>
                              {d.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
               </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
