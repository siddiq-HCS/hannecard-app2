import { useEffect, useState } from 'react';
import { api, authHeaders } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n';

interface ManagerRow {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  role: string;
  isActive: boolean;
  permissions: string[];
}

const PAGE_PERMISSIONS = [
  'PAGE_DASHBOARD_ACCESS',
  'PAGE_MAP_ACCESS',
  'PAGE_REPS_ACCESS',
  'PAGE_RFQS_ACCESS',
  'PAGE_ANALYTICS_ACCESS',
  'PAGE_CHAT_ACCESS',
  'PAGE_WEEKLY_PLANS_ACCESS',
  'PAGE_ATTENDANCE_ACCESS',
  'PAGE_MANAGERS_ACCESS',
  'PAGE_ROLL_MATERIALS_ACCESS',
];

export function PagePermissions() {
  const { token, user } = useAuth();
  const { t } = useI18n();
  const [managers, setManagers] = useState<ManagerRow[]>([]);
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  async function load() {
    if (!token) return;
    const res = await api.get('/manager/managers-with-perms', authHeaders(token));
    setManagers(res.data);
  }

  useEffect(() => {
    void load();
  }, [token]);

  async function toggle(managerId: string, permission: string, has: boolean) {
    if (!token || saving[managerId]) return;
    setSaving((p) => ({ ...p, [managerId]: true }));
    try {
      if (has) {
        await api.delete(`/manager/managers/${managerId}/permissions/${permission}`, authHeaders(token));
      } else {
        await api.post(`/manager/managers/${managerId}/permissions`, { permission }, authHeaders(token));
      }
      await load();
    } catch {
      alert(t('pagePerms.saveError'));
    } finally {
      setSaving((p) => ({ ...p, [managerId]: false }));
    }
  }

  async function grantAll(m: ManagerRow) {
    if (!token) return;
    setSaving((p) => ({ ...p, [m.id]: true }));
    try {
      for (const p of PAGE_PERMISSIONS) {
        if (!(m.permissions ?? []).includes(p)) {
          await api.post(`/manager/managers/${m.id}/permissions`, { permission: p }, authHeaders(token));
        }
      }
      await load();
    } catch {
      alert(t('pagePerms.saveError'));
    } finally {
      setSaving((p) => ({ ...p, [m.id]: false }));
    }
  }

  async function revokeAll(m: ManagerRow) {
    if (!token) return;
    setSaving((p) => ({ ...p, [m.id]: true }));
    try {
      for (const p of PAGE_PERMISSIONS) {
        if ((m.permissions ?? []).includes(p)) {
          await api.delete(`/manager/managers/${m.id}/permissions/${p}`, authHeaders(token));
        }
      }
      await load();
    } catch {
      alert(t('pagePerms.saveError'));
    } finally {
      setSaving((p) => ({ ...p, [m.id]: false }));
    }
  }

  return (
    <div>
      <h2>{t('pagePerms.title')}</h2>
      <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 20, maxWidth: 860 }}>{t('pagePerms.subtitle')}</div>

      {typeof user?.role !== 'string' || user.role.toUpperCase() !== 'DEVELOPER' ? (
        <div style={{ background: 'rgba(239, 68, 68, 0.12)', color: '#f87171', padding: 12, borderRadius: 10, border: '1px solid rgba(239, 68, 68, 0.25)', marginBottom: 16 }}>
          Developer only
        </div>
      ) : null}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {managers.map((m) => {
          const perms = (m.permissions ?? []) as string[];
          const hasSpecific = perms.length > 0;
          const limited = perms.length > 0;
          return (
            <div key={m.id} style={{ background: 'rgba(30, 41, 59, 0.4)', borderRadius: 10, padding: 16, border: '1px solid rgba(148, 163, 184, 0.08)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <strong>{m.name}</strong>
                  <span style={{ color: '#94a3b8', fontSize: 13 }}>{m.email}</span>
                  <span style={{ ...statusChip, background: m.isActive ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)', color: m.isActive ? '#22c55e' : '#ef4444' }}>
                    {m.isActive ? t('managers.active') : t('managers.suspended')}
                  </span>
                  <span style={{ ...statusChip, background: hasSpecific ? 'rgba(245, 158, 11, 0.15)' : 'rgba(59, 130, 246, 0.15)', color: hasSpecific ? '#f59e0b' : '#60a5fa' }}>
                    {hasSpecific ? t('pagePerms.restricted') : t('pagePerms.fullAccess')}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => void grantAll(m)} disabled={saving[m.id]} style={buttonStyle}>
                    {t('pagePerms.grantAll')}
                  </button>
                  <button onClick={() => void revokeAll(m)} disabled={saving[m.id]} style={{ ...buttonStyle, background: '#dc2626' }}>
                    {t('pagePerms.revokeAll')}
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {PAGE_PERMISSIONS.map((p) => {
                  const has = perms.includes(p);
                  return (
                    <button
                      key={p}
                      title={p}
                      disabled={!limited || saving[m.id]}
                      onClick={() => void toggle(m.id, p, has)}
                      style={{ ...chipStyle, background: limited ? (has ? '#16a34a' : 'rgba(148, 163, 184, 0.15)') : '#e5e7eb', color: limited ? (has ? '#fff' : '#94a3b8') : '#374151' }}
                    >
                      {t(`perms.${p}`)}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const buttonStyle: React.CSSProperties = { padding: '8px 12px', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fff', cursor: 'pointer', fontSize: 12 };
const chipStyle: React.CSSProperties = { padding: '6px 12px', borderRadius: 999, border: '1px solid rgba(148, 163, 184, 0.15)', fontSize: 12, cursor: 'pointer' };
const statusChip: React.CSSProperties = { padding: '2px 8px', borderRadius: 999, fontSize: 12 };