import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { apiClient, setApiAuthToken } from '../api/client';

const AUTH_TOKEN_STORAGE_KEY = 'padelelo.auth.token';
let inMemoryToken: string | null = null;

type AuthUser = {
  id: string;
  email: string;
  role: 'PLAYER' | 'ADMIN';
  playerProfile?: {
    id?: string;
    fullName?: string | null;
    displayName?: string | null;
    nickname?: string | null;
  } | null;
};

type LoginResponse = {
  accessToken: string;
  user: AuthUser;
};

type AuthContextValue = {
  isLoading: boolean;
  isSubmitting: boolean;
  token: string | null;
  user: AuthUser | null;
  authError: string | null;
  signIn: (identifier: string, password: string) => Promise<void>;
  signUp: (payload: {
    fullName: string;
    login: string;
    password: string;
    displayName?: string;
  }) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function logStorageWarning(action: 'read' | 'write' | 'remove', error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  if (!message.toLowerCase().includes('native module')) {
    return;
  }

  console.warn(`[auth] storage ${action} fallback: ${message}`);
}

async function readStoredToken(): Promise<string | null> {
  try {
    const value = await AsyncStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
    if (value) {
      inMemoryToken = value;
      return value;
    }
  } catch (error) {
    logStorageWarning('read', error);
  }

  return inMemoryToken;
}

async function persistStoredToken(token: string): Promise<void> {
  inMemoryToken = token;

  try {
    await AsyncStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
  } catch (error) {
    logStorageWarning('write', error);
  }
}

async function clearStoredToken(): Promise<void> {
  inMemoryToken = null;

  try {
    await AsyncStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
  } catch (error) {
    logStorageWarning('remove', error);
  }
}

function normalizeErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const responseMessage = error.response?.data?.message;

    if (typeof responseMessage === 'string') {
      return responseMessage;
    }

    if (Array.isArray(responseMessage)) {
      return responseMessage.join(', ');
    }

    return error.message || 'Request failed';
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Unknown error';
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;
    const hardStopTimer = setTimeout(() => {
      if (!isActive) {
        return;
      }

      setApiAuthToken(null);
      setToken(null);
      setUser(null);
      setIsLoading(false);
    }, 12000);

    const bootstrap = async () => {
      try {
        const storedToken = await readStoredToken();
        const envToken = process.env.EXPO_PUBLIC_API_TOKEN ?? null;
        const initialToken = storedToken ?? envToken;

        if (!initialToken) {
          if (isActive) {
            setIsLoading(false);
          }
          return;
        }

        setApiAuthToken(initialToken);
        const { data } = await apiClient.get<AuthUser>('/auth/me', {
          timeout: 7000,
        });

        if (!isActive) {
          return;
        }

        setToken(initialToken);
        setUser(data);
      } catch {
        setApiAuthToken(null);
        await clearStoredToken();
        if (isActive) {
          setToken(null);
          setUser(null);
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }

        clearTimeout(hardStopTimer);
      }
    };

    void bootstrap();

    return () => {
      isActive = false;
      clearTimeout(hardStopTimer);
    };
  }, []);

  const applyAuthSession = async (data: LoginResponse) => {
    if (!data?.accessToken) {
      throw new Error('Auth response did not include access token');
    }

    setApiAuthToken(data.accessToken);
    setToken(data.accessToken);
    setUser(data.user ?? null);
    await persistStoredToken(data.accessToken);
  };

  const signIn = async (identifier: string, password: string) => {
    setIsSubmitting(true);
    setAuthError(null);

    try {
      const normalized = identifier.trim().toLowerCase();

      const payload = {
        identifier: normalized,
        email: normalized.includes('@') ? normalized : undefined,
        password,
      };

      const { data } = await apiClient.post<LoginResponse>('/auth/login', payload);
      await applyAuthSession(data);
    } catch (error) {
      setAuthError(normalizeErrorMessage(error));
      setApiAuthToken(null);
      setToken(null);
      setUser(null);
      throw error;
    } finally {
      setIsSubmitting(false);
    }
  };

  const signUp = async (payload: {
    fullName: string;
    login: string;
    password: string;
    displayName?: string;
  }) => {
    setIsSubmitting(true);
    setAuthError(null);

    try {
      const normalizedLogin = payload.login.trim().toLowerCase();

      const { data } = await apiClient.post<LoginResponse>('/auth/register', {
        fullName: payload.fullName.trim(),
        displayName: payload.displayName?.trim() || undefined,
        login: normalizedLogin,
        password: payload.password,
      });

      await applyAuthSession(data);
    } catch (error) {
      setAuthError(normalizeErrorMessage(error));
      setApiAuthToken(null);
      setToken(null);
      setUser(null);
      throw error;
    } finally {
      setIsSubmitting(false);
    }
  };

  const signOut = async () => {
    setIsSubmitting(true);

    try {
      setApiAuthToken(null);
      await clearStoredToken();
      setToken(null);
      setUser(null);
      setAuthError(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const value = useMemo<AuthContextValue>(
    () => ({
      isLoading,
      isSubmitting,
      token,
      user,
      authError,
      signIn,
      signUp,
      signOut,
    }),
    [authError, isLoading, isSubmitting, token, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }

  return context;
}