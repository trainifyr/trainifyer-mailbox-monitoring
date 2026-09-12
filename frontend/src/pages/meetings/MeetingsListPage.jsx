import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import apiClient from '../../api/client';
import { Video, Calendar, Globe, Users, Clock, PlayCircle, ArrowRight, CheckCircle, Lock } from 'lucide-react';
import { formatTimeRange, formatTimeString } from '../../lib/dateUtils';

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
    const now = new Date();
    if (m.scheduled_end && now > new Date(m.scheduled_end)) return 'ENDED';
    
    // Client-side time barrier for recurring meetings
    if (m.is_recurring && m.recur_end_time) {
      const [endH, endM] = m.recur_end_time.split(':').map(Number);
      const todayEnd = new Date();
      todayEnd.setHours(endH, endM, 0, 0);
      if (now > todayEnd) return 'ENDED';
    }

    return m.status || 'SCHEDULED';
  };

  const formatRecurringTime = (startStrRaw, endStrRaw) => {
    if (!startStrRaw) return '—';
    const startFormatted = formatTimeString(startStrRaw);
    const endFormatted = formatTimeString(endStrRaw);
    return `Daily • ${startFormatted}${endFormatted !== '—' ? ` – ${endFormatted}` : ''}`;
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

              if (isOver) {
                return (
                  <div key={m.id} className="card" style={{ 
                    display: 'flex', 
                    flexDirection: 'column', 
                    padding: '2rem',
                    border: '1px solid rgba(255,255,255,0.05)',
                    background: 'rgba(20,20,25,0.4)',
                    backdropFilter: 'blur(10px)',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
                      <div style={{ padding: '8px', background: 'rgba(255,255,255,0.03)', color: 'rgba(255,255,255,0.3)', borderRadius: '12px' }}>
                         <Lock size={24} />
                      </div>
                      <span className="badge" style={{ 
                        background: 'rgba(255,255,255,0.05)', 
                        color: 'rgba(255,255,255,0.4)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em'
                      }}>
                        {m.is_recurring ? 'Ended for Today' : 'Completed'}
                      </span>
                    </div>

                    <h3 style={{ fontSize: '1.5rem', marginBottom: '1rem', color: 'rgba(255,255,255,0.4)' }}>{m.title}</h3>
                    
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '2rem' }}>
                       <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.875rem', color: 'rgba(255,255,255,0.25)' }}>
                        <Calendar size={16} />
                        <span>{m.is_recurring ? formatRecurringTime(m.recur_start_time, m.recur_end_time) : formatTimeRange(m.scheduled_start, m.scheduled_end)}</span>
                     </div>
                       <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.875rem', color: 'rgba(255,255,255,0.25)' }}>
                          {m.is_public ? (
                            <><Globe size={16} /> <span>Public Training Session</span></>
                          ) : (
                            <><Users size={16} /> <span>{m.batch_name || 'Restricted Cohort'}</span></>
                          )}
                       </div>
                    </div>

                    {m.is_recurring && m.recur_start_time && (
                      <div style={{
                        marginTop: '0.5rem',
                        padding: '1rem',
                        background: '#1a1111',
                        border: '1px solid #451a1a',
                        borderRadius: '12px',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '12px'
                      }}>
                        <div style={{ padding: '6px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', borderRadius: '50%', display: 'flex' }}>
                          <Clock size={20} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <strong style={{ color: '#ef4444', display: 'block', fontSize: '0.875rem', marginBottom: '2px' }}>Session Closed</strong>
                          <p style={{ color: 'var(--text-muted)', fontSize: '0.8125rem', marginBottom: '6px' }}>Today's session has ended.</p>
                          <span style={{ color: '#10b981', fontSize: '0.8125rem', fontWeight: 600 }}>
                            See you Tomorrow at {m.recur_start_time.slice(0, 5)}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              }

              return (
                <div key={m.id} className={`card ${isLive ? 'active-laser-glow' : ''}`} style={{ 
                  display: 'flex', 
                  flexDirection: 'column', 
                  padding: '2rem',
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
                      background: isLive ? '#10b981' : '', 
                      color: isLive ? 'white' : '' 
                    }}>
                      {status === 'LIVE' ? '● LIVE NOW' : status}
                    </span>
                  </div>

                  <h3 style={{ fontSize: '1.5rem', marginBottom: '1rem', color: 'var(--text-heading)' }}>{m.title}</h3>
                  
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '2rem' }}>
                     <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                      <Calendar size={16} />
                      <span>{m.is_recurring ? formatRecurringTime(m.recur_start_time, m.recur_end_time) : formatTimeRange(m.scheduled_start, m.scheduled_end)}</span>
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
                    onClick={() => navigate(`/meeting/${m.id}`)}
                    style={{ 
                      width: '100%', 
                      border: isLive ? 'none' : '1px solid var(--border)',
                      justifyContent: 'center',
                      padding: '1rem',
                      cursor: 'pointer',
                    }}
                  >
                    {isLive ? <><PlayCircle size={18} /> Join Now</> : 'View Details'}
                    <ArrowRight size={16} style={{ marginLeft: '8px' }} />
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
