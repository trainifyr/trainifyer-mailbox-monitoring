import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import apiClient from '../../api/client';
import {
  Inbox, Send, PenSquare, ChevronLeft, Mail, MailOpen,
  Paperclip, Eye, Clock, User, ArrowLeft, 
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

  // Compose state
  const [composeForm, setComposeForm] = useState({ receiverEmail: '', subject: '', body: '' });
  const [composeSending, setComposeSending] = useState(false);
  const [composeError, setComposeError] = useState(null);
  const [composeSuccess, setComposeSuccess] = useState(false);
  const [userSuggestions, setUserSuggestions] = useState([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);

  const [error, setError] = useState(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');

  const fetchInbox = useCallback(async (page) => {
    try {
      setInboxLoading(true);
      setError(null);
      const res = await apiClient.get(`/mail/inbox?page=${page}&limit=${PAGE_SIZE}`);
      if (page === 1) setInboxMessages(res.data.data);
      else setInboxMessages((prev) => [...prev, ...res.data.data]);
      setInboxPagination(res.data.pagination);
    } catch (e) {
      setError(e.response?.data?.message || e.message);
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
      if (page === 1) setSentMessages(res.data.data);
      else setSentMessages((prev) => [...prev, ...res.data.data]);
      setSentPagination(res.data.pagination);
    } catch (e) {
      setError(e.response?.data?.message || e.message);
      if (page === 1) setSentMessages([]);
    } finally {
      setSentLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    setSearchQuery(''); // Reset search when switching views
    if (activeView === 'inbox') { setInboxPage(1); fetchInbox(1); }
    if (activeView === 'sent') { setSentPage(1); fetchSent(1); }
  }, [activeView, isAuthenticated, fetchInbox, fetchSent]);

  const handleOpenMessage = async (msg) => {
    setSelectedMessage(msg);
    setActiveView('detail');
    if (!msg.is_read) {
      try {
        await apiClient.patch(`/mail/${msg.id}/read`);
        setInboxMessages(prev => prev.map(m => m.id === msg.id ? { ...m, is_read: true } : m));
        setInboxPagination(prev => prev ? { ...prev, unreadCount: Math.max(0, prev.unreadCount - 1) } : prev);
      } catch {}
    }
  };

  const handleReply = (msg) => {
    const date = new Date(msg.created_at).toLocaleString();
    const quotedBody = msg.body
      .split('\n')
      .map(line => `> ${line}`)
      .join('\n');
    setComposeForm({
      receiverEmail: msg.sender_email,
      subject: msg.subject.startsWith('Re: ') ? msg.subject : `Re: ${msg.subject}`,
      body: `\n\n--- On ${date}, ${msg.sender_name} wrote: ---\n${quotedBody}`
    });
    setComposeSuccess(false);
    setComposeError(null);
    setActiveView('compose');
  };

  const handleDelete = async (id, isDetail = false) => {
    if (!window.confirm('Are you sure you want to delete this message?')) return;
    try {
      await apiClient.delete(`/mail/${id}`);
      if (isDetail) {
        setActiveView(selectedMessage.sender_id === userId ? 'sent' : 'inbox');
        setSelectedMessage(null);
      } else {
        if (activeView === 'inbox') fetchInbox(inboxPage);
        else if (activeView === 'sent') fetchSent(sentPage);
      }
    } catch (e) {
      alert(e.response?.data?.message || e.message);
    }
  };

  const handleReceiverEmailChange = async (e) => {
    const val = e.target.value;
    setComposeForm(prev => ({ ...prev, receiverEmail: val }));
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
    try {
      setComposeSending(true);
      setComposeError(null);
      const res = await apiClient.get('/users/students/directory');
      const found = res.data.data.find(u => u.email.toLowerCase() === composeForm.receiverEmail.trim().toLowerCase());
      if (!found) { setComposeError(`No user found with email "${composeForm.receiverEmail}".`); return; }
      await apiClient.post('/mail/send', { receiverId: found.id, subject: composeForm.subject, body: composeForm.body });
      setComposeSuccess(true);
      setComposeForm({ receiverEmail: '', subject: '', body: '' });
    } catch (e) {
      setComposeError(e.response?.data?.message || e.message);
    } finally {
      setComposeSending(false);
    }
  };

  // Filter messages based on searchQuery (subject, sender/receiver name, body)
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
    <div className="animate-fade-in card" style={{ height: 'calc(100vh - var(--nav-height) - 4rem)', display: 'grid', gridTemplateColumns: '260px 1fr', overflow: 'hidden', padding: 0 }}>
      {/* Sidebar */}
      <aside style={{ background: 'var(--border-light)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '1.5rem' }}>
           <button onClick={() => setActiveView('compose')} className="btn btn-primary" style={{ width: '100%', borderRadius: '12px', padding: '0.875rem' }}>
              <PenSquare size={18} /> Compose
           </button>
        </div>
        
        <nav style={{ flex: 1, padding: '0 0.75rem' }}>
           <button onClick={() => setActiveView('inbox')} className={`nav-link ${activeView === 'inbox' ? 'active' : ''}`} style={{ width: 'calc(100% - 1.5rem)', color: activeView === 'inbox' ? 'white' : 'var(--text-main)', border: 'none', background: activeView === 'inbox' ? 'var(--primary)' : 'transparent', textAlign: 'left', cursor: 'pointer' }}>
              <Inbox size={18} /> Inbox
              {inboxPagination?.unreadCount > 0 && <span className="counter-badge" style={{ marginLeft: 'auto', background: 'white', color: 'var(--primary)' }}>{inboxPagination.unreadCount}</span>}
           </button>
           <button onClick={() => setActiveView('sent')} className={`nav-link ${activeView === 'sent' ? 'active' : ''}`} style={{ width: 'calc(100% - 1.5rem)', color: activeView === 'sent' ? 'white' : 'var(--text-main)', border: 'none', background: activeView === 'sent' ? 'var(--primary)' : 'transparent', textAlign: 'left', cursor: 'pointer' }}>
              <Send size={18} /> Sent
           </button>
        </nav>
      </aside>

      {/* Main Mail Area */}
      <main style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
         <div style={{ padding: '1.25rem 2rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: '1.125rem', textTransform: 'capitalize' }}>{activeView}</h2>
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

         <div style={{ flex: 1, overflowY: 'auto' }}>
            {activeView === 'compose' ? (
               <div style={{ padding: '2.5rem', maxWidth: '800px' }}>
                  {composeSuccess ? (
                    <div style={{ textAlign: 'center', padding: '4rem' }}>
                       <div style={{ width: '64px', height: '64px', background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem' }}><CheckCircle2 size={32} /></div>
                       <h3 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Message Dispatched</h3>
                       <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>Your message has been successfully delivered to the recipient.</p>
                       <button className="btn btn-primary" onClick={() => { setComposeSuccess(false); setActiveView('inbox'); }}>Back to Inbox</button>
                    </div>
                  ) : (
                    <form onSubmit={handleSend} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                       <div className="input-group">
                          <label className="label">Recipient</label>
                          <div style={{ position: 'relative' }}>
                             <input className="input" placeholder="Type name or email..." value={composeForm.receiverEmail} onChange={handleReceiverEmailChange} onBlur={() => setTimeout(() => setUserSuggestions([]), 200)} required />
                             {userSuggestions.length > 0 && (
                               <div className="card" style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100, marginTop: '4px', padding: '4px' }}>
                                 {userSuggestions.map(u => (
                                   <div key={u.id} onClick={() => setComposeForm(p => ({...p, receiverEmail: u.email}))} style={{ padding: '8px 12px', cursor: 'pointer', borderRadius: '6px' }} onMouseEnter={e => e.target.style.background = 'var(--bg-app)'} onMouseLeave={e => e.target.style.background = 'transparent'}>
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
                          <textarea className="input" style={{ minHeight: '300px', resize: 'vertical' }} placeholder="Compose your update..." value={composeForm.body} onChange={e => setComposeForm(p => ({...p, body: e.target.value}))} required />
                       </div>
                       {composeError && <div style={{ color: '#ef4444', fontSize: '0.875rem' }}>{composeError}</div>}
                       <button type="submit" className="btn btn-primary" style={{ width: 'fit-content' }} disabled={composeSending}>{composeSending ? 'Dispatching...' : 'Send Message'}</button>
                    </form>
                  )}
               </div>
            ) : activeView === 'detail' && selectedMessage ? (
               <div style={{ padding: '2.5rem' }}>
                  <button className="btn btn-ghost" onClick={() => setActiveView(selectedMessage.sender_id === userId ? 'sent' : 'inbox')} style={{ marginBottom: '2rem', paddingLeft: 0 }}><ArrowLeft size={18} /> Back to {selectedMessage.sender_id === userId ? 'Sent' : 'Inbox'}</button>
                  <div style={{ marginBottom: '2.5rem' }}>
                     <h1 style={{ fontSize: '1.75rem', marginBottom: '1.5rem' }}>{selectedMessage.subject}</h1>
                     <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'var(--border-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: 'var(--primary)' }}>{selectedMessage.sender_name.charAt(0)}</div>
                        <div style={{ flex: 1 }}>
                           <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span style={{ fontWeight: 700, color: 'var(--text-heading)' }}>{selectedMessage.sender_name}</span>
                              <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>{new Date(selectedMessage.created_at).toLocaleString()}</span>
                           </div>
                           <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>to {selectedMessage.receiver_name} &lt;{selectedMessage.receiver_email}&gt;</div>
                        </div>
                     </div>
                  </div>
                  <div style={{ padding: '2rem 0', borderTop: '1px solid var(--border)', lineHeight: '1.8', color: 'var(--text-main)', whiteSpace: 'pre-wrap' }}>
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
                        onClick={() => handleDelete(selectedMessage.id, true)}
                        style={{ border: '1px solid #fee2e2', background: '#fef2f2', color: '#dc2626' }}
                      >
                        <Trash2 size={16} style={{ marginRight: '6px' }} /> Delete
                      </button>
                    </div>
               </div>
            ) : (
               <div className="animate-fade-in">
                  {(() => {
                    const allMsgs = activeView === 'inbox' ? inboxMessages : sentMessages;
                    const filtered = filterMessages(allMsgs);
                    if (filtered.length === 0) return (
                      <div style={{ padding: '6rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                         <Mail size={48} style={{ opacity: 0.1, marginBottom: '1rem' }} />
                         <p>{searchQuery ? `No results for "${searchQuery}"` : `Your ${activeView} is empty.`}</p>
                      </div>
                    );
                    return filtered.map(msg => (
                      <div key={msg.id} onClick={() => handleOpenMessage(msg)} style={{ padding: '1rem 2rem', borderBottom: '1px solid var(--border)', display: 'grid', gridTemplateColumns: '180px 1fr 100px 40px', gap: '2rem', alignItems: 'center', cursor: 'pointer', background: !msg.is_read && activeView === 'inbox' ? 'var(--primary-glow)' : 'transparent', fontWeight: !msg.is_read && activeView === 'inbox' ? 600 : 400 }}>
                         <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', overflow: 'hidden' }}>
                            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: !msg.is_read && activeView === 'inbox' ? 'var(--primary)' : 'transparent' }} />
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{activeView === 'inbox' ? msg.sender_name : msg.receiver_name}</span>
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
                    ));
                  })()}
               </div>
            )}
         </div>
      </main>
    </div>
  );
}
