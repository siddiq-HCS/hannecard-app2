import { api } from '@/api/client';
import { getCurrentPosition } from '@/services/location';

/** تاريخ اليوم المحلي للمستخدم (YYYY-MM-DD) */
export function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// تاريخ اليوم الرسمي من السيرفر (بتوقيت الرياض) مع تخزين مؤقت لمدة دقيقة
// حتى لا يتأثر تسجيل الحضور/الخطط بمنطقة زمنية خاطئة على جهاز المندوب.
let cachedServerDate: string | null = null;
let cachedServerDateAt = 0;
const SERVER_DATE_TTL_MS = 60_000;

export async function todayServerDate(): Promise<string> {
  const now = Date.now();
  if (cachedServerDate && now - cachedServerDateAt < SERVER_DATE_TTL_MS) return cachedServerDate;
  try {
    const res = await api.get('/attendance/date', { timeout: 8000 });
    const d = res.data?.date as string | undefined;
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
      cachedServerDate = d;
      cachedServerDateAt = now;
      return d;
    }
  } catch (err) {
    console.error('[attendance] todayServerDate failed — سيُستخدم تاريخ الجهاز', (err as { message?: string })?.message);
  }
  return todayLocal();
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
    const date = await todayServerDate();
    const res = await api.get(`/attendance/status?date=${date}`, {
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
    const date = await todayServerDate();
    const st = await api.get(`/attendance/status?date=${date}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const rec = st.data?.attendance as AttendanceRecord | null;
    if (rec) return rec.status === 'CHECKED_IN' ? 'already' : 'skipped';
    const coords = await getCurrentPosition();
    await api.post(
      '/attendance/check-in',
      { date, ...(coords ?? {}) },
      { headers: { Authorization: `Bearer ${token}` } },
    );
    return 'checked_in';
  } catch (err) {
    // طباعة تفصيلية لرمز/حالة الخطأ الفعلية لتتبع فشل تسجيل الحضور من جهاز المندوب
    const e = err as { response?: { status?: number; data?: { error?: string; message?: string } }; message?: string };
    console.error('[attendance] autoCheckin failed', {
      status: e.response?.status,
      code: e.response?.data?.error,
      message: e.response?.data?.message ?? e.message,
    });
    return 'failed';
  }
}
