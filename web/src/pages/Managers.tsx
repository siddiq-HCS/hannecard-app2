import { useEffect, useState, type FormEvent } from 'react';
import { api, authHeaders } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n';
import { ConfirmDialog } from '../components/ConfirmDialog';

interface Manager {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  plainPassword: string | null;
  role: string;
  isActive: boolean;
  createdAt: string;
}

const PERMISSIONS = [
  'TASK_CREATE', 'TASK_VIEW', 'TASK_UPDATE', 'TASK_DELETE',
  'VISIT_CREATE', 'VISIT_VIEW',
  'ATTACHMENT_UPLOAD', 'ATTACHMENT_VIEW',
  'REPORT_WRITE', 'REPORT_VIEW', 'LOCATION_SEND',
  'PAGE_DASHBOARD_ACCESS', 'PAGE_MAP_ACCESS', 'PAGE_REPS_ACCESS', 'PAGE_RFQS_ACCESS',
  'PAGE_ANALYTICS_ACCESS', 'PAGE_CHAT_ACCESS', 'PAGE_WEEKLY_PLANS_ACCESS', 'PAGE_ATTENDANCE_ACCESS',
  'PAGE_MANAGERS_ACCESS', 'PAGE_ROLL_MATERIALS_ACCESS', 'AUTO_PRICING_ACCESS',
];

export function Managers() {
  const { token } = useAuth();
  const { t } = useI18n();
  const [managers, setManagers] = useState<Manager[]>([]);
  const [perms, setPerms] = useState<Record<string, string[]>>({});
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('DEPUTY_SALES_MANAGER');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showFormPassword, setShowFormPassword] = useState(false);
  const [revealedId, setRevealedId] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<Manager | null>(null);
  const [changePwManagerId, setChangePwManagerId] = useState<string | null>(null);
  const [changePwValue, setChangePwValue] = useState('');
  const { user } = useAuth();

  async function load() {
    if (!token) return;
    const res = await api.get('/manager/managers', authHeaders(token));
    setManagers(res.data);
    const permMap: Record<string, string[]> = {};
    for (const m of res.data as Manager[]) {
      const p = await api.get(`/manager/reps/${m.id}/permissions`, authHeaders(token));
      permMap[m.id] = p.data;
    }
    setPerms(permMap);
  }

  useEffect(() => {
    void load();
  }, [token]);

  async function createManager(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    await api.post('/manager/managers', { name, phone, email, password, role }, authHeaders(token));
    setName(''); setPhone(''); setEmail(''); setPassword('');
    await load();
  }

  async function togglePermission(id: string, permission: string, has: boolean) {
    if (!token) return;
    if (has) {
      await api.delete(`/manager/reps/${id}/permissions/${permission}`, authHeaders(token));
    } else {
      await api.post(`/manager/reps/${id}/permissions`, { permission }, authHeaders(token));
    }
    await load();
  }

  async function toggleActive(m: Manager) {
    if (!token) return;
    await api.patch(`/manager/managers/${m.id}`, { isActive: !m.isActive }, authHeaders(token));
    await load();
  }

  async function changeRole(m: Manager, nextRole: string) {
    if (!token) return;
    await api.patch(`/manager/managers/${m.id}`, { role: nextRole }, authHeaders(token));
    await load();
  }

  async function deleteManager(m: Manager) {
    if (!token) return;
    await api.delete(`/manager/managers/${m.id}`, authHeaders(token));
    setToDelete(null);
    await load();
  }

  async function submitPasswordChange() {
    if (!token || !changePwManagerId || !changePwValue) return;
    await api.post('/auth/change-password-manager', { userId: changePwManagerId, newPassword: changePwValue }, authHeaders(token));
    setChangePwManagerId(null);
    setChangePwValue('');
    alert(t('managers.passwordChanged'));
    await load();
  }

  return (
    <div>
      <h2>{t('managers.title')}</h2>

      <form onSubmit={(e) => void createManager(e)} style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center', background: 'rgba(30, 41, 59, 0.4)', padding: 16, borderRadius: 10, border: '1px solid rgba(148, 163, 184, 0.08)' }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('managers.name')} style={inputStyle} required />
        <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={t('managers.phone')} style={inputStyle} required />
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('managers.email')} type="email" style={inputStyle} required />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type={showFormPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t('managers.password')} style={inputStyle} required />
          <button type="button" style={toggleStyle} onClick={() => setShowFormPassword((v) => !v)}>
            {showFormPassword ? t('common.hide') : t('common.show')}
          </button>
        </div>
        <select value={role} onChange={(e) => setRole(e.target.value)} style={inputStyle}>
          <option value="DEPUTY_SALES_MANAGER">{t('managers.deputyRole')}</option>
          <option value="SALES_MANAGER">{t('managers.salesRole')}</option>
        </select>
        <button type="submit" style={buttonStyle}>{t('managers.addManager')}</button>
      </form>
      <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 16 }}>
        {t('managers.note')}
      </div>

      {managers.map((m) => {
        const isOpen = expanded === m.id;
        const hasSpecific = (perms[m.id]?.length ?? 0) > 0;
        return (
          <div key={m.id} style={{ background: 'rgba(30, 41, 59, 0.4)', borderRadius: 10, padding: 16, marginBottom: 16, border: '1px solid rgba(148, 163, 184, 0.08)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }} onClick={() => setExpanded(isOpen ? null : m.id)}>
              <div>
                <strong>{m.name}</strong>{' '}
                <span style={{ color: '#94a3b8' }}>{m.email}</span>{' '}
                <span style={{ ...statusChip, background: m.isActive ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)', color: m.isActive ? '#22c55e' : '#ef4444' }}>
                  {m.isActive ? t('managers.active') : t('managers.suspended')}
                </span>{' '}
                <span style={{ ...statusChip, background: hasSpecific ? 'rgba(245, 158, 11, 0.15)' : 'rgba(59, 130, 246, 0.15)', color: hasSpecific ? '#f59e0b' : '#60a5fa' }}>
                  {hasSpecific ? t('managers.specificPerms') : t('managers.fullPerms')}
                </span>{' '}
                <span style={{ ...statusChip, background: 'rgba(148, 163, 184, 0.1)', color: '#94a3b8', fontFamily: revealedId === m.id ? 'inherit' : 'monospace' }}>
                  {t('managers.passwordLabel')}: {revealedId === m.id && m.plainPassword ? m.plainPassword : '••••••••'}
                </span>{' '}
                <button style={toggleStyle} onClick={() => setRevealedId((prev) => (prev === m.id ? null : m.id))}>
                  {revealedId === m.id ? t('common.hide') : t('common.show')}
                </button>
              </div>
              <span style={{ color: '#64748b', fontSize: 13 }}>{isOpen ? '▲' : '▼'}</span>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button onClick={() => void toggleActive(m)} style={{ ...buttonStyle, background: m.isActive ? '#dc2626' : '#16a34a' }}>
                {m.isActive ? t('managers.suspend') : t('managers.activate')}
              </button>
              <select
                value={m.role}
                onChange={(e) => void changeRole(m, e.target.value)}
                style={inputStyle}
                title={t('managers.changeRole')}
              >
                <option value="DEPUTY_SALES_MANAGER">{t('managers.deputyRole')}</option>
                <option value="SALES_MANAGER">{t('managers.salesRole')}</option>
              </select>
              {user?.id !== m.id && (
                <button onClick={() => setToDelete(m)} style={{ ...buttonStyle, background: '#991b1b' }}>{t('common.delete')}</button>
              )}
              <button onClick={() => setChangePwManagerId(changePwManagerId === m.id ? null : m.id)} style={{ ...buttonStyle, background: '#7c3aed' }}>{t('managers.changePassword')}</button>
            </div>

            {changePwManagerId === m.id && (
              <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="password" value={changePwValue} onChange={(e) => setChangePwValue(e.target.value)} placeholder={t('managers.newPassword')} style={inputStyle} />
                <button onClick={() => void submitPasswordChange()} style={{ ...buttonStyle, background: '#16a34a' }}>{t('managers.save')}</button>
                <button onClick={() => { setChangePwManagerId(null); setChangePwValue(''); }} style={toggleStyle}>{t('common.cancel')}</button>
              </div>
            )}

            {isOpen && (
              <div style={{ marginTop: 14, borderTop: '1px solid #e5e7eb', paddingTop: 12 }}>
                <div style={{ fontSize: 13, marginBottom: 8 }}><strong>{t('managers.setPerms')}:</strong></div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {PERMISSIONS.map((p) => {
                    const has = perms[m.id]?.includes(p) ?? false;
                    return (
                      <button
                        key={p}
                        title={p}
                        onClick={() => void togglePermission(m.id, p, has)}
                        style={{ ...chipStyle, background: has ? '#16a34a' : '#e5e7eb', color: has ? '#fff' : '#374151' }}
                      >
                        {t(`perms.${p}`)}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {toDelete && (
        <ConfirmDialog
          title={t('managers.deleteConfirmTitle')}
          message={`${t('managers.deleteConfirmMsg')} "${toDelete.name}" (${toDelete.phone})`}
          onConfirm={() => void deleteManager(toDelete)}
          onCancel={() => setToDelete(null)}
        />
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = { padding: 8, borderRadius: 8 };
const buttonStyle: React.CSSProperties = { padding: '8px 12px', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fff', cursor: 'pointer' };
const toggleStyle: React.CSSProperties = { padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(148, 163, 184, 0.15)', background: 'transparent', cursor: 'pointer', fontSize: 12, color: '#94a3b8' };
const chipStyle: React.CSSProperties = { padding: '6px 10px', borderRadius: 999, border: 'none', fontSize: 12, cursor: 'pointer' };
const statusChip: React.CSSProperties = { padding: '2px 8px', borderRadius: 999, fontSize: 12, marginInlineStart: 8 };
