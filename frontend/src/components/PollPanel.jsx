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

  // Fetch initial data
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
          }
          else if (payload.eventType === 'UPDATE') setPolls((prev) => prev.map((p) => (p.id === payload.new.id ? payload.new : p)));
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
    const { error } = await supabase.from('meeting_poll_votes').upsert(
      { poll_id: pollId, voter_id: userId || null, voter_name: userName, option_index: optionIndex, voted_at: new Date().toISOString() },
      { onConflict: 'one_vote_per_user_poll' }
    );
    if (error) console.error('Failed to vote:', error.message);
  };

  const closePoll = async (pollId) => {
    await supabase.from('meeting_polls').update({ is_closed: true }).eq('id', pollId);
  };

  const addOption = () => { if (newOptions.length < 5) setNewOptions([...newOptions, '']); };
  const updateOption = (i, v) => { const u = [...newOptions]; u[i] = v; setNewOptions(u); };
  const removeOption = (i) => setNewOptions(newOptions.filter((_, idx) => idx !== i));

  // Visibility rule: hide closed polls created before this user's session
  const visiblePolls = polls.filter((poll) => {
    if (!poll.is_closed) return true;
    if (!sessionJoinedAt) return true;
    return new Date(poll.created_at) > new Date(sessionJoinedAt);
  });

  return (
    <div className="poll-panel animate-fade-in-right">
      {/* Header — same height as meeting-room-header (52px) */}
      <div className="poll-panel-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <BarChart2 size={18} />
          <h2>Live Polls</h2>
        </div>
        <button
          onClick={onClose}
          title="Close"
          style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 8, transition: 'background 0.15s, color 0.15s' }}
          onMouseEnter={e => { e.currentTarget.style.background='rgba(255,255,255,0.07)'; e.currentTarget.style.color='#fff'; }}
          onMouseLeave={e => { e.currentTarget.style.background='none'; e.currentTarget.style.color='rgba(255,255,255,0.4)'; }}
        ><X size={18} /></button>
      </div>

      <div className="poll-panel-content">

        {/* Create Poll trigger */}
        {!isCreating && (
          <button className="poll-create-trigger" onClick={() => setIsCreating(true)}>
            <Plus size={15} /> Create New Poll
          </button>
        )}

        {/* Create Poll form */}
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
                    <button type="button" className="poll-option-remove-btn" onClick={() => removeOption(i)}>
                      <X size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {newOptions.length < 5 && (
              <button type="button" className="poll-add-option-btn" onClick={addOption}>
                + Add option
              </button>
            )}
            <div className="poll-form-actions">
              <button type="submit" className="poll-btn-launch">Launch</button>
              <button type="button" className="poll-btn-cancel" onClick={() => setIsCreating(false)}>Cancel</button>
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
                  {/* Question row */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '0.85rem' }}>
                    <p className="poll-card-title">{poll.question}</p>
                    {poll.is_closed && <span className="poll-closed-badge">Closed</span>}
                  </div>

                  {/* Options */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                    {poll.options.map((opt, i) => {
                      const optVoters = pollVotes.filter((v) => v.option_index === i);
                      const pct = totalVotes === 0 ? 0 : Math.round((optVoters.length / totalVotes) * 100);
                      const myVote = optVoters.find((v) => v.voter_name === userName);

                      return (
                        <div key={i} className="poll-option-row">
                        <button
                            className={`poll-option-btn${myVote ? ' selected' : ''}`}
                            disabled={poll.is_closed}
                            onClick={() => handleVote(poll.id, i)}
                          >
                            {/* pointer-events:none on inner divs so clicks always reach the button */}
                            <div className="poll-option-progress" style={{ width: `${pct}%`, pointerEvents: 'none' }} />
                            <div className="poll-option-content" style={{ pointerEvents: 'none' }}>
                              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                {myVote && <Check size={12} />}{opt}
                              </span>
                              <span style={{ fontWeight: 700, fontSize: '0.75rem', flexShrink: 0 }}>{pct}%</span>
                            </div>
                          </button>
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
                      <button className="poll-close-btn" onClick={() => closePoll(poll.id)}>Close poll</button>
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
