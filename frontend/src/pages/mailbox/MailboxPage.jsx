import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import apiClient from '../../api/client';
import {
  Inbox, Send, PenSquare, ChevronLeft, Mail, MailOpen,
  Paperclip, Eye, Clock, User, ArrowLeft, X, 
  Search,
  MoreVertical,
  CheckCircle2,
  AlertCircle,
  Trash2
} from 'lucide-react';

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

  // Search/Filters query
  const [searchQuery, setSearchQuery] = useState('');

  // Suggestions state
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [userSuggestions, setUserSuggestions] = useState([]);

  // Compose Message state
  const [composeForm, setComposeForm] = useState({ receiverEmail: '', receiverId: null, subject: '', body: '' });
  const [composeSending, setComposeSending] = useState(false);
  const [composeSuccess, setComposeSuccess] = useState(false);
  const [composeError, setComposeError] = useState(null);

  const fetchInbox = useCallback(async (page = 1) => {
    try {
      setInboxLoading(true);
      const res = await apiClient.get('/mail/inbox', { params: { page, limit: PAGE_SIZE } });
      setInboxMessages(res.data.data);
      setInboxPagination(res.data.pagination);
    } catch {
      setInboxMessages([]);
    } finally {
      setInboxLoading(false);
    }
  }, []);

  const fetchSent = useCallback(async (page = 1) => {
    try {
      setSentLoading(true);
      const res = await apiClient.get('/mail/sent', { params: { page, limit: PAGE_SIZE } });
      setSentMessages(res.data.data);
      setSentPagination(res.data.pagination);
    } catch {
      setSentMessages([]);
    } finally {
      setSentLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      fetchInbox(inboxPage);
      const interval = setInterval(() => fetchInbox(inboxPage), 15000);
      return () => clearInterval(interval);
    }
  }, [fetchInbox, inboxPage, isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchSent(sentPage);
      const interval = setInterval(() => fetchSent(sentPage), 15000);
      return () => clearInterval(interval);
    }
  }, [fetchSent, sentPage, isAuthenticated]);

  const handleOpenMessage = async (msg) => {
    setSelectedMessage(msg);
    setActiveView('detail');
    if (!msg.is_read && msg.sender_id !== userId) {
      try {
        await apiClient.patch(`/mail/${msg.id}/read`);
        // Update local state
        setInboxMessages(prev => prev.map(m => m.id === msg.id ? { ...m, is_read: true } : m));
        // Decr count if present
        setInboxPagination(prev => prev ? { ...prev, unreadCount: Math.max(0, prev.unreadCount - 1) } : prev);
      } catch (e) {
        console.error('Failed to mark message as read:', e);
      }
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await apiClient.post('/mail/read-all');
      setInboxMessages(prev => prev.map(m => ({ ...m, is_read: true })));
      setInboxPagination(prev => prev ? { ...prev, unreadCount: 0 } : prev);
    } catch (e) {
      console.error('Failed to mark all as read:', e);
    }
  };

  const handleReply = (msg) => {
    const date = new Date(msg.created_at).toLocaleString();
    const quotedBody = msg.body
      .split('\n')
      .map(line => `> ${line}`)
      .join('\n');
    setComposeForm({
      receiverEmail: `${msg.sender_name} <${msg.sender_email}>`,
      receiverId: msg.sender_id,
      subject: msg.subject.startsWith('Re: ') ? msg.subject : `Re: ${msg.subject}`,
      body: `\n\n--- On ${date}, ${msg.sender_name} wrote: ---\n${quotedBody}`
    });
    setComposeSuccess(false);
    setComposeError(null);
    setActiveView('compose');
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this message?')) return;
    try {
      await apiClient.delete(`/mail/${id}`);
      fetchInbox(inboxPage);
      fetchSent(sentPage);
      if (selectedMessage?.id === id) {
        setActiveView('inbox');
        setSelectedMessage(null);
      }
    } catch (e) {
      alert(e.response?.data?.message || e.message);
    }
  };

  const handleReceiverEmailChange = async (e) => {
    const val = e.target.value;
    setComposeForm(prev => ({ ...prev, receiverEmail: val, receiverId: null })); // clear id if they type manually
    if (val.length < 2) { setUserSuggestions([]); return; }
    try {
      setSuggestionsLoading(true);
      const res = await apiClient.get('/users/students/directory');
      const filtered = res.data.data.filter(u => u.email.toLowerCase().includes(val.toLowerCase()) || u.full_name.toLowerCase().includes(val.toLowerCase())).slice(0, 5);
      setUserSuggestions(filtered);
    } catch { setUserSuggestions([]); }
    finally { setSuggestionsLoading(false); }
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!composeForm.receiverId) {
      setComposeError('Please select a recipient from the dropdown suggestions.');
      return;
    }
    try {
      setComposeSending(true);
      setComposeError(null);
      await apiClient.post('/mail/send', { receiverId: composeForm.receiverId, subject: composeForm.subject, body: composeForm.body });
      setComposeSuccess(true);
      setComposeForm({ receiverEmail: '', receiverId: null, subject: '', body: '' });
      fetchSent(sentPage); // refresh immediately
    } catch (e) {
      setComposeError(e.response?.data?.message || e.message);
    } finally {
      setComposeSending(false);
    }
  };

  const filterMessages = (msgs) => {
    if (!searchQuery.trim()) return msgs;
    const q = searchQuery.toLowerCase();
    return msgs.filter(msg =>
      msg.subject?.toLowerCase().includes(q) ||
      msg.sender_name?.toLowerCase().includes(q) ||
      msg.receiver_name?.toLowerCase().includes(q) ||
      msg.body?.toLowerCase().includes(q)
    );
  };

  const formatDate = (iso) => {
    const d = new Date(iso);
    const now = new Date();
    if (now.toDateString() === d.toDateString()) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  return (
    <div className="animate-fade-in card" style={{ height: 'calc(100vh - var(--nav-height) - 4rem)', display: 'grid', gridTemplateColumns: '260px 1fr', overflow: 'hidden', padding: 0, position: 'relative' }}>
      {/* Sidebar */}
      <aside style={{ background: 'var(--border-light)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '1.5rem' }}>
           <button onClick={() => setActiveView('compose')} className="btn btn-primary" style={{ width: '100%', borderRadius: '12px', padding: '0.875rem' }}>
              <PenSquare size={18} /> Compose
           </button>
        </div>
        
        <nav style={{ flex: 1, padding: '0 0.75rem' }}>
           <button onClick={() => { setActiveView('inbox'); setSelectedMessage(null); }} className={`nav-link ${activeView === 'inbox' || (activeView === 'detail' && selectedMessage?.sender_id !== userId) ? 'active' : ''}`} style={{ width: 'calc(100% - 1.5rem)', color: (activeView === 'inbox' || (activeView === 'detail' && selectedMessage?.sender_id !== userId)) ? 'white' : 'var(--text-main)', border: 'none', background: (activeView === 'inbox' || (activeView === 'detail' && selectedMessage?.sender_id !== userId)) ? 'var(--primary)' : 'transparent', textAlign: 'left', cursor: 'pointer' }}>
              <Inbox size={18} /> Inbox
              {inboxPagination?.unreadCount > 0 && <span className="counter-badge" style={{ marginLeft: 'auto', background: 'white', color: 'var(--primary)' }}>{inboxPagination.unreadCount}</span>}
           </button>
           <button onClick={() => { setActiveView('sent'); setSelectedMessage(null); }} className={`nav-link ${activeView === 'sent' || (activeView === 'detail' && selectedMessage?.sender_id === userId) ? 'active' : ''}`} style={{ width: 'calc(100% - 1.5rem)', color: (activeView === 'sent' || (activeView === 'detail' && selectedMessage?.sender_id === userId)) ? 'white' : 'var(--text-main)', border: 'none', background: (activeView === 'sent' || (activeView === 'detail' && selectedMessage?.sender_id === userId)) ? 'var(--primary)' : 'transparent', textAlign: 'left', cursor: 'pointer' }}>
              <Send size={18} /> Sent
           </button>
        </nav>
      </aside>

      {/* Main Mail Area */}
      <main style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
         <div style={{ padding: '1.25rem 2rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <h2 style={{ fontSize: '1.125rem', textTransform: 'capitalize' }}>
                {activeView === 'detail' ? (selectedMessage?.sender_id === userId ? 'sent' : 'inbox') : activeView}
              </h2>
              {activeView === 'inbox' && inboxPagination?.unreadCount > 0 && (
                <button
                  className="btn"
                  style={{ fontSize: '0.75rem', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '6px' }}
                  onClick={handleMarkAllAsRead}
                >
                  <MailOpen size={14} /> Mark all as read
                </button>
              )}
            </div>
            <div style={{ position: 'relative' }}>
               <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
               <input
                 className="input"
                 placeholder="Search mail..."
                 value={searchQuery}
                 onChange={(e) => setSearchQuery(e.target.value)}
                 style={{ width: '200px', padding: '0.4rem 0.75rem 0.4rem 2rem', fontSize: '0.8125rem', borderRadius: '12px' }}
               />
            </div>
         </div>

         <div style={{ flex: 1, overflowY: 'auto', position: 'relative' }}>
            {/* Always Rendered Inbox / Sent Message List */}
            <div>
               {(() => {
                 const currentView = (activeView === 'compose' || activeView === 'detail') 
                   ? (selectedMessage?.sender_id === userId ? 'sent' : 'inbox') 
                   : activeView;
                 const allMsgs = currentView === 'sent' ? sentMessages : inboxMessages;
                 const filtered = filterMessages(allMsgs);
                 
                 const currentLoading = currentView === 'sent' ? sentLoading : inboxLoading;
                 if (currentLoading) return (
                   <div style={{ padding: '2rem' }}>
                     <div className="skeleton-block" style={{ width: '30%', marginBottom: '1.5rem', height: '1rem' }}></div>
                     <div className="skeleton-block" style={{ marginBottom: '1rem', height: '3rem' }}></div>
                     <div className="skeleton-block" style={{ marginBottom: '1rem', height: '3rem' }}></div>
                     <div className="skeleton-block" style={{ height: '3rem' }}></div>
                   </div>
                 );

                 if (filtered.length === 0) return (
                   <div style={{ padding: '6rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                      <Mail size={48} style={{ opacity: 0.1, marginBottom: '1rem' }} />
                      <p>{searchQuery ? `No results for "${searchQuery}"` : `Your ${currentView} is empty.`}</p>
                   </div>
                 );

                 return filtered.map(msg => {
                   const isSelected = selectedMessage?.id === msg.id && activeView === 'detail';
                   return (
                     <div key={msg.id} onClick={() => handleOpenMessage(msg)} style={{ padding: '1rem 2rem', borderBottom: '1px solid var(--border)', display: 'grid', gridTemplateColumns: '180px 1fr 100px 40px', gap: '2rem', alignItems: 'center', cursor: 'pointer', background: isSelected ? 'rgba(16, 185, 129, 0.12)' : (!msg.is_read && currentView === 'inbox' ? 'var(--primary-glow)' : 'transparent'), fontWeight: !msg.is_read && currentView === 'inbox' ? 600 : 400 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', overflow: 'hidden' }}>
                           <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: !msg.is_read && currentView === 'inbox' ? 'var(--primary)' : 'transparent' }} />
                           <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-heading)' }}>{currentView === 'inbox' ? msg.sender_name : msg.receiver_name}</span>
                        </div>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-heading)' }}>
                           <span style={{ color: 'var(--text-muted)', fontWeight: 400, marginRight: '8px' }}>{msg.subject}</span> — {msg.body.substring(0, 100)}...
                        </div>
                        <div style={{ textAlign: 'right', fontSize: '0.75rem', color: 'var(--text-muted)' }}>{formatDate(msg.created_at)}</div>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDelete(msg.id); }}
                          style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px' }}
                          aria-label="Delete message"
                        >
                           <Trash2 size={16} />
                        </button>
                     </div>
                   );
                 });
               })()}
            </div>

            {/* Compose Drawer Page (Notion slide sheet panel) */}
            <div className={`slide-sheet ${activeView === 'compose' ? 'active' : ''}`}>
               <div style={{ padding: '2.5rem', overflowY: 'auto', flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                    <h3 style={{ fontSize: '1.25rem' }}>New Message</h3>
                    <button className="btn btn-ghost" onClick={() => { setActiveView(selectedMessage ? 'detail' : 'inbox'); }} style={{ padding: '6px' }} title="Hide Panel"><X size={20} /></button>
                  </div>
                  {composeSuccess ? (
                    <div style={{ textAlign: 'center', padding: '3rem 0' }}>
                       <div style={{ width: '64px', height: '64px', background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem' }}><CheckCircle2 size={32} /></div>
                       <h3 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Message Dispatched</h3>
                       <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>Your message has been successfully delivered.</p>
                       <button className="btn btn-primary" onClick={() => { setComposeSuccess(false); setActiveView('inbox'); }}>Done</button>
                    </div>
                  ) : (
                    <form onSubmit={handleSend} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                       <div className="input-group">
                          <label className="label">Recipient</label>
                          <div style={{ position: 'relative' }}>
                             <input className="input" placeholder="Type name or email..." value={composeForm.receiverEmail} onChange={handleReceiverEmailChange} onBlur={() => setTimeout(() => setUserSuggestions([]), 200)} required />
                             {userSuggestions.length > 0 && (
                               <div className="card" style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100, marginTop: '4px', padding: '4px' }}>
                                 {userSuggestions.map(u => (
                                   <div key={u.id} onClick={() => setComposeForm(p => ({...p, receiverEmail: `${u.full_name} <${u.email}>`, receiverId: u.id}))} onMouseDown={(e) => e.preventDefault()} style={{ padding: '8px 12px', cursor: 'pointer', borderRadius: '6px' }} onMouseEnter={e => e.target.style.background = 'var(--border-light)'} onMouseLeave={e => e.target.style.background = 'transparent'}>
                                      <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{u.full_name}</div>
                                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{u.email}</div>
                                   </div>
                                 ))}
                               </div>
                             )}
                          </div>
                       </div>
                       <div className="input-group">
                          <label className="label">Subject</label>
                          <input className="input" placeholder="What is this about?" value={composeForm.subject} onChange={e => setComposeForm(p => ({...p, subject: e.target.value}))} required />
                       </div>
                       <div className="input-group">
                          <label className="label">Message Body</label>
                          <textarea className="input" style={{ minHeight: '220px', resize: 'vertical' }} placeholder="Compose your update..." value={composeForm.body} onChange={e => setComposeForm(p => ({...p, body: e.target.value}))} required />
                       </div>
                       {composeError && <div style={{ color: '#ef4444', fontSize: '0.875rem' }}>{composeError}</div>}
                       <button type="submit" className="btn btn-primary" style={{ width: 'fit-content' }} disabled={composeSending}>{composeSending ? 'Dispatching...' : 'Send Message'}</button>
                    </form>
                  )}
               </div>
            </div>

            {/* Message Details Drawer Panel (Notion slide sheet drawer) */}
            <div className={`slide-sheet ${activeView === 'detail' && selectedMessage ? 'active' : ''}`}>
               {selectedMessage && (
                 <div style={{ padding: '2.5rem', overflowY: 'auto', flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                      <button className="btn btn-ghost" onClick={() => { setActiveView(selectedMessage.sender_id === userId ? 'sent' : 'inbox'); setSelectedMessage(null); }} style={{ paddingLeft: 0 }}><ArrowLeft size={18} /> Back</button>
                      <button className="btn btn-ghost" onClick={() => { setActiveView(selectedMessage.sender_id === userId ? 'sent' : 'inbox'); setSelectedMessage(null); }} style={{ padding: '6px' }} title="Hide Panel"><X size={20} /></button>
                    </div>
                    <div style={{ marginBottom: '2.5rem' }}>
                       <h1 style={{ fontSize: '1.5rem', marginBottom: '1.5rem' }}>{selectedMessage.subject}</h1>
                       <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                          <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--border-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: 'var(--primary)' }}>{(selectedMessage.sender_name || selectedMessage.receiver_name || '?').charAt(0)}</div>
                          <div style={{ flex: 1 }}>
                             <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ fontWeight: 700, color: 'var(--text-heading)', fontSize: '0.95rem' }}>{selectedMessage.sender_id === userId ? selectedMessage.receiver_name : selectedMessage.sender_name}</span>
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{new Date(selectedMessage.created_at).toLocaleString()}</span>
                             </div>
                             <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                               {selectedMessage.sender_id === userId ? `to ${selectedMessage.receiver_name} <${selectedMessage.receiver_email}>` : `from ${selectedMessage.sender_name} <${selectedMessage.sender_email}>`}
                             </div>
                          </div>
                       </div>
                    </div>
                    <div style={{ padding: '2rem 0', borderTop: '1px solid var(--border)', lineHeight: '1.8', color: 'var(--text-main)', whiteSpace: 'pre-wrap', fontSize: '0.9375rem' }}>
                       {selectedMessage.body}
                    </div>
                    <div style={{ paddingTop: '1.5rem', borderTop: '1px solid var(--border)', display: 'flex', gap: '1rem' }}>
                      {selectedMessage.sender_id !== userId && (
                        <button
                          className="btn btn-primary"
                          onClick={() => handleReply(selectedMessage)}
                        >
                          Reply
                        </button>
                      )}
                      <button
                        className="btn btn-ghost"
                        onClick={() => handleDelete(selectedMessage.id)}
                        style={{ border: '1px solid #fee2e2', background: '#fef2f2', color: '#dc2626' }}
                      >
                        <Trash2 size={16} style={{ marginRight: '6px' }} /> Delete
                      </button>
                    </div>
                 </div>
               )}
            </div>
         </div>
      </main>
    </div>
  );
}
