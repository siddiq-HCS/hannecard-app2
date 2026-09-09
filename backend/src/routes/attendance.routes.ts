import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';

const router = Router();

// المملكة العربية السعودية توقيت ثابت UTC+3 (بدون توقيت صيفي)
const TZ_OFFSET_MS = 3 * 60 * 60 * 1000;

/** تاريخ اليوم بمنطقة الرياض كـ YYYY-MM-DD */
function todayInRiyadh(): string {
  return new Date(Date.now() + TZ_OFFSET_MS).toISOString().slice(0, 10);
}

/** تحويل YYYY-MM-DD إلى منتصف اليوم UTC (المخزّن في القاعدة) */
function toDayStart(value: string): Date {
  return new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
}

const checkInSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  accuracy: z.number().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}/).optional(),
});

/**
 * تسجيل الحضور — مرة واحدة فقط في اليوم.
 * لا يوجد تسجيل انصراف إطلاقاً؛ وجود السجل يعني أن المستخدم حضر في ذلك اليوم.
 * في حالة التكرار يُعاد 409 مع وصف already_checked_in.
 */
router.post(
  '/check-in',
  authenticate,
  requireRole('SALES_MANAGER', 'REPRESENTATIVE'),
  async (req, res) => {
    const parsed = checkInSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_input', details: parsed.error.flatten() });

    const day = toDayStart(parsed.data.date ?? todayInRiyadh());
    const existing = await prisma.attendance.findUnique({
      where: { userId_date: { userId: req.user.id, date: day } },
    });
    if (existing) {
      return res.status(409).json({ error: 'already_checked_in', attendance: existing });
    }

    const attendance = await prisma.attendance.create({
      data: {
        userId: req.user.id,
        date: day,
        checkInTime: new Date(),
        lat: parsed.data.lat,
        lng: parsed.data.lng,
        accuracy: parsed.data.accuracy,
      },
    });
    res.status(201).json(attendance);
  },
);

// حالة اليوم للمستخدم: السجل أو null
router.get(
  '/today',
  authenticate,
  requireRole('SALES_MANAGER', 'REPRESENTATIVE'),
  async (req, res) => {
    const day = toDayStart(typeof req.query.date === 'string' ? req.query.date : todayInRiyadh());
    const attendance = await prisma.attendance.findUnique({
      where: { userId_date: { userId: req.user.id, date: day } },
    });
    res.json(attendance ?? null);
  },
);

// سجل الحضور: زيارات المستخدم الحالي، أو مدير يحدد userId
router.get(
  '/',
  authenticate,
  requireRole('SALES_MANAGER', 'REPRESENTATIVE'),
  async (req, res) => {
    const isManager = req.user.role !== 'REPRESENTATIVE';
    const userId = isManager ? (req.query.userId as string | undefined) : req.user.id;

    const records = await prisma.attendance.findMany({
      where: userId ? { userId } : {},
      orderBy: { date: 'desc' },
      take: 100,
    });
    res.json(records);
  },
);

export const attendanceRouter = router;