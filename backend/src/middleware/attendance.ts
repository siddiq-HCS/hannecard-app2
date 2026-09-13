import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma.js';

function toDate(s: string) {
  return new Date(`${s}T00:00:00Z`);
}

// المملكة العربية السعودية توقيت ثابت UTC+3 (بدون توقيت صيفي) — نفس منطقة الحضور في routes/attendance.routes.ts
const TZ_OFFSET_MS = 3 * 60 * 60 * 1000;

/** تاريخ اليوم الفعلي (YYYY-MM-DD) بتوقيت الرياض — يُستخدم عند غياب التاريخ من العميل */
export function todayInTz(): string {
  return new Date(Date.now() + TZ_OFFSET_MS).toISOString().slice(0, 10);
}

/** قراءة تاريخ اليوم من الطلب (body.date أو x-date أو query.date) مع الاحتياط إلى توقيت السيرفر */
export function dateFromRequest(req: Request): Date {
  const raw = String(req.body?.date ?? req.headers['x-date'] ?? req.query?.date ?? '');
  const s = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : todayInTz();
  return toDate(s);
}

/**
 * حارس الحضور الإلزامي: يمنع المندوب من تنفيذ العمليات المحمية
 * (حفظ/إرسال الخطة الأسبوعية، تقارير الزيارات، طلبات التسعير RFQ)
 * ما لم يكن قد سجّل حضوراً اليوم ولم ينصرف بعد.
 * المدراء والنواب لا يخضعون لهذا الشرط.
 */
export function requireAttendance() {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return next();
    if (req.user.role !== 'REPRESENTATIVE') return next();

    try {
      const date = dateFromRequest(req);
      const record = await prisma.legacyAttendance.findUnique({
        where: { userId_date: { userId: req.user.id, date } },
      });
      if (!record || record.status !== 'CHECKED_IN') {
        console.error('[attendance-guard] blocked', {
          userId: req.user.id,
          role: req.user.role,
          date: date.toISOString().slice(0, 10),
          method: req.method,
          path: req.path,
        });
        return res.status(403).json({ error: 'attendance_required', message: 'يجب تسجيل الحضور أولاً (Check-in) قبل حفظ أو إرسال الخطة الأسبوعية', date: date.toISOString().slice(0, 10) });
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
