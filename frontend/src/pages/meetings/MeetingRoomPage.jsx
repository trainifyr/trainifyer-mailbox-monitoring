import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMockIdentity } from '../../context/MockIdentityContext';
import apiClient from '../../api/client';
import loadJitsiScript from '../../lib/loadJitsiScript';
import PrivacyConsentOverlay from '../../components/PrivacyConsentOverlay';
import { ArrowLeft, Loader, Activity } from 'lucide-react';
import './MeetingRoomPage.css';

const HEARTBEAT_INTERVAL_MS = 60000; // 60 seconds

export default function MeetingRoomPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated, userId } = useMockIdentity();
  const jitsiContainerRef = useRef(null);
  const jitsiApiRef = useRef(null);
  const heartbeatIntervalRef = useRef(null);
  const sessionEndedRef = useRef(false); // Guard: fire leave-log exactly once
  const attendanceLogIdRef = useRef(null); // Store the attendance log row ID

  const [meeting, setMeeting] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Consent state
  const [consentState, setConsentState] = useState('checking');
  const [consentSubmitting, setConsentSubmitting] = useState(false);
  const [jitsiLoading, setJitsiLoading] = useState(true);

  // Heartbeat indicator
  const [heartbeatActive, setHeartbeatActive] = useState(false);

  // --- Shared leave-log sender ---
  const sendLeaveLog = useCallback(async () => {
    // Guard: fire only once per session
    if (sessionEndedRef.current) return;
    sessionEndedRef.current = true;

    // Stop heartbeat
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
    setHeartbeatActive(false);

    // Only send leave-log if we have a known attendance log
    if (!attendanceLogIdRef.current) return;

    try {
      await apiClient.post(`/meetings/${id}/leave-log`);
    } catch (e) {
      console.error('Failed to record leave-log:', e);
    }
  }, [id]);

  // --- Start heartbeat ---
  const startHeartbeat = useCallback(() => {
    if (heartbeatIntervalRef.current) return;

    const ping = async () => {
      try {
        await apiClient.post(`/meetings/${id}/heartbeat`);
        setHeartbeatActive(true);
      } catch (e) {
        // If 404 (session already closed), stop heartbeat
        if (e.response?.status === 404) {
          clearInterval(heartbeatIntervalRef.current);
          heartbeatIntervalRef.current = null;
          setHeartbeatActive(false);
        }
      }
    };

    // Ping immediately, then every 60s
    ping();
    heartbeatIntervalRef.current = setInterval(ping, HEARTBEAT_INTERVAL_MS);
  }, [id]);

  // --- Record join-log ---
  const sendJoinLog = useCallback(async () => {
    try {
      const res = await apiClient.post(`/meetings/${id}/join-log`);
      attendanceLogIdRef.current = res.data.data.id;
      startHeartbeat();
    } catch (e) {
      console.error('Failed to record join-log:', e);
    }
  }, [id, startHeartbeat]);

  // Fetch meeting data
  useEffect(() => {
    let cancelled = false;

    async function fetchMeeting() {
      try {
        setLoading(true);
        const res = await apiClient.get('/meetings');
        const found = res.data.data.find((m) => m.id === id);
        if (!found) {
          throw new Error('Meeting not found');
        }
        if (!cancelled) {
          setMeeting(found);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e.response?.data?.error || e.message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    if (isAuthenticated) {
      fetchMeeting();
    }
    return () => { cancelled = true; };
  }, [id, isAuthenticated]);

  // Check existing consent status
  useEffect(() => {
    if (!meeting || !isAuthenticated) return;
    if (meeting.status === 'ENDED' || meeting.status === 'CANCELLED') return;

    let cancelled = false;

    async function checkConsent() {
      try {
        const res = await apiClient.get(`/meetings/${id}/consent`);
        if (!cancelled && res.data.data.consented) {
          setConsentState('accepted');
        } else if (!cancelled) {
          setConsentState('needed');
        }
      } catch (e) {
        if (!cancelled) {
          console.error('Failed to check consent:', e);
          setConsentState('needed');
        }
      }
    }

    checkConsent();
    return () => { cancelled = true; };
  }, [meeting, id, isAuthenticated]);

  // Initialize Jitsi once consent is accepted
  useEffect(() => {
    if (consentState !== 'accepted' || !meeting || !jitsiContainerRef.current) return;

    let cancelled = false;

    async function initJitsi() {
      try {
        const JitsiAPI = await loadJitsiScript();
        if (cancelled) return;

        let userDisplayName = `User-${userId?.substring(0, 8) || 'Guest'}`;
        try {
          const res = await apiClient.get('/users/students');
          const user = res.data.data.find((s) => s.id === userId);
          if (user) userDisplayName = user.full_name;
        } catch (e) {}

        const domain = 'meet.jit.si';
        const options = {
          roomName: meeting.jitsi_room_name,
          width: '100%',
          height: '100%',
          parentNode: jitsiContainerRef.current,
          userInfo: { displayName: userDisplayName },
          configOverrides: {
            startWithAudioMuted: true,
            startWithVideoMuted: false,
            disableDeepLinking: true,
            prejoinPageEnabled: false
          },
          interfaceConfigOverrides: {
            SHOW_JITSI_WATERMARK: false,
            SHOW_WATERMARK_FOR_GUESTS: false,
            TOOLBAR_ALWAYS_VISIBLE: true,
            DISABLE_JOIN_LEAVE_NOTIFICATIONS: true
          }
        };

        const jitsiApi = new JitsiAPI(domain, options);
        jitsiApiRef.current = jitsiApi;
        setJitsiLoading(false);

        // Record join-log once Jitsi has loaded
        await sendJoinLog();

        // Listen for Jitsi "readyToClose" (user clicked Leave in Jitsi UI)
        jitsiApi.addListener('readyToClose', () => {
          sendLeaveLog();
        });
      } catch (e) {
        if (!cancelled) {
          console.error('Jitsi init failed:', e);
          setJitsiLoading(false);
        }
      }
    }

    initJitsi();

    return () => {
      cancelled = true;
      // Fire leave-log on component unmount (navigation, back button)
      sendLeaveLog();
      if (jitsiApiRef.current) {
        jitsiApiRef.current.dispose();
        jitsiApiRef.current = null;
      }
    };
  }, [consentState, meeting, userId, sendJoinLog, sendLeaveLog]);

  // --- Browser beforeunload handler ---
  useEffect(() => {
    const handleBeforeUnload = () => {
      sendLeaveLog();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [sendLeaveLog]);

  // Handlers
  const handleAccept = useCallback(async () => {
    try {
      setConsentSubmitting(true);
      await apiClient.post(`/meetings/${id}/consent`);
      setConsentState('accepted');
    } catch (e) {
      console.error('Failed to record consent:', e);
      alert('Failed to record consent. Please try again.');
    } finally {
      setConsentSubmitting(false);
    }
  }, [id]);

  const handleDecline = useCallback(() => {
    setConsentState('declined');
  }, []);

  // --- Render logic ---

  if (!isAuthenticated) {
    return (
      <div className="meeting-room-page">
        <div className="meeting-room-error">
          <p>Please select a role in the Mock Identity Bar to join this meeting.</p>
          <button className="btn btn-secondary" onClick={() => navigate('/')}>
            Go Home
          </button>
        </div>
      </div>
    );
  }

  if (loading || (consentState === 'checking' && !error)) {
    return (
      <div className="meeting-room-page">
        <div className="meeting-room-loading">
          <Loader size={32} className="spin" />
          <p>Preparing session...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="meeting-room-page">
        <div className="meeting-room-error">
          <p className="error">{error}</p>
          <button className="btn btn-secondary" onClick={() => navigate(-1)}>
            <ArrowLeft size={16} /> Go Back
          </button>
        </div>
      </div>
    );
  }

  if (meeting.status === 'ENDED' || meeting.status === 'CANCELLED') {
    return (
      <div className="meeting-room-page">
        <div className="meeting-room-ended">
          <h2>{meeting.title}</h2>
          <p className="status-message">
            This meeting has been <strong>{meeting.status.toLowerCase()}</strong>.
          </p>
          <button className="btn btn-secondary" onClick={() => navigate(-1)}>
            <ArrowLeft size={16} /> Go Back
          </button>
        </div>
      </div>
    );
  }

  if (consentState === 'declined') {
    return (
      <div className="meeting-room-page">
        <div className="meeting-room-ended">
          <h2>Access Denied</h2>
          <p className="status-message">
            You must agree to the privacy terms to join the session.
            Monitoring is mandatory for this training platform.
          </p>
          <button className="btn btn-secondary" onClick={() => navigate(-1)}>
            <ArrowLeft size={16} /> Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="meeting-room-page">
      <div className="meeting-room-header">
        <button className="back-btn" onClick={() => navigate(-1)}>
          <ArrowLeft size={16} /> Back
        </button>
        <h2>{meeting.title}</h2>
        {meeting.batch_name && <span className="meeting-room-badge">{meeting.batch_name}</span>}

        {/* Heartbeat indicator */}
        {heartbeatActive && (
          <span className="heartbeat-indicator" title="Attendance logging active">
            <Activity size={14} />
            <span className="heartbeat-dot" />
          </span>
        )}
      </div>

      <div className="jitsi-wrapper" style={{ flex: 1, position: 'relative', background: '#111', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
        {/* Consent overlay — blocks Jitsi until accepted */}
        {consentState === 'needed' && (
          <PrivacyConsentOverlay
            onAccept={handleAccept}
            onDecline={handleDecline}
            submitting={consentSubmitting}
          />
        )}

        {/* Jitsi loading indicator */}
        {consentState === 'accepted' && jitsiLoading && (
          <div className="jitsi-loading-overlay">
            <Loader size={24} className="spin" />
            <p>Connecting to secure stream...</p>
          </div>
        )}

        {/* Jitsi container */}
        <div
          className="jitsi-container"
          ref={jitsiContainerRef}
          style={{ width: '100%', height: '100%', display: consentState === 'accepted' ? 'block' : 'none' }}
        />
      </div>
    </div>
  );
}
