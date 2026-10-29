import { useCallback, useEffect, useState } from 'react';
import { api, authHeaders, apiErrorMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useI18n, formatDateTime, formatYmd, type Lang } from '../i18n';
import { toast } from '../components/Toast';
import { Printer } from 'lucide-react';
import { safeText } from '../lib/safeText';

interface Visit {
  id: string;
  planDayId: string;
  companyName: string;
  contactPerson: string;
  phone: string;
  address: string;
  purpose: string;
  companyCategory: string;
  categoryOther: string;
  notes: string;
  imageUrl: string | null;
}

interface Day {
  id: string;
  planId: string;
  dayName: string;
  visits: Visit[];
}

interface Plan {
  id: string;
  userId: string;
  year: number;
  weekNumber: number;
  serialNumber: string;
  startDate: string;
  endDate: string;
  status: string;
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
  user?: { id: string; name: string; phone: string } | null;
  days: Day[];
}

interface Rep {
  id: string;
  name: string;
}

const DAY_INDEX: Record<string, number> = { SUNDAY: 0, MONDAY: 1, TUESDAY: 2, WEDNESDAY: 3, THURSDAY: 4 };

type T = (key: string) => string;

function isValidYmd(value: string | null | undefined): boolean {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
}

function formatPlanDate(iso: string, lang: Lang) {
  const [year, month, day] = iso.slice(0, 10).split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-GB', { timeZone: 'UTC' });
}

function optLabel(t: T, prefix: string, val: string) {
  const l = t(`${prefix}.${val}`);
  return l !== `${prefix}.${val}` ? l : val || '—';
}

function categoryLabel(t: T, v: Visit) {
  const base = optLabel(t, 'companyCategory', v.companyCategory);
  return v.companyCategory === 'OTHERS' && v.categoryOther ? `${base} (${v.categoryOther})` : base;
}

function sortedDays(p: Plan) {
  return [...(p.days ?? [])].sort((a, b) => (DAY_INDEX[a.dayName] ?? 99) - (DAY_INDEX[b.dayName] ?? 99));
}

function flattenVisits(p: Plan) {
  const out: { num: number; dayName: string; visit: Visit }[] = [];
  for (const d of sortedDays(p)) {
    for (const v of d.visits ?? []) {
      out.push({ num: out.length + 1, dayName: d.dayName, visit: v });
    }
  }
  return out;
}

function normalizeVisit(value: unknown): Visit | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.id !== 'string') return null;

  return {
    id: raw.id,
    planDayId: safeText(raw.planDayId),
    companyName: safeText(raw.companyName),
    contactPerson: safeText(raw.contactPerson),
    phone: safeText(raw.phone),
    address: safeText(raw.address),
    purpose: safeText(raw.purpose),
    companyCategory: safeText(raw.companyCategory),
    categoryOther: safeText(raw.categoryOther),
    notes: safeText(raw.notes),
    imageUrl: raw.imageUrl == null ? null : safeText(raw.imageUrl),
  };
}

function normalizeDay(value: unknown): Day | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const dayName = safeText(raw.dayName);
  if (!safeText(raw.id) || !dayName) return null;

  const visits = Array.isArray(raw.visits)
    ? raw.visits.map((item) => normalizeVisit(item)).filter((item): item is Visit => !!item)
    : [];

  return {
    id: safeText(raw.id),
    planId: safeText(raw.planId),
    dayName,
    visits,
  };
}

function normalizePlan(value: unknown): Plan | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const id = safeText(raw.id);
  if (!id) return null;

  const days = Array.isArray(raw.days)
    ? raw.days.map((item) => normalizeDay(item)).filter((item): item is Day => !!item)
    : [];

  const user = raw.user && typeof raw.user === 'object'
    ? (() => {
        const u = raw.user as Record<string, unknown>;
        const id = safeText(u.id);
        const name = safeText(u.name);
        if (!id || !name) return null;
        return { id, name, phone: safeText(u.phone) };
      })()
    : null;

  return {
    id,
    userId: safeText(raw.userId),
    year: typeof raw.year === 'number' ? raw.year : 0,
    weekNumber: typeof raw.weekNumber === 'number' ? raw.weekNumber : 0,
    serialNumber: safeText(raw.serialNumber),
    startDate: safeText(raw.startDate),
    endDate: safeText(raw.endDate),
    status: safeText(raw.status) || 'DRAFT',
    submittedAt: raw.submittedAt == null ? null : safeText(raw.submittedAt) || null,
    createdAt: safeText(raw.createdAt) || new Date().toISOString(),
    updatedAt: safeText(raw.updatedAt) || new Date().toISOString(),
    user,
    days,
  };
}

function normalizePlanList(value: unknown): Plan[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => normalizePlan(item)).filter((item): item is Plan => item !== null);
}

function statusChip(t: T, status: string) {
  const map: Record<string, { label: string; bg: string; fg: string }> = {
    DRAFT: { label: t('weeklyPlans.statusDraft'), bg: '#fef3c7', fg: '#92400e' },
    SUBMITTED: { label: t('weeklyPlans.statusSubmitted'), bg: '#dbeafe', fg: '#1d4ed8' },
    APPROVED: { label: t('weeklyPlans.statusApproved'), bg: '#dcfce7', fg: '#166534' },
  };
  const c = map[status] ?? map.DRAFT;
  return <span style={{ background: c.bg, color: c.fg, padding: '2px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600 }}>{c.label}</span>;
}

// معاينة صورة زيارة مع إمكانية التكبير والتنزيل
function VisitImage({ visitId, imageUrl, token, t }: { visitId: string; imageUrl: string | null; token: string; t: T }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [zoom, setZoom] = useState(false);

  useEffect(() => {
    let active = true;
    if (!imageUrl) return;
    setFailed(false);
    api
      .get(`/weekly-plans/visits/${visitId}/image`, { headers: { Authorization: `Bearer ${token}` }, responseType: 'blob' })
      .then((res) => {
        if (!active) return;
        setUrl(URL.createObjectURL(res.data as Blob));
      })
      .catch(() => {
        if (!active) return;
        setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [visitId, imageUrl, token]);

  if (!imageUrl) return <span style={{ color: '#64748b', fontSize: 12 }}>{t('weeklyPlans.noImage')}</span>;
  if (failed) {
    return (
      <div style={{ width: 64, height: 64, borderRadius: 8, background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 4, textAlign: 'center', fontSize: 9, color: '#ef4444' }}>
        <span>⚠️</span>
        <span>{t('weeklyPlans.imageLoadError') || 'غير متوفرة'}</span>
      </div>
    );
  }
  if (!url) return <div style={{ width: 64, height: 64, borderRadius: 8, background: 'rgba(15, 23, 42, 0.5)' }} />;

  return (
    <>
      <img
        src={url}
        alt="visit"
        onClick={() => setZoom(true)}
        style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8, cursor: 'zoom-in', border: '1px solid rgba(148, 163, 184, 0.08)' }}
      />
      <a href={url} download={`visit-${visitId}.jpg`} style={{ fontSize: 11, color: '#2563eb', display: 'block' }}>
        {t('weeklyPlans.downloadImage')}
      </a>
      {zoom && (
        <div
          onClick={() => setZoom(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out' }}
        >
          <img src={url} alt="zoom" style={{ maxWidth: '92vw', maxHeight: '92vh', objectFit: 'contain', borderRadius: 8 }} />
        </div>
      )}
    </>
  );
}

// جلب صور الخطة كـ data URLs لتضمينها في الطباعة
async function collectImageDataUrls(token: string, plan: Plan): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (const d of sortedDays(plan)) {
    for (const v of d.visits ?? []) {
      if (!v.imageUrl) continue;
      try {
        const res = await api.get(`/weekly-plans/visits/${v.id}/image`, { headers: { Authorization: `Bearer ${token}` }, responseType: 'blob' });
        const dataUrl = await new Promise<string>((resolve) => {
          const r = new FileReader();
          r.onload = () => resolve(r.result as string);
          r.onerror = () => resolve('');
          r.readAsDataURL(res.data as Blob);
        });
        if (dataUrl) map.set(v.id, dataUrl);
      } catch {
        // تجاهل الصور غير القابلة للتحميل
      }
    }
  }
  return map;
}

function printPlan(plan: Plan, t: T, lang: Lang, images: Map<string, string>) {
  const w = window.open('', '_blank', 'width=900,height=1000');
  if (!w) return;

  const daysHtml = sortedDays(plan)
    .map((d) => {
      const visits = d.visits ?? [];
      const rows = visits.length
        ? visits
            .map((v, i) => {
              const img = v.imageUrl && images.get(v.id) ? `<img src="${images.get(v.id)}" style="max-width:130px;max-height:130px;border-radius:6px;border:1px solid #ccc;" />` : '—';
              const info = [
                [t('weeklyPlans.companyName'), v.companyName],
                [t('weeklyPlans.contactPerson'), v.contactPerson],
                [t('weeklyPlans.phone'), v.phone],
                [t('weeklyPlans.address'), v.address],
                [t('weeklyPlans.purpose'), v.purpose || '—'],
                [t('weeklyPlans.category'), categoryLabel(t, v)],
                ...(v.notes ? [[t('weeklyPlans.notes'), v.notes] as [string, string]] : []),
              ]
                .map(([k, val]) => `<tr><th style="width:40%;text-align:start;padding:6px;border:1px solid #ddd;background:#f9fafb;">${k}</th><td style="padding:6px;border:1px solid #ddd;">${val || '—'}</td></tr>`)
                .join('');
              return `<div style="border:1px solid #ccc;border-radius:8px;padding:10px;margin-top:8px;page-break-inside:avoid;">
                <strong style="font-size:13px;">${t('weeklyPlans.visits')} #${i + 1}</strong>
                <table style="border-collapse:collapse;width:100%;font-size:12px;margin-top:6px;">${info}</table>
                <div style="margin-top:6px;"><strong style="font-size:12px;">${t('weeklyPlans.image')}:</strong> ${img}</div>
              </div>`;
            })
            .join('')
        : `<div style="color:#999;font-size:12px;margin-top:6px;">—</div>`;
      return `<div style="margin-top:16px;page-break-inside:avoid;">
        <h2 style="font-size:15px;margin:0;color:#1e293b;">${t(`dayNames.${d.dayName}`)}</h2>
        ${rows}
      </div>`;
    })
    .join('');

  w.document.write(`<!DOCTYPE html><html lang="${lang}" dir="${lang === 'ar' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><title>${t('weeklyPlans.title')} — ${plan.serialNumber}</title></head>
<body style="font-family:Tahoma,Arial,sans-serif;margin:24px;">
  <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #1e293b;padding-bottom:12px;">
    <h1 style="margin:0;font-size:24px;font-weight:bold;color:#1e293b;">${plan.serialNumber}</h1>
    <div style="text-align:end;font-size:12px;color:#555;">${t('weeklyPlans.title')}<br>${formatDateTime(plan.createdAt, lang)}</div>
  </div>
  <div style="margin-top:14px;font-size:15px;color:#111;">
    <strong>${t('weeklyPlans.rep')}:</strong> ${plan.user?.name ?? '—'} · ${t('weeklyPlans.week')}: ${formatPlanDate(plan.startDate, lang)} → ${formatPlanDate(plan.endDate, lang)} · ${statusChipHtml(t, plan.status)}
  </div>
  ${daysHtml}
</body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 400);
}

function statusChipHtml(t: T, status: string) {
  const map: Record<string, string> = {
    DRAFT: t('weeklyPlans.statusDraft'),
    SUBMITTED: t('weeklyPlans.statusSubmitted'),
    APPROVED: t('weeklyPlans.statusApproved'),
  };
  return map[status] ?? status;
}

// تنزيل ملف موحد وحيد يضم كل زيارات الخطة (30+) مجمعة معاً
function downloadPlan(p: Plan, t: T, lang: Lang) {
  const visits = flattenVisits(p);
  const lines: string[] = [];
  lines.push(`${t('weeklyPlans.title')}: ${p.serialNumber}`);
  lines.push(`${t('weeklyPlans.rep')}: ${p.user?.name ?? '—'}`);
  lines.push(`${t('weeklyPlans.week')}: ${formatPlanDate(p.startDate, lang)} → ${formatPlanDate(p.endDate, lang)}`);
  lines.push(`${t('weeklyPlans.status')}: ${statusChipHtml(t, p.status)}`);
  lines.push(`${t('weeklyPlans.visits')}: ${visits.length}`);
  lines.push('');
  lines.push(
    [t('weeklyPlans.serial'), t('weeklyPlans.day'), t('weeklyPlans.companyName'), t('weeklyPlans.contactPerson'), t('weeklyPlans.phone'), t('weeklyPlans.address'), t('weeklyPlans.purpose'), t('weeklyPlans.category'), t('weeklyPlans.notes')].join(' | '),
  );
  for (const f of visits) {
    lines.push(
      [String(f.num), t(`dayNames.${f.dayName}`), f.visit.companyName || '—', f.visit.contactPerson || '—', f.visit.phone || '—', f.visit.address || '—', f.visit.purpose || '—', categoryLabel(t, f.visit), f.visit.notes || '—'].join(' | '),
    );
  }
  const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `WeeklyPlan_${p.serialNumber}_${formatYmd(new Date())}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

export function WeeklyPlans() {
  const { token } = useAuth();
  const { t, lang } = useI18n();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [reps, setReps] = useState<Rep[]>([]);
  const [repId, setRepId] = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [detail, setDetail] = useState<Plan | null>(null);
  const [printing, setPrinting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingDetail, setEditingDetail] = useState(false);
  const [editedDays, setEditedDays] = useState<Day[]>([]);
  const [savingPlan, setSavingPlan] = useState(false);

  async function deletePlan(p: Plan) {
    if (!token) return;
    try {
      await api.delete(`/weekly-plans/${p.id}`, authHeaders(token));
      setPlans((prev) => prev.filter((x) => x.id !== p.id));
      if (detail?.id === p.id) setDetail(null);
      setDeletingId(null);
      toast.success(lang === 'ar' ? 'تم حذف الخطة الأسبوعية' : 'Weekly plan deleted');
    } catch (err) {
      toast.error(apiErrorMessage(err, t));
    }
  }

  async function load() {
    if (!token) return;
    const params = new URLSearchParams();
    if (repId) params.set('repId', repId);
    if (status) params.set('status', status);
    if (isValidYmd(from)) params.set('from', from.trim());
    if (isValidYmd(to)) params.set('to', to.trim());
    params.set('t', String(Date.now()));
    const res = await api.get(`/weekly-plans?${params.toString()}`, {
      ...authHeaders(token),
      headers: { ...authHeaders(token).headers, 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
    });
    setPlans(normalizePlanList(res.data));
  }

  useEffect(() => {
    if (!token) return;
    api.get('/manager/reps', authHeaders(token)).then((r) => {
      if (Array.isArray(r.data)) {
        setReps(r.data.filter((rep): rep is Rep => !!rep && typeof rep === 'object' && typeof (rep as Record<string, unknown>).id === 'string' && typeof (rep as Record<string, unknown>).name === 'string'));
      } else {
        setReps([]);
      }
    });
  }, [token]);

  useEffect(() => {
    void load();
  }, [token, repId, status, from, to]);

  async function approve(p: Plan) {
    if (!token) return;
    try {
      await api.post(`/weekly-plans/${p.id}/approve`, {}, authHeaders(token));
      await load();
      if (detail?.id === p.id) {
        const res = await api.get(`/weekly-plans/${p.id}`, authHeaders(token));
        const next = normalizePlan(res.data);
        setDetail(next ?? null);
      }
      toast.success(lang === 'ar' ? 'تم الاعتماد' : 'Approved');
    } catch (err) {
      toast.error(apiErrorMessage(err, t));
    }
  }

  function beginEditPlan(p: Plan) {
    setEditedDays(sortedDays(p).map((day) => ({
      ...day,
      visits: (day.visits ?? []).map((visit) => ({ ...visit })),
    })));
    setEditingDetail(true);
  }

  async function savePlanEdits() {
    if (!token || !detail) return;
    const visitCount = editedDays.reduce((count, day) => count + day.visits.length, 0);
    if (editedDays.some((day) => day.visits.some((visit) => !visit.companyName.trim()))) {
      toast.error(t('weeklyPlans.requiredCompany'));
      return;
    }
    if (visitCount < 30) {
      toast.error(t('weeklyPlans.minVisits'));
      return;
    }
    setSavingPlan(true);
    try {
      const response = await api.put(`/weekly-plans/${detail.id}`, {
        year: detail.year,
        weekNumber: detail.weekNumber,
        days: editedDays.map((day) => ({ dayName: day.dayName, visits: day.visits })),
      }, authHeaders(token));
      const next = normalizePlan(response.data);
      if (next) {
        setDetail(next);
        setPlans((previous) => previous.map((plan) => plan.id === next.id ? next : plan));
      }
      setEditingDetail(false);
      toast.success(t('weeklyPlans.changesSaved'));
    } catch (error) {
      toast.error(apiErrorMessage(error, t));
    } finally {
      setSavingPlan(false);
    }
  }

  async function doPrint(p: Plan) {
    if (!token) return;
    setPrinting(true);
    try {
      const images = await collectImageDataUrls(token, p);
      printPlan(p, t, lang, images);
    } finally {
      setPrinting(false);
    }
  }

  const openDetail = useCallback(async (p: Plan) => {
    if (!token) return;
    const res = await api.get(`/weekly-plans/${p.id}`, authHeaders(token));
    const next = normalizePlan(res.data);
    setDetail(next ?? null);
  }, [token]);

  const totalVisits = (p: Plan) => (p.days ?? []).reduce((sum, d) => sum + (d.visits?.length ?? 0), 0);

  return (
    <div>
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>{t('weeklyPlans.title')}</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={repId} onChange={(e) => setRepId(e.target.value)} style={inputStyle}>
            <option value="">{t('weeklyPlans.allReps')}</option>
            {reps.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)} style={inputStyle}>
            <option value="">{t('weeklyPlans.allStatus')}</option>
            <option value="DRAFT">{t('weeklyPlans.statusDraft')}</option>
            <option value="SUBMITTED">{t('weeklyPlans.statusSubmitted')}</option>
            <option value="APPROVED">{t('weeklyPlans.statusApproved')}</option>
          </select>
          <label style={dateLabelStyle}>{t('weeklyPlans.from')}:
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={dateInputStyle} placeholder="YYYY-MM-DD" dir="ltr" />
          </label>
          <label style={dateLabelStyle}>{t('weeklyPlans.to')}:
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={dateInputStyle} placeholder="YYYY-MM-DD" dir="ltr" />
          </label>
        </div>
      </div>

      <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 10 }}>{t('weeklyPlans.count')}: {plans.length}</div>

      <table style={{ width: '100%', borderCollapse: 'collapse', borderRadius: 10, overflow: 'hidden' }}>
        <thead>
          <tr style={{ background: '#1e293b', color: '#fff', textAlign: 'start' }}>
            <th style={thStyle}>{t('weeklyPlans.rep')}</th>
            <th style={thStyle}>{t('weeklyPlans.serial')}</th>
            <th style={thStyle}>{t('weeklyPlans.week')}</th>
            <th style={thStyle}>{t('weeklyPlans.visits')}</th>
            <th style={thStyle}>{t('weeklyPlans.status')}</th>
            <th style={thStyle}>{t('weeklyPlans.actions')}</th>
          </tr>
        </thead>
        <tbody>
          {plans.map((p) => (
            <tr key={p.id}>
              <td style={tdStyle}>{p.user?.name ?? '—'}</td>
              <td style={tdStyle}><strong>{p.serialNumber}</strong></td>
              <td style={tdStyle}><span dir="ltr">{formatPlanDate(p.startDate, lang)} → {formatPlanDate(p.endDate, lang)}</span></td>
              <td style={tdStyle}>{totalVisits(p)}</td>
              <td style={tdStyle}>{statusChip(t, p.status)}</td>
              <td style={tdStyle}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button style={{ ...buttonStyle, background: '#2563eb' }} onClick={() => void openDetail(p)}>{t('weeklyPlans.view')}</button>
                  {p.status === 'SUBMITTED' && (
                    <button style={{ ...buttonStyle, background: '#16a34a' }} onClick={() => void approve(p)}>{t('weeklyPlans.approve')}</button>
                  )}
                  <button style={{ ...buttonStyle, background: '#dc2626' }} onClick={() => setDeletingId(p.id)}>{t('common.delete')}</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {!plans.length && <div style={{ color: '#64748b', textAlign: 'center', marginTop: 40 }}>{t('weeklyPlans.noPlans')}</div>}

      {detail && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={() => setDetail(null)}>
          <div style={{ background: 'rgba(30, 41, 59, 0.95)', backdropFilter: 'blur(16px)', border: '1px solid rgba(148, 163, 184, 0.1)', borderRadius: 12, maxWidth: 960, width: '100%', maxHeight: '92vh', overflow: 'auto', padding: 24, color: '#e2e8f0' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
              <h3 style={{ margin: 0 }}>{t('weeklyPlans.details')} — {detail.serialNumber}</h3>
              <div style={{ display: 'flex', gap: 8 }}>
                {detail.status === 'SUBMITTED' && !editingDetail && (
                  <button style={{ ...buttonStyle, background: '#0f766e' }} onClick={() => beginEditPlan(detail)}>{t('weeklyPlans.editSubmitted')}</button>
                )}
                {editingDetail && (
                  <>
                    <button style={{ ...buttonStyle, background: '#16a34a' }} onClick={() => void savePlanEdits()} disabled={savingPlan}>
                      {savingPlan ? t('weeklyPlans.loading') : t('weeklyPlans.saveChanges')}
                    </button>
                    <button style={{ ...buttonStyle, background: '#64748b' }} onClick={() => setEditingDetail(false)} disabled={savingPlan}>{t('weeklyPlans.close')}</button>
                  </>
                )}
                <button style={{ ...buttonStyle, background: '#1e293b' }} onClick={() => void doPrint(detail)} disabled={printing}>
                  {printing ? t('weeklyPlans.loading') : <><Printer size={15} aria-hidden="true" /> {t('weeklyPlans.print')}</>}
                </button>
                <button style={{ ...buttonStyle, background: '#7c3aed' }} onClick={() => downloadPlan(detail, t, lang)}>
                  {t('weeklyPlans.downloadFile')}
                </button>
                {detail.status === 'SUBMITTED' && !editingDetail && (
                  <button style={{ ...buttonStyle, background: '#16a34a' }} onClick={() => void approve(detail)}>{t('weeklyPlans.approve')}</button>
                )}
                <button style={{ ...buttonStyle, background: '#dc2626' }} onClick={() => setDeletingId(detail.id)}>{t('common.delete')}</button>
                <button onClick={() => setDetail(null)} style={{ ...buttonStyle, background: '#6b7280' }}>{t('weeklyPlans.close')}</button>
              </div>
            </div>

            {([
              [t('weeklyPlans.rep'), detail.user?.name ?? '—'],
              [t('weeklyPlans.serial'), detail.serialNumber],
              [t('weeklyPlans.week'), <span key="weekly-week" dir="ltr">{`${formatPlanDate(detail.startDate, lang)} → ${formatPlanDate(detail.endDate, lang)}`}</span>],
              [t('weeklyPlans.status'), statusChip(t, detail.status)],
              [t('weeklyPlans.visits'), String(totalVisits(detail))],
              ...(detail.submittedAt ? [[t('weeklyPlans.submittedOn'), formatDateTime(detail.submittedAt, lang)] as [string, string]] : []),
              [t('weeklyPlans.createdOn'), formatDateTime(detail.createdAt, lang)],
            ] as [string, React.ReactNode][]).map(([k, v]) => (
              <div key={k} style={{ padding: '8px 0', borderBottom: '1px solid #f3f4f6' }}>
                <span style={{ color: '#6b7280', fontSize: 13, display: 'block' }}>{k}</span>
                <span style={{ fontSize: 15 }}>{v}</span>
              </div>
            ))}

            <div style={{ marginTop: 18 }}>
              <h4 style={{ margin: '0 0 8px', color: '#f8fafc' }}>{t('weeklyPlans.allVisits')} ({totalVisits(detail)})</h4>
              {flattenVisits(detail).length === 0 && <div style={{ color: '#64748b', fontSize: 13 }}>—</div>}
              <div style={{ border: '1px solid rgba(148, 163, 184, 0.08)', borderRadius: 10, overflow: 'auto', maxHeight: 520 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead style={{ position: 'sticky', top: 0 }}>
                    <tr style={{ background: '#1e293b', color: '#fff' }}>
                      <th style={tdStyle}>#</th>
                      <th style={tdStyle}>{t('weeklyPlans.day')}</th>
                      <th style={tdStyle}>{t('weeklyPlans.companyName')}</th>
                      <th style={tdStyle}>{t('weeklyPlans.contactPerson')}</th>
                      <th style={tdStyle}>{t('weeklyPlans.phone')}</th>
                      <th style={tdStyle}>{t('weeklyPlans.address')}</th>
                      <th style={tdStyle}>{t('weeklyPlans.purpose')}</th>
                      <th style={tdStyle}>{t('weeklyPlans.category')}</th>
                      <th style={tdStyle}>{t('weeklyPlans.notes')}</th>
                      <th style={tdStyle}>{t('weeklyPlans.image')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(editingDetail
                      ? editedDays.flatMap((day) => day.visits.map((visit) => ({ dayName: day.dayName, visit })))
                      : flattenVisits(detail)
                    ).map((row, index) => (
                      <tr key={row.visit.id}>
                        <td style={{ ...tdStyle, textAlign: 'center' }}>{index + 1}</td>
                        <td style={tdStyle}>{t(`dayNames.${row.dayName}`)}</td>
                        <td style={tdStyle}>{editingDetail ? <input value={row.visit.companyName} onChange={(event) => setEditedDays((previous) => previous.map((day) => day.dayName !== row.dayName ? day : { ...day, visits: day.visits.map((visit) => visit.id === row.visit.id ? { ...visit, companyName: event.target.value } : visit) }))} /> : <strong>{row.visit.companyName || '—'}</strong>}</td>
                        <td style={tdStyle}>{editingDetail ? <input value={row.visit.contactPerson} onChange={(event) => setEditedDays((previous) => previous.map((day) => day.dayName !== row.dayName ? day : { ...day, visits: day.visits.map((visit) => visit.id === row.visit.id ? { ...visit, contactPerson: event.target.value } : visit) }))} /> : row.visit.contactPerson || '—'}</td>
                        <td style={tdStyle} dir="ltr">{editingDetail ? <input value={row.visit.phone} onChange={(event) => setEditedDays((previous) => previous.map((day) => day.dayName !== row.dayName ? day : { ...day, visits: day.visits.map((visit) => visit.id === row.visit.id ? { ...visit, phone: event.target.value } : visit) }))} /> : row.visit.phone || '—'}</td>
                        <td style={tdStyle}>{editingDetail ? <input value={row.visit.address} onChange={(event) => setEditedDays((previous) => previous.map((day) => day.dayName !== row.dayName ? day : { ...day, visits: day.visits.map((visit) => visit.id === row.visit.id ? { ...visit, address: event.target.value } : visit) }))} /> : row.visit.address || '—'}</td>
                        <td style={tdStyle}>{editingDetail ? <input value={row.visit.purpose} onChange={(event) => setEditedDays((previous) => previous.map((day) => day.dayName !== row.dayName ? day : { ...day, visits: day.visits.map((visit) => visit.id === row.visit.id ? { ...visit, purpose: event.target.value } : visit) }))} /> : row.visit.purpose || '—'}</td>
                        <td style={tdStyle}>{editingDetail ? <div style={{ display: 'grid', gap: 4 }}><select value={row.visit.companyCategory} onChange={(event) => setEditedDays((previous) => previous.map((day) => day.dayName !== row.dayName ? day : { ...day, visits: day.visits.map((visit) => visit.id === row.visit.id ? { ...visit, companyCategory: event.target.value } : visit) }))}>{['PLASTICS', 'PRINTING', 'PACKAGING', 'WOOD', 'METAL', 'PAPER', 'TISSUES', 'TEXTILES', 'FOOD_INDUSTRY', 'OTHERS'].map((category) => <option key={category} value={category}>{t(`companyCategory.${category}`)}</option>)}</select>{row.visit.companyCategory === 'OTHERS' && <input value={row.visit.categoryOther} placeholder={t('weeklyPlans.categoryOther')} onChange={(event) => setEditedDays((previous) => previous.map((day) => day.dayName !== row.dayName ? day : { ...day, visits: day.visits.map((visit) => visit.id === row.visit.id ? { ...visit, categoryOther: event.target.value } : visit) }))} />}</div> : categoryLabel(t, row.visit)}</td>
                        <td style={tdStyle}>{editingDetail ? <input value={row.visit.notes} onChange={(event) => setEditedDays((previous) => previous.map((day) => day.dayName !== row.dayName ? day : { ...day, visits: day.visits.map((visit) => visit.id === row.visit.id ? { ...visit, notes: event.target.value } : visit) }))} /> : row.visit.notes || '—'}</td>
                        <td style={tdStyle}>{token && <VisitImage visitId={row.visit.id} imageUrl={row.visit.imageUrl} token={token} t={t} />}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {deletingId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={() => setDeletingId(null)}>
          <div style={{ background: '#1e293b', border: '1px solid rgba(148, 163, 184, 0.2)', borderRadius: 12, maxWidth: 400, width: '100%', padding: 24, color: '#e2e8f0' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 12px', fontSize: 18 }}>{lang === 'ar' ? 'تأكيد الحذف' : 'Confirm Deletion'}</h3>
            <p style={{ margin: '0 0 20px', color: '#94a3b8', fontSize: 14 }}>
              {lang === 'ar' ? 'هل أنت متأكد من حذف هذه الخطة الأسبوعية؟ لا يمكن التراجع عن هذا الإجراء.' : 'Are you sure you want to delete this weekly plan? This action cannot be undone.'}
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button style={{ ...buttonStyle, background: '#64748b' }} onClick={() => setDeletingId(null)}>{lang === 'ar' ? 'إلغاء' : 'Cancel'}</button>
              <button style={{ ...buttonStyle, background: '#dc2626' }} onClick={() => {
                const p = plans.find((x) => x.id === deletingId) || (detail?.id === deletingId ? detail : null);
                if (p) void deletePlan(p);
              }}>
                {lang === 'ar' ? 'حذف' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = { padding: 8, borderRadius: 8 };
const dateLabelStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 13, minWidth: 0 };
const dateInputStyle: React.CSSProperties = { ...inputStyle, boxSizing: 'border-box', direction: 'ltr', minWidth: 0, maxWidth: '100%' };
const buttonStyle: React.CSSProperties = { padding: '8px 12px', borderRadius: 8, border: 'none', color: '#fff', cursor: 'pointer' };
const thStyle: React.CSSProperties = { padding: '10px 12px', fontSize: 13, fontWeight: 600, textAlign: 'start' };
const tdStyle: React.CSSProperties = { padding: '10px 12px', borderBottom: '1px solid #f1f5f9', fontSize: 14 };
