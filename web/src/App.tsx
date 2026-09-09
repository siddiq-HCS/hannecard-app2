import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuth } from './context/AuthContext';
import { LanguageSwitcher, useI18n } from './i18n';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Reps } from './pages/Reps';
import { WeeklyPlans } from './pages/WeeklyPlans';
import { MapView } from './pages/MapView';
import { Chat } from './pages/Chat';
import { Managers } from './pages/Managers';
import { RFQs } from './pages/RFQs';
import { Analytics } from './pages/Analytics';
import { Attendance } from './pages/Attendance';
import { RollMaterials } from './pages/RollMaterials';
import { PagePermissions } from './pages/PagePermissions';
import { Logo } from './components/Logo';
import { Home, Map, Users, FileText, BarChart2, MessageSquare, Calendar, ClipboardCheck, Layers, Settings, ShieldCheck } from 'lucide-react';

// شاشة تحميل مؤقتة أثناء التحقق من الجلسة (/me) — بديل عن فراغ/شاشة سوداء
function LoadingScreen() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#020617' }}>
      <p style={{ color: '#94a3b8', fontSize: 14 }}>جارٍ التحقق من الجلسة...</p>
    </div>
  );
}

// توجيه المندوب (جلسة قديمة) إلى تطبيق الجوال مع رسالة توضيحية
function RedirectToMobile() {
  const { t } = useI18n();
  useEffect(() => {
    const timer = setTimeout(() => {
      window.location.replace('/mobile');
    }, 2500);
    return () => clearTimeout(timer);
  }, []);
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#020617', padding: 24 }}>
      <div style={{ maxWidth: 440, textAlign: 'center' }}>
        <p style={{ color: '#f59e0b', fontSize: 17, margin: '0 0 8px', fontWeight: 600 }}>⚠️</p>
        <p style={{ color: '#e2e8f0', fontSize: 16, margin: '0 0 8px' }}>{t('login.repNotAllowed')}</p>
        <p style={{ color: '#94a3b8', fontSize: 13, margin: 0 }}>جارٍ تحويلك إلى تطبيق الجوال...</p>
      </div>
    </div>
  );
}

function roleEq(role: any, expected: string): boolean {
  return typeof role === 'string' && role.toUpperCase() === expected.toUpperCase();
}

function hasPermission(user: any, permission: string): boolean {
  if (!user) return false;
  if (roleEq(user.role, 'DEVELOPER') || roleEq(user.role, 'REPRESENTATIVE')) return true;
  const perms = user.permissions;
  if (!Array.isArray(perms) || perms.length === 0) return true;
  return perms.includes(permission);
}

// مسار الهبوط المناسب للحساب الحالي: أول صفحة يسمح له دورها وصلاحياته بالدخول إليها.
// يمنع ارتداد الحساب إلى /login بعد تسجيل الدخول لمجرد أن /dashboard غير مضمّن في صلاحياته.
const pageOrder = [
  { href: '/dashboard', permission: 'PAGE_DASHBOARD_ACCESS' },
  { href: '/rfqs', permission: 'PAGE_RFQS_ACCESS' },
  { href: '/weekly-plans', permission: 'PAGE_WEEKLY_PLANS_ACCESS' },
  { href: '/attendance', permission: 'PAGE_ATTENDANCE_ACCESS' },
  { href: '/map', permission: 'PAGE_MAP_ACCESS' },
  { href: '/reps', permission: 'PAGE_REPS_ACCESS' },
  { href: '/analytics', permission: 'PAGE_ANALYTICS_ACCESS' },
  { href: '/managers', permission: 'PAGE_MANAGERS_ACCESS' },
  { href: '/chat', permission: 'PAGE_CHAT_ACCESS' },
  { href: '/roll-materials', permission: 'PAGE_ROLL_MATERIALS_ACCESS' },
];

function firstAllowedHref(user: any): string {
  for (const item of pageOrder) {
    if (hasPermission(user, item.permission)) return item.href;
  }
  return '/login';
}

const navItems = [
  { href: '/dashboard', label: 'nav.home', icon: Home, permission: 'PAGE_DASHBOARD_ACCESS' },
  { href: '/map', label: 'nav.map', icon: Map, permission: 'PAGE_MAP_ACCESS' },
  { href: '/reps', label: 'nav.reps', icon: Users, permission: 'PAGE_REPS_ACCESS' },
  { href: '/rfqs', label: 'nav.rfqs', icon: FileText, permission: 'PAGE_RFQS_ACCESS' },
  { href: '/analytics', label: 'nav.analytics', icon: BarChart2, permission: 'PAGE_ANALYTICS_ACCESS' },
  { href: '/chat', label: 'nav.chat', icon: MessageSquare, permission: 'PAGE_CHAT_ACCESS' },
  { href: '/weekly-plans', label: 'nav.reports', icon: Calendar, permission: 'PAGE_WEEKLY_PLANS_ACCESS' },
  { href: '/attendance', label: 'nav.attendance', icon: ClipboardCheck, permission: 'PAGE_ATTENDANCE_ACCESS' },
];

const adminItems = [
  { href: '/managers', label: 'nav.managers', icon: Settings, permission: 'PAGE_MANAGERS_ACCESS' },
  { href: '/roll-materials', label: 'rollMat.title', icon: Layers, permission: 'PAGE_ROLL_MATERIALS_ACCESS' },
];

const devItems = [
  { href: '/page-permissions', label: 'pagePerms.title', icon: ShieldCheck },
];

function Shell({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const { user, logout } = useAuth();
  const location = useLocation();

  const visibleNavItems = navItems.filter((item) => hasPermission(user, item.permission));
  const visibleAdminItems = adminItems.filter((item) => hasPermission(user, item.permission));

  function handleLogout() {
    // مسح آمن للجلسة/التوكن ثم العودة لصفحة الدخول
    logout();
    window.location.replace('/');
  }

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Top Navbar */}
      <nav className="sticky top-0 z-50 glass border-b border-slate-700/50">
        <div className="max-w-[1600px] mx-auto px-4 py-3 flex items-center gap-4">
          {/* Logo + Brand */}
          <div className="flex items-center gap-3 shrink-0">
            <a href="/dashboard">
              <Logo />
            </a>
          </div>

          {/* Nav Links */}
          <div className="flex items-center gap-1 overflow-x-auto flex-1 scrollbar-hide">
            {visibleNavItems.map(({ href, label, icon: Icon }) => {
              const active = location.pathname === href;
              return (
                <a
                  key={href}
                  href={href}
                  className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all shrink-0 ${
                    active
                      ? 'bg-amber-500/15 text-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.1)]'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                  }`}
                >
                  <Icon size={18} strokeWidth={active ? 2.2 : 1.8} />
                  <span className="hidden lg:block">{t(label)}</span>
                </a>
              );
            })}

            {/* Admin items */}
            {visibleAdminItems.map(({ href, label, icon: Icon }) => {
              const active = location.pathname === href;
              return (
                <a
                  key={href}
                  href={href}
                  className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all shrink-0 ${
                    active
                      ? 'bg-amber-500/15 text-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.1)]'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                  }`}
                >
                  <Icon size={18} strokeWidth={active ? 2.2 : 1.8} />
                  <span className="hidden lg:block">{t(label)}</span>
                </a>
              );
            })}

            {/* Developer-only items */}
            {roleEq(user?.role, 'DEVELOPER') &&
              devItems.map(({ href, label, icon: Icon }) => {
                const active = location.pathname === href;
                return (
                  <a
                    key={href}
                    href={href}
                    className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all shrink-0 ${
                      active
                        ? 'bg-amber-500/15 text-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.1)]'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                    }`}
                  >
                    <Icon size={18} strokeWidth={active ? 2.2 : 1.8} />
                    <span className="hidden lg:block">{t(label)}</span>
                  </a>
                );
              })}
          </div>

          {/* Language + User */}
          <div className="flex items-center gap-3 shrink-0">
            <LanguageSwitcher />
            {user && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800/50 border border-slate-700/50">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-xs font-bold text-slate-900">
                  {user.name?.charAt(0) || '?'}
                </div>
                <span className="text-sm text-slate-300 hidden md:block">{user.name}</span>
              </div>
            )}
            <button
              onClick={handleLogout}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 14px',
                borderRadius: 10,
                border: 'none',
                background: '#dc2626',
                color: '#fff',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              <span aria-hidden>{'↪'}</span>
              {t('nav.logout')}
            </button>
          </div>
        </div>
      </nav>

      {/* Page Content */}
      <main className="max-w-[1600px] mx-auto px-4 py-6">
        {children}
      </main>
    </div>
  );
}

export function App() {
  const { token, user, ready } = useAuth();

  // المستخدم مندوب (جلسة قديمة من قبل فصل الصلاحيات) → توجيه فوري لتطبيق الجوال مع رسالة
  if (roleEq(user?.role, 'REPRESENTATIVE')) return <RedirectToMobile />;

  // أثناء جلب /me لم يكتمل بعد (token موجود) → شاشة تحميل بدل أي وميض/مسار خاطئ لحظي
  if ((token && !user) || (token && !ready)) return <LoadingScreen />;

  const staffRoles = ['SALES_MANAGER', 'DEPUTY_SALES_MANAGER', 'DEVELOPER', 'ADMIN', 'SUPER_ADMIN', 'MANAGER', 'OWNER', 'GENERAL_MANAGER'];
  // مقارنة الأدوار غير حساسة لحالة الأحرف (Case-Insensitive) لمنع رفض الدخول
  const isStaff =
    !!token &&
    !!user &&
    typeof user.role === 'string' &&
    staffRoles.some((r) => user.role.toUpperCase() === r);
  const isDev = typeof user?.role === 'string' && user.role.toUpperCase() === 'DEVELOPER';

  return (
    <Routes>
      {/* صفحة الدخول: تظهر عند غياب جلسة صالحة (token غائب/تالف/منتهي) — بدون أي انهيار */}
      <Route path="/login" element={<Login />} />

      {/* اللوحة الإدارية محمية: أي مسار بدون جلسة سارية يُوجَّه مباشرة لـ /login */}
      <Route path="/dashboard" element={isStaff && hasPermission(user, 'PAGE_DASHBOARD_ACCESS') ? <Shell><Dashboard /></Shell> : <Navigate to={isStaff ? firstAllowedHref(user) : '/login'} replace />} />
      <Route path="/map" element={isStaff && hasPermission(user, 'PAGE_MAP_ACCESS') ? <Shell><MapView /></Shell> : <Navigate to="/login" replace />} />
      <Route path="/reps" element={isStaff && hasPermission(user, 'PAGE_REPS_ACCESS') ? <Shell><Reps /></Shell> : <Navigate to="/login" replace />} />
      <Route path="/rfqs" element={isStaff && hasPermission(user, 'PAGE_RFQS_ACCESS') ? <Shell><RFQs /></Shell> : <Navigate to="/login" replace />} />
      <Route path="/analytics" element={isStaff && hasPermission(user, 'PAGE_ANALYTICS_ACCESS') ? <Shell><Analytics /></Shell> : <Navigate to="/login" replace />} />
      <Route path="/managers" element={isStaff && hasPermission(user, 'PAGE_MANAGERS_ACCESS') ? <Shell><Managers /></Shell> : <Navigate to="/login" replace />} />
      <Route path="/chat" element={isStaff && hasPermission(user, 'PAGE_CHAT_ACCESS') ? <Shell><Chat /></Shell> : <Navigate to="/login" replace />} />
      <Route path="/weekly-plans" element={isStaff && hasPermission(user, 'PAGE_WEEKLY_PLANS_ACCESS') ? <Shell><WeeklyPlans /></Shell> : <Navigate to="/login" replace />} />
      <Route path="/attendance" element={isStaff && hasPermission(user, 'PAGE_ATTENDANCE_ACCESS') ? <Shell><Attendance /></Shell> : <Navigate to="/login" replace />} />
      <Route path="/roll-materials" element={isStaff && hasPermission(user, 'PAGE_ROLL_MATERIALS_ACCESS') ? <Shell><RollMaterials /></Shell> : <Navigate to="/login" replace />} />
      <Route path="/page-permissions" element={isStaff && isDev ? <Shell><PagePermissions /></Shell> : <Navigate to="/login" replace />} />
      <Route path="/reports" element={<Navigate to="/weekly-plans" />} />
      {/* أي مسار مجهول → أول صفحة مسموحة للحساب إن كانت جلسة سارية، وإلا صفحة الدخول */}
      <Route path="*" element={<Navigate to={isStaff ? firstAllowedHref(user) : '/login'} replace />} />
    </Routes>
  );
}