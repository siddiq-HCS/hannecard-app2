import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { prisma } from '../lib/prisma.js';
import { config } from '../config.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole, requirePageAccess } from '../middleware/rbac.js';
import { captureLocation } from '../middleware/location.js';
import { requireAttendance } from '../middleware/attendance.js';
import { logActivity } from '../lib/activity.js';
import type { PlanDayName, WeeklyPlanStatus } from '@prisma/client';

const router = Router();

const DAYS: PlanDayName[] = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY'];
const DAY_INDEX: Record<string, number> = { SUNDAY: 0, MONDAY: 1, TUESDAY: 2, WEDNESDAY: 3, THURSDAY: 4 };

const CATEGORIES = ['PLASTICS', 'PRINTING', 'PACKAGING', 'WOOD', 'METAL', 'PAPER', 'TISSUES', 'TEXTILES', 'FOOD_INDUSTRY', 'OTHERS'] as const;

const MIN_VISITS_TO_SUBMIT = 30;

function toDate(s: string) {
  return new Date(`${s}T00:00:00Z`);
}

function addDays(d: Date, n: number) {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + n);
  return out;
}

// تاريخ اليوم الفعلي (YYYY-MM-DD) داخل الأسبوع: الأحد = startDate، وكل يوم يليه +1
function dayDate(start: Date, dayName: string) {
  const idx = DAY_INDEX[dayName];
  if (idx === undefined) return start.toISOString().slice(0, 10);
  return addDays(start, idx).toISOString().slice(0, 10);
}

// إرفاق تاريخ كل يوم ببيانات الخطة في الردود
function withDayDates<T extends { startDate: Date; days: Array<{ dayName: string }> }>(plan: T) {
  return { ...plan, days: plan.days.map((d) => ({ ...d, date: dayDate(plan.startDate, d.dayName) })) };
}

// رقم الأسبوع ISO من تاريخ معيّن (للتوافق القديم عند إرسال startDate)
function isoWeekInfo(start: Date) {
  const date = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const dayNum = (date.getUTCDay() + 6) % 7; // الإثنين=0 .. الأحد=6
  date.setUTCDate(date.getUTCDate() - dayNum + 3); // الخميس من نفس الأسبوع
  const year = date.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(year, 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  const weekNumber = 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000));
  return { year, weekNumber };
}

// الأحد (بداية أسبوع العمل) من سنة ISO + رقم أسبوع
function sundayOfIsoWeek(year: number, week: number) {
  const monday = new Date(Date.UTC(year, 0, 4));
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7) + 1); // إثنين الأسبوع الأول
  monday.setUTCDate(monday.getUTCDate() + (week - 1) * 7);
  monday.setUTCDate(monday.getUTCDate() - 1); // الأحد الذي يسبق الإثنين
  return monday;
}

// الرقم التسلسلي التالي: WP-0001 تصاعدياً
async function nextPlanSerial() {
  const rows = await prisma.$queryRaw<{ n: number }[]>`SELECT nextval('weekly_plan_number_seq') AS n`;
  const n = rows[0]?.n ?? 1;
  return `WP-${String(n).padStart(4, '0')}`;
}

const visitSchema = z.object({
  id: z.string().optional(),
  companyName: z.string().max(300),
  contactPerson: z.string().max(300).optional().default(''),
  phone: z.string().max(100).optional().default(''),
  address: z.string().max(500).optional().default(''),
  purpose: z.string().max(500).optional().default(''),
  companyCategory: z.enum(CATEGORIES),
  categoryOther: z.string().max(300).optional().default(''),
  notes: z.string().max(2000).optional().default(''),
});

const daySchema = z.object({
  dayName: z.enum(DAYS),
  visits: z.array(visitSchema).max(50),
});

const createSchema = z
  .object({
    startDate: z.string().optional(), // YYYY-MM-DD (الأحد) — للتوافق القديم
    year: z.coerce.number().int().min(2000).max(2100).optional(),
    weekNumber: z.coerce.number().int().min(1).max(53).optional(),
  })
  .refine((d) => d.startDate !== undefined || (d.year !== undefined && d.weekNumber !== undefined), {
    message: 'startDate or year+weekNumber required',
  });

const updateSchema = z
  .object({
    startDate: z.string().optional(), // YYYY-MM-DD (الأحد) — للتوافق القديم
    year: z.coerce.number().int().min(2000).max(2100).optional(),
    weekNumber: z.coerce.number().int().min(1).max(53).optional(),
    days: z.array(daySchema).optional(),
  })
  .refine((d) => d.startDate !== undefined || d.year === undefined || d.weekNumber === undefined || (d.year !== undefined && d.weekNumber !== undefined), {
    message: 'year requires weekNumber',
  });

interface EchoVisit {
  id: string;
  planDayId: string;
  companyName: string;
  contactPerson: string;
  phone: string;
  address: string;
  purpose: string;
  companyCategory: string;
  categoryOther: string;
  notes: string;
  imageUrl: string | null;
  createdAt: Date;
}

async function canManagePlan(planId: string, userId: string, isManager: boolean) {
  return prisma.weeklyPlan.findFirst({
    where: isManager ? { id: planId } : { id: planId, userId },
  });
}

// قائمة الخطط: المندوب يرى خططه، المدير يرى الكل مع فلاتر repId/status/date
router.get(
  '/',
  authenticate,
  requireRole('SALES_MANAGER', 'DEPUTY_SALES_MANAGER', 'REPRESENTATIVE'),
  requirePageAccess('PAGE_WEEKLY_PLANS_ACCESS'),
  async (req, res) => {
    const isManager = req.user.role !== 'REPRESENTATIVE';
    const repId = req.query.repId as string | undefined;
    const status = req.query.status as string | undefined;
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;

    const where: Record<string, unknown> = {};
    if (isManager) {
      if (repId) where.userId = repId;
    } else {
      where.userId = req.user.id;
    }
    if (status) where.status = status as WeeklyPlanStatus;
    if (from || to) {
      where.startDate = {};
      if (from) (where.startDate as Record<string, unknown>).gte = toDate(from);
      if (to) (where.startDate as Record<string, unknown>).lte = toDate(to);
    }

    const plans = await prisma.weeklyPlan.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, phone: true } },
        days: {
          include: {
            visits: {
              orderBy: { createdAt: 'asc' },
              include: { documents: { select: { id: true, fileName: true, mimeType: true, size: true, createdAt: true, uploadedBy: true } } },
            },
          },
        },
      },
      orderBy: { startDate: 'desc' },
    });
    res.json(plans.map(withDayDates));
  },
);

// تفاصيل خطة واحدة مع الأيام والزيارات مرتبة
router.get(
  '/:id',
  authenticate,
  requireRole('SALES_MANAGER', 'DEPUTY_SALES_MANAGER', 'REPRESENTATIVE'),
  async (req, res) => {
    const isManager = req.user.role !== 'REPRESENTATIVE';
    const plan = await prisma.weeklyPlan.findFirst({
      where: isManager ? { id: String(req.params.id) } : { id: String(req.params.id), userId: req.user.id },
      include: {
        user: { select: { id: true, name: true, phone: true } },
        days: {
          include: {
            visits: {
              orderBy: { createdAt: 'asc' },
              include: { documents: { select: { id: true, fileName: true, mimeType: true, size: true, createdAt: true, uploadedBy: true } } },
            },
          },
        },
      },
    });
    if (!plan) return res.status(404).json({ error: 'not_found', message: 'لم يتم العثور على الخطة المطلوبة' });
    const sortedDays = [...plan.days].sort((a, b) => DAY_INDEX[a.dayName] - DAY_INDEX[b.dayName]);
    res.json(withDayDates({ ...plan, days: sortedDays }));
  },
);

// إنشاء خطة جديدة مع الأيام الخمسة الثابتة (الأحد → الخميس)
router.post(
  '/',
  authenticate,
  requireRole('SALES_MANAGER', 'DEPUTY_SALES_MANAGER', 'REPRESENTATIVE'),
  requireAttendance(),
  captureLocation('GENERIC_ACTION'),
  async (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'invalid_input', message: 'بعض البيانات غير صحيحة، تحقق من الحقول (السنة، رقم الأسبوع، الفئة) ثم أعد المحاولة', details: parsed.error.flatten() });
    }

    const { start, end, year, weekNumber } = parsed.data.startDate
      ? (() => {
          const s = toDate(parsed.data.startDate);
          const info = isoWeekInfo(s);
          return { start: s, end: addDays(s, 4), year: info.year, weekNumber: info.weekNumber };
        })()
      : (() => {
          const s = sundayOfIsoWeek(parsed.data.year!, parsed.data.weekNumber!);
          return { start: s, end: addDays(s, 4), year: parsed.data.year!, weekNumber: parsed.data.weekNumber! };
        })();

    const serialNumber = await nextPlanSerial();

    const plan = await prisma.weeklyPlan.create({
      data: {
        userId: req.user.id,
        year,
        weekNumber,
        serialNumber,
        startDate: start,
        endDate: end,
        days: { create: DAYS.map((d) => ({ dayName: d })) },
      },
      include: {
        user: { select: { id: true, name: true, phone: true } },
        days: {
          include: {
            visits: {
              orderBy: { createdAt: 'asc' },
              include: { documents: { select: { id: true, fileName: true, mimeType: true, size: true, createdAt: true, uploadedBy: true } } },
            },
          },
        },
      },
    });

    await logActivity(plan.userId, 'weeklyPlan.create', { planId: plan.id, serialNumber: plan.serialNumber }, req.user.name);
    res.status(201).json(withDayDates({ ...plan, days: [...plan.days].sort((a, b) => DAY_INDEX[a.dayName] - DAY_INDEX[b.dayName]) }));
  },
);

// تحديث/مزامنة الخطة (حفظ مسودة) — يحافظ على معرّفات الزيارات حتى لا تنكسر روابط الصور
router.put(
  '/:id',
  authenticate,
  requireRole('SALES_MANAGER', 'DEPUTY_SALES_MANAGER', 'REPRESENTATIVE'),
  requireAttendance(),
  captureLocation('GENERIC_ACTION'),
  async (req, res) => {
    const isManager = req.user.role !== 'REPRESENTATIVE';
    const plan = await canManagePlan(String(req.params.id), req.user.id, isManager);
    if (!plan) return res.status(404).json({ error: 'not_found', message: 'لم يتم العثور على الخطة المطلوبة' });

    // الخطة قابلة للتعديل فقط وهي مسودة؛ بعد الإرسال/الاعتماد تصبح للقراءة فقط
    if (plan.status !== 'DRAFT') {
      return res.status(400).json({ error: 'not_editable', message: 'لا يمكن تعديل هذه الخطة لأنها أُرسلت أو اعتُمدت بالفعل', status: plan.status });
    }

    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'invalid_input', message: 'بعض البيانات غير صحيحة، تحقق من الحقول (السنة، رقم الأسبوع، الفئة) ثم أعد المحاولة', details: parsed.error.flatten() });
    }

    const data: Record<string, unknown> = {};
    if (parsed.data.startDate !== undefined || (parsed.data.year !== undefined && parsed.data.weekNumber !== undefined)) {
      const start = parsed.data.startDate !== undefined ? toDate(parsed.data.startDate) : sundayOfIsoWeek(parsed.data.year!, parsed.data.weekNumber!);
      const info = parsed.data.startDate !== undefined ? isoWeekInfo(start) : { year: parsed.data.year!, weekNumber: parsed.data.weekNumber! };
      data.startDate = start;
      data.endDate = addDays(start, 4);
      data.year = info.year;
      data.weekNumber = info.weekNumber;
    }

    const echoDays: {
      id: string;
      planId: string;
      dayName: string;
      visits: EchoVisit[];
    }[] = [];

    if (parsed.data.days) {
      const existingDays = await prisma.planDay.findMany({ where: { planId: plan.id }, include: { visits: true } });
      const dayBy = new Map(existingDays.map((d) => [d.dayName, d]));
      let tick = Date.now();

      for (const day of parsed.data.days) {
        let dayRow = dayBy.get(day.dayName);
        if (!dayRow) {
          dayRow = await prisma.planDay.create({
            data: { planId: plan.id, dayName: day.dayName },
            include: { visits: true },
          });
          dayBy.set(day.dayName, dayRow);
        }

        const existingVisits = dayRow.visits ?? [];
        const existingById = new Map(existingVisits.map((v) => [v.id, v]));
        const incomingIds = new Set(day.visits.filter((v) => v.id).map((v) => v.id as string));

        for (const v of existingVisits) {
          if (!incomingIds.has(v.id)) {
            await prisma.planVisit.delete({ where: { id: v.id } });
          }
        }

        const echoVisits: EchoVisit[] = [];

        for (const v of day.visits) {
          const payload = {
            companyName: v.companyName,
            contactPerson: v.contactPerson,
            phone: v.phone,
            address: v.address,
            purpose: v.purpose,
            companyCategory: v.companyCategory,
            categoryOther: v.categoryOther,
            notes: v.notes,
          };
          let row;
          if (v.id && existingById.has(v.id)) {
            row = await prisma.planVisit.update({ where: { id: v.id }, data: payload });
          } else {
            row = await prisma.planVisit.create({
              data: { ...payload, planDayId: dayRow.id, createdAt: new Date(tick++) },
            });
          }
          echoVisits.push({
            id: row.id,
            planDayId: row.planDayId,
            companyName: row.companyName,
            contactPerson: row.contactPerson,
            phone: row.phone,
            address: row.address,
            purpose: row.purpose,
            companyCategory: row.companyCategory,
            categoryOther: row.categoryOther,
            notes: row.notes,
            imageUrl: row.imageUrl,
            createdAt: row.createdAt,
          });
        }

        echoDays.push({ id: dayRow.id, planId: plan.id, dayName: day.dayName, visits: echoVisits });
      }
    }

    const updated = await prisma.weeklyPlan.update({
      where: { id: plan.id },
      data,
    });

    const user = await prisma.user.findUnique({
      where: { id: plan.userId },
      select: { id: true, name: true, phone: true },
    });

    let days = echoDays;
    if (!days.length) {
      const loaded = await prisma.planDay.findMany({
        where: { planId: plan.id },
        include: { visits: { orderBy: { createdAt: 'asc' } } },
      });
      days = loaded.map((d) => ({
        id: d.id,
        planId: plan.id,
        dayName: d.dayName,
        visits: d.visits.map((v) => ({
          id: v.id,
          planDayId: v.planDayId,
          companyName: v.companyName,
          contactPerson: v.contactPerson,
          phone: v.phone,
          address: v.address,
          purpose: v.purpose,
          companyCategory: v.companyCategory,
          categoryOther: v.categoryOther,
          notes: v.notes,
          imageUrl: v.imageUrl,
          createdAt: v.createdAt,
        })),
      }));
    }

    await logActivity(plan.userId, 'weeklyPlan.update', { planId: plan.id }, req.user.name);
    res.json(withDayDates({ ...updated, user, days }));
  },
);

// إرسال الخطة (التحويل من مسودة إلى مرسلة)
router.post(
  '/:id/submit',
  authenticate,
  requireRole('SALES_MANAGER', 'DEPUTY_SALES_MANAGER', 'REPRESENTATIVE'),
  requireAttendance(),
  captureLocation('GENERIC_ACTION'),
  async (req, res) => {
    const isManager = req.user.role !== 'REPRESENTATIVE';
    const plan = await canManagePlan(String(req.params.id), req.user.id, isManager);
    if (!plan) return res.status(404).json({ error: 'not_found', message: 'لم يتم العثور على الخطة المطلوبة' });

    // الشركة/العميل إجباري لكل زيارة عند الإرسال
    const visits = await prisma.planVisit.findMany({
      where: { day: { planId: plan.id } },
      select: { id: true, companyName: true },
    });
    const missing = visits.filter((v) => !v.companyName.trim());
    if (missing.length) {
      return res.status(400).json({ error: 'missing_company_name', message: 'أدخل اسم الشركة/العميل لكل زيارة قبل الإرسال', count: missing.length });
    }

    // حد أدنى 30 زيارة لإرسال الخطة
    if (visits.length < MIN_VISITS_TO_SUBMIT) {
      return res.status(400).json({ error: 'min_visits', message: `يجب ألا يقل عدد الزيارات عن ${MIN_VISITS_TO_SUBMIT} زيارة قبل الإرسال (العدد الحالي: ${visits.length})`, count: visits.length, min: MIN_VISITS_TO_SUBMIT });
    }

    const updated = await prisma.weeklyPlan.update({
      where: { id: plan.id },
      data: { status: 'SUBMITTED', submittedAt: new Date() },
    });
    await logActivity(plan.userId, 'weeklyPlan.submit', { planId: plan.id }, req.user.name);
    res.json(updated);
  },
);

// اعتماد الخطة (المدير فقط)
router.post(
  '/:id/approve',
  authenticate,
  requireRole('SALES_MANAGER', 'DEPUTY_SALES_MANAGER'),
  async (req, res) => {
    const plan = await prisma.weeklyPlan.findFirst({ where: { id: String(req.params.id) } });
    if (!plan) return res.status(404).json({ error: 'not_found' });
    const updated = await prisma.weeklyPlan.update({ where: { id: plan.id }, data: { status: 'APPROVED' } });
    await logActivity(plan.userId, 'weeklyPlan.approve', { planId: plan.id }, req.user.name);
    res.json(updated);
  },
);

// حذف خطة (صاحبها أو الإدارة)
router.delete('/:id', authenticate, requireRole('SALES_MANAGER', 'DEPUTY_SALES_MANAGER', 'REPRESENTATIVE'), async (req, res) => {
  const isManager = req.user.role !== 'REPRESENTATIVE';
  const plan = await canManagePlan(String(req.params.id), req.user.id, isManager);
  if (!plan) return res.status(404).json({ error: 'not_found' });

  await prisma.weeklyPlan.delete({ where: { id: plan.id } });
  await logActivity(plan.userId, 'weeklyPlan.delete', { planId: plan.id }, req.user.name);
  res.json({ ok: true });
});

// ======================= رفع وعرض صور الزيارات =======================

fs.mkdirSync(config.uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, config.uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('only_images'));
    cb(null, true);
  },
});

// POST /api/weekly-plans/visits/:visitId/image  (field name: 'image')
router.post(
  '/visits/:visitId/image',
  authenticate,
  requireRole('SALES_MANAGER', 'DEPUTY_SALES_MANAGER', 'REPRESENTATIVE'),
  captureLocation('ATTACHMENT_UPLOAD'),
  upload.single('image'),
  async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'missing_file' });
    const isManager = req.user.role !== 'REPRESENTATIVE';
    const visit = await prisma.planVisit.findFirst({
      where: isManager
        ? { id: String(req.params.visitId) }
        : { id: String(req.params.visitId), day: { plan: { userId: req.user.id } } },
    });
    if (!visit) {
      fs.unlink(path.join(config.uploadDir, req.file.filename), () => undefined);
      return res.status(404).json({ error: 'not_found' });
    }

    const updated = await prisma.planVisit.update({
      where: { id: visit.id },
      data: { imageUrl: req.file.filename },
    });
    await logActivity(req.user.id, 'weeklyPlan.visitImage', { visitId: visit.id, planId: visit.id }, req.user.name);
    res.json(updated);
  },
);

// GET /api/weekly-plans/visits/:visitId/image
router.get(
  '/visits/:visitId/image',
  authenticate,
  requireRole('SALES_MANAGER', 'DEPUTY_SALES_MANAGER', 'REPRESENTATIVE'),
  async (req, res) => {
    const isManager = req.user.role !== 'REPRESENTATIVE';
    const visit = await prisma.planVisit.findFirst({
      where: isManager
        ? { id: String(req.params.visitId) }
        : { id: String(req.params.visitId), day: { plan: { userId: req.user.id } } },
    });
    if (!visit || !visit.imageUrl) return res.status(404).json({ error: 'not_found' });

    const filePath = path.resolve(config.uploadDir, visit.imageUrl);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'file_missing' });
    res.sendFile(filePath);
  },
);

export const weeklyPlansRouter = router;
