import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Send, Pin, X } from 'lucide-react';
import './ChatPanel.css';

export default function ChatPanel({ meetingId, userId, userName, joinedAt, onClose }) {
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef(null);

  useEffect(() => {
    // 1. Fetch existing messages that are either pinned or created after joinedAt
    const fetchMessages = async () => {
      try {
        const { data, error } = await supabase
          .from('meeting_messages')
          .select('*')
          .eq('meeting_id', meetingId)
          .or(`is_pinned.eq.true,created_at.gte.${joinedAt}`)
          .order('created_at', { ascending: true });

        if (!error && data) {
          setMessages(data);
        }
      } catch (err) {
        console.error('Error fetching messages:', err);
      }
    };

    fetchMessages();

    // 2. Subscribe to realtime updates for this meeting
    const channel = supabase
      .channel(`meeting_messages_${meetingId}`)
      .on(
        'postgres_changes',
        { 
          event: '*', 
          schema: 'public', 
          table: 'meeting_messages',
          filter: `meeting_id=eq.${meetingId}` 
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            // Only add if pinned or sent after our join time
            if (payload.new.is_pinned || new Date(payload.new.created_at) >= new Date(joinedAt)) {
              setMessages((prev) => [...prev, payload.new]);
            }
          } else if (payload.eventType === 'UPDATE') {
            setMessages((prev) => 
              prev.map(m => m.id === payload.new.id ? payload.new : m)
            );
          } else if (payload.eventType === 'DELETE') {
            setMessages((prev) => prev.filter(m => m.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [meetingId, joinedAt]);

  useEffect(() => {
    // Scroll to bottom when messages change
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!inputValue.trim()) return;

    const newMsg = {
      meeting_id: meetingId,
      sender_id: userId,
      sender_name: userName,
      content: inputValue.trim(),
    };

    setInputValue('');

    const { error } = await supabase
      .from('meeting_messages')
      .insert([newMsg]);

    if (error) {
      console.error('Error sending message:', error);
      // Optional: add toast error handler here
    }
  };

  const handleTogglePin = async (msgId, currentPinStatus) => {
    const { error } = await supabase
      .from('meeting_messages')
      .update({ is_pinned: !currentPinStatus })
      .eq('id', msgId);

    if (error) console.error('Error pinning message:', error);
  };

  const pinnedMessages = messages.filter(m => m.is_pinned);
  const regularMessages = messages.filter(m => !m.is_pinned);

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <h3>Session Chat</h3>
        <button className="close-btn" onClick={onClose}><X size={20} /></button>
      </div>

      <div className="chat-content">
        {pinnedMessages.length > 0 && (
          <div className="pinned-messages-section">
            <h4 className="pinned-header">Pinned Messages</h4>
            {pinnedMessages.map((msg) => (
              <div key={msg.id} className="chat-message pinned-message">
                <div className="chat-message-header">
                  <span className="sender">{msg.sender_name}</span>
                  <span className="time">{new Date(msg.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                  {msg.sender_id === userId && (
                     <button className="pin-btn active" onClick={() => handleTogglePin(msg.id, msg.is_pinned)}>
                        <Pin size={12} />
                     </button>
                  )}
                </div>
                <div className="chat-message-body">{msg.content}</div>
              </div>
            ))}
          </div>
        )}

        <div className="messages-section">
          {regularMessages.length === 0 && pinnedMessages.length === 0 ? (
            <div className="empty-chat">No messages yet. Say hello!</div>
          ) : (
            regularMessages.map((msg) => (
              <div key={msg.id} className={`chat-message ${msg.sender_id === userId ? 'self' : ''}`}>
                <div className="chat-message-header">
                  <span className="sender">{msg.sender_id === userId ? 'You' : msg.sender_name}</span>
                  <span className="time">{new Date(msg.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                  {msg.sender_id === userId && (
                     <button className="pin-btn" onClick={() => handleTogglePin(msg.id, msg.is_pinned)} title="Pin this message for everyone">
                        <Pin size={12} />
                     </button>
                  )}
                </div>
                <div className="chat-message-body">{msg.content}</div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <form className="chat-input-area" onSubmit={handleSend}>
        <input
          type="text"
          placeholder="Type a message..."
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          maxLength={500}
        />
        <button type="submit" disabled={!inputValue.trim()} className="send-btn">
          <Send size={18} />
        </button>
      </form>
    </div>
  );
}
