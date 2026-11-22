import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight, CheckCircle2, Eye, EyeOff, Headset, LockKeyhole, Mail, Ruler, ShieldCheck } from 'lucide-react';
import type { AxiosError } from 'axios';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n';

interface LoginErrorData {
  error?: string;
  message?: string;
}

export function CustomerLogin() {
  const { login } = useAuth();
  const { lang, setLang } = useI18n();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const isArabic = lang === 'ar';

  useEffect(() => {
    document.title = isArabic ? 'بوابة عملاء هانيكارد السعودية' : 'Hannecard Saudi Customer Portal';
  }, [isArabic]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const user = await login(email.trim(), password);
      navigate(user.role.toUpperCase() === 'CUSTOMER' ? '/rfq' : '/', { replace: true });
    } catch (loginError) {
      const axiosError = loginError as AxiosError<LoginErrorData>;
      const code = axiosError.response?.data?.error;
      if (code === 'account_inactive') {
        setError(isArabic ? 'هذا الحساب غير نشط. يرجى التواصل مع مندوب هانيكارد.' : 'This account is inactive. Please contact your Hannecard representative.');
      } else if (code === 'invalid_credentials' || axiosError.response?.status === 400 || axiosError.response?.status === 401) {
        setError(isArabic ? 'البريد الإلكتروني أو كلمة المرور غير صحيحة. تحقق من بياناتك وحاول مجدداً.' : 'The email or password is incorrect. Check your details and try again.');
      } else {
        setError(axiosError.response?.data?.message || (isArabic ? 'تعذر تسجيل الدخول الآن. تحقق من اتصالك وحاول مجدداً.' : 'We could not sign you in. Check your connection and try again.'));
      }
    } finally {
      setBusy(false);
    }
  }

  const copy = isArabic
    ? {
        brandTitle: 'دعوا العجلة تدور',
        brandCopy: 'حلول متخصصة لتجديد وتصنيع أسطوانات الصناعة، بدعم مباشر من فريقنا الفني في المملكة.',
        benefits: ['طلبات تسعير سريعة للأسطوانات', 'دعم مباشر من مهندس المبيعات'],
        formTitle: 'بوابة عملاء هانيكارد السعودية',
        formCopy: 'سجّل الدخول لمتابعة احتياجاتك وإرسال طلب تسعير جديد.',
        email: 'البريد الإلكتروني',
        emailPlaceholder: 'name@company.com',
        password: 'كلمة المرور',
        passwordPlaceholder: 'أدخل كلمة المرور',
        showPassword: 'إظهار كلمة المرور',
        hidePassword: 'إخفاء كلمة المرور',
        submit: 'تسجيل الدخول',
        submitting: 'جارٍ تسجيل الدخول',
        help: 'هل تحتاج إلى بيانات الدخول أو إعادة تعيين كلمة المرور؟ تواصل مع مندوب المبيعات المختص في هانيكارد.',
        secure: 'دخول آمن إلى بوابة العملاء',
        welcome: 'مرحباً بكم في',
      }
    : {
        brandTitle: 'Keep Rolling',
        brandCopy: 'Specialist roller manufacturing and refurbishment, backed by direct technical support from our Saudi team.',
        benefits: ['Fast roller quotation requests', 'Direct sales engineer support'],
        formTitle: 'Hannecard Saudi Customer Portal',
        formCopy: 'Sign in to manage your requirements and submit a new quotation request.',
        email: 'Email address',
        emailPlaceholder: 'name@company.com',
        password: 'Password',
        passwordPlaceholder: 'Enter your password',
        showPassword: 'Show password',
        hidePassword: 'Hide password',
        submit: 'Sign in',
        submitting: 'Signing in',
        help: 'Need account credentials or a password reset? Contact your Hannecard sales representative.',
        secure: 'Secure customer portal access',
      };

  const partnerLogos = [
    'Gulf LPack.png', 'MEP.png', 'SAPIN.png', 'SPG.png', 'التصنيع.png',
    'الدار العربية.png', 'السعودية لطباعة الورق.png', 'العبيكان.png', 'الوطنية.png',
    'سابك.png', 'مجمع الملك فهد.png', 'معادن.png', 'نابكو الوطنية.png', 'ورق.png', 'يونيكويل.png',
  ];

  return (
    <main className="customer-login" dir={isArabic ? 'rtl' : 'ltr'}>
      <style>{`
        .customer-login{--cl-ink:#17212b;--cl-muted:#65717d;--cl-slate:#0f172a;--cl-green:#74b743;--cl-blue:#1857a6;min-height:100vh;display:grid;grid-template-columns:minmax(0,1.08fr) minmax(420px,.92fr);background:#f4f7f8;color:var(--cl-ink);font-family:inherit}
        .cl-brand{position:relative;isolation:isolate;overflow:hidden;display:flex;flex-direction:column;justify-content:space-between;min-height:100vh;padding:clamp(30px,5vw,76px);background:linear-gradient(145deg,#6cb33f 0%,#79bb49 56%,#8bc853 100%);color:var(--cl-slate)}
        .cl-brand:before{content:"";position:absolute;inset:0;z-index:-1;opacity:.1;background-image:linear-gradient(rgba(15,23,42,.14) 1px,transparent 1px),linear-gradient(90deg,rgba(15,23,42,.14) 1px,transparent 1px);background-size:44px 44px;mask-image:linear-gradient(135deg,#000,transparent 76%)}
        .cl-brand:after{content:"";position:absolute;z-index:-1;width:420px;height:420px;border:1px solid rgba(15,23,42,.2);border-radius:50%;inset-inline-end:-180px;bottom:-205px;box-shadow:0 0 0 28px rgba(15,23,42,.035),0 0 0 58px rgba(15,23,42,.03),0 0 0 92px rgba(15,23,42,.025)}
        .cl-brand-top{display:flex;align-items:center;gap:12px;color:#15231a;font-size:12px;font-weight:800;letter-spacing:1.2px}
        .cl-brand-mark{width:9px;height:9px;border-radius:50%;background:#fff;box-shadow:0 0 0 4px rgba(15,23,42,.12)}
        .cl-brand-content{width:100%;max-width:680px;margin:36px 0}
        .cl-logo-frame{box-sizing:border-box;width:min(100%,340px);padding:11px 18px;background:#fff;border-radius:7px;box-shadow:0 18px 48px rgba(0,0,0,.2)}
        .cl-logo{display:block;width:100%;height:auto;max-height:82px;object-fit:contain;object-position:center}
        .cl-brand-heading{font-size:clamp(30px,3.8vw,52px);line-height:1.13;font-weight:700;margin:38px 0 16px;max-width:620px}
        .cl-brand-copy{max-width:550px;margin:0;color:#203522;font-size:16px;line-height:1.8}
        .cl-highlights{display:grid;gap:16px;margin:34px 0 0;padding:0;list-style:none}
        .cl-highlight{display:flex;align-items:center;gap:12px;color:#14251a;font-size:14px;font-weight:600}
        .cl-highlight-icon{display:grid;place-items:center;flex:none;width:31px;height:31px;border:1px solid rgba(15,23,42,.28);border-radius:6px;color:#0f172a;background:rgba(255,255,255,.22)}
        .cl-brand-footer{display:flex;flex-direction:column;align-items:flex-start;color:#172a1c;font-size:12px;font-weight:700}
        .cl-group-brand{display:flex;flex-direction:row;align-items:center;gap:13px;padding:10px 14px;background:#fff;border-radius:8px;box-shadow:0 4px 14px rgba(15,23,42,.16);direction:ltr;white-space:nowrap}
        .cl-group-label{font-size:11px;font-weight:800;letter-spacing:1px;color:#172a1c;white-space:nowrap}
        .cl-group-logo{display:block;width:176px;height:48px;object-fit:contain}
        .cl-partners{grid-column:1/-1;grid-row:2;display:flex;align-items:center;height:64px;overflow:hidden;background:#fff;border-top:1px solid #e4e9e9}
        .cl-partners-track{display:flex;width:max-content;align-items:center;gap:40px;padding:0 20px;animation:cl-partners-scroll 36s linear infinite;direction:ltr}
        .cl-partners:hover .cl-partners-track{animation-play-state:paused}
        .cl-partners img{display:block;flex:none;width:auto;max-width:160px;height:42px;object-fit:contain}
        @keyframes cl-partners-scroll{from{transform:translateX(0)}to{transform:translateX(-50%)}}
        .cl-roller-art{position:absolute;inset-inline-end:11%;bottom:18%;display:flex;align-items:center;gap:5px;opacity:.14;transform:rotate(-18deg);pointer-events:none}
        .cl-roller-art span{display:block;width:30px;height:140px;border:2px solid #0f172a;border-radius:15px;background:linear-gradient(90deg,transparent 25%,rgba(15,23,42,.24) 50%,transparent 75%)}
        .cl-roller-art span:nth-child(2){height:174px}.cl-roller-art span:nth-child(3){height:150px}
        .cl-form-side{display:grid;place-items:center;padding:34px clamp(24px,5vw,76px);background:#f4f7f8}
        .cl-form-wrap{width:min(100%,440px)}
        .cl-form-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:38px}
        .cl-mobile-brand{display:none;align-items:center;gap:10px;font-size:12px;font-weight:800;letter-spacing:.8px;color:#34434c}
        .cl-mobile-logo{width:38px;height:38px;object-fit:contain;background:#fff;border-radius:5px;padding:3px}
        .cl-language{display:inline-flex;gap:3px;padding:3px;border:1px solid #d9e0e2;border-radius:6px;background:#fff}
        .cl-language button{border:0;border-radius:4px;padding:7px 10px;background:transparent;color:#65717d;font:inherit;font-size:12px;font-weight:700;cursor:pointer}
        .cl-language button[aria-pressed="true"]{background:#e8f3e5;color:#2f7e25}
        .cl-form-heading{margin:0;color:#19252e;font-size:29px;line-height:1.3;font-weight:750}
        .cl-form-copy{margin:10px 0 28px;color:#65717d;font-size:14px;line-height:1.7}
        .cl-field{display:grid;gap:8px;margin-bottom:18px}
        .cl-field label{font-size:13px;font-weight:700;color:#35434c}
        .cl-input-wrap{position:relative}
        .cl-input-icon{position:absolute;top:50%;inset-inline-start:14px;transform:translateY(-50%);color:#7a878c;pointer-events:none}
        .cl-input{display:block;width:100%;height:50px;box-sizing:border-box;padding:0 44px!important;border:1px solid #cbd4d6!important;border-radius:5px!important;background:#fff!important;color:#19252e!important;font:inherit;font-size:14px!important;direction:ltr;text-align:left;transition:border-color .16s,box-shadow .16s}
        .cl-input:focus{border-color:var(--cl-blue)!important;box-shadow:0 0 0 3px rgba(24,87,166,.12)!important}
        .cl-input::placeholder{color:#8b969a!important}
        .cl-password-toggle{position:absolute;top:50%;inset-inline-end:10px;display:grid;place-items:center;width:32px;height:32px;transform:translateY(-50%);border:0;border-radius:4px;background:transparent;color:#68767c;cursor:pointer}
        .cl-password-toggle:hover{background:#eef2f1;color:#26363d}
        .cl-error{display:flex;align-items:flex-start;gap:9px;margin:0 0 16px;padding:11px 12px;border:1px solid #edc8c4;border-radius:5px;background:#fff2f0;color:#a3332c;font-size:13px;line-height:1.55}
        .cl-submit{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;min-height:49px;margin-top:8px;border:0;border-radius:5px;background:#1857a6;color:#fff;font:inherit;font-size:14px;font-weight:750;cursor:pointer;transition:background .16s,transform .16s}
        .cl-submit:hover:not(:disabled){background:#104987;transform:translateY(-1px)}.cl-submit:disabled{opacity:.7;cursor:wait}
        .cl-spinner{width:16px;height:16px;border:2px solid rgba(255,255,255,.4);border-top-color:#fff;border-radius:50%;animation:cl-spin .7s linear infinite}
        @keyframes cl-spin{to{transform:rotate(360deg)}}
        .cl-helper{margin:23px 0 0;padding-top:17px;border-top:1px solid #dce3e4;color:#69767b;font-size:12px;line-height:1.75}
        .cl-security{display:flex;align-items:center;justify-content:center;gap:7px;margin-top:30px;color:#849095;font-size:11px}
        .cl-security svg{color:#398f46}
        @media(max-width:900px){.customer-login{grid-template-columns:minmax(0,1fr) minmax(390px,.9fr)}.cl-brand{padding:36px}.cl-form-side{padding:30px}.cl-brand-heading{font-size:36px}}
        @media(min-width:900px){.customer-login{height:100dvh;min-height:0;overflow:hidden;grid-template-rows:minmax(0,1fr) 64px}.cl-brand,.cl-form-side{grid-row:1;min-height:0}.cl-brand{padding:20px 36px}.cl-brand-content{margin:20px 0}.cl-form-side{padding:20px 36px}.cl-form-top{margin-bottom:24px}.cl-security{margin-top:20px}}
        @media(max-width:700px){.customer-login{display:flex;flex-direction:column;min-height:100vh}.cl-brand{min-height:auto;padding:20px 22px 24px}.cl-brand-top{display:none}.cl-brand-content{margin:0}.cl-logo-frame{width:min(100%,340px);padding:9px 12px}.cl-logo{max-height:68px}.cl-brand-heading{font-size:25px;margin:18px 0 7px}.cl-brand-copy{font-size:13px;line-height:1.6}.cl-highlights{grid-template-columns:1fr;gap:8px;margin:16px 0 0}.cl-highlight{font-size:12px;gap:9px}.cl-highlight-icon{width:25px;height:25px}.cl-highlight-icon svg{width:14px;height:14px}.cl-roller-art{inset-inline-end:8%;bottom:10%;opacity:.08}.cl-roller-art span{height:80px;width:17px}.cl-roller-art span:nth-child(2){height:100px}.cl-roller-art span:nth-child(3){height:85px}.cl-brand-footer{display:flex;margin-top:22px}.cl-group-brand{gap:8px;padding:9px 11px}.cl-group-label{font-size:9px;letter-spacing:.6px}.cl-group-logo{width:120px;height:36px}.cl-partners{height:64px;min-height:64px}.cl-partners-track{gap:24px}.cl-partners img{max-width:130px;height:38px}.cl-form-side{flex:1;display:block;padding:24px 22px 32px}.cl-form-wrap{margin:0 auto}.cl-form-top{margin-bottom:28px}.cl-mobile-brand{display:flex}.cl-form-heading{font-size:24px}.cl-form-copy{margin:8px 0 23px}}
        @media(prefers-reduced-motion:reduce){.cl-spinner{animation-duration:1.8s}.cl-submit{transition:none}}
      `}</style>

      <section className="cl-brand" aria-label={isArabic ? 'عن هانيكارد السعودية' : 'About Hannecard Saudi'}>
        <div className="cl-brand-content">
          <div className="cl-logo-frame"><img className="cl-logo" src="/logo.png" alt="هانيكارد السعودية | Hannecard Saudi - Your Roller Expert" /></div>
          <h1 className="cl-brand-heading">{copy.brandTitle}</h1>
          <p className="cl-brand-copy">{copy.brandCopy}</p>
          <ul className="cl-highlights">
            {[Ruler, Headset].map((Icon, index) => (
              <li className="cl-highlight" key={copy.benefits[index]}>
                <span className="cl-highlight-icon"><Icon size={17} /></span>{copy.benefits[index]}
              </li>
            ))}
          </ul>
        </div>
        <div className="cl-roller-art" aria-hidden="true"><span /><span /><span /></div>
        <div className="cl-brand-footer">
          <div className="cl-group-brand" dir="ltr">
            <span className="cl-group-label">PART OF HANNECARD GROUP</span>
            <img className="cl-group-logo" src="/hannecard-group-logo.jpg" alt="Hannecard France" />
          </div>
        </div>
      </section>

      <div className="cl-partners" aria-label={isArabic ? 'شركاؤنا' : 'Our partners'}>
        <div className="cl-partners-track">
          {partnerLogos.map((logo) => <img key={`first-${logo}`} src={`/partners/${logo}`} alt="" />)}
          {partnerLogos.map((logo) => <img key={`second-${logo}`} src={`/partners/${logo}`} alt="" />)}
        </div>
      </div>

      <section className="cl-form-side">
        <div className="cl-form-wrap">
          <div className="cl-form-top">
            <div className="cl-mobile-brand"><img className="cl-mobile-logo" src="/logo.png" alt="" />HANNECARD SAUDI</div>
            <div className="cl-language" role="group" aria-label={isArabic ? 'اختيار اللغة' : 'Choose language'}>
              <button type="button" aria-pressed={isArabic} onClick={() => setLang('ar')}>العربية</button>
              <button type="button" aria-pressed={!isArabic} onClick={() => setLang('en')}>EN</button>
            </div>
          </div>
          <div>
            <h2 className="cl-form-heading">{copy.formTitle}</h2>
            <p className="cl-form-copy">{copy.formCopy}</p>
          </div>
          <form onSubmit={(event) => void handleSubmit(event)}>
            <div className="cl-field">
              <label htmlFor="customer-email">{copy.email}</label>
              <div className="cl-input-wrap">
                <Mail className="cl-input-icon" size={17} />
                <input id="customer-email" className="cl-input" type="email" autoComplete="username" placeholder={copy.emailPlaceholder} value={email} onChange={(event) => setEmail(event.target.value)} required />
              </div>
            </div>
            <div className="cl-field">
              <label htmlFor="customer-password">{copy.password}</label>
              <div className="cl-input-wrap">
                <LockKeyhole className="cl-input-icon" size={17} />
                <input id="customer-password" className="cl-input" type={passwordVisible ? 'text' : 'password'} autoComplete="current-password" placeholder={copy.passwordPlaceholder} value={password} onChange={(event) => setPassword(event.target.value)} required />
                <button className="cl-password-toggle" type="button" onClick={() => setPasswordVisible((visible) => !visible)} aria-label={passwordVisible ? copy.hidePassword : copy.showPassword} title={passwordVisible ? copy.hidePassword : copy.showPassword}>
                  {passwordVisible ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </div>
            {error && <div className="cl-error" role="alert" aria-live="assertive"><ShieldCheck size={17} />{error}</div>}
            <button className="cl-submit" type="submit" disabled={busy}>
              {busy ? <><span className="cl-spinner" aria-hidden="true" />{copy.submitting}</> : <>{copy.submit}<ArrowUpRight size={17} /></>}
            </button>
          </form>
          <p className="cl-helper">{copy.help}</p>
          <div className="cl-security"><CheckCircle2 size={14} />{copy.secure}</div>
        </div>
      </section>
    </main>
  );
}