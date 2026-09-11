import { useEffect, useState } from 'react';
import { api, authHeaders } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useI18n, formatDate, formatDateTime, type Lang } from '../i18n';

interface RfqItem {
  description: string;
  quantity: string;
  finishingType: string;
  finishingTypeOther?: string;
  requiredWork: string[];
  requiredWorkOther?: string;
  workEnvironment: string;
  workEnvironmentOther?: string;
  rollMaterialId?: string;
  outerDiameter?: number;
  innerDiameter?: number;
  rollLength?: number;
  calculatedPrice?: number;
}

interface Rfq {
  id: string;
  userId: string;
  serialNumber?: string;
  clientName: string;
  contactName: string;
  contactPhone: string;
  items: RfqItem[];
  requiredTime: string;
  requiredTimeOther?: string | null;
  rollLocation?: string;
  workOrderDate: string;
  paymentTerms: string;
  imageUrl?: string | null;
  imageUrls?: string[] | null;
  price?: string | number | null;
  currency?: string;
  pricingNotes?: string | null;
  pricingStatus?: string;
  approvedAt?: string | null;
  approvedBy?: string | null;
  createdAt: string;
  user?: { id: string; name: string; phone: string } | null;
  comments?: RfqComment[];
}

interface Rep {
  id: string;
  name: string;
}

interface RfqComment {
  id: string;
  text: string;
  createdAt: string;
  updatedAt?: string;
  author?: { id: string; name: string; role: string } | null;
}

type T = (key: string) => string;

function optLabel(t: T, prefix: string, val: string) {
  const l = t(`${prefix}.${val}`);
  return l !== `${prefix}.${val}` ? l : val || '—';
}

function envWithOther(t: T, env: string, envOther?: string | null) {
  if (env === 'NORMAL') return '';
  const label = optLabel(t, 'rfqEnv', env);
  return env === 'OTHERS' && envOther ? `${label} (${envOther})` : label;
}

function workWithOther(t: T, work: string | string[], workOther?: string | null) {
  const arr = Array.isArray(work) ? work : [work];
  const filtered = arr.filter((w) => w !== 'NORMAL');
  if (filtered.length === 0) return '';
  return filtered
    .map((w) => {
      const label = optLabel(t, 'rfqWork', w);
      return w === 'OTHERS' && workOther ? `${label} (${workOther})` : label;
    })
    .join(', ');
}

// إجمالي الرولات في الطلب = مجموع الكميات على كل الأصناف
function totalRolls(items?: { quantity?: string }[]): number {
  let sum = 0;
  for (const it of items ?? []) {
    const m = String(it.quantity ?? '').match(/\d+(\.\d+)?/);
    if (m) sum += parseFloat(m[0]);
  }
  return sum;
}

function itemsTable(t: T, items: RfqItem[]) {
  const rows = (items ?? [])
    .map((it, i) => {
      const finish = optLabel(t, 'rfqFinish', it.finishingType);
      const finishOther = it.finishingType === 'OTHERS' && it.finishingTypeOther ? ` (${it.finishingTypeOther})` : '';
      return `<tr>
          <td style="padding:5px 8px;border:1px solid #d3dae3;text-align:center;background:#f9fafb;width:34px;">${i + 1}</td>
          <td style="padding:5px 8px;border:1px solid #d3dae3;">${it.description || '—'}</td>
          <td style="padding:5px 8px;border:1px solid #d3dae3;text-align:center;">${it.quantity || '—'}</td>
          <td style="padding:5px 8px;border:1px solid #d3dae3;">${finish}${finishOther}</td>
          <td style="padding:5px 8px;border:1px solid #d3dae3;">${workWithOther(t, it.requiredWork, it.requiredWorkOther)}</td>
          <td style="padding:5px 8px;border:1px solid #d3dae3;">${envWithOther(t, it.workEnvironment, it.workEnvironmentOther)}</td>
        </tr>`;
    })
    .join('');
  return `<table style="border-collapse:collapse;width:100%;font-size:12.5px;margin-top:6px;">
    <thead><tr style="background:#1e293b;color:#fff;">
      <th style="padding:6px 8px;border:1px solid #1e293b;width:34px;">#</th>
      <th style="padding:6px 8px;border:1px solid #1e293b;">${t('rfq.desc')}</th>
      <th style="padding:6px 8px;border:1px solid #1e293b;">${t('rfq.qty')}</th>
      <th style="padding:6px 8px;border:1px solid #1e293b;">${t('rfq.finishType')}</th>
      <th style="padding:6px 8px;border:1px solid #1e293b;">${t('rfq.requiredWork')}</th>
      <th style="padding:6px 8px;border:1px solid #1e293b;">${t('rfq.workEnv')}</th>
    </tr></thead><tbody>${rows || `<tr><td colspan="6" style="padding:6px 8px;border:1px solid #ddd;">${t('rfq.noItems')}</td></tr>`}</tbody></table>`;
}

function printRfq(r: Rfq, t: T, lang: Lang) {
  const w = window.open('', '_blank', 'width=860,height=980');
  if (!w) return;

  const now = new Date();
  const printTimestamp = now.toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-GB', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });

  const origin = window.location.origin;

  const rows: [string, string][] = [
    [t('rfq.contactName'), r.contactName || '—'],
    [t('rfq.contactPhone'), r.contactPhone || '—'],
    [t('rfq.priority'), optLabel(t, 'rfqTime', r.requiredTime)],
    ...(r.requiredTime === 'OTHERS' && r.requiredTimeOther ? [[t('rfq.othersDetail'), r.requiredTimeOther] as [string, string]] : []),
    [t('rfq.rollLocation'), optLabel(t, 'rfqLocation', r.rollLocation ?? 'NOT_SPECIFIED')],
    [t('rfq.workOrderDate'), formatDate(r.workOrderDate, lang)],
    [t('rfq.paymentTerms'), optLabel(t, 'rfqPay', r.paymentTerms)],
  ];
  const body = rows
    .map(([k, v]) => `<tr><th style="width:38%;text-align:start;padding:5px 8px;border:1px solid #d3dae3;background:#f1f5f9;font-weight:600;">${k}</th><td style="padding:5px 8px;border:1px solid #d3dae3;">${v}</td></tr>`)
    .join('');

  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  const headerFlex = lang === 'ar' ? 'row' : 'row-reverse';

  w.document.write(`<!DOCTYPE html><html lang="${lang}" dir="${dir}"><head><meta charset="utf-8"><title>${r.serialNumber || r.clientName}</title>
<style>
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: 'Segoe UI', Tahoma, Arial, sans-serif; font-size: 13px; color: #111; line-height: 1.45; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; gap: 14px; flex-direction: ${headerFlex}; border-bottom: 2.5px solid #1e293b; padding-bottom: 10px; margin-bottom: 12px; }
  .hblock { display: flex; flex-direction: column; gap: 2px; }
  .hblock.end { text-align: ${dir === 'rtl' ? 'left' : 'right'}; }
  .logo { height: 54px; width: auto; object-fit: contain; }
  .client-name { font-size: 16px; font-weight: 700; color: #111; margin-top: 4px; }
  .label { font-size: 11px; color: #64748b; }
  .rfq-no { font-size: 20px; font-weight: 800; color: #1e293b; letter-spacing: .5px; }
  .rep-name { font-size: 14px; color: #334155; margin-top: 4px; }
  h2.section { font-size: 13.5px; font-weight: 700; color: #1e293b; margin: 14px 0 6px; padding-bottom: 4px; border-bottom: 1px solid #cbd5e1; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #d3dae3; padding: 5px 8px; font-size: 12.5px; text-align: start; }
  thead th { background: #1e293b; color: #fff; font-weight: 600; }
  tbody tr:nth-child(even) { background: #f8fafc; }
  .timestamp { font-size: 10.5px; color: #94a3b8; margin-top: 10px; text-align: start; }
</style></head>
<body>
  <div class="header">
    <div class="hblock">
      <img class="logo" src="${origin}/logo-hannecard.jpeg" alt="Hannecard">
      <div class="client-name">${r.clientName}</div>
    </div>
    <div class="hblock end">
      <div class="label">${t('rfq.serial')}</div>
      <div class="rfq-no">${r.serialNumber || '—'}</div>
      <div class="rep-name">${t('rfq.rep')}: ${r.user?.name ?? '—'}</div>
    </div>
  </div>

  <h2 class="section">${t('rfq.itemsTitle')}</h2>
  ${itemsTable(t, r.items)}
  <h2 class="section">${t('rfq.details')}</h2>
  <table style="margin-top:2px;">${body}</table>
  <div class="timestamp">${t('rfq.printDetails')} · ${printTimestamp}</div>
</body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 300);
}

function pricingChip(pricingStatus: string | undefined, t: T) {
  if (pricingStatus === 'APPROVED') {
    return (
      <span style={{ background: 'rgba(34, 197, 94, 0.15)', color: '#22c55e', border: '1px solid rgba(34, 197, 94, 0.2)', padding: '2px 10px', borderRadius: 999, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>
        ✓ {t('rfq.approved')}
      </span>
    );
  }
  const priced = pricingStatus === 'PRICED';
  return (
    <span
      style={{
        background: priced ? 'rgba(245, 158, 11, 0.15)' : 'rgba(148, 163, 184, 0.1)',
        color: priced ? '#f59e0b' : '#94a3b8',
        padding: '2px 10px',
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        whiteSpace: 'nowrap',
      }}
    >
      {priced ? t('rfq.priced') : t('rfq.unpriced')}
    </span>
  );
}

function locationChip(value: string | undefined, t: T) {
  const colors =
    value === 'AT_FACTORY'
      ? { background: 'rgba(37, 99, 235, 0.12)', color: '#2563eb' }
      : value === 'AT_CUSTOMER'
        ? { background: 'rgba(124, 58, 237, 0.12)', color: '#7c3aed' }
        : { background: 'rgba(148, 163, 184, 0.12)', color: '#64748b' };
  return (
    <span style={{ ...colors, padding: '2px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>
      {optLabel(t, 'rfqLocation', value ?? 'NOT_SPECIFIED')}
    </span>
  );
}

// معاينة صور مرفق RFQ مع التكبير والتنزيل
function RfqImages({ rfqId, imageUrl, imageUrls, token, t }: { rfqId: string; imageUrl?: string | null; imageUrls?: string[] | null; token: string; t: T }) {
  const [urls, setUrls] = useState<string[]>([]);
  const [zoom, setZoom] = useState<string | null>(null);

  const imageList = (() => {
    if (imageUrls && imageUrls.length > 0) return imageUrls;
    if (imageUrl) return [imageUrl];
    return [];
  })();

  useEffect(() => {
    let active = true;
    if (imageList.length === 0) return;
    Promise.all(
      imageList.map((_fn, i) =>
        api
          .get(`/rfqs/${rfqId}/image/${i}`, { headers: { Authorization: `Bearer ${token}` }, responseType: 'blob' })
          .then((res) => URL.createObjectURL(res.data as Blob))
          .catch(() => null),
      ),
    ).then((results) => {
      if (!active) return;
      setUrls(results.filter(Boolean) as string[]);
    });
    return () => { active = false; };
  }, [rfqId, imageUrl, imageUrls, token]);

  if (imageList.length === 0) return <span style={{ color: '#64748b', fontSize: 13 }}>{t('rfq.noImage')}</span>;
  if (urls.length === 0) return <div style={{ width: 72, height: 72, borderRadius: 8, background: 'rgba(15, 23, 42, 0.5)' }} />;

  return (
    <>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {urls.map((url, i) => (
          <div key={i}>
            <img
              src={url}
              alt={`rfq-${i}`}
              onClick={() => setZoom(url)}
              style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 8, cursor: 'zoom-in', border: '1px solid rgba(148, 163, 184, 0.08)' }}
            />
            <a href={url} download={`rfq-${rfqId}-${i + 1}.jpg`} style={{ fontSize: 12, color: '#2563eb', display: 'block', marginTop: 4 }}>
              {t('rfq.downloadImage')}
            </a>
          </div>
        ))}
      </div>
      {zoom && (
        <div
          onClick={() => setZoom(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out' }}
        >
          <img src={zoom} alt="zoom" style={{ maxWidth: '92vw', maxHeight: '92vh', objectFit: 'contain', borderRadius: 8 }} />
        </div>
      )}
    </>
  );
}

function downloadRfqs(list: Rfq[], t: T, lang: Lang) {
  const header = [t('rfq.serial'), t('rfq.clientName'), t('rfq.salesman'), t('rfq.contactName'), t('rfq.contactPhone'), t('rfq.desc'), t('rfq.qty'), t('rfq.finishType'), t('rfq.requiredWork'), t('rfq.workEnv'), t('rfq.requiredTime'), t('rfq.rollLocation'), t('rfq.workOrderDate'), t('rfq.paymentTerms'), t('rfq.price'), t('rfq.sentOn')].join(' | ');
  const lines: string[] = [];
  for (const r of list) {
    const items = (r.items ?? []).length ? r.items : [{ description: '—', quantity: '—', finishingType: '—', requiredWork: ['—'] as string[], workEnvironment: '—' }];
    for (const it of items) {
      const finish = optLabel(t, 'rfqFinish', it.finishingType);
      const finishOther = it.finishingType === 'OTHERS' && it.finishingTypeOther ? ` (${it.finishingTypeOther})` : '';
      lines.push(
        [
          r.serialNumber || '—',
          r.clientName,
          r.user?.name ?? '—',
          r.contactName || '—',
          r.contactPhone || '—',
          it.description || '—',
          it.quantity || '—',
          `${finish}${finishOther}`,
          workWithOther(t, it.requiredWork, it.requiredWorkOther),
          envWithOther(t, it.workEnvironment, it.workEnvironmentOther),
          optLabel(t, 'rfqTime', r.requiredTime),
          optLabel(t, 'rfqLocation', r.rollLocation ?? 'NOT_SPECIFIED'),
          formatDate(r.workOrderDate, lang),
          optLabel(t, 'rfqPay', r.paymentTerms),
          r.pricingStatus === 'APPROVED' || (r.pricingStatus === 'PRICED' && r.price != null && String(r.price) !== '')
            ? `${Number(r.price).toLocaleString('en')} ${r.currency || 'SAR'} (${r.pricingStatus === 'APPROVED' ? t('rfq.approved') : t('rfq.priced')})`
            : t('rfq.unpriced'),
          formatDateTime(r.createdAt, lang),
        ].join(' | '),
      );
    }
  }
  const blob = new Blob(['\ufeff' + [header, ...lines].join('\n')], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `RFQs_${new Date().toISOString().slice(0, 10)}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

function distinctLabels(t: T, items: RfqItem[] | undefined, prefix: string, val: (i: RfqItem) => string | string[]) {
  const set = new Set<string>();
  for (const it of items ?? []) {
    const raw = val(it);
    const vals = Array.isArray(raw) ? raw : [raw];
    for (const v of vals) {
      if (v && v !== 'NORMAL') set.add(optLabel(t, prefix, v));
    }
  }
  return [...set].join(' / ') || '—';
}

export function RFQs() {
  const { token, user } = useAuth();
  const { t, lang } = useI18n();
  const [rfqs, setRfqs] = useState<Rfq[]>([]);
  const [reps, setReps] = useState<Rep[]>([]);
  const [repId, setRepId] = useState('');
  const [status, setStatus] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [sort, setSort] = useState('newest');
  const [searchQuery, setSearchQuery] = useState('');
  const [detail, setDetail] = useState<Rfq | null>(null);
  const [priceInput, setPriceInput] = useState('');
  const [currencyInput, setCurrencyInput] = useState('SAR');
  const [notesInput, setNotesInput] = useState('');
  const [savingPrice, setSavingPrice] = useState(false);
  const [approving, setApproving] = useState(false);
  const [commentInput, setCommentInput] = useState('');
  const [commenting, setCommenting] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [commentEditText, setCommentEditText] = useState('');
  const [savingLocation, setSavingLocation] = useState(false);

  const [rollMaterials, setRollMaterials] = useState<{ id: string; name: string; density: number; materialCostPerKg: number; baseWorkmanshipCost: number }[]>([]);
  const [calcMaterialId, setCalcMaterialId] = useState('');
  const [calcOD, setCalcOD] = useState('');
  const [calcID, setCalcID] = useState('');
  const [calcLen, setCalcLen] = useState('');
  const [calcResult, setCalcResult] = useState<{ total: number; weightKg: number; materialCost: number; workmanshipCost: number } | null>(null);

  async function load() {
    if (!token) return;
    const params = new URLSearchParams();
    if (repId) params.set('repId', repId);
    if (status) params.set('pricingStatus', status);
    if (dateFilter) params.set('date', dateFilter);
    const res = await api.get(`/rfqs?${params.toString()}`, authHeaders(token));
    setRfqs(res.data);
  }

  useEffect(() => {
    if (!token) return;
    api.get('/manager/reps', authHeaders(token)).then((r) => setReps(r.data));
  }, [token]);

  useEffect(() => {
    void load();
  }, [token, repId, status, dateFilter]);

  useEffect(() => {
    if (!token) return;
    const id = setInterval(() => { void load(); }, 5_000);
    return () => clearInterval(id);
  }, [token, repId, status, dateFilter]);

  useEffect(() => {
    if (detail) {
      setPriceInput(detail.price != null && detail.price !== '' ? String(detail.price) : '');
      setCurrencyInput(detail.currency || 'SAR');
      setNotesInput(detail.pricingNotes ?? '');
      // Reset calc state
      setCalcMaterialId('');
      setCalcOD('');
      setCalcID('');
      setCalcLen('');
      setCalcResult(null);
    }
  }, [detail]);

  useEffect(() => {
    if (token) {
      api.get('/roll-materials?active=true', authHeaders(token)).then((r) => setRollMaterials(r.data)).catch(() => {});
    }
  }, [token]);

  async function runCalc() {
    if (!token || !calcMaterialId || !calcOD || !calcID || !calcLen) return;
    try {
      const res = await api.post('/roll-materials/calculate', {
        materialId: calcMaterialId,
        outerDiameter: parseFloat(calcOD),
        innerDiameter: parseFloat(calcID),
        length: parseFloat(calcLen),
      }, authHeaders(token));
      setCalcResult(res.data);
    } catch {
      setCalcResult(null);
    }
  }

  const isManager = typeof user?.role !== 'string' || user.role.toUpperCase() !== 'REPRESENTATIVE';
  const canUseAutoCalc = (typeof user?.role === 'string' && user.role.toUpperCase() === 'DEVELOPER') || (Array.isArray(user?.permissions) && (user?.permissions as string[]).includes('AUTO_PRICING_ACCESS'));

  async function savePrice(clear: boolean) {
    if (!token || !detail || savingPrice) return;
    setSavingPrice(true);
    try {
      const body: Record<string, unknown> = { currency: currencyInput, pricingNotes: notesInput };
      if (clear) {
        body.price = null;
      } else {
        const raw = priceInput.replace(/[^\d.]/g, '');
        const num = Number(raw);
        if (raw === '' || !Number.isFinite(num)) {
          alert(t('rfq.invalidPrice'));
          setSavingPrice(false);
          return;
        }
        body.price = num;
      }
      const res = await api.patch(`/rfqs/${detail.id}/price`, body, authHeaders(token));
      const updated = res.data as Rfq;
      setRfqs((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      setDetail(updated);
      alert(clear ? t('rfq.priceCleared') : t('rfq.priceSaved'));
    } catch {
      alert(t('rfq.fail'));
    } finally {
      setSavingPrice(false);
    }
  }

  async function approve(id: string) {
    if (!token || approving) return;
    setApproving(true);
    try {
      const res = await api.post(`/rfqs/${id}/approve`, {}, authHeaders(token));
      const updated = res.data as Rfq;
      setRfqs((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      setDetail(updated);
      alert(t('rfq.approvedMsg'));
    } catch (err) {
      const notPriced = (err as { response?: { data?: { error?: string } } })?.response?.data?.error === 'not_priced';
      alert(notPriced ? t('rfq.notPriced') : t('rfq.fail'));
    } finally {
      setApproving(false);
    }
  }

  async function setRollLocation(value: string) {
    if (!token || !detail || savingLocation) return;
    setSavingLocation(true);
    try {
      const res = await api.patch(`/rfqs/${detail.id}/roll-location`, { rollLocation: value }, authHeaders(token));
      const updated = res.data as Rfq;
      setRfqs((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      setDetail(updated);
    } catch {
      alert(t('rfq.fail'));
    } finally {
      setSavingLocation(false);
    }
  }

  async function postComment() {
    if (!token || !detail || !commentInput.trim()) return;
    setCommenting(true);
    try {
      const res = await api.post(`/rfqs/${detail.id}/comments`, { text: commentInput.trim() }, authHeaders(token));
      const comment = res.data as RfqComment;
      setDetail((d) => (d ? { ...d, comments: [...(d.comments ?? []), comment] } : d));
      setRfqs((prev) => prev.map((r) => (r.id === detail.id ? { ...r, comments: [...(r.comments ?? []), comment] } : r)));
      setCommentInput('');
    } catch {
      alert(t('rfq.fail'));
    } finally {
      setCommenting(false);
    }
  }

  async function saveCommentEdit(id: string) {
    if (!token || !detail || !commentEditText.trim()) return;
    try {
      const res = await api.patch(`/rfqs/${detail.id}/comments/${id}`, { text: commentEditText.trim() }, authHeaders(token));
      const comment = res.data as RfqComment;
      const mapComment = (c: RfqComment) => (c.id === id ? { ...c, ...comment } : c);
      setDetail((d) => (d ? { ...d, comments: (d.comments ?? []).map(mapComment) } : d));
      setRfqs((prev) => prev.map((r) => (r.id === detail.id ? { ...r, comments: (r.comments ?? []).map(mapComment) } : r)));
      setEditingCommentId(null);
    } catch {
      alert(t('rfq.fail'));
    }
  }

  async function deleteComment(id: string) {
    if (!token || !detail || !window.confirm(t('rfq.deleteCommentConfirm'))) return;
    try {
      await api.delete(`/rfqs/${detail.id}/comments/${id}`, authHeaders(token));
      const filterComment = (c: RfqComment) => c.id !== id;
      setDetail((d) => (d ? { ...d, comments: (d.comments ?? []).filter(filterComment) } : d));
      setRfqs((prev) => prev.map((r) => (r.id === detail.id ? { ...r, comments: (r.comments ?? []).filter(filterComment) } : r)));
    } catch {
      alert(t('rfq.fail'));
    }
  }

  const q = searchQuery.trim().toLowerCase();

  let sorted = [...rfqs];
  if (q) {
    sorted = sorted.filter((r) => {
      const ps = r.pricingStatus;
      const statusLabel =
        ps === 'APPROVED' ? t('rfq.approved')
        : ps === 'PRICED' ? t('rfq.priced')
        : ps === 'UNPRICED' ? t('rfq.unpriced')
        : '';
      const payLabel = optLabel(t, 'rfqPay', r.paymentTerms);
      const haystack = [
        r.clientName,
        r.contactName,
        r.contactPhone,
        String(r.serialNumber ?? ''),
        r.id,
        r.user?.name ?? '',
        String(r.pricingStatus ?? ''),
        statusLabel,
        payLabel,
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }
  if (sort === 'rep') sorted.sort((a, b) => (a.user?.name ?? '').localeCompare(b.user?.name ?? '', 'ar'));
  else if (sort === 'client') sorted.sort((a, b) => a.clientName.localeCompare(b.clientName, 'ar'));
  else sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({
    clientName: '', contactName: '', contactPhone: '', userId: '',
    requiredTime: 'NORMAL', workOrderDate: '', paymentTerms: 'CASH',
    items: [{ description: '', quantity: '', finishingType: 'NORMAL_CYLINDRICAL', requiredWork: ['NORMAL'] as string[], workEnvironment: 'NORMAL' }],
  });
  const [creating, setCreating] = useState(false);

  function addCreateItem() {
    setCreateForm((f) => ({ ...f, items: [...f.items, { description: '', quantity: '', finishingType: 'NORMAL_CYLINDRICAL', requiredWork: ['NORMAL'] as string[], workEnvironment: 'NORMAL' }] }));
  }
  function removeCreateItem(i: number) {
    setCreateForm((f) => ({ ...f, items: f.items.filter((_, idx) => idx !== i) }));
  }
  function updateCreateItem(i: number, patch: Partial<typeof createForm.items[number]>) {
    setCreateForm((f) => ({ ...f, items: f.items.map((it, idx) => idx === i ? { ...it, ...patch } : it) }));
  }
  function toggleCreateRequiredWork(i: number, val: string) {
    setCreateForm((f) => ({ ...f, items: f.items.map((it, idx) => {
      if (idx !== i) return it;
      if (val === 'NORMAL') return { ...it, requiredWork: ['NORMAL'] };
      let next = it.requiredWork.filter((w) => w !== 'NORMAL');
      if (next.includes(val)) next = next.filter((w) => w !== val);
      else next.push(val);
      return { ...it, requiredWork: next.length > 0 ? next : ['NORMAL'] };
    }) }));
  }

  async function submitCreate() {
    if (!token) return;
    if (!createForm.clientName.trim() || !createForm.workOrderDate || createForm.items.some((it) => !it.description.trim())) {
      alert(t('rfq.fillRequired'));
      return;
    }
    setCreating(true);
    try {
      await api.post('/rfqs', {
        clientName: createForm.clientName.trim(),
        contactName: createForm.contactName.trim(),
        contactPhone: createForm.contactPhone.trim(),
        userId: createForm.userId || undefined,
        items: createForm.items.map((it) => ({
          description: it.description.trim(),
          quantity: it.quantity.trim(),
          finishingType: it.finishingType,
          requiredWork: it.requiredWork,
          workEnvironment: it.workEnvironment,
        })),
        requiredTime: createForm.requiredTime,
        workOrderDate: createForm.workOrderDate,
        paymentTerms: createForm.paymentTerms,
      }, authHeaders(token));
      setShowCreate(false);
      setCreateForm({ clientName: '', contactName: '', contactPhone: '', userId: '', requiredTime: 'NORMAL', workOrderDate: '', paymentTerms: 'CASH', items: [{ description: '', quantity: '', finishingType: 'NORMAL_CYLINDRICAL', requiredWork: ['NORMAL'], workEnvironment: 'NORMAL' }] });
      await load();
      alert(t('rfq.success'));
    } catch {
      alert(t('rfq.fail'));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>{t('rfq.title')}</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={() => void load()}
            style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: '#1e293b', color: '#fff', cursor: 'pointer', fontSize: 13 }}
          >
            ↻ {lang === 'ar' ? 'تحديث' : 'Refresh'}
          </button>
          {isManager && (
            <button style={{ ...buttonStyle, background: '#16a34a' }} onClick={() => setShowCreate(true)}>+ {t('rfq.createRfq') || 'طلب تسعير جديد'}</button>
          )}
          <select value={repId} onChange={(e) => setRepId(e.target.value)} style={inputStyle}>
            <option value="">{t('rfq.allReps')}</option>
            {reps.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)} style={inputStyle}>
            <option value="">{t('rfq.allStatuses')}</option>
            <option value="APPROVED">{t('rfq.approved')}</option>
            <option value="PRICED">{t('rfq.priced')}</option>
            <option value="UNPRICED">{t('rfq.unpriced')}</option>
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value)} style={inputStyle}>
            <option value="newest">{t('rfq.sortNewest')}</option>
            <option value="rep">{t('rfq.sortRep')}</option>
            <option value="client">{t('rfq.sortClient')}</option>
          </select>
          <input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} style={inputStyle} title={t('rfq.filterDate') || 'Filter by date'} />
          <button style={{ ...buttonStyle, background: '#7c3aed' }} onClick={() => downloadRfqs(sorted, t, lang)} disabled={!sorted.length}>
            {t('rfq.download')}
          </button>
          <button style={{ ...buttonStyle, background: '#1e293b' }} onClick={() => window.print()} disabled={!sorted.length}>
            {t('rfq.print')}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 240, maxWidth: 480 }}>
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', opacity: 0.6, pointerEvents: 'none', fontSize: 15 }}>🔍</span>
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('rfq.searchRfq')}
            style={{ ...inputStyle, width: '100%', paddingLeft: 38, paddingRight: 32 }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              title={t('rfq.close')}
              style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}
            >
              ✕
            </button>
          )}
        </div>
        <span style={{ fontSize: 12, color: '#94a3b8' }}>
          {q ? `${t('rfq.count')}: ${sorted.length} / ${rfqs.length}` : `${t('rfq.count')}: ${sorted.length}`}
        </span>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', borderRadius: 10, overflow: 'hidden' }}>
        <thead>
          <tr style={{ background: '#1e293b', color: '#fff', textAlign: 'start' }}>
            <th style={thStyle}>{t('rfq.serial')}</th>
            <th style={thStyle}>{t('rfq.clientName')}</th>
            <th style={thStyle}>{t('rfq.rep')}</th>
            <th style={thStyle}>{t('rfq.requiredWork')}</th>
            <th style={thStyle}>{t('rfq.workEnv')}</th>
            <th style={thStyle}>{t('rfq.itemsCount')}</th>
            <th style={thStyle}>{t('rfq.totalRolls')}</th>
            <th style={thStyle}>{t('rfq.rollLocation')}</th>
            <th style={thStyle}>{t('rfq.requiredTime')}</th>
            <th style={thStyle}>{t('rfq.paymentTerms')}</th>
            <th style={thStyle}>{t('rfq.price')}</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.id} onClick={() => setDetail(r)} style={rowStyle}>
              <td style={tdStyle}><strong>{r.serialNumber || '—'}</strong></td>
              <td style={tdStyle}>{r.clientName}</td>
              <td style={tdStyle}>{r.user?.name ?? '—'}</td>
              <td style={tdStyle}>{distinctLabels(t, r.items, 'rfqWork', (i) => i.requiredWork)}</td>
              <td style={tdStyle}>{distinctLabels(t, r.items, 'rfqEnv', (i) => i.workEnvironment)}</td>
              <td style={tdStyle}>{r.items?.length ?? 0}</td>
              <td style={tdStyle}><strong>{totalRolls(r.items)}</strong></td>
              <td style={tdStyle}>{locationChip(r.rollLocation, t)}</td>
              <td style={tdStyle}><span style={timeChip}>{optLabel(t, 'rfqTime', r.requiredTime)}</span></td>
              <td style={tdStyle}>{optLabel(t, 'rfqPay', r.paymentTerms)}</td>
              <td style={tdStyle}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {pricingChip(r.pricingStatus, t)}
                  {(r.pricingStatus === 'PRICED' || r.pricingStatus === 'APPROVED') && r.price != null && String(r.price) !== '' && (
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{Number(r.price).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en')} {r.currency || 'SAR'}</span>
                  )}
                  {isManager && r.pricingStatus === 'PRICED' && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        void approve(r.id);
                      }}
                      disabled={approving}
                      style={{ ...buttonStyle, background: '#16a34a', fontSize: 12, padding: '4px 8px', alignSelf: 'flex-start' }}
                    >
                      {approving ? t('rfq.approving') : `✓ ${t('rfq.approve')}`}
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {!sorted.length && <div style={{ color: '#64748b', textAlign: 'center', marginTop: 40 }}>{t('rfq.noRfqs')}</div>}

      {detail && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={() => setDetail(null)}>
          <div style={{ background: 'rgba(30, 41, 59, 0.95)', backdropFilter: 'blur(16px)', border: '1px solid rgba(148, 163, 184, 0.1)', borderRadius: 12, maxWidth: 880, width: '100%', maxHeight: '90vh', overflow: 'auto', padding: 24, color: '#e2e8f0' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}>{t('rfq.details')} — {detail.serialNumber || detail.clientName}</h3>
              <button onClick={() => setDetail(null)} style={{ ...buttonStyle, background: '#6b7280' }}>{t('rfq.close')}</button>
            </div>
            {([
              [t('rfq.serial'), detail.serialNumber || '—'],
              [t('rfq.clientName'), detail.clientName],
              [t('rfq.rep'), detail.user?.name ?? '—'],
              [t('rfq.itemsCount'), String(detail.items?.length ?? 0)],
              [t('rfq.totalRolls'), String(totalRolls(detail.items))],
              [t('rfq.contactName'), detail.contactName || '—'],
              [t('rfq.contactPhone'), detail.contactPhone || '—'],
              [t('rfq.requiredTime'), optLabel(t, 'rfqTime', detail.requiredTime)],
              ...(detail.requiredTime === 'OTHERS' && detail.requiredTimeOther ? [[t('rfq.othersDetail'), detail.requiredTimeOther] as [string, string]] : []),
              [t('rfq.rollLocation'), optLabel(t, 'rfqLocation', detail.rollLocation ?? 'NOT_SPECIFIED')],
              [t('rfq.workOrderDate'), formatDate(detail.workOrderDate, lang)],
              [t('rfq.paymentTerms'), optLabel(t, 'rfqPay', detail.paymentTerms)],
              [t('rfq.sentOn'), formatDateTime(detail.createdAt, lang)],
            ] as [string, string][]).map(([k, v]) => (
              <div key={k} style={{ padding: '8px 0', borderBottom: '1px solid #f3f4f6' }}>
                <span style={{ color: '#6b7280', fontSize: 13, display: 'block' }}>{k}</span>
                <span style={{ fontSize: 15 }}>{v}</span>
              </div>
            ))}

            {isManager && (
              <div style={{ padding: '10px 0', borderBottom: '1px solid #f3f4f6' }}>
                <span style={{ color: '#6b7280', fontSize: 13, display: 'block', marginBottom: 6 }}>
                  {t('rfq.rollLocation')} — {t('rfq.setRollLocation')}
                </span>
                <select
                  value={detail.rollLocation ?? 'NOT_SPECIFIED'}
                  onChange={(e) => void setRollLocation(e.target.value)}
                  disabled={savingLocation}
                  style={{ ...inputStyle, width: '100%', background: 'rgba(30, 41, 59, 0.6)', border: '1px solid rgba(148, 163, 184, 0.2)', color: '#e2e8f0' }}
                >
                  <option value="NOT_SPECIFIED">{t('rfqLocation.NOT_SPECIFIED')}</option>
                  <option value="AT_FACTORY">{t('rfqLocation.AT_FACTORY')}</option>
                  <option value="AT_CUSTOMER">{t('rfqLocation.AT_CUSTOMER')}</option>
                </select>
              </div>
            )}

            <div style={{ padding: '8px 0', borderBottom: '1px solid #f3f4f6' }}>
              <span style={{ color: '#6b7280', fontSize: 13, display: 'block' }}>{t('rfq.price')}</span>
              <span style={{ fontSize: 15 }}>
                {pricingChip(detail.pricingStatus, t)}{' '}
                {(detail.pricingStatus === 'PRICED' || detail.pricingStatus === 'APPROVED') && detail.price != null && String(detail.price) !== '' ? (
                  <strong style={{ marginLeft: 8 }}>{Number(detail.price).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en')} {detail.currency || 'SAR'}</strong>
                ) : null}
                {detail.pricingNotes ? <div style={{ fontSize: 13, color: '#555', marginTop: 4 }}>{detail.pricingNotes}</div> : null}
              </span>
            </div>

            {detail.pricingStatus === 'APPROVED' && (
              <div style={{ padding: '8px 0', borderBottom: '1px solid #f3f4f6' }}>
                <span style={{ color: '#6b7280', fontSize: 13, display: 'block' }}>{t('rfq.approvedAt')}</span>
                <span style={{ fontSize: 15 }}>
                  {formatDateTime(detail.approvedAt, lang)}
                  {detail.approvedBy ? ` — ${t('rfq.approvedBy')}: ${detail.approvedBy}` : ''}
                </span>
              </div>
            )}

            <div style={{ padding: '8px 0', borderBottom: '1px solid #f3f4f6' }}>
              <span style={{ color: '#6b7280', fontSize: 13, display: 'block', marginBottom: 6 }}>{t('rfq.attachment')}</span>
              {token ? <RfqImages rfqId={detail.id} imageUrl={detail.imageUrl} imageUrls={detail.imageUrls} token={token} t={t} /> : <span style={{ color: '#64748b', fontSize: 13 }}>{t('rfq.noImage')}</span>}
            </div>

            <div style={{ padding: '8px 0', borderBottom: '1px solid #f3f4f6' }}>
              <span style={{ color: '#6b7280', fontSize: 13, display: 'block', marginBottom: 6 }}>{t('rfq.comments')}</span>
              {(detail.comments ?? []).length === 0 && <span style={{ color: '#64748b', fontSize: 13 }}>{t('rfq.noComments')}</span>}
              {(detail.comments ?? []).map((c) => (
                <div key={c.id} style={{ background: 'rgba(15, 23, 42, 0.5)', border: '1px solid rgba(148, 163, 184, 0.08)', borderRadius: 8, padding: '8px 12px', marginBottom: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <strong style={{ fontSize: 13, color: '#93c5fd' }}>{c.author?.name ?? '—'}</strong>
                    <span style={{ fontSize: 11, color: '#94a3b8' }}>{formatDateTime(c.createdAt, lang)}</span>
                  </div>
                  {editingCommentId === c.id ? (
                    <div style={{ marginTop: 4 }}>
                      <textarea
                        value={commentEditText}
                        onChange={(e) => setCommentEditText(e.target.value)}
                        rows={2}
                        style={{ ...inputStyle, width: '100%', resize: 'vertical', fontFamily: 'inherit', background: 'rgba(30, 41, 59, 0.6)', border: '1px solid rgba(148, 163, 184, 0.2)', color: '#e2e8f0' }}
                      />
                      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                        <button style={{ ...buttonStyle, background: '#16a34a', padding: '4px 12px', fontSize: 12 }} onClick={() => void saveCommentEdit(c.id)}>{t('rfq.saveComment')}</button>
                        <button style={{ ...buttonStyle, background: '#6b7280', padding: '4px 12px', fontSize: 12 }} onClick={() => setEditingCommentId(null)}>{t('rfq.cancelComment')}</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div style={{ fontSize: 14, marginTop: 4, whiteSpace: 'pre-wrap' }}>{c.text}</div>
                      {isManager && c.author?.id === user?.id && (
                        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                          <button style={{ ...buttonStyle, background: '#2563eb', padding: '2px 10px', fontSize: 12 }} onClick={() => { setEditingCommentId(c.id); setCommentEditText(c.text); }}>{t('rfq.editComment')}</button>
                          <button style={{ ...buttonStyle, background: '#dc2626', padding: '2px 10px', fontSize: 12 }} onClick={() => void deleteComment(c.id)}>{t('rfq.deleteComment')}</button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))}
              {isManager && (
                <div style={{ marginTop: 8 }}>
                  <textarea
                    value={commentInput}
                    onChange={(e) => setCommentInput(e.target.value)}
                    placeholder={t('rfq.writeComment')}
                    rows={2}
                    style={{ ...inputStyle, width: '100%', resize: 'vertical', fontFamily: 'inherit', background: 'rgba(30, 41, 59, 0.6)', border: '1px solid rgba(148, 163, 184, 0.2)', color: '#e2e8f0' }}
                  />
                  <button style={{ ...buttonStyle, background: '#2563eb', marginTop: 6 }} onClick={() => void postComment()} disabled={commenting || !commentInput.trim()}>
                    {commenting ? t('rfq.saving') : t('rfq.postComment')}
                  </button>
                </div>
              )}
            </div>

            {isManager && (
              <div style={{ marginTop: 14, padding: 14, background: 'rgba(15, 23, 42, 0.5)', borderRadius: 10, border: '1px solid rgba(148, 163, 184, 0.08)' }}>
                {detail.pricingStatus === 'PRICED' && (
                  <button
                    style={{ ...buttonStyle, background: '#16a34a', width: '100%', padding: '10px', fontSize: 15, fontWeight: 700, marginBottom: 12 }}
                    onClick={() => void approve(detail.id)}
                    disabled={approving}
                  >
                    {approving ? t('rfq.approving') : `✓ ${t('rfq.approve')}`}
                  </button>
                )}
                {detail.pricingStatus === 'APPROVED' && (
                  <div style={{ background: '#dcfce7', color: '#166534', padding: '10px 12px', borderRadius: 8, marginBottom: 12, fontWeight: 600, fontSize: 14 }}>
                    ✓ {t('rfq.approved')} — {formatDateTime(detail.approvedAt, lang)}
                    {detail.approvedBy ? ` (${t('rfq.approvedBy')}: ${detail.approvedBy})` : ''}
                  </div>
                )}
                <h4 style={{ margin: '0 0 10px' }}>{t('rfq.price')}</h4>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={priceInput}
                    onChange={(e) => setPriceInput(e.target.value)}
                    placeholder={t('rfq.price')}
                    style={{ ...inputStyle, flex: 1, minWidth: 120 }}
                  />
                  <select value={currencyInput} onChange={(e) => setCurrencyInput(e.target.value)} style={inputStyle}>
                    <option value="SAR">SAR</option>
                    <option value="EGP">EGP</option>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                  </select>
                </div>
                {rollMaterials.length > 0 && canUseAutoCalc && (
                  <div style={{ marginTop: 10, padding: 10, background: 'rgba(30, 41, 59, 0.5)', borderRadius: 8, border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: '#1e40af', marginBottom: 6 }}>⚙ {t('rfq.autoCalc') || 'حساب آلي للسعر'}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                      <select value={calcMaterialId} onChange={(e) => { setCalcMaterialId(e.target.value); setCalcResult(null); }} style={inputStyle}>
                        <option value="">{t('rfq.selectMaterial') || 'اختر الخامة'}</option>
                        {rollMaterials.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                      </select>
                      <input type="number" step="any" min="0" placeholder={t('rfq.outerDia') || 'القطر الخارجي D'} value={calcOD} onChange={(e) => { setCalcOD(e.target.value); setCalcResult(null); }} style={inputStyle} />
                      <input type="number" step="any" min="0" placeholder={t('rfq.innerDia') || 'القطر الداخلي d'} value={calcID} onChange={(e) => { setCalcID(e.target.value); setCalcResult(null); }} style={inputStyle} />
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 6, alignItems: 'center' }}>
                      <input type="number" step="any" min="0" placeholder={t('rfq.rollLen') || 'الطول L'} value={calcLen} onChange={(e) => { setCalcLen(e.target.value); setCalcResult(null); }} style={{ ...inputStyle, flex: 1 }} />
                      <button style={{ ...buttonStyle, background: '#2563eb', whiteSpace: 'nowrap' }} onClick={() => void runCalc()}>{t('rfq.calc') || 'احسب'}</button>
                    </div>
                    {calcResult && (
                      <div style={{ marginTop: 8, padding: 8, background: 'rgba(30, 41, 59, 0.5)', borderRadius: 6, border: '1px solid rgba(148, 163, 184, 0.1)', fontSize: 13 }}>
                        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                          <span>{t('rfq.weight') || 'الوزن'}: <strong>{calcResult.weightKg} kg</strong></span>
                          <span>{t('rfq.materialCost') || 'تكلفة الخامة'}: <strong>{calcResult.materialCost} SAR</strong></span>
                          <span>{t('rfq.workmanshipCost') || 'المصنعية'}: <strong>{calcResult.workmanshipCost} SAR</strong></span>
                        </div>
                        <div style={{ marginTop: 4, fontSize: 15, fontWeight: 700, color: '#16a34a' }}>
                          {t('rfq.totalPrice') || 'السعر الكلي'}: {calcResult.total.toLocaleString()} SAR
                          <button
                            style={{ ...buttonStyle, background: '#16a34a', marginLeft: 12, padding: '2px 10px', fontSize: 12 }}
                            onClick={() => setPriceInput(String(calcResult.total))}
                          >
                            {t('rfq.usePrice') || 'استخدم هذا السعر'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                <textarea
                  value={notesInput}
                  onChange={(e) => setNotesInput(e.target.value)}
                  placeholder={t('rfq.pricingNotes')}
                  rows={2}
                  style={{ ...inputStyle, width: '100%', marginTop: 8, resize: 'vertical', fontFamily: 'inherit' }}
                />
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button style={{ ...buttonStyle, background: '#16a34a' }} onClick={() => void savePrice(false)} disabled={savingPrice}>
                    {savingPrice ? t('rfq.saving') : t('rfq.savePrice')}
                  </button>
                  {detail.pricingStatus === 'PRICED' && (
                    <button style={{ ...buttonStyle, background: '#dc2626' }} onClick={() => void savePrice(true)} disabled={savingPrice}>
                      {t('rfq.clearPrice')}
                    </button>
                  )}
                </div>
              </div>
            )}

            <h4 style={{ margin: '16px 0 4px' }}>{t('rfq.itemsTitle')}</h4>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8 }}>
              <thead>
                <tr style={{ background: '#1e293b', color: '#fff' }}>
                  <th style={tdStyle}>#</th>
                  <th style={tdStyle}>{t('rfq.desc')}</th>
                  <th style={tdStyle}>{t('rfq.qty')}</th>
                  <th style={tdStyle}>{t('rfq.finishType')}</th>
                  <th style={tdStyle}>{t('rfq.requiredWork')}</th>
                  <th style={tdStyle}>{t('rfq.workEnv')}</th>
                  {detail.items?.some((it) => it.rollMaterialId) && (
                    <>
                      <th style={tdStyle}>{t('rfq.rollDimensions') || 'أبعاد الرول'}</th>
                      <th style={tdStyle}>{t('rfq.calculatedPriceLabel') || 'السعر المحسوب'}</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {(detail.items ?? []).map((it, i) => (
                  <tr key={i}>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>{i + 1}</td>
                    <td style={tdStyle}>{it.description || '—'}</td>
                    <td style={tdStyle}>{it.quantity || '—'}</td>
                    <td style={tdStyle}>
                      {optLabel(t, 'rfqFinish', it.finishingType)}
                      {it.finishingType === 'OTHERS' && it.finishingTypeOther ? ` (${it.finishingTypeOther})` : ''}
                    </td>
                    <td style={tdStyle}>{workWithOther(t, it.requiredWork, it.requiredWorkOther)}</td>
                    <td style={tdStyle}>{envWithOther(t, it.workEnvironment, it.workEnvironmentOther)}</td>
                    {detail.items?.some((item) => item.rollMaterialId) && (
                      <>
                        <td style={tdStyle}>
                          {it.outerDiameter && it.innerDiameter && it.rollLength
                            ? `D:${it.outerDiameter} × d:${it.innerDiameter} × L:${it.rollLength} mm`
                            : '—'}
                        </td>
                        <td style={tdStyle}>
                          {it.calculatedPrice != null
                            ? <strong style={{ color: '#16a34a' }}>{Number(it.calculatedPrice).toLocaleString()} SAR</strong>
                            : '—'}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {!(detail.items ?? []).length && <div style={{ color: '#64748b', marginTop: 8 }}>{t('rfq.noItems')}</div>}

            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button style={{ ...buttonStyle, background: '#1e293b', flex: 1 }} onClick={() => printRfq(detail, t, lang)}>{t('rfq.printDetails')}</button>
            </div>
          </div>
        </div>
      )}

      {showCreate && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={() => setShowCreate(false)}>
          <div style={{ background: 'rgba(30, 41, 59, 0.95)', backdropFilter: 'blur(16px)', border: '1px solid rgba(148, 163, 184, 0.1)', borderRadius: 12, maxWidth: 700, width: '100%', maxHeight: '90vh', overflow: 'auto', padding: 24, color: '#e2e8f0' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0 }}>{t('rfq.createRfq') || 'طلب تسعير جديد'}</h3>
              <button onClick={() => setShowCreate(false)} style={{ ...buttonStyle, background: '#6b7280' }}>{t('rfq.close')}</button>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>{t('rfq.rep')}:</label>
              <select value={createForm.userId} onChange={(e) => setCreateForm((f) => ({ ...f, userId: e.target.value }))} style={{ ...inputStyle, width: '100%' }}>
                <option value="">{t('rfq.assignToSelf')}</option>
                {reps.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <input placeholder={t('rfq.clientName')} value={createForm.clientName} onChange={(e) => setCreateForm((f) => ({ ...f, clientName: e.target.value }))} style={inputStyle} />
              <input placeholder={t('rfq.contactName')} value={createForm.contactName} onChange={(e) => setCreateForm((f) => ({ ...f, contactName: e.target.value }))} style={inputStyle} />
              <input placeholder={t('rfq.contactPhone')} value={createForm.contactPhone} onChange={(e) => setCreateForm((f) => ({ ...f, contactPhone: e.target.value }))} style={inputStyle} />
              <select value={createForm.requiredTime} onChange={(e) => setCreateForm((f) => ({ ...f, requiredTime: e.target.value }))} style={inputStyle}>
                <option value="TOP_URGENT">{t('rfqTime.TOP_URGENT')}</option>
                <option value="URGENT">{t('rfqTime.URGENT')}</option>
                <option value="NORMAL">{t('rfqTime.NORMAL')}</option>
                <option value="OTHERS">{t('rfqTime.OTHERS')}</option>
              </select>
              <input type="date" value={createForm.workOrderDate} onChange={(e) => setCreateForm((f) => ({ ...f, workOrderDate: e.target.value }))} style={inputStyle} />
              <select value={createForm.paymentTerms} onChange={(e) => setCreateForm((f) => ({ ...f, paymentTerms: e.target.value }))} style={inputStyle}>
                <option value="CASH">{t('rfqPay.CASH')}</option>
                <option value="CREDIT">{t('rfqPay.CREDIT')}</option>
              </select>
            </div>

            <h4 style={{ margin: '16px 0 8px' }}>{t('rfq.itemsTitle')}</h4>
            {createForm.items.map((item, i) => (
              <div key={i} style={{ background: 'rgba(15, 23, 42, 0.5)', borderRadius: 8, padding: 12, marginBottom: 10, border: '1px solid rgba(148, 163, 184, 0.08)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <strong style={{ color: '#2563eb' }}>{t('rfq.desc')} #{i + 1}</strong>
                  {createForm.items.length > 1 && <button onClick={() => removeCreateItem(i)} style={{ ...buttonStyle, background: '#dc2626', padding: '4px 8px', fontSize: 12 }}>✕</button>}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <input placeholder={t('rfq.desc')} value={item.description} onChange={(e) => updateCreateItem(i, { description: e.target.value })} style={inputStyle} />
                  <input placeholder={t('rfq.qty')} value={item.quantity} onChange={(e) => updateCreateItem(i, { quantity: e.target.value })} style={inputStyle} />
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                  {['NORMAL', 'COMPLETE_MANUFACTURING', 'MANUFACTURING', 'RE_COVERING', 'RE_GRINDING', 'REPAIR', 'OTHERS'].map((w) => (
                    <button key={w} onClick={() => toggleCreateRequiredWork(i, w)} style={{ padding: '4px 10px', borderRadius: 999, border: 'none', fontSize: 12, cursor: 'pointer', background: item.requiredWork.includes(w) ? '#2563eb' : '#e5e7eb', color: item.requiredWork.includes(w) ? '#fff' : '#374151' }}>
                      {t(`rfqWork.${w}`)}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <button onClick={addCreateItem} style={{ ...buttonStyle, background: 'rgba(59, 130, 246, 0.2)', color: '#60a5fa', marginBottom: 12 }}>+ {t('rfq.addItem')}</button>

            <div style={{ display: 'flex', gap: 8 }}>
              <button style={{ ...buttonStyle, background: '#16a34a' }} onClick={() => void submitCreate()} disabled={creating}>
                {creating ? t('rfq.saving') : t('rfq.submit')}
              </button>
              <button style={{ ...buttonStyle, background: '#6b7280' }} onClick={() => setShowCreate(false)}>{t('rfq.close')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = { padding: 8, borderRadius: 8 };
const buttonStyle: React.CSSProperties = { padding: '8px 12px', borderRadius: 8, border: 'none', color: '#fff', cursor: 'pointer' };
const thStyle: React.CSSProperties = { padding: '10px 12px', fontSize: 13, fontWeight: 600, textAlign: 'start' };
const tdStyle: React.CSSProperties = { padding: '10px 12px', borderBottom: '1px solid #f1f5f9', fontSize: 14 };
const rowStyle: React.CSSProperties = { cursor: 'pointer' };
const timeChip: React.CSSProperties = { background: '#fef3c7', color: '#92400e', padding: '2px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600 };
