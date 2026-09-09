import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole, requirePageAccess } from '../middleware/rbac.js';

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

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// شكل الاستجابة الموحّد: سجل الحضور/الانصراف القديم (status + checkIn/checkOut...)
// مع حقول aliases (lat/lng/accuracy) لبقاء التوافق مع القُرّاء الجدد.
function serializeLegacy(rec: {
  id: string;
  userId: string;
  date: Date;
  checkInTime: Date | null;
  checkInLat: number | null;
  checkInLng: number | null;
  checkInAccuracy: number | null;
  checkOutTime: Date | null;
  checkOutLat: number | null;
  checkOutLng: number | null;
  checkOutAccuracy: number | null;
  status: 'CHECKED_IN' | 'CHECKED_OUT';
}) {
  return {
    id: rec.id,
    userId: rec.userId,
    date: fmtDate(rec.date),
    checkInTime: rec.checkInTime,
    checkInLat: rec.checkInLat,
    checkInLng: rec.checkInLng,
    checkInAccuracy: rec.checkInAccuracy,
    checkOutTime: rec.checkOutTime,
    checkOutLat: rec.checkOutLat,
    checkOutLng: rec.checkOutLng,
    checkOutAccuracy: rec.checkOutAccuracy,
    status: rec.status,
    lat: rec.checkInLat,
    lng: rec.checkInLng,
    accuracy: rec.checkInAccuracy,
  };
}

const checkInSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  accuracy: z.number().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}/).optional(),
});

const checkOutSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  accuracy: z.number().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}/).optional(),
});

/**
 * تسجيل الحضور — مرة واحدة فقط في اليوم.
 * يكتب في جدول الحضور الجديد (Attendance) وفي نفس الوقت يضمن وجود سجل
 * LegacyAttendance بحالة CHECKED_IN حتى يمرّ حارس الحضور (requireAttendance)
 * عند حفظ/إرسال الخطط الأسبوعية وطلبات RFQ، ولتظهر للمدير في لوحة الإدارة.
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

    if (!existing) {
      await prisma.attendance.create({
        data: {
          userId: req.user.id,
          date: day,
          checkInTime: new Date(),
          lat: parsed.data.lat,
          lng: parsed.data.lng,
          accuracy: parsed.data.accuracy,
        },
      });
    }

    // ضمان وجود سجل الحضور/الانصراف القديم بحالة CHECKED_IN
    let legacy = await prisma.legacyAttendance.findUnique({
      where: { userId_date: { userId: req.user.id, date: day } },
    });
    if (!legacy) {
      legacy = await prisma.legacyAttendance.create({
        data: {
          userId: req.user.id,
          date: day,
          checkInTime: new Date(),
          checkInLat: parsed.data.lat,
          checkInLng: parsed.data.lng,
          checkInAccuracy: parsed.data.accuracy,
          status: 'CHECKED_IN',
        },
      });
    }

    const body = serializeLegacy(legacy);
    if (existing) return res.status(409).json({ error: 'already_checked_in', attendance: body });
    res.status(201).json(body);
  },
);

// حالة اليوم للمستخدم بصيغة تطبيق المندوب: { attendance: سجل | null }
router.get(
  '/status',
  authenticate,
  requireRole('SALES_MANAGER', 'REPRESENTATIVE'),
  async (req, res) => {
    const day = toDayStart(typeof req.query.date === 'string' ? req.query.date : todayInRiyadh());
    const legacy = await prisma.legacyAttendance.findUnique({
      where: { userId_date: { userId: req.user.id, date: day } },
    });
    res.json({ attendance: legacy ? serializeLegacy(legacy) : null });
  },
);

// سجل الحضور (تاريخ اليوم المحدد أو آخر سجل متاح) بصيغة تطبيق المندوب
router.get(
  '/history',
  authenticate,
  requireRole('SALES_MANAGER', 'REPRESENTATIVE'),
  async (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 100);
    const records = await prisma.legacyAttendance.findMany({
      where: { userId: req.user.id },
      orderBy: { date: 'desc' },
      take: limit,
    });
    res.json(records.map(serializeLegacy));
  },
);

// تسجيل الانصراف (يسجّل في سجل الحضور/الانصراف القديم بحالة CHECKED_OUT)
router.post(
  '/check-out',
  authenticate,
  requireRole('SALES_MANAGER', 'REPRESENTATIVE'),
  async (req, res) => {
    const parsed = checkOutSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_input', details: parsed.error.flatten() });

    const day = toDayStart(parsed.data.date ?? todayInRiyadh());
    const legacy = await prisma.legacyAttendance.findUnique({
      where: { userId_date: { userId: req.user.id, date: day } },
    });
    if (!legacy || legacy.status !== 'CHECKED_IN') {
      return res.status(400).json({ error: 'not_checked_in', message: 'لم يتم تسجيل الحضور اليوم' });
    }

    const updated = await prisma.legacyAttendance.update({
      where: { id: legacy.id },
      data: {
        checkOutTime: new Date(),
        checkOutLat: parsed.data.lat,
        checkOutLng: parsed.data.lng,
        checkOutAccuracy: parsed.data.accuracy,
        status: 'CHECKED_OUT',
      },
    });

    res.json(serializeLegacy(updated));
  },
);

// حالة اليوم للمستخدم (جدول الحضور الجديد): السجل أو null
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

// سجل الحضور الجديد: زيارات المستخدم الحالي، أو مدير يحدد userId
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

// سجل الحضور والانصراف للمدراء (لوحة الإدارة): فلترة بالتاريخ والمندوب من جدول الحضور القديم (attendances)
router.get(
  '/manage',
  authenticate,
  requireRole('SALES_MANAGER', 'DEPUTY_SALES_MANAGER'),
  requirePageAccess('PAGE_ATTENDANCE_ACCESS'),
  async (req, res) => {
    const dateStr = (req.query.date as string) || todayInRiyadh();
    const date = /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? toDayStart(dateStr) : toDayStart(todayInRiyadh());
    const repId = (req.query.repId as string) || undefined;

    const records = await prisma.legacyAttendance.findMany({
      where: { date, ...(repId ? { userId: repId } : {}) },
      include: { user: { select: { id: true, name: true, phone: true } } },
      orderBy: [{ userId: 'asc' }, { date: 'desc' }],
    });

    res.json({ date: date.toISOString().slice(0, 10), records });
  },
);

export const attendanceRouter = router;