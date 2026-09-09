import axios from 'axios';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

// على الويب (لوحة المبيعات عبر المتصفح) نستخدم نفس منشأ الصفحة بحيث تعمل /api/v1 مباشرة بلا CORS.
const isWeb = Platform.OS === 'web';

function resolveApiUrl(): string {
  const env = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (env) return env.replace(/\/+$/, '').replace(/\/api\/v1\/?$/, '').concat('/api/v1');
  if (isWeb) return `${typeof window !== 'undefined' ? window.location.origin : ''}/api/v1`;
  const host = Constants.expoConfig?.hostUri?.split(':')[0] ?? 'localhost';
  return `http://${host}:4001/api/v1`;
}

export const API_URL = resolveApiUrl();

export const api = axios.create({ baseURL: API_URL });