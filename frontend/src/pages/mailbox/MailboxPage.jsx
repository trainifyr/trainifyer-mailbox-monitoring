import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import apiClient from '../../api/client';
import {
  Inbox, Send, PenSquare, ChevronLeft, Mail, MailOpen,
  Paperclip, Eye, Clock, User, ArrowLeft
} from 'lucide-react';
import './MailboxPage.css';

const PAGE_SIZE = 20;

export default function MailboxPage() {
  const { isAuthenticated, user, userId } = useAuth();

  // View state: 'inbox' | 'sent' | 'compose' | 'detail'
  const [activeView, setActiveView] = useState('inbox');
  const [selectedMessage, setSelectedMessage] = useState(null);

  // Inbox state
  const [inboxMessages, setInboxMessages] = useState([]);
  const [inboxPagination, setInboxPagination] = useState(null);
  const [inboxPage, setInboxPage] = useState(1);
  const [inboxLoading, setInboxLoading] = useState(false);

  // Sent state
  const [sentMessages, setSentMessages] = useState([]);
  const [sentPagination, setSentPagination] = useState(null);
  const [sentPage, setSentPage] = useState(1);
  const [sentLoading, setSentLoading] = useState(false);

  // Compose state
  const [composeForm, setComposeForm] = useState({ receiverEmail: '', subject: '', body: '' });
  const [composeSending, setComposeSending] = useState(false);
  const [composeError, setComposeError] = useState(null);
  const [composeSuccess, setComposeSuccess] = useState(false);
  const [userSuggestions, setUserSuggestions] = useState([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);

  // Error / notification
  const [error, setError] = useState(null);

  const fetchInbox = useCallback(async (page) => {
    try {
      setInboxLoading(true);
      setError(null);
      const res = await apiClient.get(`/mail/inbox?page=${page}&limit=${PAGE_SIZE}`);
      if (page === 1) {
        setInboxMessages(res.data.data);
      } else {
        setInboxMessages((prev) => [...prev, ...res.data.data]);
      }
      setInboxPagination(res.data.pagination);
    } catch (e) {
      const msg = e.response?.data?.message || e.message;
      setError(msg);
      if (page === 1) setInboxMessages([]);
    } finally {
      setInboxLoading(false);
    }
  }, []);

  const fetchSent = useCallback(async (page) => {
    try {
      setSentLoading(true);
      setError(null);
      const res = await apiClient.get(`/mail/sent?page=${page}&limit=${PAGE_SIZE}`);
      if (page === 1) {
        setSentMessages(res.data.data);
      } else {
        setSentMessages((prev) => [...prev, ...res.data.data]);
      }
      setSentPagination(res.data.pagination);
    } catch (e) {
      const msg = e.response?.data?.message || e.message;
      setError(msg);
      if (page === 1) setSentMessages([]);
    } finally {
      setSentLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    if (activeView === 'inbox') {
      setInboxPage(1);
      fetchInbox(1);
    }
  }, [activeView, isAuthenticated, fetchInbox]);

  useEffect(() => {
    if (!isAuthenticated) return;
    if (activeView === 'sent') {
      setSentPage(1);
      fetchSent(1);
    }
  }, [activeView, isAuthenticated, fetchSent]);

  const handleViewInbox = () => {
    setActiveView('inbox');
    setSelectedMessage(null);
    setComposeSuccess(false);
  };

  const handleViewSent = () => {
    setActiveView('sent');
    setSelectedMessage(null);
    setComposeSuccess(false);
  };

  const handleViewCompose = () => {
    setActiveView('compose');
    setSelectedMessage(null);
    setComposeForm({ receiverEmail: '', subject: '', body: '' });
    setComposeError(null);
    setComposeSuccess(false);
    setUserSuggestions([]);
  };

  const handleLoadMoreInbox = () => {
    const nextPage = inboxPage + 1;
    setInboxPage(nextPage);
    fetchInbox(nextPage);
  };

  const handleLoadMoreSent = () => {
    const nextPage = sentPage + 1;
    setSentPage(nextPage);
    fetchSent(nextPage);
  };

  const handleOpenMessage = async (msg) => {
    setSelectedMessage(msg);
    setActiveView('detail');

    // If unread, mark as read
    if (!msg.is_read) {
      try {
        await apiClient.patch(`/mail/${msg.id}/read`);
        // Update the read status locally
        const markRead = (list) =>
          list.map((m) => m.id === msg.id ? { ...m, is_read: true, read_at: new Date().toISOString() } : m);
        
        setInboxMessages((prev) => markRead(prev));
        
        // Also decrement the sidebar unread count
        setInboxPagination(prev => prev ? { ...prev, unreadCount: Math.max(0, (prev.unreadCount || 0) - 1) } : prev);
        
        setSelectedMessage((prev) => prev ? { ...prev, is_read: true, read_at: new Date().toISOString() } : prev);
      } catch (e) {
        // Non-critical; ignore
      }
    }
  };

  // Search users by email/name as the user types in To: field
  const handleReceiverEmailChange = async (e) => {
    const val = e.target.value;
    setComposeForm((prev) => ({ ...prev, receiverEmail: val }));
    if (val.length < 2) { setUserSuggestions([]); return; }
    try {
      setSuggestionsLoading(true);
      const res = await apiClient.get('/users/students/directory');
      const all = res.data.data;
      const filtered = all.filter(
        (u) =>
          u.email.toLowerCase().includes(val.toLowerCase()) ||
          u.full_name.toLowerCase().includes(val.toLowerCase())
      ).slice(0, 6);
      setUserSuggestions(filtered);
    } catch { setUserSuggestions([]); }
    finally { setSuggestionsLoading(false); }
  };

  const handlePickSuggestion = (user) => {
    setComposeForm((prev) => ({ ...prev, receiverEmail: user.email }));
    setUserSuggestions([]);
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!composeForm.receiverEmail || !composeForm.subject || !composeForm.body) {
      setComposeError('All fields are required.');
      return;
    }
    try {
      setComposeSending(true);
      setComposeError(null);

      // Resolve email → UUID
      const res = await apiClient.get('/users/students/directory');
      const all = res.data.data;
      // also include admins: fetch from a general endpoint if needed
      const found = all.find((u) => u.email.toLowerCase() === composeForm.receiverEmail.trim().toLowerCase());
      if (!found) {
        setComposeError(`No user found with email "${composeForm.receiverEmail}". Make sure the recipient exists.`);
        return;
      }

      await apiClient.post('/mail/send', {
        receiverId: found.id,
        subject: composeForm.subject,
        body: composeForm.body,
      });
      setComposeSuccess(true);
      setComposeForm({ receiverEmail: '', subject: '', body: '' });
      setUserSuggestions([]);
    } catch (e) {
      setComposeError(e.response?.data?.message || e.message);
    } finally {
      setComposeSending(false);
    }
  };

  // --- Render helpers ---

  const formatDate = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now - d;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString();
  };

  const renderSidebar = () => (
    <div className="mailbox-sidebar">
      <button
        className={`sidebar-btn ${activeView === 'inbox' ? 'active' : ''}`}
        onClick={handleViewInbox}
      >
        <Inbox size={16} /> Inbox
        {inboxPagination && inboxPagination.unreadCount > 0 && (
          <span className="sidebar-count">{inboxPagination.unreadCount}</span>
        )}
      </button>
      <button
        className={`sidebar-btn ${activeView === 'sent' ? 'active' : ''}`}
        onClick={handleViewSent}
      >
        <Send size={16} /> Sent
      </button>
      <button
        className={`sidebar-btn ${activeView === 'compose' ? 'active' : ''}`}
        onClick={handleViewCompose}
      >
        <PenSquare size={16} /> Compose
      </button>
    </div>
  );

  const renderMessageList = (messages, loading, pagination, onLoadMore) => (
    <div className="message-list">
      {loading && messages.length === 0 ? (
        <p className="status-message">Loading messages...</p>
      ) : messages.length === 0 ? (
        <p className="status-message">No messages.</p>
      ) : (
        <>
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`message-row ${!msg.is_read && activeView === 'inbox' ? 'unread' : ''} ${selectedMessage?.id === msg.id ? 'selected' : ''}`}
              onClick={() => handleOpenMessage(msg)}
            >
              <div className="message-row-icon">
                {msg.is_read ? <MailOpen size={16} /> : <Mail size={16} />}
              </div>
              <div className="message-row-content">
                <span className="message-row-name">
                  {activeView === 'inbox' ? msg.sender_name : msg.receiver_name}
                </span>
                <span className="message-row-subject">{msg.subject}</span>
              </div>
              <span className="message-row-date">{formatDate(msg.created_at)}</span>
            </div>
          ))}
          {pagination && pagination.page < pagination.totalPages && (
            <button className="load-more-btn" onClick={onLoadMore} disabled={loading}>
              {loading ? 'Loading...' : 'Load more'}
            </button>
          )}
        </>
      )}
    </div>
  );

  const renderDetail = () => {
    if (!selectedMessage) return null;

    const msg = selectedMessage;

    return (
      <div className="message-detail">
        <button className="back-btn" onClick={() => setActiveView(activeView === 'detail' ? (selectedMessage.sender_id === userId ? 'sent' : 'inbox') : 'inbox')}>
          <ArrowLeft size={16} /> Back
        </button>
        <div className="detail-header">
          <h3>{msg.subject}</h3>
          <div className="detail-meta">
            <div className="detail-meta-row">
              <User size={14} />
              <span className="meta-label">{msg.sender_id === userId ? 'To:' : 'From:'}</span>
              <span className="meta-value">{msg.sender_id === userId ? msg.receiver_name : msg.sender_name}</span>
              <span className="meta-email">
                ({msg.sender_id === userId ? msg.receiver_email : msg.sender_email})
              </span>
            </div>
            <div className="detail-meta-row">
              <Clock size={14} />
              <span className="meta-label">Date:</span>
              <span className="meta-value">{new Date(msg.created_at).toLocaleString()}</span>
            </div>
            <div className="detail-meta-row">
              {msg.is_read ? <Eye size={14} /> : <Mail size={14} />}
              <span className="meta-label">Status:</span>
              <span className="meta-value">
                {msg.is_read
                  ? `Read ${msg.read_at ? `(${new Date(msg.read_at).toLocaleString()})` : ''}`
                  : 'Unread'}
              </span>
            </div>
          </div>
        </div>
        <div className="detail-body">
          {msg.body.split('\n').map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </div>
      </div>
    );
  };

  const renderCompose = () => (
    <div className="compose-form">
      <h3><PenSquare size={16} /> New Message</h3>
      {composeSuccess ? (
        <div className="compose-success">
          <p>Message sent successfully!</p>
          <button className="btn btn-primary" onClick={handleViewInbox}>Go to Inbox</button>
          <button className="btn btn-secondary" style={{ marginLeft: 8 }} onClick={() => {
            setComposeSuccess(false);
            setComposeForm({ receiverEmail: '', subject: '', body: '' });
          }}>Send Another</button>
        </div>
      ) : (
        <form onSubmit={handleSend}>
          {/* To: field with autocomplete */}
          <div className="compose-field" style={{ position: 'relative' }}>
            <label>To (Email)</label>
            <input
              name="receiverEmail"
              type="email"
              value={composeForm.receiverEmail}
              onChange={handleReceiverEmailChange}
              onBlur={() => setTimeout(() => setUserSuggestions([]), 200)}
              placeholder="Search by name or email..."
              autoComplete="off"
              required
            />
            {userSuggestions.length > 0 && (
              <ul style={{
                position: 'absolute', top: '100%', left: 0, right: 0,
                background: '#1e1b4b', border: '1px solid #4f46e5', borderRadius: '6px',
                listStyle: 'none', margin: 0, padding: '4px 0', zIndex: 100,
                boxShadow: '0 8px 24px rgba(0,0,0,0.4)'
              }}>
                {userSuggestions.map((u) => (
                  <li
                    key={u.id}
                    onMouseDown={() => handlePickSuggestion(u)}
                    style={{
                      padding: '8px 14px', cursor: 'pointer', display: 'flex',
                      flexDirection: 'column', gap: '2px',
                      borderBottom: '1px solid rgba(255,255,255,0.05)'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#2d2564'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    <span style={{ fontWeight: 600, color: '#e2e8f0', fontSize: '0.9rem' }}>{u.full_name}</span>
                    <span style={{ color: '#94a3b8', fontSize: '0.78rem' }}>{u.email}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="compose-field">
            <label>Subject</label>
            <input
              name="subject"
              value={composeForm.subject}
              onChange={(e) => setComposeForm((p) => ({ ...p, subject: e.target.value }))}
              placeholder="Message subject"
              required
              maxLength={200}
            />
          </div>
          <div className="compose-field">
            <label>Body</label>
            <textarea
              name="body"
              value={composeForm.body}
              onChange={(e) => setComposeForm((p) => ({ ...p, body: e.target.value }))}
              placeholder="Write your message here..."
              required
              rows={10}
            />
          </div>
          {composeError && <p className="form-error">{composeError}</p>}
          <div className="compose-actions">
            <button type="submit" className="btn btn-primary" disabled={composeSending}>
              {composeSending ? 'Sending...' : 'Send Message'}
            </button>
          </div>
        </form>
      )}
    </div>
  );

  const renderMainContent = () => {
    if (!isAuthenticated) {
      return (
        <div className="mailbox-empty">
          <p>Please sign in to access the mailbox.</p>
        </div>
      );
    }

    if (activeView === 'compose') {
      return renderCompose();
    }

    if (error) {
      const isForbidden = error.includes('disabled') || error === 'Forbidden' || error.includes('not assigned');
      return (
        <div className="mailbox-empty">
          <div className="error-container" style={{ textAlign: 'center' }}>
            <p className="error" style={{ color: '#dc2626', fontWeight: '500' }}>{error}</p>
            {isForbidden && (
              <p style={{ marginTop: '0.5rem', opacity: 0.7 }}>
                This is enforced by the batch settings for your cohort.
              </p>
            )}
          </div>
        </div>
      );
    }

    switch (activeView) {
      case 'inbox':
        return renderMessageList(inboxMessages, inboxLoading, inboxPagination, handleLoadMoreInbox);
      case 'sent':
        return renderMessageList(sentMessages, sentLoading, sentPagination, handleLoadMoreSent);
      case 'detail':
        return renderDetail();
      default:
        return null;
    }
  };

  return (
    <div className="mailbox-page">
      {renderSidebar()}
      <div className="mailbox-main">
        {renderMainContent()}
      </div>
    </div>
  );
}
