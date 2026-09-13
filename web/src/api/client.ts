import axios from 'axios';
import { storageGet } from '../lib/safeStorage';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

// مهلة موحدة للطلبات حتى لا تعلق الأزرار للأبد عند انقطاع الشبكة/تعليق الخادم
export const api = axios.create({ baseURL: API_BASE, timeout: 30_000 });

// رابط السوكيت: في بيئة الإنتاج نفس أصل الموقع (Render)، وفي التطوير المحلي المنفذ 4000
const localDev = ['localhost', '127.0.0.1'].includes(window.location.hostname);
export const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || (localDev ? `http://${window.location.hostname}:4000` : window.location.origin);

export function authHeaders(token: string | null | undefined) {
  return { headers: { Authorization: token ? `Bearer ${token}` : undefined } };
}

// ===== ملحق مركزي: يرفق توكن الجلسة تلقائياً لكل طلب =====
// يضمن وصول Authorization صحيح حتى لو نسي أي استدعاء تمريره يدوياً
// (ويغطي حالات التوكن الفارغ/المنقضي بعد تحديث الصفحة).
api.interceptors.request.use((config) => {
  if (!config.headers?.Authorization) {
    try {
      const t = storageGet('token');
      if (t && typeof t === 'string' && t.length > 0) config.headers.Authorization = `Bearer ${t}`;
    } catch {
      /* ignore */
    }
  }
  return config;
});

// ===== معالجة 401 مركزية: الجلسة منتهية/غير صالحة → إشعار الصفحة للتنظيف والتوجيه =====
// (لا تُطبق على تسجيل الدخول نفسه لأن فشل كلمة المرور يعيد 401 أيضاً).
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = (err as { response?: { status?: number } })?.response?.status;
    const url = (err as { config?: { url?: string } })?.config?.url ?? '';
    if (status === 401 && !url.includes('/auth/login')) {
      try {
        window.dispatchEvent(new CustomEvent('auth:unauthorized'));
      } catch {
        /* ignore */
      }
    }
    return Promise.reject(err);
  },
);

export interface ApiErrorInfo {
  status: number | null;
  code?: string;
  message?: string;
}

// استخراج معلومات الخطأ الحقيقي من استجابة الخادم (الحالة + كود + رسالة)
export function extractApiError(err: unknown): ApiErrorInfo {
  const response = (err as { response?: { status?: number; data?: unknown } })?.response;
  const d = (response?.data ?? {}) as { error?: unknown; message?: unknown };
  return {
    status: response?.status ?? null,
    code: typeof d.error === 'string' && d.error ? d.error : undefined,
    message: typeof d.message === 'string' && d.message ? d.message : undefined,
  };
}

// صياغة رسالة خطأ قابلة للعرض للمدير تعكس الخطأ الحقيقي (403/500/...) بدل رسالة عامة
export function apiErrorMessage(err: unknown, t?: (key: string) => string): string {
  const { status, code, message } = extractApiError(err);

  if (status === 401) return t ? t('errors.sessionExpired') : 'Session expired or invalid. Please log in again.';
  if (status === 403) return t ? t('errors.forbidden') : 'Forbidden: you do not have permission for this action.';
  if (status === 409) return t ? t('errors.conflict') : 'Conflict: phone, email or identifier already exists.';
  if (status === 404) return t ? t('errors.notFound') : 'Not found: the requested item no longer exists.';
  if (status !== null && status >= 500) return t ? t('errors.server') : 'Server error, please try again.';
  if (status === null) return t ? t('errors.network') : 'Network error or server unreachable.';

  if (code) return `${message ? message + ' ' : ''}(${status} ${code})`;
  return `(${status})`;
}