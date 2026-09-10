import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, authHeaders } from '../api/client';
import { storageGet, storageSet, storageRemove, storageClear } from '../lib/safeStorage';

interface User {
  id: string;
  name: string;
  phone: string;
  role: string;
  email?: string;
  permissions?: string[];
}

interface AuthState {
  token: string | null;
  user: User | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState>(null as unknown as AuthState);

// قراءة/كتابة آمنة لـ localStorage مع احتياطي في الذاكرة:
// أي خطأ (امتلاء/حظر/وضع خاص) لا ينهار التطبيق أبداً.

export function AuthProvider({ children }: { children: ReactNode }) {
  // تهيئة آمنة: token قيمة نصية غير فارغة فقط؛ أي قيمة تالفة/غائبة → لا جلسة (يتوجّه التطبيق لـ /login بهدوء)
  const [token, setToken] = useState<string | null>(() => {
    try {
      const t = storageGet('token');
      return t && typeof t === 'string' && t.length > 0 ? t : null;
    } catch {
      return null;
    }
  });

  // تهيئة آمنة للمستخدم: نحلّل JSON، ونتحقق صرامةً من الشكل، وإلا نمسح الإدخال ولا ننهار
  const [user, setUser] = useState<User | null>(() => {
    const raw = storageGet('user');
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as User;
      const valid =
        parsed &&
        typeof parsed === 'object' &&
        typeof parsed.id === 'string' &&
        typeof parsed.role === 'string' &&
        typeof parsed.name === 'string';
      if (!valid) {
        storageRemove('user');
        return null;
      }
      return parsed;
    } catch {
      storageRemove('user');
      return null;
    }
  });

  // هل اكتمل فحص الجلسة (/me) بعد تسجيل الدخول أو تحميل الصفحة؟
  // حتى لا يُعرض مسار خاطئ لحظياً قبل وصول الصلاحيات (مثل توجيه حساب كامل الصلاحيات نحو /dashboard ثم ارتداده لاحقاً)
  const [ready, setReady] = useState<boolean>(() => {
    try {
      const t = storageGet('token');
      return !(t && typeof t === 'string' && t.length > 0);
    } catch {
      return true;
    }
  });

  // Fetch latest user + permissions (reusable: mount + manual refresh after permission changes)
  const refreshMe = useCallback(async () => {
    if (!token) return;
    setReady(false);
    try {
      const res = await api.get('/me', authHeaders(token));
      const data = res.data as { user?: User | null; permissions?: unknown };
      // استجابة غير متوقعة (حساب محذوف/تالف) → تنظيف الجلسة بأمان وبدون انهيار
      const me = data?.user;
      if (!me || typeof me !== 'object' || typeof me.role !== 'string') {
        storageClear();
        setToken(null);
        setUser(null);
        setReady(true);
        return;
      }
      setUser(me as User);
      // الصلاحيات: القيم الفارغة/التالفة تُعامل كقائمة فارغة بدلاً من انهيار العرض
      const perms = Array.isArray((res.data as { permissions?: unknown }).permissions)
        ? (res.data as { permissions: string[] }).permissions
        : [];
      const merged = { ...me, permissions: perms };
      setUser(merged);
      try {
        storageSet('user', JSON.stringify(merged));
      } catch {
        /* ignore */
      }
      setReady(true);
    } catch (err) {
      // الجلسة غير صالحة عند السيرفر (401/403/منتهية) → تنظيف فوري والتوجيه لـ /login؛
      // أخطاء الشبكة المؤقتة تُبقي الجلسة ولا تُسجّل المستخدم خارجاً
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (typeof status === 'number' && status >= 400 && status < 500) {
        if (storageGet('token')) {
          storageClear();
          setToken(null);
          setUser(null);
        }
      }
      setReady(true);
    }
  }, [token]);

  useEffect(() => {
    void refreshMe();
  }, [refreshMe]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.post('/auth/login', { email, password, app: 'web' });
    const data = res.data as { token: string; user: User };
    // سجل تشخيصي مؤقت: يعرض شكل الاستجابة عند أي مشكلة للتحقق من اكتمال الحقول
    if (typeof data?.token !== 'string' || typeof data?.user?.role !== 'string') {
      console.error('[auth][debug] unexpected login response shape:', JSON.stringify(data));
    }
    // تحقق صارم من شكل الاستجابة قبل الحفظ — استجابة غريبة لا تُحدث انهياراً
    if (!data || typeof data.token !== 'string' || !data.token || !data.user || typeof data.user.role !== 'string') {
      throw new Error('invalid_login_response');
    }
    // حفظ بأمان مع احتياطي في الذاكرة — حتى لو فشل التخزين يستمر الدخول في هذه الجلسة
    try {
      storageSet('token', data.token);
      storageSet('user', JSON.stringify(data.user));
    } catch {
      /* ignore */
    }
    setReady(false);
    setToken(data.token);
    setUser(data.user);
  }, []);

  const logout = useCallback(() => {
    storageClear();
    setToken(null);
    setUser(null);
    setReady(true);
  }, []);

  return <AuthContext.Provider value={{ token, user, ready, login, logout, refresh: refreshMe }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
