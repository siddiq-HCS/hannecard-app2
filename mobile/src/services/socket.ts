import { io, type Socket } from 'socket.io-client';
import { API_URL } from '@/api/client';

// Socket.IO يُرفق بالخادم نفسه على المنشأ الجذري (المسار الافتراضي /socket.io).
// نستخرج المنشأ من API_URL مهما كان المسار (مثل /api/v1) لتفادي إلحاق المسار بعنوان المقبس.
const SOCKET_URL = (() => {
  try {
    return new URL(API_URL).origin;
  } catch {
    return API_URL.replace(/\/api(\/v1)?\/?$/, '');
  }
})();

let socket: Socket | null = null;
let socketToken: string | null = null;

/** اتصال Socket.IO واحد لكل توكن (يعاد استخدامه عبر الشاشات) */
export function getSocket(token: string): Socket {
  if (socket && socketToken === token) return socket;
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
  }
  socketToken = token;
  socket = io(SOCKET_URL, { auth: { token } });
  return socket;
}

export function closeSocket() {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
  }
  socket = null;
  socketToken = null;
}