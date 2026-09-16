import React, { useEffect, useMemo, useState } from 'react';
import { api, authHeaders, apiErrorMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n';
import { toast } from '../components/Toast';

interface QuotationClient {
  id: string;
  companyName: string;
}

interface RollerSpec {
  id: string;
  clientId: string;
  serviceType: string;
  outerDiameterOd: number;
  coreDiameter: number;
  faceLength: number;
  totalLength: number;
  coatingMaterial: string;
  hardnessShore: string;
}

interface CreatedBy {
  id: string;
  name: string;
}

interface Quotation {
  id: string;
  quotationNumber: string;
  qNumber: string | null;
  client: QuotationClient;
  rollerSpec: RollerSpec;
  createdBy: CreatedBy;
  status: string;
  baseMaterialCost: number;
  laborMachiningCost: number;
  subtotal: number;
  discountPercentage: number;
  discountAmount: number;
  vatAmount: number;
  grandTotal: number;
  terms: string | null;
  qrCodeUrl: string | null;
  pdfUrl: string | null;
  createdAt: string;
}

const inputStyle: React.CSSProperties = {
  padding: '8px 12px',
  border: '1px solid #d1d5db',
  borderRadius: '6px',
  fontSize: '14px',
  width: '100%',
  boxSizing: 'border-box',
};

const buttonStyle: React.CSSProperties = {
  padding: '8px 16px',
  borderRadius: '6px',
  border: 'none',
  fontSize: '14px',
  cursor: 'pointer',
  fontWeight: 600,
};

const thStyle: React.CSSProperties = {
  padding: '10px 12px',
  textAlign: 'left',
  borderBottom: '2px solid #e5e7eb',
  fontWeight: 600,
  fontSize: '13px',
  color: '#6b7280',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.05em',
};

const tdStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderBottom: '1px solid #f3f4f6',
  fontSize: '14px',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '13px',
  fontWeight: 600,
  color: '#374151',
  marginBottom: '4px',
};

const statusChipStyle: Record<string, React.CSSProperties> = {
  DRAFT: { background: '#fef3c7', color: '#92400e' },
  PENDING_APPROVAL: { background: '#fee2e2', color: '#b91c1c' },
  APPROVED: { background: '#d1fae5', color: '#065f46' },
  REJECTED: { background: '#e5e7eb', color: '#374151' },
  CONVERTED_TO_WORK_ORDER: { background: '#dbeafe', color: '#1e40af' },
};

const fmtMoney = (n: number, lang: string) => `SAR ${Number(n ?? 0).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en', { maximumFractionDigits: 2 })}`;

export function Quotations() {
  const { token, user } = useAuth();
  const { t, lang } = useI18n();

  const roleName = typeof user?.role === 'string' ? user.role.toUpperCase() : '';
  const isManager = roleName !== 'REPRESENTATIVE';

  const [list, setList] = useState<Quotation[]>([]);
  const [clients, setClients] = useState<QuotationClient[]>([]);
  const [rolls, setRolls] = useState<RollerSpec[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const [showForm, setShowForm] = useState(false);
  const [clientId, setClientId] = useState('');
  const [rollerSpecId, setRollerSpecId] = useState('');
  const [qNum, setQNum] = useState('');
  const [discount, setDiscount] = useState('0');
  const [terms, setTerms] = useState('');
  const [saving, setSaving] = useState(false);

  const [detail, setDetail] = useState<Quotation | null>(null);
  const [edit, setEdit] = useState<{ qNumber: string; terms: string } | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [approving, setApproving] = useState(false);

  const load = async () => {
    if (!token) return;
    try {
      const res = await api.get('/quotations', authHeaders(token));
      setList(res.data);
    } catch (e) {
      toast.error(apiErrorMessage(e, t));
    }
  };

  const loadClients = async () => {
    if (!token) return;
    try {
      const res = await api.get('/clients', authHeaders(token));
      setClients(res.data);
    } catch {
      toast.error(t('quotations.saveFailed'));
    }
  };

  const loadRolls = async (cid?: string) => {
    if (!token) return;
    try {
      const res = await api.get(cid ? `/rollers?clientId=${encodeURIComponent(cid)}` : '/rollers', authHeaders(token));
      setRolls(res.data);
    } catch {
      setRolls([]);
    }
  };

  useEffect(() => {
    if (!token) return;
    void load();
    void loadClients();
    void loadRolls();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return list.filter((r) => {
      if (statusFilter !== 'ALL' && r.status !== statusFilter) return false;
      if (!q) return true;
      return (
        r.quotationNumber.toLowerCase().includes(q) ||
        (r.qNumber ?? '').toLowerCase().includes(q) ||
        (r.client.companyName || '').toLowerCase().includes(q)
      );
    });
  }, [list, search, statusFilter]);

  const updateQuote = (updated: Quotation) => {
    setList((prev) => {
      const idx = prev.findIndex((x) => x.id === updated.id);
      if (idx === -1) return [updated, ...prev];
      const next = [...prev];
      next[idx] = updated;
      return next;
    });
    setDetail((d) => (d && d.id === updated.id ? { ...d, ...updated } : d));
  };

  const handleCreate = async () => {
    if (!clientId || !rollerSpecId) {
      toast.error(t('quotations.required'));
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        clientId,
        rollerSpecId,
        qNumber: qNum,
        discountPercentage: Number(discount) || 0,
      };
      if (terms.trim()) body.terms = terms.trim();
      const res = await api.post('/quotations', body, authHeaders(token));
      updateQuote(res.data as Quotation);
      setShowForm(false);
      setQNum('');
      setRollerSpecId('');
      setClientId('');
      setDiscount('0');
      setTerms('');
      toast.success(t('quotations.saveSuccess'));
    } catch (e) {
      toast.error(apiErrorMessage(e, t));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!detail || !edit) return;
    setSavingEdit(true);
    try {
      const res = await api.patch(`/quotations/${detail.id}`, { qNumber: edit.qNumber, terms: edit.terms }, authHeaders(token));
      updateQuote(res.data as Quotation);
      setEdit(null);
      toast.success(t('quotations.saveSuccess'));
    } catch (e) {
      toast.error(apiErrorMessage(e, t));
    } finally {
      setSavingEdit(false);
    }
  };

  const handleApprove = async (status: 'APPROVED' | 'REJECTED') => {
    if (!detail) return;
    setApproving(true);
    try {
      const res = await api.patch(`/quotations/${detail.id}/approve`, { status }, authHeaders(token));
      updateQuote(res.data as Quotation);
      toast.success(t('quotations.saveSuccess'));
    } catch (e) {
      toast.error(apiErrorMessage(e, t));
    } finally {
      setApproving(false);
    }
  };

  const downloadPdf = async () => {
    if (!detail || !token) return;
    try {
      const res = await api.get(`/quotations/${detail.id}/pdf`, { headers: { Authorization: `Bearer ${token}` }, responseType: 'blob' });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${detail.quotationNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(apiErrorMessage(e, t));
    }
  };

  const availableRolls = clientId ? rolls.filter((r) => r.clientId === clientId) : rolls;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ margin: 0, fontSize: 20 }}>{t('quotations.title')}</h2>
        <button onClick={() => setShowForm((v) => !v)} style={{ ...buttonStyle, background: '#1d4ed8', color: '#fff' }}>
          {showForm ? t('quotations.close') : t('quotations.create')}
        </button>
      </div>

      {isManager && showForm && (
        <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 10, padding: 16, marginBottom: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <div>
              <label style={labelStyle}>{t('quotations.client')}</label>
              <select
                value={clientId}
                onChange={(e) => {
                  setClientId(e.target.value);
                  setRollerSpecId('');
                  void loadRolls(e.target.value || undefined);
                }}
                style={inputStyle}
              >
                <option value="">{t('quotations.selectClient')}</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.companyName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>{t('quotations.selectRoller')}</label>
              <select value={rollerSpecId} onChange={(e) => setRollerSpecId(e.target.value)} style={inputStyle}>
                <option value="">{t('quotations.selectRoller')}</option>
                {availableRolls.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.serviceType} · OD {r.outerDiameterOd} / Core {r.coreDiameter} / Face {r.faceLength} / L {r.totalLength} · {r.coatingMaterial}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>{t('quotations.qNumber')}</label>
              <input value={qNum} onChange={(e) => setQNum(e.target.value)} placeholder={t('quotations.qNumberPlaceholder')} style={inputStyle} maxLength={200} />
            </div>
            <div>
              <label style={labelStyle}>{t('quotations.discount')}</label>
              <input value={discount} onChange={(e) => setDiscount(e.target.value)} type="number" min={0} max={100} style={inputStyle} />
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <label style={labelStyle}>{t('quotations.terms')}</label>
            <textarea value={terms} onChange={(e) => setTerms(e.target.value)} rows={2} style={inputStyle} />
          </div>
          <button onClick={() => void handleCreate()} disabled={saving} style={{ ...buttonStyle, background: '#16a34a', color: '#fff', marginTop: 12 }}>
            {saving ? '...' : t('quotations.create')}
          </button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('quotations.search')} style={{ ...inputStyle, maxWidth: 340 }} />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ ...inputStyle, width: 200 }}>
          <option value="ALL">{t('quotations.statusAll')}</option>
          {['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'CONVERTED_TO_WORK_ORDER'].map((s) => (
            <option key={s} value={s}>
              {t(`quotations.status${s}`)}
            </option>
          ))}
        </select>
      </div>

      <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb', overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
          <thead>
            <tr>
              <th style={thStyle}>{t('quotations.quotationNumber')}</th>
              <th style={thStyle}>{t('quotations.qNumber')}</th>
              <th style={thStyle}>{t('quotations.client')}</th>
              <th style={thStyle}>{t('quotations.total')}</th>
              <th style={thStyle}>{t('quotations.status')}</th>
              <th style={thStyle}>{t('quotations.createdAt')}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} onClick={() => setDetail(r)} style={{ cursor: 'pointer' }}>
                <td style={tdStyle}>
                  <strong>{r.quotationNumber}</strong>
                </td>
                <td style={tdStyle}>{r.qNumber || '—'}</td>
                <td style={tdStyle}>{r.client.companyName}</td>
                <td style={tdStyle}>
                  <strong>{fmtMoney(r.grandTotal, lang)}</strong>
                </td>
                <td style={tdStyle}>
                  <span style={{ ...statusChipStyle[r.status] ?? statusChipStyle.DRAFT, padding: '3px 8px', borderRadius: 999, fontSize: 12, fontWeight: 600, display: 'inline-block' }}>
                    {t(`quotations.status${r.status}`)}
                  </span>
                </td>
                <td style={{ ...tdStyle, color: '#6b7280' }}>{new Date(r.createdAt).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-GB')}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!filtered.length && <div style={{ color: '#64748b', textAlign: 'center', padding: 40 }}>{t('quotations.noData')}</div>}
      </div>

      {detail && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={() => { setDetail(null); setEdit(null); }}>
          <div
            style={{ background: 'rgba(30, 41, 59, 0.95)', backdropFilter: 'blur(16px)', border: '1px solid rgba(148, 163, 184, 0.1)', borderRadius: 12, maxWidth: 720, width: '100%', maxHeight: '90vh', overflow: 'auto', padding: 24, color: '#e2e8f0' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
              <h3 style={{ margin: 0 }}>
                {t('quotations.details')} — {detail.quotationNumber}
              </h3>
              {detail.qrCodeUrl && <img src={detail.qrCodeUrl} alt="QR" style={{ width: 72, height: 72, borderRadius: 6, background: '#fff', padding: 4 }} />}
            </div>

            {([['quotations.quotationNumber', detail.quotationNumber], ['quotations.qNumber', detail.qNumber || '—'], ['quotations.client', detail.client.companyName], ['quotations.createdBy', detail.createdBy?.name ?? '—'], ['quotations.status', t(`quotations.status${detail.status}`)], ['quotations.total', fmtMoney(detail.grandTotal, lang)]] as [string, string][]).map(([k, v]) => (
              <div key={k} style={{ padding: '8px 0', borderBottom: '1px solid #334155' }}>
                <span style={{ color: '#94a3b8', fontSize: 13, display: 'block' }}>{t(k)}</span>
                <span style={{ fontSize: 15 }}>{v}</span>
              </div>
            ))}

            <div style={{ padding: '8px 0', borderBottom: '1px solid #334155' }}>
              <span style={{ color: '#94a3b8', fontSize: 13, display: 'block' }}>{t('quotations.selectRoller')}</span>
              <span style={{ fontSize: 15 }}>
                {detail.rollerSpec.serviceType} · {t('quotations.rollerDims')}: OD {detail.rollerSpec.outerDiameterOd} / Core {detail.rollerSpec.coreDiameter} / Face {detail.rollerSpec.faceLength} / L {detail.rollerSpec.totalLength} · {t('quotations.coatingMaterial')}: {detail.rollerSpec.coatingMaterial} · {t('quotations.hardness')}: {detail.rollerSpec.hardnessShore}
              </span>
            </div>

            {(['baseMaterialCost', 'laborMachiningCost', 'subtotal', 'discountAmount', 'vatAmount', 'grandTotal'] as const).map((k) => (
              <div key={k} style={{ padding: '8px 0', borderBottom: '1px solid #334155' }}>
                <span style={{ color: '#94a3b8', fontSize: 13, display: 'block' }}>
                  {t(`quotations.${k}`)}{k === 'discountAmount' && detail.discountPercentage > 0 ? ` (${detail.discountPercentage}%)` : ''}
                </span>
                <span style={{ fontSize: 15, fontWeight: k === 'grandTotal' ? 700 : 400 }}>{fmtMoney(detail[k], lang)}</span>
              </div>
            ))}

            {detail.terms && (
              <div style={{ padding: '8px 0', borderBottom: '1px solid #334155' }}>
                <span style={{ color: '#94a3b8', fontSize: 13, display: 'block' }}>{t('quotations.terms')}</span>
                <span style={{ fontSize: 14, whiteSpace: 'pre-wrap' }}>{detail.terms}</span>
              </div>
            )}

            {edit ? (
              <div style={{ padding: '12px 0', borderBottom: '1px solid #334155' }}>
                <span style={{ color: '#94a3b8', fontSize: 13, display: 'block', marginBottom: 6 }}>{t('quotations.edit')}</span>
                <input value={edit.qNumber} onChange={(e) => setEdit({ ...edit, qNumber: e.target.value })} placeholder={t('quotations.qNumberPlaceholder')} style={{ ...inputStyle, background: 'rgba(30, 41, 59, 0.6)', border: '1px solid rgba(148, 163, 184, 0.2)', color: '#e2e8f0', marginBottom: 8 }} maxLength={200} />
                <textarea value={edit.terms} onChange={(e) => setEdit({ ...edit, terms: e.target.value })} rows={2} style={{ ...inputStyle, background: 'rgba(30, 41, 59, 0.6)', border: '1px solid rgba(148, 163, 184, 0.2)', color: '#e2e8f0', marginBottom: 8 }} />
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => void handleSaveEdit()} disabled={savingEdit} style={{ ...buttonStyle, background: '#16a34a', fontSize: 12, padding: '5px 12px' }}>
                    {savingEdit ? '...' : t('quotations.save')}
                  </button>
                  <button onClick={() => setEdit(null)} style={{ ...buttonStyle, background: '#6b7280', fontSize: 12, padding: '5px 12px' }}>
                    {t('quotations.close')}
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '12px 0' }}>
                <button onClick={downloadPdf} style={{ ...buttonStyle, background: '#1d4ed8', color: '#fff', fontSize: 13 }}>
                  {t('quotations.downloadPdf')}
                </button>
                <button onClick={() => setEdit({ qNumber: detail.qNumber || '', terms: detail.terms || '' })} style={{ ...buttonStyle, background: '#6b7280', color: '#fff', fontSize: 13 }}>
                  {t('quotations.edit')}
                </button>
                {isManager && detail.status === 'PENDING_APPROVAL' && (
                  <>
                    <button onClick={() => void handleApprove('APPROVED')} disabled={approving} style={{ ...buttonStyle, background: '#16a34a', color: '#fff', fontSize: 13 }}>
                      {approving ? '...' : `✓ ${t('quotations.statusAPPROVED')}`}
                    </button>
                    <button onClick={() => void handleApprove('REJECTED')} disabled={approving} style={{ ...buttonStyle, background: '#dc2626', color: '#fff', fontSize: 13 }}>
                      {t('quotations.statusREJECTED')}
                    </button>
                  </>
                )}
                <button onClick={() => { setDetail(null); setEdit(null); }} style={{ ...buttonStyle, background: '#334155', color: '#fff', fontSize: 13 }}>
                  {t('quotations.close')}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}