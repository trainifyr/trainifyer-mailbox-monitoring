import React, { useState, useEffect, useCallback } from 'react';
import supabase from '../lib/supabaseClient';
import { BarChart2, Plus, X, Check, Activity } from 'lucide-react';
import './PollPanel.css';

export default function PollPanel({ meetingId, userId, userName, isAdmin, sessionJoinedAt, onNewPoll, onClose }) {
  const [polls, setPolls] = useState([]);
  const [votes, setVotes] = useState([]);
  const [isCreating, setIsCreating] = useState(false);
  const [newQuestion, setNewQuestion] = useState('');
  const [newOptions, setNewOptions] = useState(['', '']);
  const [loading, setLoading] = useState(true);

  const fetchPollsAndVotes = useCallback(async () => {
    setLoading(true);
    const { data: pollsData, error: pollsError } = await supabase
      .from('meeting_polls')
      .select('*')
      .eq('meeting_id', meetingId)
      .order('created_at', { ascending: false });

    if (!pollsError && pollsData) setPolls(pollsData);

    const { data: votesData, error: votesError } = await supabase
      .from('meeting_poll_votes')
      .select('*')
      .in('poll_id', pollsData?.map((p) => p.id) || []);

    if (!votesError && votesData) setVotes(votesData);
    setLoading(false);
  }, [meetingId]);

  useEffect(() => {
    fetchPollsAndVotes();

    const sub = supabase.channel('polls-channel')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'meeting_polls', filter: `meeting_id=eq.${meetingId}` },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setPolls((prev) => [payload.new, ...prev]);
            if (onNewPoll) onNewPoll();
          } else if (payload.eventType === 'UPDATE') {
            setPolls((prev) => prev.map((p) => (p.id === payload.new.id ? payload.new : p)));
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'meeting_poll_votes' },
        (payload) => {
          if (payload.eventType === 'INSERT') setVotes((prev) => [...prev, payload.new]);
          else if (payload.eventType === 'UPDATE') setVotes((prev) => prev.map((v) => (v.id === payload.new.id ? payload.new : v)));
          else if (payload.eventType === 'DELETE') setVotes((prev) => prev.filter((v) => v.id !== payload.old.id));
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(sub); };
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
    // Check if the user already voted to update instead of insert (bypassing flaky upsert constraint logic)
    let query = supabase.from('meeting_poll_votes').select('id').eq('poll_id', pollId);
    if (userId) query = query.eq('voter_id', userId);
    else query = query.is('voter_id', null).eq('voter_name', userName);

    const { data: existingVote } = await query.maybeSingle();

    if (existingVote) {
      const { error } = await supabase.from('meeting_poll_votes')
        .update({ option_index: optionIndex, voted_at: new Date().toISOString() })
        .eq('id', existingVote.id);
      if (error) console.error('Failed to update vote:', error.message);
    } else {
      const { error } = await supabase.from('meeting_poll_votes').insert({
        poll_id: pollId,
        voter_id: userId || null,
        voter_name: userName,
        option_index: optionIndex,
      });
      if (error) console.error('Failed to insert vote:', error.message);
    }
  };

  const closePoll = async (pollId) => {
    await supabase.from('meeting_polls').update({ is_closed: true }).eq('id', pollId);
  };

  const addOption = () => { if (newOptions.length < 5) setNewOptions([...newOptions, '']); };
  const updateOption = (i, v) => { const u = [...newOptions]; u[i] = v; setNewOptions(u); };
  const removeOption = (i) => setNewOptions(newOptions.filter((_, idx) => idx !== i));

  // Visibility: hide closed polls from users who weren't present, but always show own polls
  const visiblePolls = polls.filter((poll) => {
    if (!poll.is_closed) return true;
    if (poll.creator_name === userName) return true;
    if (!sessionJoinedAt) return true;
    return new Date(poll.created_at) > new Date(sessionJoinedAt);
  });

  const handleOptionClick = (poll, optionIndex) => {
    if (poll.is_closed) return;
    handleVote(poll.id, optionIndex);
  };

  return (
    <div className="poll-panel animate-fade-in-right">
      {/* Header */}
      <div className="poll-panel-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <BarChart2 size={18} />
          <h2>Live Polls</h2>
        </div>
        <span
          onClick={onClose}
          title="Close"
          style={{
            color: 'rgba(255,255,255,0.4)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 32,
            height: 32,
            borderRadius: 8,
            userSelect: 'none',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; e.currentTarget.style.color = '#fff'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'rgba(255,255,255,0.4)'; }}
        >
          <X size={18} />
        </span>
      </div>

      <div className="poll-panel-content">
        {/* Create trigger */}
        {!isCreating && (
          <div className="poll-create-trigger" onClick={() => setIsCreating(true)}>
            <Plus size={15} /> Create New Poll
          </div>
        )}

        {/* Create form */}
        {isCreating && (
          <form className="poll-create-card animate-fade-in" onSubmit={handleCreatePoll}>
            <h3>New Poll</h3>
            <input
              className="input-field"
              placeholder="Ask a question…"
              value={newQuestion}
              onChange={(e) => setNewQuestion(e.target.value)}
              style={{ marginBottom: '0.75rem' }}
              autoFocus
              required
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.5rem' }}>
              {newOptions.map((opt, i) => (
                <div key={i} style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <input
                    className="input-field"
                    placeholder={`Option ${i + 1}`}
                    value={opt}
                    onChange={(e) => updateOption(i, e.target.value)}
                    required
                  />
                  {newOptions.length > 2 && (
                    <span className="poll-option-remove-btn" onClick={() => removeOption(i)}>
                      <X size={14} />
                    </span>
                  )}
                </div>
              ))}
            </div>
            {newOptions.length < 5 && (
              <div className="poll-add-option-btn" onClick={addOption}>
                + Add option
              </div>
            )}
            <div className="poll-form-actions">
              <button type="submit" className="poll-btn-launch">Launch</button>
              <span className="poll-btn-cancel" onClick={() => setIsCreating(false)}>Cancel</span>
            </div>
          </form>
        )}

        {/* Polls list */}
        {loading ? (
          <div className="poll-empty-state"><p>Loading polls…</p></div>
        ) : visiblePolls.length === 0 && !isCreating ? (
          <div className="poll-empty-state">
            <Activity size={28} style={{ opacity: 0.35 }} />
            <p>No active polls yet.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {visiblePolls.map((poll) => {
              const pollVotes = votes.filter((v) => v.poll_id === poll.id);
              const totalVotes = pollVotes.length;

              return (
                <div key={poll.id} className="poll-card">
                  {/* Question */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '0.85rem' }}>
                    <p className="poll-card-title">{poll.question}</p>
                    {poll.is_closed && <span className="poll-closed-badge">Closed</span>}
                  </div>

                  {/* Options — using div with onClick for maximum click compatibility */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                    {poll.options.map((opt, i) => {
                      const optVoters = pollVotes.filter((v) => v.option_index === i);
                      const pct = totalVotes === 0 ? 0 : Math.round((optVoters.length / totalVotes) * 100);
                      const myVote = optVoters.find((v) => v.voter_name === userName);
                      const isDisabled = poll.is_closed;

                      return (
                        <div key={i}>
                          <div
                            className={`poll-option-btn${myVote ? ' selected' : ''}${isDisabled ? ' disabled' : ''}`}
                            onClick={() => handleOptionClick(poll, i)}
                            style={{ cursor: isDisabled ? 'not-allowed' : 'pointer' }}
                          >
                            <div className="poll-option-progress" style={{ width: `${pct}%` }} />
                            <div className="poll-option-content">
                              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                {myVote && <Check size={12} />}{opt}
                              </span>
                              <span style={{ fontWeight: 700, fontSize: '0.75rem', flexShrink: 0 }}>{pct}%</span>
                            </div>
                          </div>
                          {optVoters.length > 0 && (
                            <div className="poll-voter-names">
                              {optVoters.map((v) => v.voter_name).join(', ')}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Footer */}
                  <div className="poll-meta-row">
                    <span>{totalVotes} vote{totalVotes !== 1 ? 's' : ''} · by {poll.creator_name}</span>
                    {isAdmin && !poll.is_closed && (
                      <span className="poll-close-btn" onClick={() => closePoll(poll.id)}>Close poll</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
