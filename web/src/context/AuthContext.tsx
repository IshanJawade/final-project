import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { ApiError, ApiRequestOptions, apiRequest } from '../lib/api';
import { UserProfile } from '../types';

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

type StaffLoginInput = {
  email: string;
  password: string;
  totp_code?: string;
};

type PatientLoginInput = {
  identifier: string;
  password: string;
};

type AuthSuccessResponse = {
  access_token: string;
  expires_in: number;
  user: UserProfile;
};

type SessionStore = {
  accessToken: string;
  expiresAt: number;
  user: UserProfile;
};

type WithoutToken<T> = Omit<T, 'token'>;

type AuthContextValue = {
  status: AuthStatus;
  user: UserProfile | null;
  loginStaff: (input: StaffLoginInput) => Promise<void>;
  loginPatient: (input: PatientLoginInput) => Promise<void>;
  logout: () => Promise<void>;
  authedRequest: <T = unknown>(path: string, options?: WithoutToken<ApiRequestOptions>) => Promise<T>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const SESSION_KEY = 'mrs-session';
const EXPIRY_BUFFER_MS = 15_000;

const computeExpiry = (seconds: number) => {
  const raw = seconds * 1000;
  return Date.now() + Math.max(raw - EXPIRY_BUFFER_MS, 0);
};

const parseStoredSession = (raw: string | null): SessionStore | null => {
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as SessionStore;
    if (!parsed || typeof parsed.accessToken !== 'string') {
      return null;
    }
    return parsed;
  } catch (_err) {
    return null;
  }
};

type AuthProviderProps = {
  children: ReactNode;
};

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [sessionState, setSessionState] = useState<SessionStore | null>(null);
  const sessionRef = useRef<SessionStore | null>(null);
  const refreshPromiseRef = useRef<Promise<string> | null>(null);

  const setSession = useCallback((next: SessionStore | null) => {
    sessionRef.current = next;
    setSessionState(next);
    if (typeof window !== 'undefined') {
      if (next) {
        window.localStorage.setItem(SESSION_KEY, JSON.stringify(next));
      } else {
        window.localStorage.removeItem(SESSION_KEY);
      }
    }
  }, []);

  const clearSession = useCallback(() => {
    setSession(null);
  }, [setSession]);

  const toSession = useCallback((payload: AuthSuccessResponse): SessionStore => {
    return {
      accessToken: payload.access_token,
      expiresAt: computeExpiry(payload.expires_in),
      user: payload.user
    };
  }, []);

  const applyAuthResponse = useCallback(
    (payload: AuthSuccessResponse) => {
      const next = toSession(payload);
      setSession(next);
      setStatus('authenticated');
      return next;
    },
    [setSession, toSession]
  );

  const refresh = useCallback(async () => {
    if (!sessionRef.current) {
      throw new ApiError(401, 'Not authenticated');
    }
    if (refreshPromiseRef.current) {
      return refreshPromiseRef.current;
    }

    const promise = apiRequest<AuthSuccessResponse>('/auth/refresh', { method: 'POST' })
      .then((data) => {
        const next = applyAuthResponse(data);
        return next.accessToken;
      })
      .catch((error) => {
        clearSession();
        setStatus('unauthenticated');
        throw error;
      })
      .finally(() => {
        refreshPromiseRef.current = null;
      });

    refreshPromiseRef.current = promise;
    return promise;
  }, [applyAuthResponse, clearSession]);

  const ensureValidAccessToken = useCallback(async () => {
    const current = sessionRef.current;
    if (!current) {
      throw new ApiError(401, 'Not authenticated');
    }
    if (current.expiresAt <= Date.now()) {
      return refresh();
    }
    return current.accessToken;
  }, [refresh]);

  const loginStaff = useCallback(
    async (input: StaffLoginInput) => {
      const response = await apiRequest<AuthSuccessResponse>('/auth/staff/login', {
        method: 'POST',
        body: input
      });
      applyAuthResponse(response);
    },
    [applyAuthResponse]
  );

  const loginPatient = useCallback(
    async (input: PatientLoginInput) => {
      const response = await apiRequest<AuthSuccessResponse>('/auth/patient/login', {
        method: 'POST',
        body: input
      });
      applyAuthResponse(response);
    },
    [applyAuthResponse]
  );

  const logout = useCallback(async () => {
    try {
      await apiRequest('/auth/logout', { method: 'POST' });
    } catch (_err) {
      // Ignore logout errors; still clear local state.
    }
    clearSession();
    setStatus('unauthenticated');
  }, [clearSession]);

  const authedRequest = useCallback(
    async <T,>(path: string, options?: WithoutToken<ApiRequestOptions>): Promise<T> => {
      const attempt = async (): Promise<T> => {
        const token = await ensureValidAccessToken();
        return apiRequest<T>(path, { ...options, token });
      };

      try {
        return await attempt();
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          try {
            const token = await refresh();
            return await apiRequest<T>(path, { ...options, token });
          } catch (refreshError) {
            await logout();
            throw refreshError;
          }
        }
        throw error;
      }
    },
    [ensureValidAccessToken, refresh, logout]
  );

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const stored = parseStoredSession(window.localStorage.getItem(SESSION_KEY));
    if (!stored) {
      clearSession();
      setStatus('unauthenticated');
      return;
    }
    setSession(stored);
    setStatus('authenticated');
    if (stored.expiresAt <= Date.now()) {
      refresh().catch(() => {
        clearSession();
        setStatus('unauthenticated');
      });
    }
  }, [clearSession, refresh, setSession]);

  const value: AuthContextValue = {
    status,
    user: sessionState?.user ?? null,
    loginStaff,
    loginPatient,
    logout,
    authedRequest
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
