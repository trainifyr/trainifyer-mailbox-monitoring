import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import apiClient from '../../api/client';
import { Video, Calendar, Globe, Users, Clock } from 'lucide-react';
import './MeetingsListPage.css';

export default function MeetingsListPage() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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

  useEffect(() => {
    if (isAuthenticated) {
      fetchMeetings();
    }
  }, [fetchMeetings, isAuthenticated]);

  const getEffectiveStatus = (m) => {
    if (m.status === 'CANCELLED') return 'CANCELLED';
    if (m.status === 'ENDED') return 'ENDED';
    if (m.scheduled_end && new Date() > new Date(m.scheduled_end)) return 'ENDED';
    return m.status || 'SCHEDULED';
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

  const formatTimeRange = (start, end) => {
    if (!start) return '—';
    const s = new Date(start);
    const options = { hour: 'numeric', minute: '2-digit', hour12: true };
    const dateStr = s.toLocaleDateString();
    const startStr = s.toLocaleTimeString([], options);
    
    if (!end) return `${dateStr}, ${startStr}`;
    
    const e = new Date(end);
    const endStr = e.toLocaleTimeString([], options);
    return `${dateStr}, ${startStr} - ${endStr}`;
  };

  if (!isAuthenticated) {
    return (
      <div className="meetings-list-page">
        <p className="status-message">Please select a role in the Mock Identity Bar to view meetings.</p>
      </div>
    );
  }

  return (
    <div className="meetings-list-page">
      <div className="page-header">
        <h2>Sessions & Meetings</h2>
        <p style={{ color: '#666', marginBottom: '2rem' }}>Join live training sessions and cohort meetings.</p>
      </div>

      {loading && <p className="status-message">Loading meetings...</p>}
      {error && <p className="status-message error">{error}</p>}

      {!loading && !error && (
        <>
          {meetings.length === 0 ? (
            <p className="status-message">No meetings available for your account at this time.</p>
          ) : (
            <div className="meetings-grid">
              {meetings.map((m) => {
                const status = getEffectiveStatus(m);
                const isOver = status === 'ENDED' || status === 'CANCELLED';
                
                return (
                  <div key={m.id} className={`meeting-card ${isOver ? 'meeting-over' : ''}`}>
                    <div className="meeting-card-header">
                      <h3>{m.title}</h3>
                      <span className={getStatusBadgeClass(status)}>{status}</span>
                    </div>
                    <div className="meeting-card-meta">
                      <span>
                        {m.is_public ? (
                          <><Globe size={14} /> Public Session</>
                        ) : (
                          <><Users size={14} /> {m.batch_name || 'Cohort Meeting'}</>
                        )}
                      </span>
                      <span><Calendar size={14} /> {formatTimeRange(m.scheduled_start, m.scheduled_end)}</span>
                    </div>
                    <div className="meeting-card-actions">
                      <button
                        className="btn btn-primary"
                        onClick={() => navigate(`/meeting/${m.id}`)}
                        disabled={isOver}
                        style={{ 
                          width: '100%', 
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'center', 
                          gap: '8px',
                          opacity: isOver ? 0.6 : 1,
                          cursor: isOver ? 'not-allowed' : 'pointer'
                        }}
                      >
                        <Video size={18} />
                        {isOver ? 'Meeting Ended' : 'Join Session'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
