import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '../lib/prisma.js';
import { Prisma } from '@prisma/client';
import { authenticate } from '../middleware/auth.js';
import { requireRole, requirePageAccess } from '../middleware/rbac.js';
import { captureLocation } from '../middleware/location.js';
import { requireAttendance } from '../middleware/attendance.js';
import { logActivity } from '../lib/activity.js';
import { emitRfqUpdated } from '../lib/socket.js';
import { config } from '../config.js';

const router = Router();

const workEnum = z.enum(['COMPLETE_MANUFACTURING', 'MANUFACTURING', 'RE_COVERING', 'RE_GRINDING', 'REPAIR', 'NORMAL', 'OTHERS']);
const requiredWorkSchema = z.union([workEnum, z.array(workEnum)]).transform((v) => (Array.isArray(v) ? v : [v]));

const itemSchema = z.object({
  description: z.string().min(1).max(500),
  quantity: z.string().max(100).optional().or(z.number()).optional(),
  finishingType: z.enum(['NORMAL_CYLINDRICAL', 'PARABOLIC_CROWNING', 'GROOVING', 'OTHERS']),
  finishingTypeOther: z.string().max(300).optional(),
  requiredWork: requiredWorkSchema,
  requiredWorkOther: z.string().max(300).optional(),
  workEnvironment: z.enum(['CHEMICALS', 'TEMPERATURE', 'PRESSURE', 'OTHERS', 'NORMAL']),
  workEnvironmentOther: z.string().max(500).optional(),
  // قياسات الرول (اختيارية)
  rollMaterialId: z.string().optional(),
  outerDiameter: z.number().positive().optional(),
  innerDiameter: z.number().positive().optional(),
  rollLength: z.number().positive().optional(),
  calculatedPrice: z.number().optional(),
});

const rfqSchema = z.object({
  clientName: z.string().min(1).max(200),
  contactName: z.string().max(200).default(''),
  contactPhone: z.string().max(50).default(''),
  // إسناد الطلب إلى مندوب معيّن (المدير فقط عند الإنشاء/التعديل)
  userId: z.string().optional(),
  items: z.array(itemSchema).min(1).max(50),
  requiredTime: z.enum(['TOP_URGENT', 'URGENT', 'NORMAL', 'OTHERS']),
  requiredTimeOther: z.string().max(300).optional(),
  workOrderDate: z.string(), // YYYY-MM-DD
  paymentTerms: z.enum(['CASH', 'CREDIT']),
});

function toDate(s: string) {
  return new Date(`${s}T00:00:00Z`);
}

// التحقق من صحة الإسناد: مندوب موجود فعلاً (المدير فقط يستطيع الإسناد)
async function resolveOwnerId(userId: string | undefined, isManager: boolean, fallback: string): Promise<{ ownerId: string; error?: { status: number; json: unknown } }> {
  if (!isManager || !userId) return { ownerId: fallback };
  const rep = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true } });
  if (!rep || rep.role !== 'REPRESENTATIVE') {
    return { ownerId: fallback, error: { status: 400, json: { error: 'invalid_assignee', message: 'المندوب المحدد غير موجود أو غير صالح' } } };
  }
  return { ownerId: rep.id };
}

async function nextRfqSerial() {
  const rows = await prisma.$queryRaw<{ n: number }[]>`SELECT nextval('rfq_number_seq') AS n`;
  const n = rows[0]?.n ?? 1;
  return `RFQ-${String(n).padStart(4, '0')}`;
}

// نافذة منع التكرار: تجاهل طلباً مطابقاً تماماً لنفس المستخدم خلال آخر 30 ثانية
const DUPLICATE_WINDOW_MS = 30 * 1000;

function normalizeItemList(its: { description: string; quantity?: string | number | null; finishingType: string; finishingTypeOther?: string | null; requiredWork: string | string[]; requiredWorkOther?: string | null; workEnvironment: string; workEnvironmentOther?: string | null }[]) {
  return JSON.stringify(
    (its ?? []).map((i) => [
      i.description.trim(),
      String(i.quantity ?? '').trim(),
      i.finishingType,
      (i.finishingTypeOther ?? '').trim(),
      Array.isArray(i.requiredWork) ? i.requiredWork.join(',') : i.requiredWork,
      (i.requiredWorkOther ?? '').trim(),
      i.workEnvironment,
      (i.workEnvironmentOther ?? '').trim(),
    ]),
  );
}

function rfqFingerprint(r: { clientName: string; contactName: string; contactPhone: string; items: unknown; requiredTime: string; requiredTimeOther: string | null; workOrderDate: Date; paymentTerms: string }) {
  return JSON.stringify([
    r.clientName.trim(),
    r.contactName.trim(),
    r.contactPhone.trim(),
    normalizeItemList(r.items as { description: string; quantity?: string | number | null; finishingType: string; finishingTypeOther?: string | null; requiredWork: string | string[]; requiredWorkOther?: string | null; workEnvironment: string; workEnvironmentOther?: string | null }[]),
    r.requiredTime,
    (r.requiredTimeOther ?? '').trim(),
    r.workOrderDate.toISOString(),
    r.paymentTerms,
  ]);
}

/** تطبيع backward compat: تحويل requiredWork من نص قديم إلى مصفوفة */
function normalizeRequiredWork(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === 'string' && v) return [v];
  return ['NORMAL'];
}

// تضمين موحّد لردود طلبات التسعير (يشمل تعليقات الإدارة مع كاتبها)
const rfqInclude = Prisma.validator<Prisma.RfqInclude>()({
  user: { select: { id: true, name: true, phone: true } },
  documents: { select: { id: true, fileName: true, mimeType: true, size: true, createdAt: true, uploadedBy: true } },
  comments: {
    include: { author: { select: { id: true, name: true, role: true } } },
    orderBy: { createdAt: 'asc' },
  },
});

const commentSchema = z.object({ text: z.string().min(1).max(2000) });

// قائمة طلبات التسعير: المندوب يرى طلباته، المدير يرى الكل مع فلاتر repId/date
router.get(
  '/',
  authenticate,
  requireRole('SALES_MANAGER', 'DEPUTY_SALES_MANAGER', 'REPRESENTATIVE'),
  requirePageAccess('PAGE_RFQS_ACCESS'),
  async (req, res) => {
    const isManager = req.user.role !== 'REPRESENTATIVE';
    const repId = req.query.repId as string | undefined;
    const date = req.query.date as string | undefined;
    const pricingStatus = req.query.pricingStatus as string | undefined;

    const where: Record<string, unknown> = {};
    if (isManager) {
      if (repId) where.userId = repId;
    } else {
      where.userId = req.user.id;
    }
    if (pricingStatus === 'PRICED' || pricingStatus === 'UNPRICED' || pricingStatus === 'APPROVED') where.pricingStatus = pricingStatus;
    if (date) {
      const day = toDate(date);
      const next = new Date(day);
      next.setUTCDate(next.getUTCDate() + 1);
      where.createdAt = { gte: day, lt: next };
    }

    const rfqs = await prisma.rfq.findMany({
      where,
      include: rfqInclude,
      orderBy: { createdAt: 'desc' },
    });
    // backward compat: normalize requiredWork from old string to array
    const normalized = rfqs.map((r) => ({
      ...r,
      items: Array.isArray(r.items)
        ? (r.items as Record<string, unknown>[]).map((it) => ({
            ...it,
            requiredWork: normalizeRequiredWork(it.requiredWork),
          }))
        : r.items,
    }));
    res.json(normalized);
  },
);

// إنشاء طلب تسعير من المندوب
router.post(
  '/',
  authenticate,
  requireRole('SALES_MANAGER', 'DEPUTY_SALES_MANAGER', 'REPRESENTATIVE'),
  requireAttendance(),
  captureLocation('GENERIC_ACTION'),
  async (req, res) => {
    const parsed = rfqSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_input', details: parsed.error.flatten() });

    // منع التكرار: طلب مطابق تماماً من نفس المستخدم خلال آخر 30 ثانية
    const cutoff = new Date(Date.now() - DUPLICATE_WINDOW_MS);
    const recent = await prisma.rfq.findMany({
      where: { userId: req.user.id, createdAt: { gte: cutoff } },
      select: {
        id: true,
        clientName: true,
        contactName: true,
        contactPhone: true,
        items: true,
        requiredTime: true,
        requiredTimeOther: true,
        workOrderDate: true,
        paymentTerms: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    const candidate = rfqFingerprint({
      clientName: parsed.data.clientName,
      contactName: parsed.data.contactName,
      contactPhone: parsed.data.contactPhone,
      items: parsed.data.items,
      requiredTime: parsed.data.requiredTime,
      requiredTimeOther: parsed.data.requiredTimeOther ?? null,
      workOrderDate: toDate(parsed.data.workOrderDate),
      paymentTerms: parsed.data.paymentTerms,
    });
    const duplicate = recent.find((r) => rfqFingerprint(r as Parameters<typeof rfqFingerprint>[0]) === candidate);
    if (duplicate) {
      return res.status(409).json({ error: 'duplicate_rfq', rfqId: duplicate.id });
    }

    const serialNumber = await nextRfqSerial();

    const isManager = req.user.role !== 'REPRESENTATIVE';
    const resolved = await resolveOwnerId(parsed.data.userId, isManager, req.user.id);
    if (resolved.error) {
      return res.status(resolved.error.status).json(resolved.error.json);
    }

    const rfq = await prisma.rfq.create({
      data: {
        serialNumber,
        userId: resolved.ownerId,
        clientName: parsed.data.clientName,
        contactName: parsed.data.contactName,
        contactPhone: parsed.data.contactPhone,
        items: parsed.data.items.map((i) => ({
          description: i.description,
          quantity: i.quantity == null ? '' : String(i.quantity),
          finishingType: i.finishingType,
          finishingTypeOther: i.finishingTypeOther ?? '',
          requiredWork: i.requiredWork,
          requiredWorkOther: i.requiredWorkOther ?? '',
          workEnvironment: i.workEnvironment,
          workEnvironmentOther: i.workEnvironmentOther ?? '',
          ...(i.rollMaterialId ? { rollMaterialId: i.rollMaterialId, outerDiameter: i.outerDiameter, innerDiameter: i.innerDiameter, rollLength: i.rollLength, calculatedPrice: i.calculatedPrice } : {}),
        })),
        requiredTime: parsed.data.requiredTime,
        requiredTimeOther: parsed.data.requiredTimeOther ?? null,
        workOrderDate: toDate(parsed.data.workOrderDate),
        paymentTerms: parsed.data.paymentTerms,
      },
      include: rfqInclude,
    });

    await logActivity(req.user.id, 'rfq.create', { rfqId: rfq.id, clientName: rfq.clientName }, req.user.name);
    res.status(201).json(rfq);
  },
);

// تفاصيل طلب تسعير (صاحبه أو الإدارة)
router.get('/:id', authenticate, requireRole('SALES_MANAGER', 'DEPUTY_SALES_MANAGER', 'REPRESENTATIVE'), async (req, res) => {
  const isManager = req.user.role !== 'REPRESENTATIVE';
  const rfq = await prisma.rfq.findFirst({
    where: isManager ? { id: String(req.params.id) } : { id: String(req.params.id), userId: req.user.id },
    include: rfqInclude,
  });
  if (!rfq) return res.status(404).json({ error: 'not_found' });
  // backward compat: normalize requiredWork
  const normalized = {
    ...rfq,
    items: Array.isArray(rfq.items)
      ? (rfq.items as Record<string, unknown>[]).map((it) => ({
          ...it,
          requiredWork: normalizeRequiredWork(it.requiredWork),
        }))
      : rfq.items,
  };
  res.json(normalized);
});

// حذف طلب تسعير (صاحبه أو الإدارة)
router.delete('/:id', authenticate, requireRole('SALES_MANAGER', 'DEPUTY_SALES_MANAGER', 'REPRESENTATIVE'), async (req, res) => {
  const isManager = req.user.role !== 'REPRESENTATIVE';
  const rfq = await prisma.rfq.findFirst({
    where: isManager ? { id: String(req.params.id) } : { id: String(req.params.id), userId: req.user.id },
  });
  if (!rfq) return res.status(404).json({ error: 'not_found' });

  await prisma.rfq.delete({ where: { id: rfq.id } });
  await logActivity(req.user.id, 'rfq.delete', { rfqId: rfq.id }, req.user.name);
  res.json({ ok: true });
});

// تعديل طلب تسعير (PUT /:id) — يسمح للمندوب والمدير بتعديل البيانات الأساسية
router.put(
  '/:id',
  authenticate,
  requireRole('SALES_MANAGER', 'DEPUTY_SALES_MANAGER', 'REPRESENTATIVE'),
  async (req, res) => {
    const isManager = req.user.role !== 'REPRESENTATIVE';
    const rfq = await prisma.rfq.findFirst({
      where: isManager ? { id: String(req.params.id) } : { id: String(req.params.id), userId: req.user.id },
    });
    if (!rfq) return res.status(404).json({ error: 'not_found' });

    const parsed = rfqSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_input', details: parsed.error.flatten() });
    const d = parsed.data;

    const updateData: Prisma.RfqUpdateInput = {};
    if (d.userId && isManager) {
      const resolved = await resolveOwnerId(d.userId, true, rfq.userId);
      if (resolved.error) {
        return res.status(resolved.error.status).json(resolved.error.json);
      }
      updateData.user = { connect: { id: resolved.ownerId } };
    }
    if (d.clientName != null) updateData.clientName = d.clientName;
    if (d.contactName != null) updateData.contactName = d.contactName;
    if (d.contactPhone != null) updateData.contactPhone = d.contactPhone;
    if (d.items != null) {
      updateData.items = d.items.map((i) => ({
        description: i.description,
        quantity: i.quantity == null ? '' : String(i.quantity),
        finishingType: i.finishingType,
        finishingTypeOther: i.finishingTypeOther ?? '',
        requiredWork: Array.isArray(i.requiredWork) ? i.requiredWork : [i.requiredWork],
        requiredWorkOther: i.requiredWorkOther ?? '',
        workEnvironment: i.workEnvironment,
        workEnvironmentOther: i.workEnvironmentOther ?? '',
        ...(i.rollMaterialId ? { rollMaterialId: i.rollMaterialId, outerDiameter: i.outerDiameter, innerDiameter: i.innerDiameter, rollLength: i.rollLength, calculatedPrice: i.calculatedPrice } : {}),
      }));
    }
    if (d.requiredTime != null) updateData.requiredTime = d.requiredTime;
    if (d.requiredTimeOther != null) updateData.requiredTimeOther = d.requiredTimeOther;
    if (d.workOrderDate != null) updateData.workOrderDate = toDate(d.workOrderDate);
    if (d.paymentTerms != null) updateData.paymentTerms = d.paymentTerms;

    // أي تعديل يعيد ضبط حالة التسعير والاعتماد
    updateData.pricingStatus = 'UNPRICED';
    updateData.price = null;
    updateData.pricedAt = null;
    updateData.approvedAt = null;
    updateData.approvedBy = null;

    const updated = await prisma.rfq.update({
      where: { id: rfq.id },
      data: updateData,
      include: rfqInclude,
    });
    await logActivity(req.user.id, 'rfq.update', { rfqId: rfq.id, clientName: rfq.clientName }, req.user.name);
    res.json(updated);
  },
);

// تسعير طلب من المدير (PATCH /:id/price) — إرسال price = null/فارغ لإلغاء التسعير
const priceSchema = z.object({
  price: z.union([z.number(), z.string()]).optional().nullable(),
  currency: z.string().max(10).optional(),
  pricingNotes: z.string().max(500).optional().nullable(),
});

router.patch(
  '/:id/price',
  authenticate,
  requireRole('SALES_MANAGER', 'DEPUTY_SALES_MANAGER'),
  async (req, res) => {
    const parsed = priceSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_input', details: parsed.error.flatten() });

    const rfq = await prisma.rfq.findFirst({ where: { id: String(req.params.id) } });
    if (!rfq) return res.status(404).json({ error: 'not_found' });

    const price = parsed.data.price;
    const hasPrice = price != null && String(price).trim() !== '';
    const data: Prisma.RfqUpdateInput = {
      price: hasPrice ? new Prisma.Decimal(String(price)) : null,
      pricingStatus: hasPrice ? 'PRICED' : 'UNPRICED',
      pricedAt: hasPrice ? new Date() : null,
      // أي تغيير في التسعير يلغي الاعتماد السابق (يُعاد الاعتماد بعد التعديل)
      approvedAt: null,
      approvedBy: null,
    };
    if (parsed.data.currency != null) data.currency = parsed.data.currency;
    if (parsed.data.pricingNotes != null) data.pricingNotes = parsed.data.pricingNotes;

    const updated = await prisma.rfq.update({
      where: { id: rfq.id },
      data,
      include: rfqInclude,
    });
    await logActivity(req.user.id, 'rfq.price', { rfqId: rfq.id, clientName: rfq.clientName, price: updated.price?.toString() ?? null }, req.user.name);
    res.json(updated);
  },
);

// اعتماد عرض السعر (المدير فقط): الطلب المسعّر PRICED يصبح APPROVED
router.post(
  '/:id/approve',
  authenticate,
  requireRole('SALES_MANAGER', 'DEPUTY_SALES_MANAGER'),
  async (req, res) => {
    const rfq = await prisma.rfq.findFirst({ where: { id: String(req.params.id) } });
    if (!rfq) return res.status(404).json({ error: 'not_found' });

    // اعتماد مكرر — إرجاع الحالة الحالية دون تغيير
    if (rfq.pricingStatus === 'APPROVED') return res.json(rfq);

    // الاعتماد متاح فقط للطلبات المسعّرة فعلياً
    if (rfq.pricingStatus !== 'PRICED' || rfq.price == null) {
      return res.status(400).json({ error: 'not_priced' });
    }

    const updated = await prisma.rfq.update({
      where: { id: rfq.id },
      data: {
        pricingStatus: 'APPROVED',
        approvedAt: new Date(),
        approvedBy: req.user.name,
      },
      include: rfqInclude,
    });
    await logActivity(req.user.id, 'rfq.approve', { rfqId: rfq.id, clientName: rfq.clientName, serialNumber: rfq.serialNumber }, req.user.name);
    // بث فوري للمندوب صاحب الطلب حتى يعرض لوحته الحالة "معتمد" دون انتظار تحديث
    emitRfqUpdated(rfq.userId, updated);
    res.json(updated);
  },
);

// ======================= تعليقات الإدارة على طلبات التسعير =======================

// إضافة تعليق على طلب تسعير (الإدارة فقط)، ويُبث فوراً للمندوب صاحب الطلب
router.post(
  '/:id/comments',
  authenticate,
  requireRole('SALES_MANAGER', 'DEPUTY_SALES_MANAGER'),
  async (req, res) => {
    const parsed = commentSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_input', details: parsed.error.flatten() });
    const text = parsed.data.text.trim();
    if (!text) return res.status(400).json({ error: 'invalid_input' });

    const rfq = await prisma.rfq.findFirst({ where: { id: String(req.params.id) }, select: { id: true, userId: true } });
    if (!rfq) return res.status(404).json({ error: 'not_found' });

    const comment = await prisma.rfqComment.create({
      data: { rfqId: rfq.id, authorId: req.user.id, text },
      include: { author: { select: { id: true, name: true, role: true } } },
    });

    // بث الطلب المحدّث كاملاً حتى يتحدّث عرض المندوب لحظياً (المتطلب: تحديث/إضافة التعليقات)
    const updated = await prisma.rfq.findUnique({ where: { id: rfq.id }, include: rfqInclude });
    if (updated) emitRfqUpdated(updated.userId, updated);

    await logActivity(req.user.id, 'rfq.comment.add', { rfqId: rfq.id, commentId: comment.id }, req.user.name);
    res.status(201).json(comment);
  },
);

// تعديل تعليق (صاحبه فقط)
router.patch(
  '/:id/comments/:commentId',
  authenticate,
  requireRole('SALES_MANAGER', 'DEPUTY_SALES_MANAGER'),
  async (req, res) => {
    const parsed = commentSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_input', details: parsed.error.flatten() });

    const comment = await prisma.rfqComment.findFirst({
      where: { id: String(req.params.commentId), rfqId: String(req.params.id) },
    });
    if (!comment) return res.status(404).json({ error: 'not_found' });
    if (comment.authorId !== req.user.id) return res.status(403).json({ error: 'forbidden' });

    const text = parsed.data.text.trim();
    if (!text) return res.status(400).json({ error: 'invalid_input' });

    const updatedComment = await prisma.rfqComment.update({
      where: { id: comment.id },
      data: { text },
      include: { author: { select: { id: true, name: true, role: true } } },
    });

    const updated = await prisma.rfq.findUnique({ where: { id: comment.rfqId }, include: rfqInclude });
    if (updated) emitRfqUpdated(updated.userId, updated);

    await logActivity(req.user.id, 'rfq.comment.update', { rfqId: comment.rfqId, commentId: comment.id }, req.user.name);
    res.json(updatedComment);
  },
);

// حذف تعليق (صاحبه فقط)
router.delete(
  '/:id/comments/:commentId',
  authenticate,
  requireRole('SALES_MANAGER', 'DEPUTY_SALES_MANAGER'),
  async (req, res) => {
    const comment = await prisma.rfqComment.findFirst({
      where: { id: String(req.params.commentId), rfqId: String(req.params.id) },
    });
    if (!comment) return res.status(404).json({ error: 'not_found' });
    if (comment.authorId !== req.user.id) return res.status(403).json({ error: 'forbidden' });

    await prisma.rfqComment.delete({ where: { id: comment.id } });

    const updated = await prisma.rfq.findUnique({ where: { id: comment.rfqId }, include: rfqInclude });
    if (updated) emitRfqUpdated(updated.userId, updated);

    await logActivity(req.user.id, 'rfq.comment.delete', { rfqId: comment.rfqId, commentId: comment.id }, req.user.name);
    res.json({ ok: true, id: comment.id });
  },
);

// ======================= رفع وعرض صور المرفق (متعددة) =======================

fs.mkdirSync(config.uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, config.uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `rfq-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
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

// POST /api/rfqs/:id/image  (field name: 'images') — يدعم رفع صورة واحدة أو أكثر
router.post(
  '/:id/image',
  authenticate,
  requireRole('SALES_MANAGER', 'DEPUTY_SALES_MANAGER', 'REPRESENTATIVE'),
  captureLocation('ATTACHMENT_UPLOAD'),
  upload.array('images', 10),
  async (req, res) => {
    const files = req.files as Express.Multer.File[] | undefined;
    if (!files || files.length === 0) return res.status(400).json({ error: 'missing_file' });
    const isManager = req.user.role !== 'REPRESENTATIVE';
    const rfq = await prisma.rfq.findFirst({
      where: isManager ? { id: String(req.params.id) } : { id: String(req.params.id), userId: req.user.id },
    });
    if (!rfq) {
      for (const f of files) fs.unlink(path.join(config.uploadDir, f.filename), () => undefined);
      return res.status(404).json({ error: 'not_found' });
    }

    const existingUrls: string[] = Array.isArray(rfq.imageUrls)
      ? (rfq.imageUrls as string[])
      : rfq.imageUrl
        ? [rfq.imageUrl]
        : [];
    const newUrls = files.map((f) => f.filename);
    const merged = [...existingUrls, ...newUrls].slice(0, 10);

    const updated = await prisma.rfq.update({
      where: { id: rfq.id },
      data: { imageUrls: merged },
      include: rfqInclude,
    });
    await logActivity(req.user.id, 'rfq.image', { rfqId: rfq.id, clientName: rfq.clientName, count: files.length }, req.user.name);
    res.json(updated);
  },
);

// DELETE /api/rfqs/:id/image/:index — حذف صورة من المصفوفة
router.delete(
  '/:id/image/:index',
  authenticate,
  requireRole('SALES_MANAGER', 'DEPUTY_SALES_MANAGER', 'REPRESENTATIVE'),
  async (req, res) => {
    const isManager = req.user.role !== 'REPRESENTATIVE';
    const rfq = await prisma.rfq.findFirst({
      where: isManager ? { id: String(req.params.id) } : { id: String(req.params.id), userId: req.user.id },
    });
    if (!rfq) return res.status(404).json({ error: 'not_found' });

    const urls: string[] = Array.isArray(rfq.imageUrls)
      ? (rfq.imageUrls as string[])
      : rfq.imageUrl
        ? [rfq.imageUrl]
        : [];
    const idx = parseInt(String(req.params.index), 10);
    if (idx < 0 || idx >= urls.length) return res.status(400).json({ error: 'invalid_index' });

    const removed = urls.splice(idx, 1);
    if (removed[0]) fs.unlink(path.join(config.uploadDir, removed[0]), () => undefined);

    const updated = await prisma.rfq.update({
      where: { id: rfq.id },
      data: { imageUrls: urls.length > 0 ? urls : Prisma.JsonNull },
      include: rfqInclude,
    });
    res.json(updated);
  },
);

// GET /api/rfqs/:id/image — الصورة الأولى (للتوافق)
router.get(
  '/:id/image',
  authenticate,
  requireRole('SALES_MANAGER', 'DEPUTY_SALES_MANAGER', 'REPRESENTATIVE'),
  async (req, res) => {
    const isManager = req.user.role !== 'REPRESENTATIVE';
    const rfq = await prisma.rfq.findFirst({
      where: isManager ? { id: String(req.params.id) } : { id: String(req.params.id), userId: req.user.id },
    });
    if (!rfq) return res.status(404).json({ error: 'not_found' });

    const urls: string[] = Array.isArray(rfq.imageUrls)
      ? (rfq.imageUrls as string[])
      : rfq.imageUrl
        ? [rfq.imageUrl]
        : [];
    if (urls.length === 0) return res.status(404).json({ error: 'not_found' });

    const filePath = path.resolve(config.uploadDir, urls[0]);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'file_missing' });
    res.sendFile(filePath);
  },
);

// GET /api/rfqs/:id/image/:index — صورة محددة حسب الفهرس
router.get(
  '/:id/image/:index',
  authenticate,
  requireRole('SALES_MANAGER', 'DEPUTY_SALES_MANAGER', 'REPRESENTATIVE'),
  async (req, res) => {
    const isManager = req.user.role !== 'REPRESENTATIVE';
    const rfq = await prisma.rfq.findFirst({
      where: isManager ? { id: String(req.params.id) } : { id: String(req.params.id), userId: req.user.id },
    });
    if (!rfq) return res.status(404).json({ error: 'not_found' });

    const urls: string[] = Array.isArray(rfq.imageUrls)
      ? (rfq.imageUrls as string[])
      : rfq.imageUrl
        ? [rfq.imageUrl]
        : [];
    if (urls.length === 0) return res.status(404).json({ error: 'not_found' });

    const idx = parseInt(String(req.params.index), 10);
    const filename = urls[idx];
    if (!filename) return res.status(404).json({ error: 'not_found' });

    const filePath = path.resolve(config.uploadDir, filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'file_missing' });
    res.sendFile(filePath);
  },
);

export const rfqsRouter = router;
