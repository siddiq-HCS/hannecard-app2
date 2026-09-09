import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

export const api = axios.create({ baseURL: API_BASE });

// رابط السوكيت: في بيئة الإنتاج نفس أصل الموقع (Render)، وفي التطوير المحلي المنفذ 4000
const localDev = ['localhost', '127.0.0.1'].includes(window.location.hostname);
export const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || (localDev ? `http://${window.location.hostname}:4000` : window.location.origin);

export function authHeaders(token: string) {
  return { headers: { Authorization: `Bearer ${token}` } };
}
