import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import apiClient from '../../api/client';
import { supabase } from '../../lib/supabaseClient';
import loadJitsiScript from '../../lib/loadJitsiScript';
import PrivacyConsentOverlay from '../../components/PrivacyConsentOverlay';
import PollPanel from '../../components/PollPanel';
import ChatPanel from '../../components/ChatPanel';
import { ArrowLeft, Loader, Activity, Clock, BarChart2, MessageSquare } from 'lucide-react';
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
  const wakeLockRef = useRef(null); // Reference to hold the screen awake lock
  const sessionJoinedAtRef = useRef(null); // Timestamp when user clicked Join in this session
  const bgSubscriptionsRef = useRef({ polls: null, chat: null }); // Track background sockets

  // Play a short beep using the Web Audio API for attention-grabbing notifications.
  // frequency: Hz (higher = more urgent); duration: ms
  const playBeep = (frequency = 880, duration = 180) => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = frequency;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.4, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration / 1000);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + duration / 1000);
    } catch (_) { /* AudioContext not supported */ }
  };

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
  const [isPollPanelOpen, setIsPollPanelOpen] = useState(false);
  const [newPollCount, setNewPollCount] = useState(0);
  const [isChatPanelOpen, setIsChatPanelOpen] = useState(false);
  const [newChatCount, setNewChatCount] = useState(0);

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
    // Use beacon only on full tab/window close — NOT on visibility change.
    // Students routinely switch tabs to check other things while still in the meeting.
    const handleUnload = () => sendLeaveLog(true);

    window.addEventListener('beforeunload', handleUnload);
    window.addEventListener('unload', handleUnload);
    window.addEventListener('pagehide', handleUnload);

    return () => {
      window.removeEventListener('beforeunload', handleUnload);
      window.removeEventListener('unload', handleUnload);
      window.removeEventListener('pagehide', handleUnload);
    };
  }, [sendLeaveLog]);

  const startHeartbeat = useCallback(() => {
    if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);

    let lastTick = Date.now();

    const ping = async (intervalId) => {
      // Sleep/Freeze detection: If the timer fires extremely late (e.g., > 2.5 minutes interval instead of 1 min),
      // it means the computer went to sleep, hibernate, or the browser aggressively throttled the background tab.
      const now = Date.now();
      const elapsed = now - lastTick;
      lastTick = now;

      // Allow 2.5 minutes (150,000ms) of slop before considering it a sleep event
      if (elapsed > 150000) {
        console.warn('System sleep or severe throttling detected. Halting session.');
        clearInterval(intervalId);
        
        sessionEndedRef.current = false; // Allow standard leave log to fire
        await sendLeaveLog(); // kick out attendance
        
        attendanceLogIdRef.current = null;
        sessionEndedRef.current = false;
        
        setHasJoined(false); // force them out to lobby
        return;
      }

      try {
        await apiClient.post(`/meetings/${id}/heartbeat`);
        setHeartbeatActive(true);
      } catch (e) {
        if (e.response?.status === 404) clearInterval(intervalId);
      }
    };

    // Self-contained interval to avoid ref collision on rapid reconnects
    const idObj = { current: null };
    idObj.current = setInterval(() => ping(idObj.current), HEARTBEAT_INTERVAL_MS);
    heartbeatIntervalRef.current = idObj.current;

    // Initial immediate ping
    ping(idObj.current);
  }, [id, sendLeaveLog]);

  const sendJoinLog = useCallback(async () => {
    try {
      const res = await apiClient.post(`/meetings/${id}/join-log`);
      // May return null data for public meetings — guard against that
      if (res.data.data?.id) {
        attendanceLogIdRef.current = res.data.data.id;
        startHeartbeat();
      }
    } catch (e) { }
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

  // --- Screen Wake Lock (Prevent Sleep) ---
  // Actively holds the computer awake while the student is in the meeting
  useEffect(() => {
    const requestWakeLock = async () => {
      if ('wakeLock' in navigator && hasJoined) {
        try {
          wakeLockRef.current = await navigator.wakeLock.request('screen');
        } catch (err) {
          console.error('Wake Lock error:', err.name, err.message);
        }
      }
    };

    const handleVisibilityChange = async () => {
      // Wake locks are automatically dropped when the tab is hidden. 
      // We must re-request it when they come back.
      if (document.visibilityState === 'visible' && hasJoined) {
        await requestWakeLock();
      }
    };

    if (hasJoined) {
      requestWakeLock();
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    return () => {
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
        wakeLockRef.current = null;
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [hasJoined]);

  // Background listener for the red dot on the poll & chat icons
  useEffect(() => {
    if (!isInConference || !id) return;

    let cancelled = false;

    // Fetch pre-existing pinned messages to show a notification badge for late joiners
    const fetchExistingPinned = async () => {
      const { data, error } = await supabase
        .from('meeting_messages')
        .select('id')
        .eq('meeting_id', id)
        .eq('is_pinned', true)
        .neq('sender_id', userId); // don't notify if we pinned it ourselves previously
      
      if (!error && data?.length > 0 && !cancelled) {
        setNewChatCount(prev => prev + data.length);
        playBeep(660, 150); 
      }
    };
    fetchExistingPinned();

    // Polls
    if (!bgSubscriptionsRef.current.polls) {
      const sub = supabase.channel(`meeting-polls-bg-${id}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'meeting_polls', filter: `meeting_id=eq.${id}` }, () => {
          setNewPollCount(prev => prev + 1);
          playBeep(1047, 200); // High C — distinct "poll arrived" sound
        })
        .subscribe();
      bgSubscriptionsRef.current.polls = sub;
    }

    // Chat
    if (!bgSubscriptionsRef.current.chat) {
      const subChat = supabase.channel(`meeting-chat-bg-${id}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'meeting_messages', filter: `meeting_id=eq.${id}` }, (payload) => {
          // Point 5 requirement: Only show red dot if message is pinned or sent AFTER we joined
          if (payload.new.sender_id === userId) return; // ignore our own messages
          if (sessionJoinedAtRef.current && (payload.new.is_pinned || new Date(payload.new.created_at) >= new Date(sessionJoinedAtRef.current))) {
            setNewChatCount(prev => prev + 1);
            playBeep(660, 150); // Softer G5 — subtle "chat message" chime
          }
        })
        .subscribe();
      bgSubscriptionsRef.current.chat = subChat;
    }

    return () => {
      cancelled = true;
      if (bgSubscriptionsRef.current.polls) {
        supabase.removeChannel(bgSubscriptionsRef.current.polls);
        bgSubscriptionsRef.current.polls = null;
      }
      if (bgSubscriptionsRef.current.chat) {
        supabase.removeChannel(bgSubscriptionsRef.current.chat);
        bgSubscriptionsRef.current.chat = null;
      }
    };
  }, [isInConference, id, userId]);

  // --- Meeting End Watcher ---
  // Polls the meeting status every 10 seconds.
  // When Admin clicks "End", students are automatically kicked out of Jitsi
  // and their attendance is finalized (the backend does that part on the API call).
  const statusPollIntervalRef = useRef(null);
  useEffect(() => {
    // Only poll if we are inside an ongoing session
    if (!isAuthenticated || !id || !hasJoined) return;
    // Skip polling if we are the Admin — we are the one ending it
    if (isAdmin) return;

    const pollStatus = async () => {
      try {
        const res = await apiClient.get('/meetings');
        const found = res.data.data.find((m) => m.id === id);
        if (!found || found.status === 'ENDED' || found.status === 'CANCELLED') {
          // Stop polling immediately
          clearInterval(statusPollIntervalRef.current);
          // Hang up Jitsi call
          if (jitsiApiRef.current) {
            try { jitsiApiRef.current.executeCommand('hangup'); } catch (_) { }
          }
          // Reset so sendLeaveLog isn't blocked by sessionEndedRef
          sessionEndedRef.current = false;
          await sendLeaveLog(false);
          navigate('/student/meetings');
        }
      } catch (_) { }
    };

    statusPollIntervalRef.current = setInterval(pollStatus, 10000);
    return () => clearInterval(statusPollIntervalRef.current);
  }, [id, isAuthenticated, hasJoined, isAdmin, sendLeaveLog, navigate]);

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
          } catch (e) { }
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

            // Camera video capped at 360p to avoid dropping free server connections
            resolution: 360,
            constraints: {
              video: {
                height: { ideal: 360, max: 360, min: 180 }
              }
            },

            // Point 8: Screen share at 720p with slightly higher FPS for smoother delivery.
            // 1080p caused severe jitter on the free Jitsi server (meet.systemli.org) due to
            // bandwidth limits. 720p is still sharp enough to read text while keeping frame
            // delivery stable for all viewers.
            desktopSharingFrameRate: { min: 5, max: 12 },
            desktopSharingResolution: 720,
            desktopSharingMaxFps: 12,
            screenShareSettings: {
              desktopMediaVideo: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                frameRate: { ideal: 12, max: 15 }
              }
            },

            // Crucial block: Prevent P2P crashing when exactly 2 people are in the room.
            // If P2P is true, Jitsi tries to disconnect from the server and connect users directly,
            // which often fails on strict networks and kicks both people out.
            p2p: {
              enabled: false
            },

            // Google Meet gallery feel
            disableLocalVideoFlip: true,

            hideConferenceSubject: true, // We have our own title bar
            hideConferenceTimer: true,
            disableReactions: true,

            // Mute/Kick overrides
            // Note: We completely remove the internal 'hangup' button for everyone (including Admin)
            // so they are forced to use our custom red "Leave Meeting" header button. Using the internal
            // Jitsi hangup button causes the iframe to redirect to the systemli homepage (Image 1).
            toolbarButtons: isAdmin
              ? ['microphone', 'camera', 'desktop', 'raisehand', 'participants-pane', 'tileview', 'mute-everyone', 'security', 'settings', 'fullscreen']
              : ['microphone', 'camera', meeting.require_screen_share === 'OFF' ? null : 'desktop', 'raisehand', 'participants-pane', 'tileview', 'settings', 'fullscreen'].filter(Boolean),

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
            // Point 7: Maximize tile density — 5 columns fits up to 20 people without scrolling
            TILE_VIEW_MAX_COLUMNS: 5,
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


        // NOTE: Do NOT listen to readyToClose or videoConferenceLeft here.
        // Those events fire during Jitsi's own internal reconnect cycles.
        // Intercepting them caused us to destroy+recreate the iframe every ~60s,
        // creating an infinite reconnect loop. Jitsi handles network blips natively.
        // Students are kicked via the admin "End" button (status poll) or
        // naturally close the tab/click Leave — both of which call sendLeaveLog directly.
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
            sessionEndedMsg = `Today's session has ended. See you tomorrow from ${String(sh).padStart(2, '0')}:${String(sm).padStart(2, '0')}.`;
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
                  <div className="session-ended-icon-wrap">
                    <Clock size={28} />
                  </div>
                  <div className="session-ended-text">
                    <strong>Session Closed</strong>
                    <p>{sessionEndedMsg}</p>
                    {meeting.is_recurring && meeting.recur_start_time && (
                      <span className="session-ended-next">
                        Next session: tomorrow at {meeting.recur_start_time.slice(0, 5)}
                      </span>
                    )}
                  </div>
                </div>
              ) : (
          <button className="lobby-join-btn" onClick={() => {
                  sessionJoinedAtRef.current = new Date().toISOString();
                  setHasJoined(true);
                }}>
                  Join Meeting
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Build a readable schedule string for the badge
  const scheduleBadge = (() => {
    if (meeting.is_recurring && meeting.recur_start_time && meeting.recur_end_time) {
      return `${meeting.recur_start_time.slice(0, 5)} – ${meeting.recur_end_time.slice(0, 5)}`;
    }
    if (!meeting.is_recurring && meeting.scheduled_end) {
      return new Date(meeting.scheduled_end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return null;
  })();

  return (
    <div className="meeting-room-page">
      <div className="meeting-room-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button className="back-btn" onClick={() => navigate(-1)}><ArrowLeft size={16} /> Back</button>
          <h2>{meeting.title}</h2>
          {scheduleBadge && (
            <span className="meeting-schedule-badge">
              <Clock size={12} />
              {scheduleBadge}
            </span>
          )}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
          {heartbeatActive && <span className="heartbeat-indicator" title="Active Connection"><Activity size={14} /><span className="heartbeat-dot" /> Live</span>}
          {isInConference && (
            <>
              <button
                className={`meeting-poll-btn${isChatPanelOpen ? ' active' : ''}`}
                onClick={() => { setIsChatPanelOpen(!isChatPanelOpen); setNewChatCount(0); setIsPollPanelOpen(false); }}
                title="Session Chat"
              >
                <MessageSquare size={18} />
                {newChatCount > 0 && !isChatPanelOpen && (
                  <span className="poll-badge-dot">{newChatCount}</span>
                )}
              </button>

              <button
                className={`meeting-poll-btn${isPollPanelOpen ? ' active' : ''}`}
                onClick={() => { setIsPollPanelOpen(!isPollPanelOpen); setNewPollCount(0); setIsChatPanelOpen(false); }}
                title="Live Polls"
              >
                <BarChart2 size={18} />
                {newPollCount > 0 && !isPollPanelOpen && (
                  <span className="poll-badge-dot">{newPollCount}</span>
                )}
              </button>
            </>
          )}
          {isInConference && (
            <button className="btn btn-leave-meeting" onClick={async () => { await sendLeaveLog(); navigate(-1); }}>Leave Meeting</button>
          )}
        </div>
      </div>
      <div className="jitsi-wrapper" style={{ display: 'flex' }}>
        <div style={{ flex: 1, position: 'relative' }}>
          {/* Consent overlay — blocks Jitsi until accepted (Students only) */}
          {consentState === 'needed' && !isAdmin && (
            <PrivacyConsentOverlay onAccept={handleAccept} onDecline={() => navigate(-1)} submitting={consentSubmitting} />
          )}
          {consentState === 'accepted' && jitsiLoading && <div className="jitsi-loading-overlay"><Loader size={24} className="spin" /><p>Opening video...</p></div>}
          <div className="jitsi-container" ref={jitsiContainerRef} style={{ width: '100%', height: '100%', display: consentState === 'accepted' ? 'block' : 'none' }} />
        </div>
        {isPollPanelOpen && (
          <PollPanel
            meetingId={id}
            userId={userId}
            userName={user?.full_name || 'Guest'}
            isAdmin={isAdmin}
            sessionJoinedAt={sessionJoinedAtRef.current}
            onClose={() => { setIsPollPanelOpen(false); setNewPollCount(0); }}
          />
        )}
        {isChatPanelOpen && (
          <ChatPanel
            meetingId={id}
            userId={userId}
            userName={user?.full_name || 'Guest'}
            joinedAt={sessionJoinedAtRef.current}
            onClose={() => { setIsChatPanelOpen(false); setNewChatCount(0); }}
          />
        )}
      </div>
    </div>
  );
}
