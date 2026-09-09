import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Platform, AppState, View } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { api } from '@/api/client';
import { getCurrentPosition } from '@/services/location';
import { closeSocket } from '@/services/socket';
import { registerForPushNotifications } from '@/services/notifications';

const isWeb = Platform.OS === 'web';

// على الويب تمتد اللوحة الإدارية وتطبيق المناديب على نفس النطاق (same-origin)
// لذا نستخدم مفاتيح مستقلة تماماً (Namespaced) لتجنّب تعارض التوكن بين الواجهتين.
const WEB_TOKEN_KEY = 'mobile_token';
const WEB_USER_KEY = 'mobile_user';

// مدة الخمول قبل تسجيل الخروج التلقائي: 60 دقيقة
const INACTIVITY_TIMEOUT = 60 * 60 * 1000;

const storage = {
  async getItem(key: string): Promise<string | null> {
    if (isWeb) {
      const mapped = key === 'token' ? WEB_TOKEN_KEY : key === 'user' ? WEB_USER_KEY : key;
      return globalThis.localStorage?.getItem(mapped) ?? null;
    }
    return SecureStore.getItemAsync(key);
  },
  async setItem(key: string, value: string): Promise<void> {
    if (isWeb) {
      // على الويب قد يمنع Safari (خاصة الوضع الخاص) الكتابة في localStorage:
      // أي فشل تخزين لا يجب أن يُسقط تسجيل الدخول — نكمل بالجلسة في الذاكرة.
      const mapped = key === 'token' ? WEB_TOKEN_KEY : key === 'user' ? WEB_USER_KEY : key;
      try {
        globalThis.localStorage?.setItem(mapped, value);
      } catch {
        /* تجاهل: الجلسة تبقى تعمل في الذاكرة لهذه الجلسة فقط */
      }
      return;
    }
    await SecureStore.setItemAsync(key, value);
  },
  async deleteItem(key: string): Promise<void> {
    if (isWeb) {
      const mapped = key === 'token' ? WEB_TOKEN_KEY : key === 'user' ? WEB_USER_KEY : key;
      try {
        globalThis.localStorage?.removeItem(mapped);
      } catch {
        /* ignore */
      }
      return;
    }
    await SecureStore.deleteItemAsync(key);
  },
};

interface User {
  id: string;
  name: string;
  phone: string;
  role: string;
}

interface AuthState {
  token: string | null;
  user: User | null;
  /** جاهزية الجلسة: true بعد قراءة التخزين (يمنع وميض/انهيار قبل تحميل بيانات الدخول) */
  ready: boolean;
  login: (email: string, password: string, coords?: { lat: number; lng: number; accuracy?: number }) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState>(null as unknown as AuthState);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  const lastActivityRef = useRef<number>(Date.now());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [storedToken, storedUser] = await Promise.all([storage.getItem('token'), storage.getItem('user')]);
        if (cancelled) return;
        setToken(storedToken);
        let parsed: User | null = null;
        try {
          if (storedUser) parsed = JSON.parse(storedUser);
        } catch {
          parsed = null;
        }
        setUser(parsed);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string, coords?: { lat: number; lng: number; accuracy?: number }) => {
    const res = await api.post('/auth/login', { email, password, app: 'mobile', ...coords });
    const { token: t, user: u } = res.data as { token: string; user: User };
    // تطبيق الجوال مخصص للمناديب فقط — أي حساب آخر يُرفض
    if (u.role !== 'REPRESENTATIVE') {
      throw new Error('MOBILE_NOT_ALLOWED');
    }
    await storage.setItem('token', t);
    await storage.setItem('user', JSON.stringify(u));
    setToken(t);
    setUser(u);
    lastActivityRef.current = Date.now();
    // تسجيل رمز الإشعارات بعد الدخول — خارج المسار الحرج: أي فشل هنا لا يوقف الدخول أو الملاحة
    try {
      const pushToken = await registerForPushNotifications();
      if (pushToken && t) {
        await api.post('/me/fcm-token', { token: pushToken }, { headers: { Authorization: `Bearer ${t}` } }).catch(() => {});
      }
    } catch {
      // تجاهل أي خطأ في الإشعارات حتى لا يتأثر تسجيل الدخول على المتصفح
    }
  }, []);

  const logout = useCallback(async () => {
    if (token) {
      const coords = await getCurrentPosition();
      await api
        .post('/auth/logout', { ...coords }, { headers: { Authorization: `Bearer ${token}` } })
        .catch(() => {});
    }
    await storage.deleteItem('token');
    await storage.deleteItem('user');
    closeSocket();
    setToken(null);
    setUser(null);
  }, [token]);

  // تسجيل الخروج التلقائي عند الخمول (60 دقيقة بدون أي تفاعل).
  // لا يمسّ سجل الحضور والانصراف إطلاقاً — فهو فقط يمسح الجلسة المحلية ويتصل بـ /logout
  // (الذي يسجّل نشاط الخروج فقط ولا يعدّل سجلات الحضور في قاعدة البيانات).
  useEffect(() => {
    if (!token) return;

    const bump = () => {
      lastActivityRef.current = Date.now();
    };

    // Web: نستمع لأحداث التفاعل العالمية
    if (isWeb) {
      const events = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'mousemove'];
      events.forEach((ev) => window.addEventListener(ev, bump, { passive: true }));
      return () => events.forEach((ev) => window.removeEventListener(ev, bump));
    }

    // Native: لا نستمع هنا — نعتمد على AppState + نبضة + لمسة الالتفاف في العرض أدناه
    return undefined;
  }, [token]);

  useEffect(() => {
    if (!token) return;

    const onHeartbeat = () => {
      if (Date.now() - lastActivityRef.current >= INACTIVITY_TIMEOUT) {
        void logout();
      }
    };

    const interval = setInterval(onHeartbeat, 30 * 1000); // فحص كل 30 ثانية
    const onAppState = (state: string) => {
      if (state === 'active') lastActivityRef.current = Date.now();
    };
    const sub = AppState.addEventListener('change', onAppState);

    return () => {
      clearInterval(interval);
      sub.remove();
    };
  }, [token, logout]);

  const onNativeTouch = () => {
    if (!isWeb) lastActivityRef.current = Date.now();
  };

  return (
    <AuthContext.Provider value={{ token, user, ready, login, logout }}>
      {isWeb ? (
        children
      ) : (
        // مراقبة اللمس على Native دون تعطيل العناصر السفلية:
        // نعود بـ false في مرحلة الالتقاط فنرى اللمسة ولا نمنعها من الوصول للشاشات.
        <View
          style={{ flex: 1 }}
          onStartShouldSetResponder={() => false}
          onStartShouldSetResponderCapture={() => {
            onNativeTouch();
            return false;
          }}
        >
          {children}
        </View>
      )}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
