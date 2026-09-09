import { Component, type ErrorInfo, type ReactNode } from 'react';
import { storageClear } from '../lib/safeStorage';

interface Props {
  children: ReactNode;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  message: string;
}

// أخطاء ترتبط بالجلسة/التخزين المؤقت التالف — نتعامل معها تلقائياً بالمسح والتوجيه لصفحة الدخول
const SESSION_ERROR_PATTERNS = [
  /storage/i,
  /localStorage/i,
  /quota/i,
  /token/i,
  /user\./i,
  /cannot read propert/i,
  /cannot read properties of undefined/i,
  /cannot read properties of null/i,
  /json\.parse/i,
  /unexpected token/i,
  /invalid_login_response/i,
];

/**
 * Error boundary to prevent a blank/black screen.
 * Any uncaught error during rendering is caught and shown as a friendly,
 * retry-able panel instead of unmounting the whole tree.
 * أخطاء التخزين/الجلسة المكسورة تُعالج تلقائياً: مسح كامل للتخزين ثم توجيه لصفحة الدخول لمرة واحدة
 * (محميّ ضد حلقات إعادة التوجيه عبر علامة sessionStorage).
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' };

  private static markPurged() {
    try {
      sessionStorage.setItem('__eb_session_purged__', '1');
    } catch {
      /* sessionStorage قد يكون محظوراً أيضاً — نكتفي بالعلامة الحركية داخل الصفحة */
    }
  }

  private static alreadyPurged(): boolean {
    try {
      return sessionStorage.getItem('__eb_session_purged__') === '1';
    } catch {
      return false;
    }
  }

  static getDerivedStateFromError(error: unknown): State {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : String(error),
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // طباعة تفاصيل الخطأ والمكوّنات في الـ console لسهولة التشخيص
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary] Uncaught error:', error);
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary] Component stack:', info?.componentStack);

    // إصلاح جذري تلقائي: إن كان الخطأ من التخزين/الجلسة المكسورة ولم نعالجه بعد → مسح كامل وتوجيه للدخول
    const msg = error instanceof Error ? error.message || String(error) : String(error);
    const isSessionRelated = SESSION_ERROR_PATTERNS.some((re) => re.test(msg));
    if (isSessionRelated && !ErrorBoundary.alreadyPurged()) {
      // مسح كل بيانات الجلسة التالفة (تخزين دائم + في الذاكرة) مرة واحدة
      try {
        storageClear();
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('[ErrorBoundary] storageClear failed', e);
      }
      ErrorBoundary.markPurged();
      // الانتقال لصفحة الدخول لإغلاق الدائرة وتصفير الحالة المتسببة في الخلل
      // eslint-disable-next-line no-console
      console.warn('[ErrorBoundary] Auto-recovered session error -> routing to /login');
      window.location.replace('/login');
    }
  }

  reset = () => {
    this.setState({ hasError: false, message: '' });
    try {
      this.props.onReset?.();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[ErrorBoundary] onReset failed', e);
    }
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#020617', padding: 24 }} dir="rtl">
        <div
          style={{
            maxWidth: 440,
            width: '100%',
            textAlign: 'center',
            background: 'rgba(30, 41, 59, 0.6)',
            border: '1px solid rgba(148, 163, 184, 0.1)',
            borderRadius: 12,
            padding: 32,
          }}
        >
          <div style={{ fontSize: 40, marginBottom: 8 }}>⚠️</div>
          <h1 style={{ fontSize: 20, margin: '0 0 8px', color: '#f8fafc' }}>حدث خطأ غير متوقع</h1>
          <p style={{ fontSize: 14, color: '#94a3b8', margin: '0 0 16px' }}>تعذّر عرض هذه الصفحة لأسباب غير متوقعة.</p>
          <code
            style={{
              display: 'block',
              fontSize: 12,
              color: '#fca5a5',
              background: 'rgba(239, 68, 68, 0.1)',
              borderRadius: 6,
              padding: 8,
              marginBottom: 16,
              overflowWrap: 'anywhere',
              direction: 'ltr',
            }}
          >
            {this.state.message || 'Unknown error'}
          </code>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            <button
              onClick={this.reset}
              style={{
                padding: '10px 18px',
                borderRadius: 8,
                border: 'none',
                background: '#2563eb',
                color: '#fff',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              إعادة المحاولة
            </button>
            <button
              onClick={() => {
                try {
                  storageClear();
                } catch (e) {
                  // eslint-disable-next-line no-console
                  console.error('[ErrorBoundary] storage clear failed', e);
                }
                // التوجيه لصفحة الدخول مباشرة بدل الجذر لضمان تجاوز الجلسة المكسورة
                window.location.replace('/login');
              }}
              style={{
                padding: '10px 18px',
                borderRadius: 8,
                border: '1px solid rgba(148, 163, 184, 0.2)',
                background: 'transparent',
                color: '#e2e8f0',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              تسجيل الدخول من جديد
            </button>
          </div>
        </div>
      </div>
    );
  }
}
