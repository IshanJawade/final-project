import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

const AuthContext = createContext(null);

const STORAGE_KEY = 'hipaa-mvp-auth';

export function AuthProvider({ children }) {
  const [authState, setAuthState] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : { token: null, role: null, account: null };
    } catch (err) {
      return { token: null, role: null, account: null };
    }
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(authState));
  }, [authState]);

  const value = useMemo(
    () => ({
      ...authState,
      setAuth: (next) => setAuthState(next),
      clearAuth: () => setAuthState({ token: null, role: null, account: null }),
    }),
    [authState]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
