import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import apiClient from '../../api/client';
import loadJitsiScript from '../../lib/loadJitsiScript';
import PrivacyConsentOverlay from '../../components/PrivacyConsentOverlay';
import { ArrowLeft, Loader, Activity } from 'lucide-react';
import './MeetingRoomPage.css';

const HEARTBEAT_INTERVAL_MS = 60000; 

export default function MeetingRoomPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated, userId, isAdmin } = useAuth();
  const jitsiContainerRef = useRef(null);
  const jitsiApiRef = useRef(null);
  const heartbeatIntervalRef = useRef(null);
  const sessionEndedRef = useRef(false);
  const attendanceLogIdRef = useRef(null);

  const [meeting, setMeeting] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [consentState, setConsentState] = useState('checking');
  const [consentSubmitting, setConsentSubmitting] = useState(false);
  const [jitsiLoading, setJitsiLoading] = useState(true);
  const [heartbeatActive, setHeartbeatActive] = useState(false);

  const sendLeaveLog = useCallback(async () => {
    if (sessionEndedRef.current) return;
    sessionEndedRef.current = true;
    if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
    setHeartbeatActive(false);
    
    // Only send leave-log if tracking was enabled (i.e. if it was a student)
    if (!attendanceLogIdRef.current) return;
    
    try { await apiClient.post(`/meetings/${id}/leave-log`); } catch (e) {}
  }, [id]);

  const startHeartbeat = useCallback(() => {
    // Only track heartbeat for students
    if (isAdmin) return;
    
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
  }, [id, isAdmin]);

  const sendJoinLog = useCallback(async () => {
    // Only track join for students
    if (isAdmin) return;
    
    try {
      const res = await apiClient.post(`/meetings/${id}/join-log`);
      attendanceLogIdRef.current = res.data.data.id;
      startHeartbeat();
    } catch (e) {}
  }, [id, isAdmin, startHeartbeat]);

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

  useEffect(() => {
    if (consentState !== 'accepted' || !meeting || !jitsiContainerRef.current) return;
    let cancelled = false;
    async function initJitsi() {
      try {
        const JitsiAPI = await loadJitsiScript();
        if (cancelled) return;

        let userDisplayName = isAdmin ? 'Instructor' : 'Student';
        try {
          const res = await apiClient.get('/users/students');
          const u = res.data.data.find((s) => s.id === userId);
          if (u) userDisplayName = u.full_name;
        } catch (e) {}

        // --- NEW DOMAIN ---
        // We use ffmuc.net because it allows anonymous meetings without mandatory host login
        const domain = 'meet.guifi.net'; 
        
        const options = {
          roomName: meeting.jitsi_room_name,
          width: '100%',
          height: '100%',
          lang: 'en', // Explicit language lock
          parentNode: jitsiContainerRef.current,
          userInfo: { displayName: userDisplayName },
          configOverrides: {
            defaultLanguage: 'en',
            startWithAudioMuted: true,
            prejoinPageEnabled: false,
            disableModeratorIndicator: true,
            enableWelcomePage: false,
            enableLobby: false,
            requireDisplayName: false
          },
          interfaceConfigOverrides: {
            SHOW_JITSI_WATERMARK: false,
            SHOW_WATERMARK_FOR_GUESTS: false,
            TOOLBAR_ALWAYS_VISIBLE: true
          }
        };

        const jitsiApi = new JitsiAPI(domain, options);
        jitsiApiRef.current = jitsiApi;
        setJitsiLoading(false);
        await sendJoinLog();
        jitsiApi.addListener('readyToClose', () => { sendLeaveLog(); navigate(-1); });
      } catch (e) {
        if (!cancelled) setJitsiLoading(false);
      }
    }
    initJitsi();
    return () => {
      cancelled = true;
      sendLeaveLog();
      if (jitsiApiRef.current) jitsiApiRef.current.dispose();
    };
  }, [consentState, meeting, userId, isAdmin, sendJoinLog, sendLeaveLog, navigate]);

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

  return (
    <div className="meeting-room-page">
      <div className="meeting-room-header">
        <button className="back-btn" onClick={() => navigate(-1)}><ArrowLeft size={16} /> Back</button>
        <h2>{meeting.title}</h2>
        {heartbeatActive && <span className="heartbeat-indicator"><Activity size={14} /><span className="heartbeat-dot" /></span>}
      </div>
      <div className="jitsi-wrapper" style={{ 
        flex: 1, 
        position: 'relative', 
        background: '#000', 
        borderRadius: '12px', 
        overflow: 'hidden', 
        minHeight: '400px',
        maxHeight: '75vh',
        aspectRatio: '16/9',
        margin: '0 auto',
        width: '100%'
      }}>
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
