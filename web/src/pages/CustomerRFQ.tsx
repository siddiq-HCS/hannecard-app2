import { useState, type FormEvent } from 'react';
import { Check, LogOut, Send } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { LanguageSwitcher, useI18n } from '../i18n';

type Measurement = 'innerDiameter' | 'outerDiameter' | 'faceLength' | 'totalLength';

const measurements: { key: Measurement; label: string; instruction: string }[] = [
  { key: 'innerDiameter', label: 'innerDiameter', instruction: 'innerInstruction' },
  { key: 'outerDiameter', label: 'outerDiameter', instruction: 'outerInstruction' },
  { key: 'faceLength', label: 'faceLength', instruction: 'faceInstruction' },
  { key: 'totalLength', label: 'totalLength', instruction: 'totalInstruction' },
];

function MeasurementDiagram({ type, label }: { type: Measurement; label: string }) {
  const isLength = type === 'faceLength' || type === 'totalLength';
  const isInner = type === 'innerDiameter';

  return (
    <svg viewBox="0 0 220 100" role="img" aria-label={label} className="crfq-diagram">
      <defs>
        <marker id={`arrow-${type}`} markerWidth="7" markerHeight="7" refX="3.5" refY="3.5" orient="auto-start-reverse">
          <path d="M 0 0 L 7 3.5 L 0 7 z" fill="#d97706" />
        </marker>
      </defs>
      {isLength ? (
        <>
          <rect x="58" y="33" width="104" height="34" rx="8" fill="#dbeafe" stroke="#334155" strokeWidth="2" />
          <path d="M30 50h28M162 50h28" stroke="#334155" strokeWidth="8" strokeLinecap="round" />
          {type === 'faceLength' ? (
            <path d="M60 77v8m100-8v8M64 82h92" stroke="#d97706" strokeWidth="2" markerStart={`url(#arrow-${type})`} markerEnd={`url(#arrow-${type})`} />
          ) : (
            <path d="M28 78v8m164-8v8M32 83h156" stroke="#d97706" strokeWidth="2" markerStart={`url(#arrow-${type})`} markerEnd={`url(#arrow-${type})`} />
          )}
        </>
      ) : (
        <>
          <circle cx="110" cy="50" r="37" fill="#dbeafe" stroke="#334155" strokeWidth="2" />
          {isInner && <circle cx="110" cy="50" r="20" fill="#fff" stroke="#64748b" strokeWidth="2" />}
          <path d={isInner ? 'M91 50h38' : 'M73 50h74'} stroke="#d97706" strokeWidth="2" markerStart={`url(#arrow-${type})`} markerEnd={`url(#arrow-${type})`} />
          <circle cx="110" cy="50" r="2.5" fill="#d97706" />
        </>
      )}
    </svg>
  );
}

export function CustomerRFQ() {
  const { user, logout } = useAuth();
  const { t, lang } = useI18n();
  const [material, setMaterial] = useState('');
  const [coreId, setCoreId] = useState('');
  const [finishedOd, setFinishedOd] = useState('');
  const [faceLength, setFaceLength] = useState('');
  const [hardness, setHardness] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  function handleLogout() {
    logout();
    window.location.replace('/login');
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const dimensions = [coreId, finishedOd, faceLength].map(Number);
    const hardnessValue = Number(hardness);
    const quantityValue = Number(quantity);
    if (!dimensions.every((value) => Number.isFinite(value) && value > 0)
      || !hardness.trim()
      || !Number.isFinite(hardnessValue) || hardnessValue < 0 || hardnessValue > 100
      || !Number.isInteger(quantityValue) || quantityValue <= 0) {
      setError(t('customerRfq.validation'));
      return;
    }
    if (!material.trim()) {
      setError(t('customerRfq.typeRequired'));
      return;
    }

    setBusy(true);
    setError('');
    try {
      await api.post('/rfqs', {
        clientName: user?.name ?? '',
        contactName: user?.name ?? '',
        contactPhone: user?.phone ?? '',
        items: [{
          description: material.trim(),
          quantity: quantityValue,
          requiredWork: 'RE_COVERING',
          workEnvironment: 'NORMAL',
          innerDiameter: dimensions[0],
          outerDiameter: dimensions[1],
          rollLength: dimensions[2],
          faceLength: dimensions[2],
          hardnessShore: hardnessValue,
          notes: notes.trim(),
        }],
        requiredTime: 'NORMAL',
        rollLocation: 'NOT_SPECIFIED',
        workOrderDate: new Date().toISOString().slice(0, 10),
        paymentTerms: 'CASH',
      });
      setSubmitted(true);
    } catch {
      setError(t('customerRfq.submitError'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="crfq-page" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <style>{`
        .crfq-page{min-height:100vh;background:#f4f7fb;color:#172033;font-family:inherit}
        .crfq-header{background:#102a43;color:#fff;border-bottom:4px solid #e8a23a}
        .crfq-header-inner,.crfq-main{width:min(1120px,calc(100% - 32px));margin:0 auto}
        .crfq-header-inner{min-height:76px;display:flex;align-items:center;justify-content:space-between;gap:16px;direction:ltr}
        .crfq-brand{display:flex;align-items:center;gap:14px;min-width:0;direction:ltr}
        .crfq-brand-logo{display:block;width:min(220px,32vw);height:52px;box-sizing:border-box;padding:4px;background:#fff;border-radius:5px;object-fit:contain;object-position:left center;flex:none}
        .crfq-brand h1{font-size:18px;line-height:1.35;margin:0;font-weight:700}
        .crfq-header-actions{display:flex;align-items:center;gap:14px}
        .crfq-user{font-size:14px;color:#d9e3ec;white-space:nowrap}
        .crfq-logout{display:inline-flex;align-items:center;gap:7px;border:1px solid #7992a8;color:#fff;background:transparent;padding:8px 11px;border-radius:6px;cursor:pointer;font:inherit}
        .crfq-main{padding:30px 0 54px}
        .crfq-intro{margin:0 0 22px}
        .crfq-intro h2{font-size:26px;margin:0 0 7px;color:#102a43}
        .crfq-intro p,.crfq-section-copy{margin:0;color:#526174;line-height:1.65;font-size:14px}
        .crfq-section{background:#fff;border:1px solid #dce4ec;border-radius:8px;padding:22px;margin-top:18px;box-shadow:0 5px 18px rgba(16,42,67,.045)}
        .crfq-section h3{margin:0 0 5px;font-size:19px;color:#102a43}
        .crfq-guide-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-top:18px}
        .crfq-guide-item{border:1px solid #e1e8ef;border-radius:6px;padding:13px;min-width:0}
        .crfq-step{display:flex;align-items:center;gap:8px;color:#a35d09;font-size:12px;font-weight:700;margin-bottom:8px}
        .crfq-step-number{width:22px;height:22px;display:grid;place-items:center;border-radius:50%;background:#fff1d6;color:#8a4b04}
        .crfq-diagram{display:block;width:100%;height:90px;background:#f6f9fc;border-radius:4px;margin-bottom:11px}
        .crfq-guide-item h4{font-size:14px;line-height:1.45;margin:0 0 6px;color:#172033}
        .crfq-guide-item p{font-size:12px;line-height:1.55;color:#5a6878;margin:0}
        .crfq-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin-top:20px}
        .crfq-field{display:flex;flex-direction:column;gap:7px;min-width:0}
        .crfq-field label{font-size:13px;font-weight:650;color:#29384b}
        .crfq-field input,.crfq-field textarea{width:100%;box-sizing:border-box;border:1px solid #cbd5df;border-radius:5px;padding:11px 12px;color:#172033;background:#fff;font:inherit;font-size:14px;outline:none}
        .crfq-field input:focus,.crfq-field textarea:focus{border-color:#b56b12;box-shadow:0 0 0 3px rgba(232,162,58,.17)}
        .crfq-field textarea{min-height:86px;resize:vertical}
        .crfq-span-2{grid-column:1/-1}
        .crfq-error{color:#a4262c;background:#fff1f0;border:1px solid #f2c5c2;border-radius:5px;padding:10px 12px;font-size:13px;margin:16px 0 0}
        .crfq-submit{display:inline-flex;align-items:center;justify-content:center;gap:9px;min-height:44px;background:#a85f0c;color:#fff;border:0;border-radius:5px;padding:0 18px;font:inherit;font-weight:700;cursor:pointer}
        .crfq-submit:disabled{opacity:.6;cursor:wait}
        .crfq-modal-backdrop{position:fixed;inset:0;background:rgba(10,25,40,.58);display:grid;place-items:center;padding:20px;z-index:100}
        .crfq-modal{width:min(440px,100%);background:#fff;border-radius:8px;padding:28px;text-align:center;box-shadow:0 18px 60px rgba(0,0,0,.24)}
        .crfq-success-icon{width:48px;height:48px;display:grid;place-items:center;border-radius:50%;background:#e2f5e9;color:#16804a;margin:0 auto 13px}
        .crfq-modal h3{font-size:20px;margin:0 0 8px;color:#102a43}
        .crfq-modal p{font-size:14px;line-height:1.7;color:#526174;margin:0 0 20px}
        @media(max-width:800px){.crfq-guide-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
        @media(max-width:560px){.crfq-header-inner{align-items:flex-start;padding:13px 0;flex-direction:column}.crfq-header-actions{width:100%;justify-content:space-between;gap:8px}.crfq-user{overflow:hidden;text-overflow:ellipsis}.crfq-main{padding-top:22px}.crfq-section{padding:16px}.crfq-guide-grid,.crfq-form-grid{grid-template-columns:1fr}.crfq-span-2{grid-column:auto}.crfq-intro h2{font-size:22px}}
      `}</style>

      <header className="crfq-header">
        <div className="crfq-header-inner">
          <div className="crfq-brand">
            <img className="crfq-brand-logo" src="/logo-transparent.png" alt="Hannecard Saudi" />
            <h1 dir={lang === 'ar' ? 'rtl' : 'ltr'}>{t('customerRfq.title')}</h1>
          </div>
          <div className="crfq-header-actions">
            <span className="crfq-user">{user?.name}</span>
            <LanguageSwitcher />
            <button type="button" className="crfq-logout" onClick={handleLogout}>
              <LogOut size={16} />{t('customerRfq.logout')}
            </button>
          </div>
        </div>
      </header>

      <main className="crfq-main">
        <div className="crfq-intro">
          <h2>{t('customerRfq.title')}</h2>
          <p>{t('customerRfq.formIntro')}</p>
        </div>

        <section className="crfq-section" aria-labelledby="crfq-guide-title">
          <h3 id="crfq-guide-title">{t('customerRfq.guideTitle')}</h3>
          <p className="crfq-section-copy">{t('customerRfq.guideIntro')}</p>
          <div className="crfq-guide-grid">
            {measurements.map((item, index) => (
              <article className="crfq-guide-item" key={item.key}>
                <div className="crfq-step"><span className="crfq-step-number">{index + 1}</span>{lang === 'ar' ? 'خطوة القياس' : 'MEASUREMENT'}</div>
                <MeasurementDiagram type={item.key} label={t(`customerRfq.measure.${item.label}`)} />
                <h4>{t(`customerRfq.measure.${item.label}`)}</h4>
                <p>{t(`customerRfq.measure.${item.instruction}`)}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="crfq-section" aria-labelledby="crfq-form-title">
          <h3 id="crfq-form-title">{t('customerRfq.formTitle')}</h3>
          <p className="crfq-section-copy">{t('customerRfq.formIntro')}</p>
          <form onSubmit={(event) => void handleSubmit(event)} noValidate>
            <div className="crfq-form-grid">
              <div className="crfq-field crfq-span-2">
                <label htmlFor="roller-type">{t('customerRfq.rollerType')}</label>
                <input id="roller-type" value={material} onChange={(event) => setMaterial(event.target.value)} placeholder={t('customerRfq.rollerTypePlaceholder')} required />
              </div>
              <div className="crfq-field">
                <label htmlFor="core-id">{t('customerRfq.coreId')}</label>
                <input id="core-id" type="number" min="0.01" step="1" placeholder="0.00" value={coreId} onChange={(event) => setCoreId(event.target.value)} required />
              </div>
              <div className="crfq-field">
                <label htmlFor="finished-od">{t('customerRfq.finishedOd')}</label>
                <input id="finished-od" type="number" min="0.01" step="1" placeholder="0.00" value={finishedOd} onChange={(event) => setFinishedOd(event.target.value)} required />
              </div>
              <div className="crfq-field">
                <label htmlFor="face-length">{t('customerRfq.faceLength')}</label>
                <input id="face-length" type="number" min="0.01" step="1" placeholder="0.00" value={faceLength} onChange={(event) => setFaceLength(event.target.value)} required />
              </div>
              <div className="crfq-field">
                <label htmlFor="hardness">{t('customerRfq.hardness')}</label>
                <input id="hardness" type="number" min="0" max="100" step="any" value={hardness} onChange={(event) => setHardness(event.target.value)} required />
              </div>
              <div className="crfq-field">
                <label htmlFor="quantity">{t('customerRfq.quantity')}</label>
                <input id="quantity" type="number" min="1" step="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} required />
              </div>
              <div className="crfq-field crfq-span-2">
                <label htmlFor="notes">{t('customerRfq.notes')}</label>
                <textarea id="notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder={t('customerRfq.notesPlaceholder')} />
              </div>
              <div className="crfq-span-2">
                <button className="crfq-submit" type="submit" disabled={busy}>
                  <Send size={17} />{busy ? t('customerRfq.submitting') : t('customerRfq.submit')}
                </button>
              </div>
            </div>
            {error && <p className="crfq-error" role="alert">{error}</p>}
          </form>
        </section>
      </main>

      {submitted && (
        <div className="crfq-modal-backdrop" role="presentation">
          <div className="crfq-modal" role="dialog" aria-modal="true" aria-labelledby="crfq-success-title">
            <span className="crfq-success-icon"><Check size={25} /></span>
            <h3 id="crfq-success-title">{t('customerRfq.successTitle')}</h3>
            <p>{t('customerRfq.successMessage')}</p>
            <button type="button" className="crfq-submit" onClick={() => setSubmitted(false)}>{t('customerRfq.close')}</button>
          </div>
        </div>
      )}
    </div>
  );
}