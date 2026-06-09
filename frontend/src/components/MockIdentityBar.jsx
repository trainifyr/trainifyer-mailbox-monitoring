// TODO(PHASE-8: REMOVE) - Floating developer helper. Will be deleted in WI-803.

import React from 'react';
import { useMockIdentity } from '../context/MockIdentityContext';
import { UserCog, GraduationCap, LogOut } from 'lucide-react';
import './MockIdentityBar.css';

export default function MockIdentityBar() {
  const { role, userId, cohortId, setIdentity } = useMockIdentity();

  const setAdmin = () => setIdentity({ role: 'ADMIN', userId: 'admin-001', cohortId: null });
  const setStudent = () => setIdentity({ role: 'STUDENT', userId: 'student-001', cohortId: 'cohort-1' });
  const clear = () => setIdentity({ role: null, userId: null, cohortId: null });

  return (
    <div className="mock-identity-bar" data-testid="mock-identity-bar">
      <span className="mock-label">MOCK IDENTITY</span>
      <button
        className={`mock-btn ${role === 'ADMIN' ? 'active' : ''}`}
        onClick={setAdmin}
      >
        <UserCog size={14} /> Admin (admin-001)
      </button>
      <button
        className={`mock-btn ${role === 'STUDENT' ? 'active' : ''}`}
        onClick={setStudent}
      >
        <GraduationCap size={14} /> Student (student-001, cohort-1)
      </button>
      <button className="mock-btn clear" onClick={clear}>
        <LogOut size={14} /> Clear
      </button>
      {role && (
        <span className="mock-status">
          Active: {role} / {userId} / {cohortId || '—'}
        </span>
      )}
    </div>
  );
}
