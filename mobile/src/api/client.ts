import axios from 'axios';
import Constants from 'expo-constants';

const host = Constants.expoConfig?.hostUri?.split(':')[0] ?? 'localhost';

function resolveApiUrl(): string {
  const env = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (!env) return `http://${host}:4001/api/v1`;
  return env.replace(/\/+$/, '').replace(/\/api\/v1\/?$/, '').concat('/api/v1');
}

export const API_URL = resolveApiUrl();

export const api = axios.create({ baseURL: API_URL });
