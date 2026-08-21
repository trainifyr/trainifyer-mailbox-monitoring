import React, { useState, useEffect, useCallback } from 'react';
import supabase from '../lib/supabaseClient';
import { BarChart2, Plus, X, Check, Activity } from 'lucide-react';
import './PollPanel.css';

export default function PollPanel({ meetingId, userId, userName, isAdmin, sessionJoinedAt, onClose }) {
  const [polls, setPolls] = useState([]);
  const [votes, setVotes] = useState([]);
  const [isCreating, setIsCreating] = useState(false);
  const [newQuestion, setNewQuestion] = useState('');
  const [newOptions, setNewOptions] = useState(['', '']);
  const [loading, setLoading] = useState(true);

  // Fetch initial data
  const fetchPollsAndVotes = useCallback(async () => {
    setLoading(true);
    // Fetch polls
    const { data: pollsData, error: pollsError } = await supabase
      .from('meeting_polls')
      .select('*')
      .eq('meeting_id', meetingId)
      .order('created_at', { ascending: false });

    if (!pollsError && pollsData) setPolls(pollsData);

    // Fetch votes for these polls
    const { data: votesData, error: votesError } = await supabase
      .from('meeting_poll_votes')
      .select('*')
      .in('poll_id', pollsData?.map((p) => p.id) || []);

    if (!votesError && votesData) setVotes(votesData);
    setLoading(false);
  }, [meetingId]);

  useEffect(() => {
    fetchPollsAndVotes();

    // Supabase Realtime Subscriptions
    const sub = supabase.channel('polls-channel')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'meeting_polls', filter: `meeting_id=eq.${meetingId}` },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setPolls((prev) => [payload.new, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            setPolls((prev) => prev.map((p) => (p.id === payload.new.id ? payload.new : p)));
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'meeting_poll_votes' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setVotes((prev) => [...prev, payload.new]);
          } else if (payload.eventType === 'UPDATE') {
            setVotes((prev) => prev.map((v) => (v.id === payload.new.id ? payload.new : v)));
          } else if (payload.eventType === 'DELETE') {
            setVotes((prev) => prev.filter((v) => v.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(sub);
    };
  }, [meetingId, fetchPollsAndVotes]);

  const handleCreatePoll = async (e) => {
    e.preventDefault();
    const validOptions = newOptions.filter((opt) => opt.trim() !== '');
    if (!newQuestion.trim() || validOptions.length < 2) return;

    await supabase.from('meeting_polls').insert({
      meeting_id: meetingId,
      created_by: userId || null,
      creator_name: userName,
      question: newQuestion.trim(),
      options: validOptions,
    });

    setIsCreating(false);
    setNewQuestion('');
    setNewOptions(['', '']);
  };

  const handleVote = async (pollId, optionIndex) => {
    // If they already voted, upsert it (allows changing vote)
    const { error } = await supabase.from('meeting_poll_votes').upsert(
      {
        poll_id: pollId,
        voter_id: userId || null,
        voter_name: userName,
        option_index: optionIndex,
        voted_at: new Date().toISOString(),
      },
      { onConflict: 'one_vote_per_user_poll' }
    );
    if (error) {
      console.error('Failed to vote:', error.message);
    }
  };

  const closePoll = async (pollId) => {
    await supabase.from('meeting_polls').update({ is_closed: true }).eq('id', pollId);
  };

  const addOption = () => {
    if (newOptions.length < 5) setNewOptions([...newOptions, '']);
  };
  const updateOption = (index, value) => {
    const updated = [...newOptions];
    updated[index] = value;
    setNewOptions(updated);
  };
  const removeOption = (index) => {
    setNewOptions(newOptions.filter((_, i) => i !== index));
  };

  return (
    <div className="poll-panel animate-fade-in-right">
      <div className="poll-panel-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <BarChart2 size={20} />
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Live Polls</h2>
        </div>
        <button className="btn-icon" onClick={onClose}><X size={20} /></button>
      </div>

      <div className="poll-panel-content">
        {!isCreating && (
          <div style={{ marginBottom: '1.5rem' }}>
            <button
              className="btn btn-outline"
              style={{ width: '100%', justifyContent: 'center', borderColor: 'rgba(255,255,255,0.1)' }}
              onClick={() => setIsCreating(true)}
            >
              <Plus size={16} style={{ marginRight: '8px' }} />
              Create New Poll
            </button>
          </div>
        )}

        {isCreating && (
          <form className="poll-create-card animate-fade-in" onSubmit={handleCreatePoll}>
            <h3 style={{ marginBottom: '1rem', fontSize: '1rem' }}>Create Poll</h3>
            <input
              className="input-field"
              placeholder="Ask a question..."
              value={newQuestion}
              onChange={(e) => setNewQuestion(e.target.value)}
              style={{ marginBottom: '1rem' }}
              autoFocus
              required
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
              {newOptions.map((opt, i) => (
                <div key={i} style={{ display: 'flex', gap: '0.5rem' }}>
                  <input
                    className="input-field"
                    placeholder={`Option ${i + 1}`}
                    value={opt}
                    onChange={(e) => updateOption(i, e.target.value)}
                    required
                  />
                  {newOptions.length > 2 && (
                    <button type="button" className="btn-icon" onClick={() => removeOption(i)}>
                      <X size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {newOptions.length < 5 && (
              <button type="button" className="btn-text" onClick={addOption} style={{ fontSize: '0.875rem', marginBottom: '1.5rem' }}>
                + Add Option
              </button>
            )}
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>Launch</button>
              <button type="button" className="btn btn-ghost" onClick={() => setIsCreating(false)}>Cancel</button>
            </div>
          </form>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>Loading...</div>
        ) : polls.length === 0 && !isCreating ? (
          <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)' }}>
            <Activity size={32} style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
            <p>No polls have been created yet.</p>
          </div>
        ) : (() => {
            // Hide polls that are CLOSED and were created BEFORE this user joined this session.
            // Open polls are always shown regardless of join time.
            const visiblePolls = polls.filter((poll) => {
              if (!poll.is_closed) return true; // always show open polls
              if (!sessionJoinedAt) return true; // no join time recorded, show all
              return new Date(poll.created_at) > new Date(sessionJoinedAt);
            });
            if (visiblePolls.length === 0 && !isCreating) return (
              <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)' }}>
                <Activity size={32} style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
                <p>No polls have been created yet.</p>
              </div>
            );
            return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {visiblePolls.map((poll) => {
              const pollVotes = votes.filter((v) => v.poll_id === poll.id);
              const totalVotes = pollVotes.length;
              // To handle vote changes properly, we don't disable voting if they hasVoted.
              // But we should visually show their CURRENT vote

              return (
                <div key={poll.id} className="poll-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: 600, lineHeight: 1.4 }}>{poll.question}</h3>
                    {poll.is_closed && (
                      <span className="badge" style={{ background: 'rgba(255,255,255,0.1)' }}>Closed</span>
                    )}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {poll.options.map((opt, i) => {
                      const votesForOption = pollVotes.filter((v) => v.option_index === i);
                      const percentage = totalVotes === 0 ? 0 : Math.round((votesForOption.length / totalVotes) * 100);
                      const myVote = votesForOption.find((v) => v.voter_name === userName);

                      return (
                        <div key={i} className="poll-option-row">
                          <button
                            className={`poll-option-btn ${myVote ? 'selected' : ''}`}
                            disabled={poll.is_closed}
                            onClick={() => handleVote(poll.id, i)}
                          >
                            <div className="poll-option-progress" style={{ width: `${percentage}%` }}></div>
                            <div className="poll-option-content">
                              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                {myVote && <Check size={14} />} {opt}
                              </span>
                              <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>
                                {percentage}%
                              </span>
                            </div>
                          </button>
                          {votesForOption.length > 0 && (
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px', paddingLeft: '8px' }}>
                              {votesForOption.map(v => v.voter_name).join(', ')}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    <span>{totalVotes} vote{totalVotes !== 1 ? 's' : ''} • By {poll.creator_name}</span>
                    {isAdmin && !poll.is_closed && (
                      <button className="btn-text" onClick={() => closePoll(poll.id)} style={{ color: '#ef4444' }}>
                        Close Poll
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
            );
          })()}
      </div>
    </div>
  );
}
