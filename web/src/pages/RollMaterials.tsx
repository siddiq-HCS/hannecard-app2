import React, { useEffect, useState } from 'react';
import { api, authHeaders } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n';

interface RollMaterial {
  id: string;
  name: string;
  density: number;
  materialCostPerKg: number;
  baseWorkmanshipCost: number;
  isActive: boolean;
  createdAt: string;
}

interface Roll {
  id: string;
  materialId: string;
  materialName: string;
  name: string | null;
  outerDiameter: number;
  innerDiameter: number;
  length: number;
  density: number;
  materialCostPerKg: number;
  workmanshipCost: number;
  volumeM3: number;
  weightKg: number;
  materialCost: number;
  total: number;
  currency: string;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
}

interface RollPreview {
  volumeM3: number;
  weightKg: number;
  materialCost: number;
  workmanshipCost: number;
  total: number;
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

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '13px',
  fontWeight: 600,
  color: '#374151',
  marginBottom: '4px',
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const round4 = (n: number) => Math.round(n * 10000) / 10000;

export function RollMaterials() {
  const { token } = useAuth();
  const { t } = useI18n();

  const [materials, setMaterials] = useState<RollMaterial[]>([]);
  const [name, setName] = useState('');
  const [density, setDensity] = useState('');
  const [costPerKg, setCostPerKg] = useState('');
  const [workmanship, setWorkmanship] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const [rolls, setRolls] = useState<Roll[]>([]);
  const [rollMaterialId, setRollMaterialId] = useState('');
  const [rollName, setRollName] = useState('');
  const [rOD, setROD] = useState('');
  const [rID, setRID] = useState('');
  const [rLen, setRLen] = useState('');
  const [rWork, setRWork] = useState('');
  const [rNotes, setRNotes] = useState('');
  const [rollEditId, setRollEditId] = useState<string | null>(null);
  const [rollSearch, setRollSearch] = useState('');
  const [preview, setPreview] = useState<RollPreview | null>(null);

  const load = async () => {
    if (!token) return;
    const res = await api.get('/roll-materials', authHeaders(token));
    setMaterials(res.data);
  };

  const loadRolls = async () => {
    if (!token) return;
    const res = await api.get('/roll-materials/rolls', authHeaders(token));
    setRolls(res.data);
  };

  useEffect(() => {
    void load();
    void loadRolls();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !name.trim()) return;
    const payload = {
      name: name.trim(),
      density: parseFloat(density),
      materialCostPerKg: parseFloat(costPerKg),
      baseWorkmanshipCost: parseFloat(workmanship),
    };
    if (isNaN(payload.density) || isNaN(payload.materialCostPerKg) || isNaN(payload.baseWorkmanshipCost)) return;

    if (editId) {
      await api.patch(`/roll-materials/${editId}`, payload, authHeaders(token));
    } else {
      await api.post('/roll-materials', payload, authHeaders(token));
    }

    resetForm();
    void load();
  };

  const startEdit = (m: RollMaterial) => {
    setEditId(m.id);
    setName(m.name);
    setDensity(String(m.density));
    setCostPerKg(String(m.materialCostPerKg));
    setWorkmanship(String(m.baseWorkmanshipCost));
  };

  const remove = async (id: string) => {
    if (!token || !confirm(t('rollMat.confirmDelete'))) return;
    await api.delete(`/roll-materials/${id}`, authHeaders(token));
    void load();
  };

  const resetForm = () => {
    setEditId(null);
    setName('');
    setDensity('');
    setCostPerKg('');
    setWorkmanship('');
  };

  const handleRollSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !rollMaterialId) return;
    const payload = {
      materialId: rollMaterialId,
      ...(rollName.trim() ? { name: rollName.trim() } : {}),
      outerDiameter: parseFloat(rOD),
      innerDiameter: parseFloat(rID),
      length: parseFloat(rLen),
      ...(rWork !== '' ? { workmanshipCost: parseFloat(rWork) } : {}),
      ...(rNotes.trim() ? { notes: rNotes.trim() } : {}),
    };
    if (isNaN(payload.outerDiameter) || isNaN(payload.innerDiameter) || isNaN(payload.length)) return;

    if (rollEditId) {
      await api.patch(`/roll-materials/rolls/${rollEditId}`, payload, authHeaders(token));
    } else {
      await api.post('/roll-materials/rolls', payload, authHeaders(token));
    }

    resetRollForm();
    void loadRolls();
  };

  const startRollEdit = (r: Roll) => {
    setRollEditId(r.id);
    setRollMaterialId(r.materialId);
    setRollName(r.name ?? '');
    setROD(String(r.outerDiameter));
    setRID(String(r.innerDiameter));
    setRLen(String(r.length));
    setRWork(String(r.workmanshipCost));
    setRNotes(r.notes ?? '');
  };

  const removeRoll = async (id: string) => {
    if (!token || !confirm(t('rollMat.confirmDeleteRoll'))) return;
    await api.delete(`/roll-materials/rolls/${id}`, authHeaders(token));
    void loadRolls();
  };

  const resetRollForm = () => {
    setRollEditId(null);
    setRollMaterialId('');
    setRollName('');
    setROD('');
    setRID('');
    setRLen('');
    setRWork('');
    setRNotes('');
    setPreview(null);
  };

  // معاينة سعر الرول محلياً بنفس معادلة الخادم
  useEffect(() => {
    const mat = (materials ?? []).find((m) => m.id === rollMaterialId);
    const od = parseFloat(rOD);
    const id = parseFloat(rID);
    const len = parseFloat(rLen);
    if (!mat || isNaN(od) || isNaN(id) || isNaN(len) || id >= od) {
      setPreview(null);
      return;
    }
    const D = od / 1000;
    const d = id / 1000;
    const L = len / 1000;
    const volume = Math.PI * ((D / 2) ** 2 - (d / 2) ** 2) * L;
    const weight = volume * mat.density;
    const materialCost = weight * mat.materialCostPerKg;
    const workCost = rWork !== '' && !isNaN(parseFloat(rWork)) ? parseFloat(rWork) : mat.baseWorkmanshipCost;
    setPreview({
      volumeM3: round4(volume),
      weightKg: round2(weight),
      materialCost: round2(materialCost),
      workmanshipCost: round2(workCost),
      total: round2(materialCost + workCost),
    });
  }, [materials, rollMaterialId, rOD, rID, rLen, rWork]);

  const filtered = materials.filter((m) =>
    m.name.toLowerCase().includes(search.toLowerCase())
  );

  const filteredRolls = rolls.filter((r) =>
    (r.name ?? r.materialName).toLowerCase().includes(rollSearch.toLowerCase())
  );

  return (
    <div style={{ padding: '24px', maxWidth: '1100px', margin: '0 auto' }}>
      <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '16px' }}>
        {t('rollMat.title')}
      </h2>

      {/* ============ الخامات ============ */}
      <form
        onSubmit={handleSubmit}
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '12px',
          marginBottom: '24px',
          background: 'rgba(30, 41, 59, 0.4)',
          padding: '16px',
          borderRadius: '8px',
          border: '1px solid rgba(148, 163, 184, 0.08)',
        }}
      >
        <div>
          <label style={labelStyle}>{t('rollMat.name')}</label>
          <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div>
          <label style={labelStyle}>{t('rollMat.density')}</label>
          <input style={inputStyle} type="number" step="any" min="0" value={density} onChange={(e) => setDensity(e.target.value)} required />
        </div>
        <div>
          <label style={labelStyle}>{t('rollMat.costPerKg')}</label>
          <input style={inputStyle} type="number" step="any" min="0" value={costPerKg} onChange={(e) => setCostPerKg(e.target.value)} required />
        </div>
        <div>
          <label style={labelStyle}>{t('rollMat.workmanship')}</label>
          <input style={inputStyle} type="number" step="any" min="0" value={workmanship} onChange={(e) => setWorkmanship(e.target.value)} required />
        </div>
        <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '8px' }}>
          <button type="submit" style={{ ...buttonStyle, background: '#2563eb', color: '#fff' }}>
            {editId ? t('rollMat.update') : t('rollMat.add')}
          </button>
          {editId && (
            <button type="button" style={{ ...buttonStyle, background: '#e5e7eb', color: '#374151' }} onClick={resetForm}>
              {t('rollMat.cancel')}
            </button>
          )}
        </div>
      </form>

      <input
        style={{ ...inputStyle, marginBottom: '12px', maxWidth: '300px' }}
        placeholder={t('rollMat.search')}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div style={{ overflowX: 'auto', marginBottom: '40px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', borderRadius: '8px', overflow: 'hidden', border: '1px solid rgba(148, 163, 184, 0.08)' }}>
          <thead>
            <tr>
              <th style={thStyle}>{t('rollMat.name')}</th>
              <th style={thStyle}>{t('rollMat.density')}</th>
              <th style={thStyle}>{t('rollMat.costPerKg')}</th>
              <th style={thStyle}>{t('rollMat.workmanship')}</th>
              <th style={thStyle}>{t('rollMat.status')}</th>
              <th style={thStyle}>{t('rollMat.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((m) => (
              <tr key={m.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                <td style={{ padding: '10px 12px', fontSize: '14px' }}>{m.name}</td>
                <td style={{ padding: '10px 12px', fontSize: '14px' }}>{m.density}</td>
                <td style={{ padding: '10px 12px', fontSize: '14px' }}>{m.materialCostPerKg}</td>
                <td style={{ padding: '10px 12px', fontSize: '14px' }}>{m.baseWorkmanshipCost}</td>
                <td style={{ padding: '10px 12px', fontSize: '14px' }}>
                  <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: 600, background: m.isActive ? '#d1fae5' : '#fee2e2', color: m.isActive ? '#065f46' : '#991b1b' }}>
                    {m.isActive ? t('rollMat.active') : t('rollMat.inactive')}
                  </span>
                </td>
                <td style={{ padding: '10px 12px', fontSize: '14px' }}>
                  <button style={{ ...buttonStyle, background: '#e0e7ff', color: '#3730a3', marginRight: '6px', padding: '4px 10px', fontSize: '12px' }} onClick={() => startEdit(m)}>
                    {t('rollMat.edit')}
                  </button>
                  <button style={{ ...buttonStyle, background: '#fee2e2', color: '#991b1b', padding: '4px 10px', fontSize: '12px' }} onClick={() => void remove(m.id)}>
                    {t('rollMat.delete')}
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: '20px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>
                  {t('rollMat.noData')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ============ الرولات وأسعارها ============ */}
      <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '16px', borderTop: '1px solid rgba(148, 163, 184, 0.15)', paddingTop: '24px' }}>
        {t('rollMat.rollsTitle')}
      </h3>

      <form
        onSubmit={handleRollSubmit}
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '12px',
          marginBottom: '24px',
          background: 'rgba(30, 41, 59, 0.4)',
          padding: '16px',
          borderRadius: '8px',
          border: '1px solid rgba(148, 163, 184, 0.08)',
        }}
      >
        <div>
          <label style={labelStyle}>{t('rollMat.material')}</label>
          <select style={inputStyle} value={rollMaterialId} onChange={(e) => setRollMaterialId(e.target.value)} required>
            <option value="">{t('rollMat.selectMaterial')}</option>
            {materials.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={labelStyle}>{t('rollMat.rollName')}</label>
          <input style={inputStyle} value={rollName} onChange={(e) => setRollName(e.target.value)} />
        </div>
        <div>
          <label style={labelStyle}>{t('rollMat.outerDiameter')}</label>
          <input style={inputStyle} type="number" step="any" min="0" value={rOD} onChange={(e) => setROD(e.target.value)} required />
        </div>
        <div>
          <label style={labelStyle}>{t('rollMat.innerDiameter')}</label>
          <input style={inputStyle} type="number" step="any" min="0" value={rID} onChange={(e) => setRID(e.target.value)} required />
        </div>
        <div>
          <label style={labelStyle}>{t('rollMat.length')}</label>
          <input style={inputStyle} type="number" step="any" min="0" value={rLen} onChange={(e) => setRLen(e.target.value)} required />
        </div>
        <div>
          <label style={labelStyle}>{t('rollMat.workmanshipCost')} <span style={{ fontWeight: 400, color: '#9ca3af' }}>{t('rollMat.defaultFromMaterial')}</span></label>
          <input style={inputStyle} type="number" step="any" min="0" value={rWork} onChange={(e) => setRWork(e.target.value)} />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={labelStyle}>{t('rollMat.notes')}</label>
          <input style={inputStyle} value={rNotes} onChange={(e) => setRNotes(e.target.value)} />
        </div>
        {preview && (
          <div style={{ gridColumn: '1 / -1', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '6px', padding: '12px' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#065f46', marginBottom: '6px' }}>{t('rollMat.preview')}</div>
            <table style={{ width: '100%', fontSize: '13px' }}>
              <tbody>
                <tr>
                  <td style={{ padding: '2px 6px', color: '#374151' }}>{t('rollMat.volume')}</td>
                  <td style={{ padding: '2px 6px', color: '#374151', textAlign: 'right' }}>{preview.volumeM3} m³</td>
                  <td style={{ padding: '2px 6px', color: '#374151' }}>{t('rollMat.weight')}</td>
                  <td style={{ padding: '2px 6px', color: '#374151', textAlign: 'right' }}>{preview.weightKg} kg</td>
                </tr>
                <tr>
                  <td style={{ padding: '2px 6px', color: '#374151' }}>{t('rollMat.materialCost')}</td>
                  <td style={{ padding: '2px 6px', color: '#374151', textAlign: 'right' }}>{preview.materialCost} SAR</td>
                  <td style={{ padding: '2px 6px', color: '#374151' }}>{t('rollMat.workmanshipCost')}</td>
                  <td style={{ padding: '2px 6px', color: '#374151', textAlign: 'right' }}>{preview.workmanshipCost} SAR</td>
                </tr>
                <tr>
                  <td style={{ padding: '2px 6px', fontWeight: 700, color: '#065f46' }}>{t('rollMat.totalPrice')}</td>
                  <td style={{ padding: '2px 6px', fontWeight: 700, color: '#065f46', textAlign: 'right' }}>{preview.total} SAR</td>
                  <td colSpan={2} />
                </tr>
              </tbody>
            </table>
          </div>
        )}
        <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '8px' }}>
          <button type="submit" style={{ ...buttonStyle, background: '#2563eb', color: '#fff' }}>
            {rollEditId ? t('rollMat.updateRoll') : t('rollMat.addRoll')}
          </button>
          {rollEditId && (
            <button type="button" style={{ ...buttonStyle, background: '#e5e7eb', color: '#374151' }} onClick={resetRollForm}>
              {t('rollMat.cancel')}
            </button>
          )}
        </div>
      </form>

      <input
        style={{ ...inputStyle, marginBottom: '12px', maxWidth: '300px' }}
        placeholder={t('rollMat.searchRoll')}
        value={rollSearch}
        onChange={(e) => setRollSearch(e.target.value)}
      />

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', borderRadius: '8px', overflow: 'hidden', border: '1px solid rgba(148, 163, 184, 0.08)' }}>
          <thead>
            <tr>
              <th style={thStyle}>{t('rollMat.rollName')}</th>
              <th style={thStyle}>{t('rollMat.material')}</th>
              <th style={thStyle}>{t('rollMat.outerDiameter')}</th>
              <th style={thStyle}>{t('rollMat.innerDiameter')}</th>
              <th style={thStyle}>{t('rollMat.length')}</th>
              <th style={thStyle}>{t('rollMat.weight')}</th>
              <th style={thStyle}>{t('rollMat.materialCost')}</th>
              <th style={thStyle}>{t('rollMat.workmanshipCost')}</th>
              <th style={thStyle}>{t('rollMat.totalPrice')}</th>
              <th style={thStyle}>{t('rollMat.status')}</th>
              <th style={thStyle}>{t('rollMat.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {filteredRolls.map((r) => (
              <tr key={r.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                <td style={{ padding: '10px 12px', fontSize: '14px', fontWeight: 600 }}>{r.name || '—'}</td>
                <td style={{ padding: '10px 12px', fontSize: '14px' }}>{r.materialName}</td>
                <td style={{ padding: '10px 12px', fontSize: '14px' }}>{r.outerDiameter}</td>
                <td style={{ padding: '10px 12px', fontSize: '14px' }}>{r.innerDiameter}</td>
                <td style={{ padding: '10px 12px', fontSize: '14px' }}>{r.length}</td>
                <td style={{ padding: '10px 12px', fontSize: '14px' }}>{r.weightKg}</td>
                <td style={{ padding: '10px 12px', fontSize: '14px' }}>{r.materialCost}</td>
                <td style={{ padding: '10px 12px', fontSize: '14px' }}>{r.workmanshipCost}</td>
                <td style={{ padding: '10px 12px', fontSize: '14px', fontWeight: 700, color: '#065f46' }}>{r.total} {r.currency}</td>
                <td style={{ padding: '10px 12px', fontSize: '14px' }}>
                  <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: 600, background: r.isActive ? '#d1fae5' : '#fee2e2', color: r.isActive ? '#065f46' : '#991b1b' }}>
                    {r.isActive ? t('rollMat.active') : t('rollMat.inactive')}
                  </span>
                </td>
                <td style={{ padding: '10px 12px', fontSize: '14px', whiteSpace: 'nowrap' }}>
                  <button style={{ ...buttonStyle, background: '#e0e7ff', color: '#3730a3', marginRight: '6px', padding: '4px 10px', fontSize: '12px' }} onClick={() => startRollEdit(r)}>
                    {t('rollMat.edit')}
                  </button>
                  <button style={{ ...buttonStyle, background: '#fee2e2', color: '#991b1b', padding: '4px 10px', fontSize: '12px' }} onClick={() => void removeRoll(r.id)}>
                    {t('rollMat.delete')}
                  </button>
                </td>
              </tr>
            ))}
            {filteredRolls.length === 0 && (
              <tr>
                <td colSpan={11} style={{ padding: '20px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>
                  {t('rollMat.noRolls')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}