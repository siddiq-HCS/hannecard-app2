import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import { LanguageSwitcher, useI18n } from '../i18n';
import { Logo } from '../components/Logo';
import type { AxiosError } from 'axios';

interface LoginErrorData {
  error?: string;
  message?: string;
}

export function Login() {
  const { login } = useAuth();
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [repBlocked, setRepBlocked] = useState(false);

  async function doLogin(e: string, pw: string) {
    setBusy(true);
    setError('');
    setRepBlocked(false);
    try {
      await login(e, pw);
      const params = new URLSearchParams(window.location.search);
      const redirect = params.get('redirect') || '/dashboard';
      window.location.replace(redirect);
    } catch (err) {
      const axiosErr = err as AxiosError<LoginErrorData>;
      // سجل تشخيصي مؤقت لعرض رمز الحالة وسبب الرفض من الخادم على لوحة التحكم (Console)
      console.error('[auth][debug] login failed:', axiosErr?.response?.status, err);
      const code = axiosErr?.response?.data?.error;
      const serverMsg = axiosErr?.response?.data?.message;
      if (code === 'web_not_allowed') {
        // حساب مندوب يحاول الدخول للوحة الإدارية → أعرض رسالة + زر للانتقال لتطبيق المناديب
        setRepBlocked(true);
        setError(serverMsg ?? t('login.repNotAllowed'));
        setPassword('');
      } else if (code === 'account_inactive') {
        // حساب معطّل → رسالة عربية واضحة تشرح السبب
        setError(serverMsg ?? t('login.accountInactive'));
        setPassword('');
      } else if (code === 'invalid_credentials' || axiosErr?.response?.status === 401) {
        // بيانات خاطئة (بريد غير موجود أو كلمة مرور غير صحيحة)
        setError(serverMsg ?? t('login.error'));
        setPassword('');
      } else {
        // خطأ عام آخر (شبكة/سيرفر) → رسالة واضحة دون تعليق الشاشة
        setError(t('login.serverError'));
      }
      setBusy(false);
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const e = params.get('email');
    const pw = params.get('password');
    if (e && pw) void doLogin(e, pw);
  }, []);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    void doLogin(email, password);
  }

  return (
    <div style={{ maxWidth: 380, margin: '80px auto', background: 'rgba(30, 41, 59, 0.6)', backdropFilter: 'blur(16px)', border: '1px solid rgba(148, 163, 184, 0.1)', padding: 32, borderRadius: 12, textAlign: 'center' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        <LanguageSwitcher />
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
        <Logo size={78} column />
      </div>
      <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 0, marginBottom: 24 }}>{t('login.subtitle')}</p>
      {busy && <p style={{ color: '#2563eb', margin: '0 0 8px' }}>{t('login.busy')}</p>}
      <form onSubmit={(e) => void onSubmit(e)} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder={t('login.email')} style={inputStyle} />
        <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder={t('login.password')} style={inputStyle} />
        {error && <p style={{ color: '#dc2626', margin: 0 }}>{error}</p>}
        {repBlocked && (
          <button
            type="button"
            onClick={() => {
              window.location.replace('/mobile');
            }}
            style={{ ...buttonStyle, background: '#f59e0b', width: '100%' }}
          >
            {t('login.goToMobile')}
          </button>
        )}
        <button type="submit" disabled={busy} style={{ ...buttonStyle, opacity: busy ? 0.6 : 1 }}>{t('login.submit')}</button>
      </form>
    </div>
  );
}

const inputStyle: React.CSSProperties = { padding: 10, borderRadius: 8 };
const buttonStyle: React.CSSProperties = { padding: 10, borderRadius: 8, border: 'none', background: '#2563eb', color: '#fff', fontWeight: 600, cursor: 'pointer' };
