/**
 * المستخدم المدير الأعلى (Super‑Admin) — تجاوز مضمون (Hardcoded Bypass).
 * أياً كان الدور أو مصفوفة الصلاحيات الممنوحة، هذا الحساب يمر على كل فحوصات
 * 403 في الخادم (rbac: requireRole/requirePermission/requirePageAccess/requireDeveloper)
 * وفي شاشة إدارة الصلاحيات — لمنع أي إقفال ذاتي لحساب SIDDIQ.
 */

const SUPER_ADMIN_EMAILS = new Set(['siddiq@hannecardsaudi.com']);
const SUPER_ADMIN_NAMES = new Set(['siddiq']);

function norm(value: string | null | undefined): string {
  return (value ?? '').toLowerCase().trim();
}

export function isSuperAdmin(user: { name?: string | null; email?: string | null } | null | undefined): boolean {
  if (!user) return false;
  const email = norm(user.email);
  const name = norm(user.name);
  return SUPER_ADMIN_EMAILS.has(email) || SUPER_ADMIN_NAMES.has(name) || SUPER_ADMIN_EMAILS.has(name);
}
