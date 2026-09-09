import { useEffect, useState } from 'react';
import { api, authHeaders } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useI18n, formatDate, formatDateTime } from '../i18n';

interface Summary {
  id: string;
  user: { name: string };
  summaryDate: string;
  totalVisits: number;
  totalCollected: number | null;
  tasksCompleted: number;
  reportSubmitted: boolean;
}

interface Rep {
  id: string;
  name: string;
  phone: string;
}

interface RepReport {
  rep: { id: string; name: string; phone: string };
  from: string | null;
  to: string | null;
  visits: {
    id: string;
    clientName: string;
    clientPhone: string | null;
    clientAddress: string | null;
    purpose: string;
    notes: string | null;
    collectedAmount: number | null;
    visitedAt: string;
    attachments: { id: string }[];
  }[];
  reports: { id: string; reportDate: string; content: string; submittedAt: string | null }[];
  summary: { totalVisits: number; totalCollected: number; reportsSubmitted: number };
}

export function Reports() {
  const { token } = useAuth();
  const { t, lang } = useI18n();
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [summaries, setSummaries] = useState<Summary[]>([]);
  const [reps, setReps] = useState<Rep[]>([]);
  const [repId, setRepId] = useState('');
  const [fromDate, setFromDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [toDate, setToDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [printData, setPrintData] = useState<RepReport | null>(null);
  const [printError, setPrintError] = useState('');
  const [loadingPrint, setLoadingPrint] = useState(false);

  async function load(d: string) {
    if (!token) return;
    const res = await api.get(`/manager/daily-summaries?date=${d}`, authHeaders(token));
    setSummaries(res.data);
  }

  useEffect(() => {
    void load(date);
  }, [token, date]);

  useEffect(() => {
    if (!token) return;
    api.get('/manager/reps', authHeaders(token)).then((r) => setReps(r.data));
  }, [token]);

  async function printReport() {
    if (!token) return;
    if (!repId) {
      setPrintError(t('reports.selectFirst'));
      return;
    }
    setPrintError('');
    setLoadingPrint(true);
    try {
      const params = new URLSearchParams({ repId, from: fromDate, to: toDate });
      const res = await api.get(`/manager/rep-report?${params.toString()}`, authHeaders(token));
      setPrintData(res.data as RepReport);
      setTimeout(() => window.print(), 200);
    } catch {
      setPrintError(t('reports.loadError'));
    } finally {
      setLoadingPrint(false);
    }
  }

  return (
    <div>
      <h2>{t('reports.title')}</h2>
      <label>
        {t('reports.date')}:{' '}
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} />
      </label>

      <div style={{ marginTop: 24, borderTop: '2px solid #e5e7eb', paddingTop: 16 }}>
        <h3>{t('reports.compTitle')}</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={repId} onChange={(e) => setRepId(e.target.value)} style={inputStyle}>
            <option value="">{t('reports.selectRep')}</option>
            {reps.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
          <label style={{ fontSize: 13 }}>{t('reports.from')}:
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} style={inputStyle} />
          </label>
          <label style={{ fontSize: 13 }}>{t('reports.to')}:
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} style={inputStyle} />
          </label>
          <button onClick={() => void printReport()} style={buttonStyle} disabled={loadingPrint}>
            {loadingPrint ? t('common.loading') : t('reports.printComp')}
          </button>
        </div>
        {printError && <div style={{ color: '#dc2626', marginTop: 8, fontSize: 13 }}>{printError}</div>}
      </div>

      <table style={{ width: '100%', marginTop: 16, borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ textAlign: 'right' }}>
            <th style={thStyle}>{t('reports.rep')}</th>
            <th style={thStyle}>{t('reports.visits')}</th>
            <th style={thStyle}>{t('reports.collected')} (ج.م)</th>
            <th style={thStyle}>{t('reports.completedTasks')}</th>
            <th style={thStyle}>{t('reports.dailyReport')}</th>
          </tr>
        </thead>
        <tbody>
          {summaries.map((s) => (
            <tr key={s.id}>
              <td style={tdStyle}>{s.user.name}</td>
              <td style={tdStyle}>{s.totalVisits}</td>
              <td style={tdStyle}>{s.totalCollected ?? 0}</td>
              <td style={tdStyle}>{s.tasksCompleted}</td>
              <td style={tdStyle}>{s.reportSubmitted ? t('reports.submitted') : t('reports.notWritten')}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {printData && (
        <>
          <style>{PRINT_CSS}</style>
          <div id="print-root">
            <div style={{ marginBottom: 8 }}>
              <strong style={{ fontSize: 18 }}>{t('reports.compRep')}</strong>
            </div>
            <div style={{ marginBottom: 16 }}>
              {t('reports.name')}: {printData.rep.name} · {t('reports.phone')}: {printData.rep.phone} · {t('reports.period')}:{' '}
              {printData.from ? formatDate(printData.from, lang) : t('reports.all')} {t('reports.to')}{' '}
              {printData.to ? formatDate(printData.to, lang) : t('reports.all')}
            </div>
            <div style={{ marginBottom: 16 }}>
              {t('reports.totalVisits')}: <strong>{printData.summary.totalVisits}</strong> · {t('reports.totalCollected')}: <strong>{printData.summary.totalCollected} ج.م</strong> · {t('reports.submittedReports')}: <strong>{printData.summary.reportsSubmitted}</strong>
            </div>

            <div style={{ marginBottom: 16 }}>
              <strong>{t('reports.visitsTitle')}:</strong>
              <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 6 }}>
                <thead>
                  <tr>
                    <th style={printTh}>{t('reports.client')}</th>
                    <th style={printTh}>{t('reports.purpose')}</th>
                    <th style={printTh}>{t('reports.notes')}</th>
                    <th style={printTh}>{t('reports.collected')}</th>
                    <th style={printTh}>{t('reports.dateCol')}</th>
                  </tr>
                </thead>
                <tbody>
                  {printData.visits.length === 0 && (
                    <tr><td colSpan={5} style={printTd}>{t('reports.noVisits')}</td></tr>
                  )}
                  {printData.visits.map((v) => (
                    <tr key={v.id}>
                      <td style={printTd}>{v.clientName}</td>
                      <td style={printTd}>{t(`purposes.${v.purpose}`)}</td>
                      <td style={printTd}>{v.notes ?? '—'}</td>
                      <td style={printTd}>{v.collectedAmount ?? 0}</td>
                      <td style={printTd}>{formatDateTime(v.visitedAt, lang)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div>
              <strong>{t('reports.submittedDaily')}:</strong>
              {printData.reports.length === 0 && (
                <div style={{ marginTop: 6 }}>{t('reports.noSubmittedReports')}</div>
              )}
              {printData.reports.map((r) => (
                <div key={r.id} style={{ border: '1px solid rgba(148, 163, 184, 0.08)', borderRadius: 8, padding: 10, marginTop: 8 }}>
                  <div style={{ fontSize: 12, color: '#94a3b8' }}>{formatDate(r.reportDate, lang)}</div>
                  <div style={{ whiteSpace: 'pre-wrap' }}>{r.content}</div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const PRINT_CSS = `
@media print {
  body * { visibility: hidden; }
  #print-root, #print-root * { visibility: visible; }
  #print-root { position: absolute; left: 0; top: 0; width: 100%; }
}
`;

const inputStyle: React.CSSProperties = { padding: 8, borderRadius: 8 };
const buttonStyle: React.CSSProperties = { padding: '8px 12px', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fff', cursor: 'pointer' };
const thStyle: React.CSSProperties = { padding: 10, borderBottom: '2px solid #e5e7eb', textAlign: 'right' };
const tdStyle: React.CSSProperties = { padding: 10, borderBottom: '1px solid #e5e7eb' };
const printTh: React.CSSProperties = { padding: 6, borderBottom: '1px solid #333', textAlign: 'right', fontSize: 12 };
const printTd: React.CSSProperties = { padding: 6, borderBottom: '1px solid #ccc', fontSize: 12 };
