import axios from 'axios';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

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

// دالة لرفع الاستهلاك الفردي من المهلة الافتراضية عند الحاجة (مثلاً رفع ملفات أكبر).
export const apiWithTimeout = (timeoutMs: number) =>
  axios.create({ baseURL: API_URL, timeout: timeoutMs });