import { useEffect, useState } from 'react';
import { Printer } from 'lucide-react';
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
  const { t, lang } = useI18n();
  const [feed, setFeed] = useState<Activity[]>([]);
  const activityLabel = (type: string) => {
    const key = `dashboard.activities.${type.replace(/[.-]/g, '_')}`;
    const translated = t(key);
    return translated === key ? type.replace(/[._]/g, ' ') : translated;
  };

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
    <div className="print-page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>{t('dashboard.title')}</h2>
        <button className="no-print" type="button" title={t('common.print')} aria-label={t('common.print')} onClick={() => window.print()} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 38, height: 38, borderRadius: 8, border: '1px solid #475569', background: '#1e293b', color: '#fff', cursor: 'pointer' }}>
          <Printer size={17} />
        </button>
      </div>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {feed.map((a) => (
          <li key={a.id} style={{ background: 'rgba(30, 41, 59, 0.4)', padding: 12, borderRadius: 8, marginBottom: 8, border: '1px solid rgba(148, 163, 184, 0.08)' }}>
            <strong>{a.userName ?? a.userId}</strong>
            <span style={{ color: '#94a3b8' }}> — {activityLabel(a.type)}</span>
            <div style={{ fontSize: 12, color: '#64748b' }}>{new Date(a.createdAt).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-GB')}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}
