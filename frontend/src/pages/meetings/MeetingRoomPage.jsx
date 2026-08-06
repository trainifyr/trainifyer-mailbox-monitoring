import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import apiClient from '../../api/client';
import { supabase } from '../../lib/supabaseClient';
import loadJitsiScript from '../../lib/loadJitsiScript';
import PrivacyConsentOverlay from '../../components/PrivacyConsentOverlay';
import { ArrowLeft, Loader, Activity, VideoOff, MicOff, Settings } from 'lucide-react';
import './MeetingRoomPage.css';

const HEARTBEAT_INTERVAL_MS = 60000; 

export default function MeetingRoomPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated, userId, isAdmin, user } = useAuth();
  const jitsiContainerRef = useRef(null);
  const jitsiApiRef = useRef(null);
  const heartbeatIntervalRef = useRef(null);
  const sessionEndedRef = useRef(false);
  const attendanceLogIdRef = useRef(null);
  const defaultAuthTokenRef = useRef(null); // synchronous token access for beforeunload

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.access_token) defaultAuthTokenRef.current = session.access_token;
    });
  }, []);

  const [meeting, setMeeting] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [consentState, setConsentState] = useState('checking');
  const [consentSubmitting, setConsentSubmitting] = useState(false);
  const [jitsiLoading, setJitsiLoading] = useState(true);
  const [heartbeatActive, setHeartbeatActive] = useState(false);
  const [hasJoined, setHasJoined] = useState(false);
  const [isInConference, setIsInConference] = useState(false); // true only after Jitsi pre-join complete
  const [activeParticipants, setActiveParticipants] = useState([]);
  const [participantsLoading, setParticipantsLoading] = useState(true);

  // sendLeaveLog: call this whenever a user leaves.
  // useBeacon=true is for tab-close (beforeunload) where fetch is killed by the browser.
  // useBeacon=false (default) is for button clicks and programmatic leaves where we can await.
  const sendLeaveLog = useCallback(async (useBeacon = false) => {
    if (sessionEndedRef.current) return;
    sessionEndedRef.current = true;
    if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
    setHeartbeatActive(false);
    if (!attendanceLogIdRef.current) return;
    try {
      const apiUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';
      const token = defaultAuthTokenRef.current;
      if (useBeacon) {
        const url = token ? `${apiUrl}/meetings/${id}/leave-log?token=${token}` : `${apiUrl}/meetings/${id}/leave-log`;
        // text/plain avoids CORS preflight which the browser kills on tab close
        navigator.sendBeacon(url, new Blob([''], { type: 'text/plain' }));
      } else {
        await fetch(`${apiUrl}/meetings/${id}/leave-log`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          keepalive: true,
        });
      }
    } catch (e) {
      console.error('Failed to send leave log:', e);
    }
  }, [id]);

  useEffect(() => {
    // Use beacon only on tab close or backgrounding — proper fetch is used for all other explicit leaves
    const handleUnload = () => sendLeaveLog(true);
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') sendLeaveLog(true);
    };

    window.addEventListener('beforeunload', handleUnload);
    window.addEventListener('unload', handleUnload);
    window.addEventListener('pagehide', handleUnload);
    document.addEventListener('visibilitychange', handleVisibility);
    
    return () => {
      window.removeEventListener('beforeunload', handleUnload);
      window.removeEventListener('unload', handleUnload);
      window.removeEventListener('pagehide', handleUnload);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [sendLeaveLog]);

  const startHeartbeat = useCallback(() => {
    const ping = async () => {
      try {
        await apiClient.post(`/meetings/${id}/heartbeat`);
        setHeartbeatActive(true);
      } catch (e) {
        if (e.response?.status === 404) clearInterval(heartbeatIntervalRef.current);
      }
    };
    ping();
    heartbeatIntervalRef.current = setInterval(ping, HEARTBEAT_INTERVAL_MS);
  }, [id]);

  const sendJoinLog = useCallback(async () => {
    try {
      const res = await apiClient.post(`/meetings/${id}/join-log`);
      // May return null data for public meetings — guard against that
      if (res.data.data?.id) {
        attendanceLogIdRef.current = res.data.data.id;
        startHeartbeat();
      }
    } catch (e) {}
  }, [id, startHeartbeat]);

  useEffect(() => {
    let cancelled = false;
    async function fetchMeeting() {
      try {
        setLoading(true);
        const res = await apiClient.get('/meetings');
        const found = res.data.data.find((m) => m.id === id);
        if (!found) throw new Error('Meeting not found');
        if (found.scheduled_end && !isAdmin && new Date() > new Date(found.scheduled_end)) {
          found.status = 'ENDED';
        }
        if (!cancelled) setMeeting(found);
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    if (isAuthenticated) fetchMeeting();
    return () => { cancelled = true; };
  }, [id, isAuthenticated, isAdmin]);

  useEffect(() => {
    if (!meeting || !isAuthenticated || meeting.status === 'ENDED') return;
    let cancelled = false;
    async function checkConsent() {
      // Admins bypass consent entirely
      if (isAdmin) {
        setConsentState('accepted');
        return;
      }
      try {
        const res = await apiClient.get(`/meetings/${id}/consent`);
        if (!cancelled) setConsentState(res.data.data.consented ? 'accepted' : 'needed');
      } catch (e) {
        if (!cancelled) setConsentState('needed');
      }
    }
    checkConsent();
    return () => { cancelled = true; };
  }, [meeting, id, isAuthenticated]);

  // Fetch active participants list
  useEffect(() => {
    if (!meeting || !isAuthenticated || hasJoined) return;
    let cancelled = false;
    
    async function fetchActiveParticipants() {
      try {
        const res = await apiClient.get(`/meetings/${id}/active-participants`);
        if (!cancelled) {
          // Deduplicate by name (in case a user joined from multiple tabs)
          const uniqueParticipants = [];
          const seenNames = new Set();
          for (const p of res.data.data) {
            const name = p.name || 'Anonymous';
            if (!seenNames.has(name)) {
              seenNames.add(name);
              uniqueParticipants.push(p);
            }
          }
          uniqueParticipants.sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }));
          setActiveParticipants(uniqueParticipants);
          setParticipantsLoading(false);
        }
      } catch (e) {
        console.error('Failed to fetch active participants', e);
        if (!cancelled) setParticipantsLoading(false);
      }
    }
    
    fetchActiveParticipants();
    const interval = setInterval(fetchActiveParticipants, 15000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [id, meeting, isAuthenticated, hasJoined]);

  useEffect(() => {
    if (consentState !== 'accepted' || !meeting || !jitsiContainerRef.current || !hasJoined) return;
    let cancelled = false;
    async function initJitsi() {
      try {
        const JitsiAPI = await loadJitsiScript();
        if (cancelled) return;

        let userDisplayName = 'Student';

        // For admins, use the name from AuthContext directly
        if (isAdmin) {
          userDisplayName = user?.full_name || 'Admin';
        } else {
          // For students, fetch their name from the users list
          try {
            const res = await apiClient.get('/users/students');
            const u = res.data.data.find((s) => s.id === userId);
            if (u) userDisplayName = u.full_name;
          } catch (e) {}
        }

        // meet.systemli.org: confirmed iframe-compatible, public Jitsi instance with anonymous room creation
        const domain = 'meet.systemli.org'; 
        
        const options = {
          roomName: meeting.jitsi_room_name,
          width: '100%',
          height: '100%',
          lang: 'en', // Explicit language lock
          parentNode: jitsiContainerRef.current,
          userInfo: { displayName: userDisplayName },
          configOverwrite: {
            defaultLanguage: 'en',
            startWithAudioMuted: meeting.require_microphone ? false : true,
            startWithVideoMuted: meeting.require_camera ? false : true,
            prejoinPageEnabled: false,
            disableModeratorIndicator: true,
            enableWelcomePage: false,
            enableLobby: false,
            requireDisplayName: false,
            screenSharingEnabled: true,
            disableDeepLinking: true,
            disableProfile: true,
            disableSpeakerStats: true,
            
            // Limit bandwidth payload to stop public instances from dropping connection
            resolution: 360,
            constraints: {
              video: {
                height: { ideal: 360, max: 360, min: 180 }
              }
            },
            
            // Google Meet gallery feel
            disableLocalVideoFlip: true,
            
            hideConferenceSubject: true, // We have our own title bar
            hideConferenceTimer: true,
            
            // Restrict moderator buttons if the user is a student
            // For security, students MUST NOT have 'hangup' in their toolbar, to prevent phantom "End meeting for all"
            toolbarButtons: isAdmin
              ? ['microphone', 'camera', 'desktop', 'chat', 'raisehand', 'participants-pane', 'tileview', 'hangup', 'mute-everyone', 'security', 'settings', 'fullscreen']
              : ['microphone', 'camera', meeting.require_screen_share === 'OFF' ? null : 'desktop', 'chat', 'raisehand', 'participants-pane', 'tileview', 'settings', 'fullscreen'].filter(Boolean),
            
            // Mute/Kick overrides
            remoteVideoMenu: {
              disableKick: !isAdmin,
              disableGrantModerator: true
            },
            participantsPane: {
              hideModeratorSettingsTab: !isAdmin,
              hideMoreActionsButton: !isAdmin,
              hideMuteAllButton: !isAdmin
            },
            breakoutRooms: {
              hideAddRoomButton: true
            },
            customLogoUrl: '',
            dynamicBrandingUrl: ''
          },
          interfaceConfigOverwrite: {
            SHOW_JITSI_WATERMARK: false,
            SHOW_WATERMARK_FOR_GUESTS: false,
            SHOW_BRAND_WATERMARK: false,
            SHOW_POWERED_BY: false,
            DEFAULT_LOGO_URL: '',
            DEFAULT_WELCOME_PAGE_LOGO_URL: '',
            JITSI_WATERMARK_LINK: '',
            BRAND_WATERMARK_LINK: '',
            HIDE_INVITE_MORE_HEADER: true,
            CONNECTION_INDICATOR_DISABLED: true,
            VIDEO_QUALITY_LABEL_DISABLED: true,
            DISABLE_DOMINANT_SPEAKER_INDICATOR: true,
            TOOLBAR_ALWAYS_VISIBLE: false,
            TILE_VIEW_MAX_COLUMNS: 4,
            MOBILE_APP_PROMO: false,
            SHOW_CHROME_EXTENSION_BANNER: false,
            GENERATE_ROOMNAMES_ON_WELCOME_PAGE: false,
            DEFAULT_BACKGROUND: '#000000'
          }
        };

        const jitsiApi = new JitsiAPI(domain, options);
        jitsiApiRef.current = jitsiApi;

        // Ensure display-capture (screen sharing) is allowed on the iframe
        const iframe = jitsiContainerRef.current?.querySelector('iframe');
        if (iframe) {
          iframe.setAttribute('allow', 'camera; microphone; display-capture; fullscreen; autoplay; clipboard-write; clipboard-read');
        }

        setJitsiLoading(false);
        
        // Force Google Meet style grid view immediately upon entering the call
        jitsiApi.addListener('videoConferenceJoined', async () => {
          setIsInConference(true);
          jitsiApi.executeCommand('setTileView', true);
          if (!attendanceLogIdRef.current) {
            await sendJoinLog();
          }
        });

        const handleUnexpectedDrop = async () => {
          if (sessionEndedRef.current) return;
          setIsInConference(false);
          // Log the LEAVE before attempting reconnect so the timeline is accurate
          const apiUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';
          const token = defaultAuthTokenRef.current;
          if (attendanceLogIdRef.current && token) {
            try {
              await fetch(`${apiUrl}/meetings/${id}/leave-log`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                keepalive: true,
              });
            } catch {}
          }
          // Reset so the reconnected session creates a fresh JOIN log entry
          attendanceLogIdRef.current = null;
          setJitsiLoading(true);
          jitsiApiRef.current?.dispose();
          setTimeout(() => {
            if (!cancelled) initJitsi();
          }, 3000);
        };

        // Intercept silent kicks or packet-loss drops and silently resurrect the connection
        jitsiApi.addListener('readyToClose', handleUnexpectedDrop);
        jitsiApi.addListener('videoConferenceLeft', handleUnexpectedDrop);
      } catch (e) {
        console.error('Failed to initialize Jitsi meeting room:', e);
        if (!cancelled) setJitsiLoading(false);
      }
    }
    initJitsi();
    return () => {
      cancelled = true;
      sendLeaveLog();
      if (jitsiApiRef.current) jitsiApiRef.current.dispose();
    };
  }, [consentState, meeting, userId, isAdmin, sendJoinLog, sendLeaveLog, navigate, hasJoined]);

  const handleAccept = async () => {
    try {
      setConsentSubmitting(true);
      await apiClient.post(`/meetings/${id}/consent`);
      setConsentState('accepted');
    } catch (e) { alert('Consent failed'); } finally { setConsentSubmitting(false); }
  };

  if (loading || (consentState === 'checking' && !error)) {
    return <div className="meeting-room-page"><div className="meeting-room-loading"><Loader size={32} className="spin" /><p>Connecting...</p></div></div>;
  }

  if (error || (meeting && meeting.status === 'ENDED')) {
    return (
      <div className="meeting-room-page">
        <div className="meeting-room-ended">
          <h2>{error ? 'Error' : 'Meeting Ended'}</h2>
          <p>{error || 'This session is no longer active.'}</p>
          <button className="btn btn-secondary" onClick={() => navigate(-1)}>Back</button>
        </div>
      </div>
    );
  }

  if (!hasJoined) {
    const activeCount = activeParticipants.length;
    let participantsText = 'No one is in this call yet';
    if (activeCount === 1) {
      participantsText = `${activeParticipants[0].name} is in this call`;
    } else if (activeCount === 2) {
      participantsText = `${activeParticipants[0].name} and ${activeParticipants[1].name} are in this call`;
    } else if (activeCount === 3) {
      participantsText = `${activeParticipants[0].name}, ${activeParticipants[1].name}, and ${activeParticipants[2].name} are in this call`;
    } else if (activeCount > 3) {
      const remaining = activeCount - 3;
      participantsText = `${activeParticipants[0].name}, ${activeParticipants[1].name}, ${activeParticipants[2].name} and ${remaining} more are in this call`;
    }

    // Block students from joining after the meeting's end time
    const now = new Date();
    let isSessionEnded = false;
    let sessionEndedMsg = 'This session has already ended for today.';
    if (!isAdmin) {
      if (meeting.is_recurring && meeting.recur_end_time) {
        const [endH, endM] = meeting.recur_end_time.split(':').map(Number);
        const todayEnd = new Date();
        todayEnd.setHours(endH, endM, 0, 0);
        if (now > todayEnd) {
          isSessionEnded = true;
          if (meeting.recur_start_time) {
            const [sh, sm] = meeting.recur_start_time.split(':').map(Number);
            sessionEndedMsg = `Today's session has ended. See you tomorrow from ${String(sh).padStart(2,'0')}:${String(sm).padStart(2,'0')}.`;
          }
        }
      } else if (!meeting.is_recurring && meeting.scheduled_end) {
        if (now > new Date(meeting.scheduled_end)) {
          isSessionEnded = true;
          sessionEndedMsg = 'This meeting has already ended.';
        }
      }

      // Hook up meeting_join_enabled for students
      if (meeting.meeting_join_enabled === false) {
        isSessionEnded = true;
        sessionEndedMsg = 'Your batch administrator has disabled meeting joins at this time.';
      }
    }

    return (
      <div className="meeting-room-page animate-fade-in">
        <div className="meeting-room-header">
          <button className="back-btn" onClick={() => navigate(-1)}><ArrowLeft size={16} /> Back</button>
          <h2>{meeting.title}</h2>
        </div>

        <div className="lobby-container card">
          <div className="lobby-preview-card animate-fade-in">
            <div className="lobby-preview-main">
              <div className="lobby-camera-avatar">
                {meeting.title.charAt(0).toUpperCase()}
              </div>
            </div>
          </div>

          {/* Right Column: Pre-join info */}
          <div className="lobby-info-card">
            <h1>Ready to join?</h1>
            <p className="meeting-subtitle">Jitsi Video Conference Room</p>

            <div className="active-participants-wrapper">
              <div className="active-participants-header" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {activeCount > 0 && <span className="participants-indicator-pulse" />}
                {activeCount > 0 ? 'Active in Call' : 'Room is empty'}
              </div>
              
              {activeCount > 0 && (
                <div className="avatar-stack">
                  {activeParticipants.slice(0, 3).map((p, idx) => (
                    <div key={p.id || idx} className="avatar-bubble" title={p.name}>
                      {p.name.charAt(0).toUpperCase()}
                    </div>
                  ))}
                  {activeCount > 3 && (
                    <div className="avatar-bubble more">
                      +{activeCount - 3}
                    </div>
                  )}
                </div>
              )}
              
              <div className="participants-text" style={{ fontSize: '0.9375rem', marginTop: activeCount > 0 ? '0.5rem' : 0 }}>
                {participantsLoading ? 'Checking participants...' : participantsText}
              </div>
            </div>

            <div className="lobby-actions">
              {isSessionEnded ? (
                <div className="session-ended-notice">
                  <span>🔒</span>
                  <p>{sessionEndedMsg}</p>
                </div>
              ) : (
                <button className="lobby-join-btn" onClick={() => setHasJoined(true)}>
                  Join Meeting
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="meeting-room-page">
      <div className="meeting-room-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button className="back-btn" onClick={() => navigate(-1)}><ArrowLeft size={16} /> Back</button>
          <h2>{meeting.title}</h2>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
          {heartbeatActive && <span className="heartbeat-indicator" title="Active Connection"><Activity size={14} /><span className="heartbeat-dot" /></span>}
          {!isAdmin && isInConference && (
            <button className="btn btn-leave-meeting" onClick={async () => { await sendLeaveLog(); navigate(-1); }}>Leave Meeting</button>
          )}
        </div>
      </div>
      <div className="jitsi-wrapper">
        {/* Consent overlay — blocks Jitsi until accepted (Students only) */}
        {consentState === 'needed' && !isAdmin && (
          <PrivacyConsentOverlay onAccept={handleAccept} onDecline={() => navigate(-1)} submitting={consentSubmitting} />
        )}
        {consentState === 'accepted' && jitsiLoading && <div className="jitsi-loading-overlay"><Loader size={24} className="spin" /><p>Opening video...</p></div>}
        <div className="jitsi-container" ref={jitsiContainerRef} style={{ width: '100%', height: '100%', display: consentState === 'accepted' ? 'block' : 'none' }} />
      </div>
    </div>
  );
}
