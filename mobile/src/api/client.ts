import axios from 'axios';
import Constants from 'expo-constants';
import { DeviceEventEmitter, Platform } from 'react-native';
import { authStorage } from '@/services/authStorage';

// واجهة REST تتوفر في هذا المشروع تحت الجذر /api/v1
// على الويب: نفس المنشأ (same-origin) حتى تعمل بدون CORS في الإنتاج على Render.
function resolveApiUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv;
  if (Platform.OS === 'web') return `${globalThis.location?.origin ?? ''}/api/v1`;
  return `http://${Constants.expoConfig?.hostUri?.split(':')[0] ?? 'localhost'}:10000/api/v1`;
}

export const API_URL = resolveApiUrl();

// مهلة زمنية لأي طلب حتى لا يبقى زر الإرسال معطلاً إلى الأبد عند تعليق/بطء الرفع.
export const DEFAULT_REQUEST_TIMEOUT = 90_000;

export const api = axios.create({
  baseURL: API_URL,
  timeout: DEFAULT_REQUEST_TIMEOUT,
});

let sessionExpiryHandled = false;

export function resetSessionExpiryGuard(): void {
  sessionExpiryHandled = false;
}

api.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    const axiosError = error as {
      response?: { status?: number };
      config?: { url?: string; baseURL?: string };
    };
    const status = axiosError.response?.status;
    const requestUrl = axiosError.config?.url ?? '';
    if (status === 401 && !/\/auth\/login(?:[/?#]|$)/i.test(requestUrl) && !sessionExpiryHandled) {
      sessionExpiryHandled = true;
      try {
        await authStorage.clear();
      } catch {
        // The in-memory auth state must still reset if secure storage is unavailable.
      } finally {
        DeviceEventEmitter.emit('auth:session-expired');
      }
    }
    return Promise.reject(error);
  },
);

// دالة لرفع الاستهلاك الفردي من المهلة الافتراضية عند الحاجة (مثلاً رفع ملفات أكبر).
export const apiWithTimeout = (timeoutMs: number) =>
  axios.create({ baseURL: API_URL, timeout: timeoutMs });