import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { supabase, fetchUserProfile } from '../lib/supabaseClient';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Sync session state with Supabase Auth
  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      setSession(initialSession);
      if (initialSession?.user) {
        fetchUserProfile(initialSession.user.id).then((profile) => {
          setUser(profile);
          // Mount check for invite links
          if (window.location.hash.includes('access_token')) {
            window.location.hash = ''; // Clear hash
            window.location.assign('/profile');
          }
        });
      }
      setLoading(false);
    });

    // Subscribe to auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, newSession) => {
        setSession(newSession);
        if (newSession?.user) {
          fetchUserProfile(newSession.user.id).then((profile) => {
            setUser(profile);
            
            // AUTO-REDIRECT FOR INVITE LINKS
            // If the user arrived via a #access_token=... (invite/recovery),
            // take them straight to the profile page to set their password.
            if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
              if (window.location.hash.includes('access_token')) {
                console.log('Detected invitation/recovery link, redirecting to profile...');
                // Small delay to allow session to settle
                setTimeout(() => {
                  window.location.hash = ''; // Clear hash
                  window.location.assign('/profile');
                }, 800);
              }
            }
          });
        } else {
          setUser(null);
        }
      }
    );

    return () => subscription?.unsubscribe();
  }, []);

  const login = useCallback(async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;

    // Session and user will be set by onAuthStateChange
    return data;
  }, []);

  const logout = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    // Session and user will be cleared by onAuthStateChange
  }, []);

  const value = useMemo(
    () => ({
      session,
      user,
      login,
      logout,
      loading,
      isAuthenticated: !!session?.user,
      isAdmin: user?.role === 'ADMIN',
      isStudent: user?.role === 'STUDENT',
      userId: user?.id || null
    }),
    [session, user, login, logout, loading]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
