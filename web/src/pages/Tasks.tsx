import { useEffect, useState, type FormEvent } from 'react';
import { api, authHeaders } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useI18n, formatDate, formatTime, type Lang } from '../i18n';
import { TaskImages } from '../components/TaskImages';

interface Task {
  id: string;
  userId: string;
  user?: { id: string; name: string } | null;
  type: 'DAILY' | 'WEEKLY';
  category: string;
  title: string;
  description: string | null;
  status: string;
  dueDate: string;
  dueTime: string | null;
  completedAt: string | null;
  createdAt: string;
  attachments: { id: string; filePath: string }[];
}

interface Rep {
  id: string;
  name: string;
  phone: string;
  _count?: { tasks: number; visits: number };
}

const STATUS_COLOR: Record<string, string> = {
  PENDING: '#d97706', IN_PROGRESS: '#2563eb', DONE: '#16a34a', CANCELLED: '#6b7280',
};

const dayLabel = (iso: string, lang: Lang) => {
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00`);
  const today = new Date();
  const key = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  const label = d.toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (key(d) === key(today)) return `${lang === 'ar' ? 'اليوم' : 'Today'} — ${label}`;
  if (diff === 1) return `${lang === 'ar' ? 'غداً' : 'Tomorrow'} — ${label}`;
  if (diff === -1) return `${lang === 'ar' ? 'أمس' : 'Yesterday'} — ${label}`;
  return label;
};

export function Tasks() {
  const { token } = useAuth();
  const { t, lang } = useI18n();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [reps, setReps] = useState<Rep[]>([]);
  const [selectedRepId, setSelectedRepId] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('NEW_CLIENT');
  const [type, setType] = useState('DAILY');
  const [dueDate, setDueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dueTime, setDueTime] = useState('');
  const [assignRepId, setAssignRepId] = useState('');

  async function load() {
    if (!token) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedRepId) params.set('repId', selectedRepId);
      if (status) params.set('status', status);
      const res = await api.get(`/tasks?${params.toString()}`, authHeaders(token));
      setTasks(res.data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!token) return;
    api.get('/manager/reps', authHeaders(token)).then((r) => setReps(r.data));
  }, [token]);

  useEffect(() => {
    void load();
  }, [token, selectedRepId, status]);

  async function createTask(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    await api.post(
      '/tasks',
      { title, description, category, type, dueDate, dueTime: dueTime || undefined, userId: assignRepId || undefined },
      authHeaders(token),
    );
    setShowForm(false);
    setTitle(''); setDescription(''); setDueTime('');
    if (selectedRepId && assignRepId !== selectedRepId) {
      // المهمة أُسنِدت لمندوب آخر، حدِّث القائمة الحالية بعد العودة
    }
    await load();
    if (selectedRepId && assignRepId && assignRepId !== selectedRepId) {
      await api.get('/manager/reps', authHeaders(token)).then((r) => setReps(r.data));
    }
  }

  async function toggleDone(t: Task) {
    if (!token) return;
    if (t.status === 'DONE') return;
    await api.post(`/tasks/${t.id}/complete`, {}, authHeaders(token));
    await load();
  }

  async function removeTask(task: Task) {
    if (!token) return;
    if (!window.confirm(`${t('tasks.deleteConfirm')} «${task.title}»؟`)) return;
    await api.delete(`/tasks/${task.id}`, authHeaders(token));
    await load();
    if (selectedRepId) await api.get('/manager/reps', authHeaders(token)).then((r) => setReps(r.data));
  }

  const selectedRep = selectedRepId ? reps.find((r) => r.id === selectedRepId) : null;

  // تجميع المهام حسب التاريخ (أحدث يوم في الأعلى)
  const groups: { date: string; items: Task[] }[] = [];
  for (const t of tasks) {
    const date = String(t.dueDate).slice(0, 10);
    const g = groups.find((x) => x.date === date);
    if (g) g.items.push(t);
    else groups.push({ date, items: [t] });
  }
  groups.sort((a, b) => b.date.localeCompare(a.date));

  // === عرض قائمة المناديب ===
  if (!selectedRepId) {
    return (
      <div>
        <h2>{t('tasks.title')}</h2>
        <p style={{ color: '#94a3b8', fontSize: 13 }}>{t('tasks.subtitle')}</p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12, marginBottom: 24 }}>
          <button onClick={() => { setSelectedRepId(''); setShowForm(false); }} style={{ ...cardBtn, border: selectedRepId === null && !showForm ? '2px solid #2563eb' : '1px solid #e5e7eb' }}>
            <div style={{ fontSize: 26 }}>🗂️</div>
            <strong>{t('tasks.allTasks')}</strong>
            <span style={{ color: '#94a3b8', fontSize: 12 }}>{t('tasks.allDesc')}</span>
          </button>
          {reps.map((r) => (
            <button key={r.id} onClick={() => setSelectedRepId(r.id)} style={cardBtn}>
              <div style={{ fontSize: 26 }}>👤</div>
              <strong>{r.name}</strong>
              <span style={{ color: '#94a3b8', fontSize: 12 }}>{r.phone}</span>
              <span style={{ color: '#2563eb', fontSize: 12 }}>
                {r._count?.tasks ?? 0} {t('tasks.task')} · {r._count?.visits ?? 0} {t('tasks.visit')}
              </span>
            </button>
          ))}
        </div>

        {!reps.length && <div style={{ color: '#64748b', textAlign: 'center', marginTop: 24 }}>{t('tasks.noReps')}</div>}

        <button style={buttonStyle} onClick={() => setShowForm((v) => !v)}>
          {showForm ? t('tasks.close') : t('tasks.addTask')}
        </button>

        {showForm && (
          <form onSubmit={(e) => void createTask(e)} style={{ background: 'rgba(30, 41, 59, 0.4)', borderRadius: 10, padding: 16, marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px,1fr))', gap: 10, border: '1px solid rgba(148, 163, 184, 0.08)' }}>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('tasks.taskTitle')} style={inputStyle} required />
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t('tasks.descOptional')} style={inputStyle} />
            <select value={category} onChange={(e) => setCategory(e.target.value)} style={inputStyle}>
              {Object.entries({ NEW_CLIENT: t('taskCat.NEW_CLIENT'), EXISTING_CLIENT: t('taskCat.EXISTING_CLIENT'), DAILY_REPORT: t('taskCat.DAILY_REPORT') }).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <select value={type} onChange={(e) => setType(e.target.value)} style={inputStyle}>
              <option value="DAILY">{t('tasks.daily')}</option>
              <option value="WEEKLY">{t('tasks.weekly')}</option>
            </select>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={inputStyle} required />
            <input type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} style={inputStyle} />
            <select value={assignRepId} onChange={(e) => setAssignRepId(e.target.value)} style={inputStyle} required>
              <option value="">{t('tasks.selectRep')}</option>
              {reps.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
            <button type="submit" style={{ ...buttonStyle, background: '#16a34a' }}>{t('tasks.saveTask')}</button>
          </form>
        )}
      </div>
    );
  }

  // === عرض مهام مندوب محدد مقسمة حسب التاريخ ===
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <button onClick={() => setSelectedRepId(null)} style={backBtn}>{t('tasks.backAll')}</button>
          <h2 style={{ margin: '6px 0 0' }}>{t('tasks.tasksOf')} {selectedRep?.name ?? t('tasks.rep')}</h2>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select value={status} onChange={(e) => setStatus(e.target.value)} style={inputStyle}>
            <option value="">{t('tasks.allStatuses')}</option>
            {Object.keys({ PENDING: t('taskStatus.PENDING'), IN_PROGRESS: t('taskStatus.IN_PROGRESS'), DONE: t('taskStatus.DONE'), CANCELLED: t('taskStatus.CANCELLED') }).map((s) => (
              <option key={s} value={s}>{t(`taskStatus.${s}`)}</option>
            ))}
          </select>
          {status && (
            <button style={{ ...buttonStyle, background: '#6b7280' }} onClick={() => setStatus('')}>
              {t('tasks.clear')}
            </button>
          )}
        </div>
      </div>

      {loading && <div style={{ color: '#64748b' }}>{t('common.loading')}</div>}

      {!loading && groups.length === 0 && (
        <div style={{ color: '#64748b', textAlign: 'center', marginTop: 40 }}>{t('tasks.noTasks')}{status ? t('tasks.inStatus') : ''}.</div>
      )}

      {groups.map((g) => (
        <div key={g.date} style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 15, fontWeight: '700', marginBottom: 8, color: '#f8fafc' }}>
            📅 {dayLabel(g.date, lang)}
            <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: '400', marginInlineStart: 8 }}>{g.items.length} {t('tasks.task')}</span>
          </div>
          {g.items.map((t2) => (
            <div key={t2.id} style={{ background: 'rgba(30, 41, 59, 0.4)', borderRadius: 10, padding: 14, marginBottom: 10, border: '1px solid rgba(148, 163, 184, 0.08)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <strong>{t2.title}</strong>
                  <span style={{ ...statusChip, color: STATUS_COLOR[t2.status], border: `1px solid ${STATUS_COLOR[t2.status]}` }}>
                    {t(`taskStatus.${t2.status}`)}
                  </span>
                  <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                    {t(`taskCat.${t2.category}`)} · {t2.type === 'DAILY' ? t('tasks.daily') : t('tasks.weekly')}
                    {t2.dueTime ? ` · ${formatTime(t2.dueTime, lang)}` : ''}
                    {t2.attachments.length > 0 ? ` · 📎 ${t2.attachments.length}` : ''}
                  </div>
                  {t2.description && <div style={{ fontSize: 13, color: '#cbd5e1', marginTop: 6 }}>{t2.description}</div>}
                  <TaskImages attachments={t2.attachments} token={token} />
                  {t2.completedAt && <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>{t('tasks.completedAt')}: {formatDate(t2.completedAt, lang)}</div>}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {t2.status !== 'DONE' && (
                    <button style={{ ...buttonStyle, background: '#16a34a' }} onClick={() => void toggleDone(t2)}>{t('tasks.complete')}</button>
                  )}
                  <button style={{ ...buttonStyle, background: '#dc2626' }} onClick={() => void removeTask(t2)}>{t('common.delete')}</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

const inputStyle: React.CSSProperties = { padding: 8, borderRadius: 8 };
const buttonStyle: React.CSSProperties = { padding: '8px 12px', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fff', cursor: 'pointer' };
const backBtn: React.CSSProperties = { padding: '6px 12px', borderRadius: 8, border: '1px solid rgba(148, 163, 184, 0.15)', background: 'transparent', cursor: 'pointer', fontSize: 13, color: '#f59e0b' };
const statusChip: React.CSSProperties = { padding: '2px 8px', borderRadius: 999, fontSize: 12, marginInlineStart: 8, background: 'transparent' };
const cardBtn: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start', textAlign: 'right',
  background: 'rgba(30, 41, 59, 0.5)', borderRadius: 12, padding: 16, cursor: 'pointer', border: '1px solid rgba(148, 163, 184, 0.08)',
  fontFamily: 'inherit',
};
