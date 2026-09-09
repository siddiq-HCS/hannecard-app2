import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma.js';

function toDate(s: string) {
  return new Date(`${s}T00:00:00Z`);
}

/** تاريخ اليوم الفعلي (YYYY-MM-DD) بتوقيت القاهرة — يُستخدم عند غياب التاريخ من العميل */
export function todayInTz(): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Cairo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
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
        return res.status(403).json({ error: 'attendance_required', message: 'يجب تسجيل الحضور أولاً (Check-in) قبل حفظ أو إرسال الخطة الأسبوعية', date: date.toISOString().slice(0, 10) });
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
