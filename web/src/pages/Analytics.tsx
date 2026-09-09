import { useEffect, useState } from 'react';
import { api, authHeaders } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n';

interface Rep {
  id: string;
  name: string;
}

interface AnalyticsData {
  range: { from: string | null; to: string | null };
  plans: { total: number; DRAFT: number; SUBMITTED: number; APPROVED: number };
  visits: {
    total: number;
    byRep: { repId: string; name: string; count: number }[];
    byCategory: { category: string; count: number }[];
  };
  rfqs: { total: number; byMonth: { month: string; count: number }[] };
  reps: Rep[];
}

export function Analytics() {
  const { token } = useAuth();
  const { t, lang } = useI18n();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [repId, setRepId] = useState('');
  const [period, setPeriod] = useState('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    async function load() {
      if (!token) return;
      setLoading(true);
      setError(false);
      try {
        const q = new URLSearchParams();
        if (repId) q.set('repId', repId);
        if (period) q.set('period', period);
        const res = await api.get(`/analytics?${q.toString()}`, authHeaders(token));
        setData(res.data);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [token, repId, period]);

  const monthLabel = (m: string) => {
    const [y, mo] = m.split('-').map(Number);
    return new Date(Date.UTC(y, mo - 1, 1)).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-GB', { month: 'short' });
  };
  const maxMonth = Math.max(1, ...(data?.rfqs.byMonth.map((m) => m.count) ?? [1]));
  const maxRep = Math.max(1, ...(data?.visits.byRep.map((r) => r.count) ?? [1]));
  const maxCat = Math.max(1, ...(data?.visits.byCategory.map((c) => c.count) ?? [1]));

  const card: React.CSSProperties = { background: 'rgba(30, 41, 59, 0.4)', borderRadius: 12, padding: 20, border: '1px solid rgba(148, 163, 184, 0.08)' };
  const cardTitle: React.CSSProperties = { margin: '0 0 16px', fontSize: 15, fontWeight: 700, color: '#f8fafc' };
  const statNum: React.CSSProperties = { fontSize: 32, fontWeight: 800, color: '#e2e8f0' };
  const statLabel: React.CSSProperties = { fontSize: 13, color: '#94a3b8', marginTop: 4 };
  const selectStyle: React.CSSProperties = { padding: 8, borderRadius: 8 };

  return (
    <div>
      <h2>{t('analytics.title')}</h2>

      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={repId} onChange={(e) => setRepId(e.target.value)} style={selectStyle}>
          <option value="">{t('analytics.allReps')}</option>
          {(data?.reps ?? []).map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>
        <select value={period} onChange={(e) => setPeriod(e.target.value)} style={selectStyle}>
          <option value="all">{t('analytics.periodAll')}</option>
          <option value="week">{t('analytics.periodWeek')}</option>
          <option value="month">{t('analytics.periodMonth')}</option>
          <option value="year">{t('analytics.periodYear')}</option>
        </select>
      </div>

      {loading && <p style={{ color: '#888' }}>{t('analytics.loading')}</p>}
      {error && <p style={{ color: '#dc2626' }}>{t('analytics.error')}</p>}

      {data && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 14, marginBottom: 20 }}>
            <div style={card}>
              <div style={{ ...statNum, color: '#f8fafc' }}>{data.plans.total}</div>
              <div style={statLabel}>{t('analytics.totalPlans')}</div>
            </div>
            <div style={card}>
              <div style={{ ...statNum, color: '#d97706' }}>{data.plans.DRAFT}</div>
              <div style={statLabel}>{t('weeklyPlans.statusDraft')}</div>
            </div>
            <div style={card}>
              <div style={{ ...statNum, color: '#2563eb' }}>{data.plans.SUBMITTED}</div>
              <div style={statLabel}>{t('weeklyPlans.statusSubmitted')}</div>
            </div>
            <div style={card}>
              <div style={{ ...statNum, color: '#16a34a' }}>{data.plans.APPROVED}</div>
              <div style={statLabel}>{t('weeklyPlans.statusApproved')}</div>
            </div>
            <div style={card}>
              <div style={{ ...statNum, color: '#7c3aed' }}>{data.visits.total}</div>
              <div style={statLabel}>{t('analytics.totalVisits')}</div>
            </div>
            <div style={card}>
              <div style={{ ...statNum, color: '#0891b2' }}>{data.rfqs.total}</div>
              <div style={statLabel}>{t('analytics.totalRfqs')}</div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 }}>
            <div style={card}>
              <div style={cardTitle}>{t('analytics.visitsByRep')}</div>
              {data.visits.byRep.length === 0 && <p style={{ color: '#64748b' }}>{t('analytics.noData')}</p>}
              {data.visits.byRep.map((r) => (
                <BarRow key={r.repId} label={r.name} value={r.count} max={maxRep} color="#2563eb" />
              ))}
            </div>

            <div style={card}>
              <div style={cardTitle}>{t('analytics.visitsByCategory')}</div>
              {data.visits.byCategory.length === 0 && <p style={{ color: '#64748b' }}>{t('analytics.noData')}</p>}
              {data.visits.byCategory.map((c) => (
                <BarRow
                  key={c.category}
                  label={t(`companyCategory.${c.category}` as never)}
                  value={c.count}
                  max={maxCat}
                  color="#7c3aed"
                />
              ))}
            </div>

            <div style={card}>
              <div style={cardTitle}>{t('analytics.plansStatus')}</div>
              <div style={{ display: 'flex', height: 18, borderRadius: 999, overflow: 'hidden', marginBottom: 14 }}>
                {data.plans.total > 0 && (
                  <>
                    <div style={{ width: `${(data.plans.DRAFT / data.plans.total) * 100}%`, background: '#f59e0b' }} />
                    <div style={{ width: `${(data.plans.SUBMITTED / data.plans.total) * 100}%`, background: '#2563eb' }} />
                    <div style={{ width: `${(data.plans.APPROVED / data.plans.total) * 100}%`, background: '#16a34a' }} />
                  </>
                )}
              </div>
              <Legend color="#f59e0b" label={t('weeklyPlans.statusDraft')} />
              <Legend color="#2563eb" label={t('weeklyPlans.statusSubmitted')} />
              <Legend color="#16a34a" label={t('weeklyPlans.statusApproved')} />
            </div>

            <div style={card}>
              <div style={cardTitle}>{t('analytics.rfqTrend')}</div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 160, paddingTop: 10 }}>
                {data.rfqs.byMonth.map((m) => (
                  <div key={m.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>{m.count}</div>
                    <div style={{ width: '100%', background: '#0891b2', borderRadius: '6px 6px 0 0', minHeight: 2, height: `${(m.count / maxMonth) * 100}%` }} />
                    <div style={{ fontSize: 11, color: '#6b7280', marginTop: 6, transform: 'rotate(-25deg)' }}>{monthLabel(m.month)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function BarRow({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
      <div style={{ width: 110, fontSize: 13, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</div>
      <div style={{ flex: 1, background: 'rgba(148, 163, 184, 0.1)', borderRadius: 999, height: 14 }}>
        <div style={{ width: `${pct}%`, background: color, height: 14, borderRadius: 999 }} />
      </div>
      <div style={{ width: 40, textAlign: 'end', fontSize: 13, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
      <div style={{ width: 12, height: 12, borderRadius: 3, background: color }} />
      <span style={{ fontSize: 13, color: '#374151' }}>{label}</span>
    </div>
  );
}
