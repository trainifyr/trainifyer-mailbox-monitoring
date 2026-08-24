import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import apiClient from '../../api/client';
import { Video, Calendar, Globe, Users, Clock, PlayCircle, ArrowRight } from 'lucide-react';

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
    if (isAuthenticated) fetchMeetings();
  }, [fetchMeetings, isAuthenticated]);

  const getEffectiveStatus = (m) => {
    if (m.status === 'CANCELLED') return 'CANCELLED';
    if (m.status === 'ENDED') return 'ENDED';
    if (m.scheduled_end && new Date() > new Date(m.scheduled_end)) return 'ENDED';
    return m.status || 'SCHEDULED';
  };

  const formatTimeRange = (start, end) => {
    if (!start) return '—';
    const s = new Date(start);
    const options = { hour: 'numeric', minute: '2-digit', hour12: true };
    const dateStr = s.toLocaleDateString([], { month: 'short', day: 'numeric' });
    const startStr = s.toLocaleTimeString([], options);
    const endStr = end ? new Date(end).toLocaleTimeString([], options) : '';
    return `${dateStr} • ${startStr} ${endStr ? `- ${endStr}` : ''}`;
  };

  // For recurring meetings show 'Daily • HH:MM AM – HH:MM PM' using the time portion only
  const formatRecurringTime = (start, end) => {
    if (!start) return '—';
    const options = { hour: 'numeric', minute: '2-digit', hour12: true };
    const startStr = new Date(start).toLocaleTimeString([], options);
    const endStr = end ? new Date(end).toLocaleTimeString([], options) : '';
    return `Daily • ${startStr}${endStr ? ` – ${endStr}` : ''}`;
  };

  return (
    <div className="animate-fade-in content-area">
      <header style={{ marginBottom: '3rem' }}>
        <h1 style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>Sessions & Learning</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '1.125rem' }}>Access your scheduled training and join live interactive sessions.</p>
      </header>

      {loading ? (
        <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-muted)' }}>Checking for active sessions...</div>
      ) : error ? (
        <div className="card" style={{ padding: '2rem', background: '#fef2f2', color: '#dc2626', border: '1px solid #fee2e2' }}>{error}</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '2rem' }}>
          {meetings.length === 0 ? (
            <div className="card" style={{ gridColumn: '1 / -1', padding: '4rem', textAlign: 'center' }}>
               <Video size={48} color="var(--border)" style={{ marginBottom: '1rem' }} />
               <p style={{ color: 'var(--text-muted)' }}>No meetings scheduled for your account at this time.</p>
            </div>
          ) : (
            meetings.map((m) => {
              const status = getEffectiveStatus(m);
              const isOver = status === 'ENDED' || status === 'CANCELLED';
              const isLive = status === 'LIVE';

              return (
                <div key={m.id} className={`card ${isLive ? 'active-laser-glow' : ''}`} style={{ 
                  display: 'flex', 
                  flexDirection: 'column', 
                  padding: '2rem',
                  opacity: isOver ? 0.6 : 1,
                  border: isLive ? '2px solid var(--primary)' : '1px solid var(--border)',
                  background: isLive ? 'linear-gradient(to bottom right, var(--bg-card), var(--primary-glow))' : 'var(--bg-card)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
                    <div style={{ padding: '8px', background: isLive ? 'var(--primary)' : 'var(--border-light)', color: isLive ? 'white' : 'var(--text-muted)', borderRadius: '12px' }}>
                       <Video size={24} />
                    </div>
                    <span className={`badge ${
                      status === 'LIVE' ? 'badge-student' : 
                      status === 'SCHEDULED' ? 'badge-admin' : ''
                    }`} style={{ 
                      background: isLive ? '#10b981' : isOver ? 'var(--border-light)' : '', 
                      color: isLive ? 'white' : isOver ? 'var(--text-muted)' : '' 
                    }}>
                      {status === 'LIVE' ? '● LIVE NOW' : status}
                    </span>
                  </div>

                  <h3 style={{ fontSize: '1.5rem', marginBottom: '1rem', color: 'var(--text-heading)' }}>{m.title}</h3>
                  
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '2rem' }}>
                     <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                      <Calendar size={16} />
                      <span>{m.is_recurring ? formatRecurringTime(m.scheduled_start, m.scheduled_end) : formatTimeRange(m.scheduled_start, m.scheduled_end)}</span>
                   </div>
                     <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                        {m.is_public ? (
                          <><Globe size={16} /> <span>Public Training Session</span></>
                        ) : (
                          <><Users size={16} /> <span>{m.batch_name || 'Restricted Cohort'}</span></>
                        )}
                     </div>
                  </div>

                  <button
                    className={`btn ${isLive ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => !isOver && navigate(`/meeting/${m.id}`)}
                    disabled={isOver}
                    style={{ 
                      width: '100%', 
                      border: isLive ? 'none' : '1px solid var(--border)',
                      justifyContent: 'center',
                      padding: '1rem',
                      opacity: isOver ? 0.45 : 1,
                      cursor: isOver ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {isLive ? <><PlayCircle size={18} /> Join Now</> : isOver ? 'Session Closed' : 'View Details'}
                    {!isOver && <ArrowRight size={16} style={{ marginLeft: '8px' }} />}
                  </button>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
