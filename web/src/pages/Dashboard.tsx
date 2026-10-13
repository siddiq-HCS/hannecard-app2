import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { api, authHeaders, SOCKET_URL } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n';
import { safeText } from '../lib/safeText';

interface Activity {
  id: string;
  userId: string;
  type: string;
  userName?: string;
  createdAt: string;
}

function normalizeActivity(value: unknown): Activity | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const id = safeText(raw.id);
  if (!id) return null;
  return {
    id,
    userId: safeText(raw.userId),
    type: safeText(raw.type),
    ...(raw.userName !== undefined ? { userName: safeText(raw.userName) } : {}),
    createdAt: safeText(raw.createdAt),
  };
}

function normalizeActivities(value: unknown): Activity[] {
  return Array.isArray(value)
    ? value.map(normalizeActivity).filter((activity): activity is Activity => activity !== null)
    : [];
}

export function Dashboard() {
  const { token } = useAuth();
  const { t } = useI18n();
  const [feed, setFeed] = useState<Activity[]>([]);

  useEffect(() => {
    if (!token) return;
    api.get('/manager/live', authHeaders(token)).then((res) => setFeed(normalizeActivities(res.data))).catch(() => {});
  }, [token]);

  // اتصال لحظي لاستقبال الأنشطة الجديدة
  useEffect(() => {
    if (!token) return;
    let socket: ReturnType<typeof io> | undefined;
    try {
      socket = io(SOCKET_URL, { auth: { token } });
      socket.on('activity:new', (value: unknown) => {
        const activity = normalizeActivity(value);
        if (!activity) return;
        setFeed((prev) => [activity, ...prev].slice(0, 100));
      });
      socket.on('dailySummary:new', (s) => console.log('summary', s));
    } catch (e) {
      console.error('[Dashboard] socket init failed', e);
    }
    return () => {
      socket?.disconnect();
    };
  }, [token]);

  return (
    <div>
      <h2>{t('dashboard.title')}</h2>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {feed.map((a) => (
          <li key={a.id} style={{ background: 'rgba(30, 41, 59, 0.4)', padding: 12, borderRadius: 8, marginBottom: 8, border: '1px solid rgba(148, 163, 184, 0.08)' }}>
            <strong>{a.userName ?? a.userId}</strong>
            <span style={{ color: '#94a3b8' }}> — {a.type}</span>
            <div style={{ fontSize: 12, color: '#64748b' }}>{new Date(a.createdAt).toLocaleString()}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}
