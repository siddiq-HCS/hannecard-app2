import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { api } from '@/api/client';

const isWeb = Platform.OS === 'web';

const storage = {
  async getItem(key: string): Promise<string | null> {
    if (isWeb) return globalThis.localStorage?.getItem(key) ?? null;
    return SecureStore.getItemAsync(key);
  },
  async setItem(key: string, value: string): Promise<void> {
    if (isWeb) {
      globalThis.localStorage?.setItem(key, value);
      return;
    }
    await SecureStore.setItemAsync(key, value);
  },
  async deleteItem(key: string): Promise<void> {
    if (isWeb) {
      globalThis.localStorage?.removeItem(key);
      return;
    }
    await SecureStore.deleteItemAsync(key);
  },
};

export interface AuthUser {
  id: string;
  name: string;
  phone: string;
  role: string;
  email?: string | null;
}

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  login: (phone: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState>(null as unknown as AuthState);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    void storage.getItem('token').then(setToken);
    void storage.getItem('user').then((u) => u && setUser(JSON.parse(u)));
  }, []);

  const login = useCallback(async (phone: string, password: string) => {
    const res = await api.post('/auth/login', { phone, password });
    const { token: t, user: u } = res.data as { token: string; user: AuthUser };
    await storage.setItem('token', t);
    await storage.setItem('user', JSON.stringify(u));
    setToken(t);
    setUser(u);
  }, []);

  const logout = useCallback(async () => {
    if (token) {
      await api.post('/auth/logout', {}, { headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
    }
    await storage.deleteItem('token');
    await storage.deleteItem('user');
    setToken(null);
    setUser(null);
  }, [token]);

  return <AuthContext.Provider value={{ token, user, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
