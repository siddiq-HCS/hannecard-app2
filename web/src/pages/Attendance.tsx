import { useEffect, useState } from 'react';
import { api, authHeaders } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n';

interface Rep {
  id: string;
  name: string;
  phone: string;
}

interface AttendanceRecord {
  id: string;
  userId: string;
  date: string;
  checkInTime: string | null;
  checkInLat: number | null;
  checkInLng: number | null;
  checkInAccuracy: number | null;
  checkOutTime: string | null;
  checkOutLat: number | null;
  checkOutLng: number | null;
  status: 'CHECKED_IN' | 'CHECKED_OUT';
  user?: { id: string; name: string; phone: string };
}

const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function Attendance() {
  const { token } = useAuth();
  const { t, lang } = useI18n();
  const [date, setDate] = useState(todayLocal());
  const [repId, setRepId] = useState('');
  const [reps, setReps] = useState<Rep[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    api.get('/manager/reps', authHeaders(token)).then((res) => setReps(res.data)).catch(() => undefined);
  }, [token]);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    const params = new URLSearchParams({ date });
    if (repId) params.set('repId', repId);
    api
      .get(`/attendance?${params.toString()}`, authHeaders(token))
      .then((res) => setRecords((res.data as { records: AttendanceRecord[] }).records))
      .catch(() => setRecords([]))
      .finally(() => setLoading(false));
  }, [token, date, repId]);

  useEffect(() => {
    if (!token) return;
    const id = setInterval(() => {
      const params = new URLSearchParams({ date });
      if (repId) params.set('repId', repId);
      api
        .get(`/attendance?${params.toString()}`, authHeaders(token))
        .then((res) => setRecords((res.data as { records: AttendanceRecord[] }).records))
        .catch(() => {});
    }, 5_000);
    return () => clearInterval(id);
  }, [token, date, repId]);

  const fmtTime = (iso: string | null) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleTimeString(lang === 'ar' ? 'ar-EG' : 'en-GB', { hour: '2-digit', minute: '2-digit' });
  };

  const fmtCoords = (lat: number | null, lng: number | null) => {
    if (lat == null || lng == null) return '—';
    return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  };

  const workHours = (r: AttendanceRecord) => {
    if (!r.checkInTime || !r.checkOutTime) return '—';
    const diff = new Date(r.checkOutTime).getTime() - new Date(r.checkInTime).getTime();
    if (diff < 0) return '—';
    const h = Math.floor(diff / 3600000);
    const m = Math.round((diff % 3600000) / 60000);
    return lang === 'ar' ? `${h} س ${m} د` : `${h}h ${m}m`;
  };

  const mapLink = (lat: number | null, lng: number | null) => {
    if (lat == null || lng == null) return null;
    const href = `https://www.google.com/maps?q=${lat},${lng}`;
    return (
      <a href={href} target="_blank" rel="noreferrer" style={{ color: '#2563eb', fontSize: 13, textDecoration: 'none', whiteSpace: 'nowrap' }}>
        {t('attendance.map')} ↗
      </a>
    );
  };

  const rows = reps.map((rep) => {
    const record = records.find((r) => r.userId === rep.id);
    return { rep, record };
  });

  const present = rows.filter((r) => r.record?.status === 'CHECKED_IN').length;
  const finished = rows.filter((r) => r.record?.status === 'CHECKED_OUT').length;
  const absent = rows.filter((r) => !r.record).length;

  const badge = (status: 'CHECKED_IN' | 'CHECKED_OUT' | null) => {
    if (!status) return <span style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', padding: '2px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600 }}>{t('attendance.absent')}</span>;
    const done = status === 'CHECKED_OUT';
    return (
      <span style={{ background: done ? 'rgba(239, 68, 68, 0.15)' : 'rgba(34, 197, 94, 0.15)', color: done ? '#ef4444' : '#22c55e', padding: '2px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600 }}>
        {done ? t('attendance.finished') : t('attendance.present')}
      </span>
    );
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>{t('attendance.title')}</h2>
        <button
          onClick={() => {
            if (!token) return;
            setLoading(true);
            const params = new URLSearchParams({ date });
            if (repId) params.set('repId', repId);
            api
              .get(`/attendance?${params.toString()}`, authHeaders(token))
              .then((res) => setRecords((res.data as { records: AttendanceRecord[] }).records))
              .catch(() => setRecords([]))
              .finally(() => setLoading(false));
          }}
          style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: '#1e293b', color: '#fff', cursor: 'pointer', fontSize: 13 }}
        >
          ↻ {lang === 'ar' ? 'تحديث' : 'Refresh'}
        </button>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
          {t('attendance.date')}
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ padding: 8, borderRadius: 8, border: '1px solid #d1d5db' }} />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
          {t('attendance.rep')}
          <select value={repId} onChange={(e) => setRepId(e.target.value)} style={{ padding: 8, borderRadius: 8, border: '1px solid #d1d5db' }}>
            <option value="">{t('attendance.allReps')}</option>
            {reps.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </label>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <span style={{ background: 'rgba(34, 197, 94, 0.15)', color: '#22c55e', padding: '6px 14px', borderRadius: 8, fontSize: 14, fontWeight: 600, border: '1px solid rgba(34, 197, 94, 0.2)' }}>
          {t('attendance.presentCount')}: {present}
        </span>
        <span style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', padding: '6px 14px', borderRadius: 8, fontSize: 14, fontWeight: 600, border: '1px solid rgba(239, 68, 68, 0.2)' }}>
          {t('attendance.finishedCount')}: {finished}
        </span>
        <span style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', padding: '6px 14px', borderRadius: 8, fontSize: 14, fontWeight: 600, border: '1px solid rgba(245, 158, 11, 0.2)' }}>
          {t('attendance.absentCount')}: {absent}
        </span>
      </div>

      {loading ? (
        <p style={{ color: '#6b7280' }}>{t('attendance.loading')}</p>
      ) : rows.length === 0 ? (
        <p style={{ color: '#6b7280' }}>{t('attendance.noData')}</p>
      ) : (
        <table style={{ borderCollapse: 'collapse', width: '100%', borderRadius: 12, overflow: 'hidden', fontSize: 14 }}>
          <thead>
            <tr style={{ background: '#1e293b', color: '#fff' }}>
              <th style={{ padding: '10px 12px', textAlign: 'start' }}>{t('attendance.repName')}</th>
              <th style={{ padding: '10px 12px', textAlign: 'start' }}>{t('attendance.phone')}</th>
              <th style={{ padding: '10px 12px', textAlign: 'start' }}>{t('attendance.status')}</th>
              <th style={{ padding: '10px 12px', textAlign: 'start' }}>{t('attendance.checkIn')}</th>
              <th style={{ padding: '10px 12px', textAlign: 'start' }}>{t('attendance.checkOut')}</th>
              <th style={{ padding: '10px 12px', textAlign: 'start' }}>{t('attendance.workHours')}</th>
              <th style={{ padding: '10px 12px', textAlign: 'start' }}>{t('attendance.gps')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ rep, record }) => (
              <tr key={rep.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                <td style={{ padding: '10px 12px', fontWeight: 600 }}>{rep.name}</td>
                <td style={{ padding: '10px 12px' }}>{rep.phone}</td>
                <td style={{ padding: '10px 12px' }}>{badge(record?.status ?? null)}</td>
                <td style={{ padding: '10px 12px' }}>
                  {fmtTime(record?.checkInTime ?? null)}
                  {record?.checkInLat != null && (
                    <div style={{ fontSize: 12, color: '#6b7280' }}>{fmtCoords(record.checkInLat, record.checkInLng)} {mapLink(record.checkInLat, record.checkInLng)}</div>
                  )}
                </td>
                <td style={{ padding: '10px 12px' }}>
                  {fmtTime(record?.checkOutTime ?? null)}
                  {record?.checkOutLat != null && (
                    <div style={{ fontSize: 12, color: '#6b7280' }}>{fmtCoords(record.checkOutLat, record.checkOutLng)} {mapLink(record.checkOutLat, record.checkOutLng)}</div>
                  )}
                </td>
                <td style={{ padding: '10px 12px', fontWeight: 600 }}>{record ? workHours(record) : '—'}</td>
                <td style={{ padding: '10px 12px' }}>
                  {record?.checkInLat != null ? mapLink(record.checkInLat, record.checkInLng) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
