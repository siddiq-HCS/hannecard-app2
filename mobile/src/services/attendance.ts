import { api } from '@/api/client';
import { getCurrentPosition } from '@/services/location';

/** تاريخ اليوم المحلي للمستخدم (YYYY-MM-DD) */
export function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export interface AttendanceRecord {
  id: string;
  date: string;
  checkInTime: string | null;
  checkInLat: number | null;
  checkInLng: number | null;
  checkInAccuracy: number | null;
  checkOutTime: string | null;
  checkOutLat: number | null;
  checkOutLng: number | null;
  checkOutAccuracy: number | null;
  status: 'CHECKED_IN' | 'CHECKED_OUT';
}

/**
 * حارس الحضور الإلزامي (جانب العميل):
 * - 'ok'               : المندوب مسجّل حضوراً اليوم → يُسمح بالعملية.
 * - 'attendance_required' : لم يسجّل حضوراً أو انصرف → يجب منع العملية.
 * - 'error'            : تعذّر فحص السيرفر → نترك العملية (الحارس في السيرفر يحمي).
 * - 'skip'             : المستخدم ليس مندوباً (مدير/نائب) → لا يخضع للشرط.
 */
export async function requireTodayCheckIn(token: string, isRep: boolean): Promise<'ok' | 'attendance_required' | 'error' | 'skip'> {
  if (!isRep) return 'skip';
  try {
    const res = await api.get(`/attendance/status?date=${todayLocal()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const rec = res.data?.attendance as AttendanceRecord | null;
    if (!rec || rec.status !== 'CHECKED_IN') return 'attendance_required';
    return 'ok';
  } catch {
    return 'error';
  }
}

/**
 * تسجيل الحضور التلقائي عند فتح التطبيق أو الدخول لأول مرة في اليوم:
 * يفحص حالة اليوم عبر السيرفر، وإن لم يُسجَّل حضور إطلاقاً يسجّله في الخلفية
 * مع أحسن إحداثيات متاحة (الموقع الحالي أو آخر موقع معروف — دون تعليق العملية).
 * لا يكرر الحضور لمن حضّر بالفعل، ولا يعيد الدخول لمن انصرف.
 * فشل الشبكة لا يُفشل الاستدعاء إطلاقاً → 'failed' لإعادة المحاولة لاحقاً.
 */
export async function autoCheckin(token: string, isRep: boolean): Promise<'checked_in' | 'already' | 'skipped' | 'failed'> {
  if (!isRep) return 'skipped';
  try {
    const st = await api.get(`/attendance/status?date=${todayLocal()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const rec = st.data?.attendance as AttendanceRecord | null;
    if (rec) return rec.status === 'CHECKED_IN' ? 'already' : 'skipped';
    const coords = await getCurrentPosition();
    await api.post(
      '/attendance/check-in',
      { date: todayLocal(), ...(coords ?? {}) },
      { headers: { Authorization: `Bearer ${token}` } },
    );
    return 'checked_in';
  } catch {
    return 'failed';
  }
}
