import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { api, authHeaders, SOCKET_URL } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n';

interface Activity {
  id: string;
  userId: string;
  type: string;
  userName?: string;
  createdAt: string;
}

export function Dashboard() {
  const { token } = useAuth();
  const { t } = useI18n();
  const [feed, setFeed] = useState<Activity[]>([]);

  useEffect(() => {
    if (!token) return;
    api.get('/manager/live', authHeaders(token)).then((res) => setFeed(res.data));
  }, [token]);

  // اتصال لحظي لاستقبال الأنشطة الجديدة
  useEffect(() => {
    if (!token) return;
    let socket: ReturnType<typeof io> | undefined;
    try {
      socket = io(SOCKET_URL, { auth: { token } });
      socket.on('activity:new', (activity: Activity) => {
        if (!activity || typeof activity.id !== 'string') return;
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

  const feedSafe = Array.isArray(feed) ? feed.filter((a) => a && typeof a.id === 'string') : [];

  return (
    <div>
      <h2>{t('dashboard.title')}</h2>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {feedSafe.map((a) => (
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
