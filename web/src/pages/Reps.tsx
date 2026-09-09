import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, authHeaders } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n';
import { ConfirmDialog } from '../components/ConfirmDialog';

interface Rep {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  plainPassword: string | null;
  isActive: boolean;
  createdAt: string;
  _count: { tasks: number; visits: number };
}

interface RepLocation {
  userId: string;
  name: string;
  lat: number | null;
  lng: number | null;
  recordedAt: string | null;
  action: string | null;
}

const PERMISSIONS = [
  'TASK_CREATE', 'TASK_VIEW', 'TASK_UPDATE', 'TASK_DELETE',
  'VISIT_CREATE', 'VISIT_VIEW',
  'ATTACHMENT_UPLOAD', 'ATTACHMENT_VIEW',
  'REPORT_WRITE', 'REPORT_VIEW', 'LOCATION_SEND',
];

export function Reps() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const { t } = useI18n();
  const [reps, setReps] = useState<Rep[]>([]);
  const [perms, setPerms] = useState<Record<string, string[]>>({});
  const [locations, setLocations] = useState<Record<string, RepLocation>>({});
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showFormPassword, setShowFormPassword] = useState(false);
  const [revealedId, setRevealedId] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<Rep | null>(null);

  async function load() {
    if (!token) return;
    const res = await api.get('/manager/reps', authHeaders(token));
    setReps(res.data);
    const permMap: Record<string, string[]> = {};
    for (const rep of res.data as Rep[]) {
      const p = await api.get(`/manager/reps/${rep.id}/permissions`, authHeaders(token));
      permMap[rep.id] = p.data;
    }
    setPerms(permMap);
    const loc = await api.get('/manager/locations', authHeaders(token));
    const locMap: Record<string, RepLocation> = {};
    for (const l of loc.data as RepLocation[]) locMap[l.userId] = l;
    setLocations(locMap);
  }

  useEffect(() => {
    void load();
  }, [token]);

  async function createRep(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    await api.post('/manager/reps', { name, phone, email, password }, authHeaders(token));
    setName(''); setPhone(''); setEmail(''); setPassword('');
    await load();
  }

  async function togglePermission(repId: string, permission: string, has: boolean) {
    if (!token) return;
    if (has) {
      await api.delete(`/manager/reps/${repId}/permissions/${permission}`, authHeaders(token));
    } else {
      await api.post(`/manager/reps/${repId}/permissions`, { permission }, authHeaders(token));
    }
    await load();
  }

  async function toggleActive(rep: Rep) {
    if (!token) return;
    await api.patch(`/manager/reps/${rep.id}`, { isActive: !rep.isActive }, authHeaders(token));
    await load();
  }

  async function deleteRep(rep: Rep) {
    if (!token) return;
    await api.delete(`/manager/reps/${rep.id}`, authHeaders(token));
    setToDelete(null);
    await load();
  }

  const filtered = reps.filter(
    (r) => r.name.toLowerCase().includes(search.toLowerCase()) || r.phone.includes(search),
  );

  return (
    <div>
      <h2>{t('reps.title')}</h2>

      <form onSubmit={(e) => void createRep(e)} style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('reps.name')} style={inputStyle} required />
        <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={t('reps.phone')} style={inputStyle} required />
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('reps.email')} type="email" style={inputStyle} required />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type={showFormPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t('reps.password')} style={inputStyle} required />
          <button type="button" style={toggleStyle} onClick={() => setShowFormPassword((v) => !v)}>
            {showFormPassword ? t('common.hide') : t('common.show')}
          </button>
        </div>
        <button type="submit" style={buttonStyle}>{t('reps.addRep')}</button>
      </form>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t('reps.searchPlaceholder')}
        style={{ ...inputStyle, width: 320, marginBottom: 16 }}
      />

      {filtered.map((rep) => {
        const loc = locations[rep.id];
        const isOpen = expanded === rep.id;
        return (
          <div key={rep.id} style={{ background: 'rgba(30, 41, 59, 0.4)', borderRadius: 10, padding: 16, marginBottom: 16, border: '1px solid rgba(148, 163, 184, 0.08)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }} onClick={() => setExpanded(isOpen ? null : rep.id)}>
              <div>
                <strong>{rep.name}</strong>{' '}
                <span style={{ color: '#94a3b8' }}>{rep.phone}</span>{' '}
                <span
                  style={{
                    ...statusChip,
                    background: rep.isActive ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                    color: rep.isActive ? '#22c55e' : '#ef4444',
                  }}
                >
                  {rep.isActive ? t('reps.active') : t('reps.suspended')}
                </span>
              </div>
              <span style={{ color: '#64748b', fontSize: 13 }}>{isOpen ? '▲' : '▼'}</span>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button onClick={() => navigate(`/chat?userId=${rep.id}`)} style={chatBtnStyle}>{t('reps.message')}</button>
              <button onClick={() => void toggleActive(rep)} style={{ ...buttonStyle, background: rep.isActive ? '#ef4444' : '#22c55e' }}>
                {rep.isActive ? t('reps.suspend') : t('reps.activate')}
              </button>
              <button onClick={() => setToDelete(rep)} style={{ ...buttonStyle, background: '#991b1b' }}>{t('common.delete')}</button>
            </div>

            {isOpen && (
              <div style={{ marginTop: 14, borderTop: '1px solid #e5e7eb', paddingTop: 12 }}>
                <div style={gridStyle}>
                  <div><strong>{t('reps.email')}:</strong> {rep.email ?? '—'}</div>
                  <div>
                    <strong>{t('reps.password')}:</strong>{' '}
                    <span style={{ fontFamily: revealedId === rep.id ? 'inherit' : 'monospace' }}>
                      {revealedId === rep.id && rep.plainPassword ? rep.plainPassword : '••••••••'}
                    </span>{' '}
                    <button style={toggleStyle} onClick={() => setRevealedId((prev) => (prev === rep.id ? null : rep.id))}>
                      {revealedId === rep.id ? t('common.hide') : t('common.show')}
                    </button>
                  </div>
                  <div><strong>{t('reps.created')}:</strong> {new Date(rep.createdAt).toLocaleDateString('ar-EG')}</div>
                  <div><strong>{t('reps.tasks')}:</strong> {rep._count.tasks}</div>
                  <div><strong>{t('reps.visits')}:</strong> {rep._count.visits}</div>
                  <div><strong>{t('reps.lastLocation')}:</strong>{' '}
                    {loc?.lat != null ? `${loc.lat.toFixed(5)}, ${loc.lng?.toFixed(5)}` : t('reps.none')}</div>
                  <div><strong>{t('reps.lastActivity')}:</strong>{' '}
                    {loc?.recordedAt ? new Date(loc.recordedAt).toLocaleString('ar-EG') : '—'}</div>
                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                  {PERMISSIONS.map((p) => {
                    const has = perms[rep.id]?.includes(p) ?? false;
                    return (
                      <button
                        key={p}
                        title={p}
                        onClick={() => void togglePermission(rep.id, p, has)}
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
          title={t('reps.deleteConfirmTitle')}
          message={`${t('reps.deleteConfirmMsg')} "${toDelete.name}" (${toDelete.phone})`}
          onConfirm={() => void deleteRep(toDelete)}
          onCancel={() => setToDelete(null)}
        />
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = { padding: 8, borderRadius: 8 };
const buttonStyle: React.CSSProperties = { padding: '8px 12px', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fff', cursor: 'pointer' };
const toggleStyle: React.CSSProperties = { padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(148, 163, 184, 0.15)', background: 'transparent', cursor: 'pointer', fontSize: 12, color: '#94a3b8' };
const chatBtnStyle: React.CSSProperties = { padding: '8px 12px', borderRadius: 8, border: 'none', background: '#7c3aed', color: '#fff', cursor: 'pointer' };
const chipStyle: React.CSSProperties = { padding: '6px 10px', borderRadius: 999, border: 'none', fontSize: 12, cursor: 'pointer' };
const statusChip: React.CSSProperties = { padding: '2px 8px', borderRadius: 999, fontSize: 12, marginInlineStart: 8 };
const gridStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8, fontSize: 14 };
