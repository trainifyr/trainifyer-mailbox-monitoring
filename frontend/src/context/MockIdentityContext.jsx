// TODO(PHASE-8: REMOVE) - This provider simulates authenticated users during
// Phases 1-7. In Phase 8 (WI-803), it will be deleted and replaced with a
// real auth provider backed by Supabase.

import React, { createContext, useContext, useState, useMemo, useEffect } from 'react';

const MockIdentityContext = createContext(null);

export function MockIdentityProvider({ children }) {
  // Load from localStorage on init
  const [identity, setIdentityState] = useState(() => {
    const saved = localStorage.getItem('mock_identity');
    return saved ? JSON.parse(saved) : { role: null, userId: null, cohortId: null };
  });

  // Wrapper to save to localStorage
  const setIdentity = (newIdentity) => {
    setIdentityState(newIdentity);
    localStorage.setItem('mock_identity', JSON.stringify(newIdentity));
  };

  const value = useMemo(
    () => ({
      ...identity,
      setIdentity,
      isAdmin: identity.role === 'ADMIN',
      isStudent: identity.role === 'STUDENT',
      isAuthenticated: !!identity.role
    }),
    [identity]
  );

  return (
    <MockIdentityContext.Provider value={value}>
      {children}
    </MockIdentityContext.Provider>
  );
}

export function useMockIdentity() {
  const ctx = useContext(MockIdentityContext);
  if (!ctx) {
    throw new Error('useMockIdentity must be used within MockIdentityProvider');
  }
  return ctx;
}
