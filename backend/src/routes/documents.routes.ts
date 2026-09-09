import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { prisma } from '../lib/prisma.js';
import { config } from '../config.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { captureLocation } from '../middleware/location.js';
import { logActivity } from '../lib/activity.js';

const router = Router();

// مستندات مسموحة (PDF/Word/Excel/PowerPoint/Normal text + صور)
const DOCUMENT_MIMES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
]);

function isAllowedFile(mime: string) {
  return mime.startsWith('image/') || DOCUMENT_MIMES.has(mime);
}

fs.mkdirSync(config.uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, config.uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().slice(0, 12) || '.pdf';
    cb(null, `doc-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (_req, file, cb) => {
    if (!isAllowedFile(file.mimetype)) return cb(new Error('unsupported_file_type'));
    cb(null, true);
  },
});

const MAX_DOCS = 10;

// ======================= مرفقات طلبات التسعير (RFQ) =======================

async function findRfq(rfqId: string, userId: string, isManager: boolean) {
  return prisma.rfq.findFirst({
    where: isManager ? { id: rfqId } : { id: rfqId, userId },
  });
}

// رفع/إرفاق ملف (عرض أسعار PDF/مستند فني) لطلب تسعير
router.post(
  '/rfqs/:id/documents',
  authenticate,
  requireRole('SALES_MANAGER', 'DEPUTY_SALES_MANAGER', 'REPRESENTATIVE'),
  captureLocation('ATTACHMENT_UPLOAD'),
  upload.single('file'),
  async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'missing_file' });
    const isManager = req.user.role !== 'REPRESENTATIVE';
    const rfq = await findRfq(String(req.params.id), req.user.id, isManager);
    if (!rfq) {
      fs.unlink(path.join(config.uploadDir, req.file.filename), () => undefined);
      return res.status(404).json({ error: 'not_found' });
    }

    const count = await prisma.rfqDocument.count({ where: { rfqId: rfq.id } });
    if (count >= MAX_DOCS) {
      fs.unlink(path.join(config.uploadDir, req.file.filename), () => undefined);
      return res.status(400).json({ error: 'document_limit', max: MAX_DOCS });
    }

    const doc = await prisma.rfqDocument.create({
      data: {
        rfqId: rfq.id,
        filePath: req.file.filename,
        fileName: path.basename(req.file.originalname).slice(0, 200) || req.file.filename,
        mimeType: req.file.mimetype,
        size: req.file.size,
        uploadedBy: req.user.id,
      },
    });

    await logActivity(req.user.id, 'rfq.documentUpload', { rfqId: rfq.id, documentId: doc.id, fileName: doc.fileName }, req.user.name);
    res.status(201).json(doc);
  },
);

// قائمة مرفقات طلب تسعير
router.get(
  '/rfqs/:id/documents',
  authenticate,
  requireRole('SALES_MANAGER', 'DEPUTY_SALES_MANAGER', 'REPRESENTATIVE'),
  async (req, res) => {
    const isManager = req.user.role !== 'REPRESENTATIVE';
    const rfq = await findRfq(String(req.params.id), req.user.id, isManager);
    if (!rfq) return res.status(404).json({ error: 'not_found' });
    const docs = await prisma.rfqDocument.findMany({
      where: { rfqId: rfq.id },
      select: { id: true, fileName: true, mimeType: true, size: true, createdAt: true, uploadedBy: true },
      orderBy: { createdAt: 'asc' },
    });
    res.json(docs);
  },
);

// عرض/تحميل ملف طلب تسعير
router.get(
  '/rfq-documents/:id/file',
  authenticate,
  requireRole('SALES_MANAGER', 'DEPUTY_SALES_MANAGER', 'REPRESENTATIVE'),
  async (req, res) => {
    const doc = await prisma.rfqDocument.findUnique({
      where: { id: String(req.params.id) },
      include: { rfq: { select: { userId: true } } },
    });
    if (!doc) return res.status(404).json({ error: 'not_found' });
    const isManager = req.user.role !== 'REPRESENTATIVE';
    if (!isManager && doc.rfq.userId !== req.user.id) return res.status(403).json({ error: 'forbidden' });

    const filePath = path.join(config.uploadDir, doc.filePath);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'file_missing' });
    res.type(doc.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(doc.fileName)}`);
    res.sendFile(filePath);
  },
);

// حذف ملف طلب تسعير
router.delete(
  '/rfq-documents/:id',
  authenticate,
  requireRole('SALES_MANAGER', 'DEPUTY_SALES_MANAGER', 'REPRESENTATIVE'),
  async (req, res) => {
    const doc = await prisma.rfqDocument.findUnique({
      where: { id: String(req.params.id) },
      include: { rfq: { select: { userId: true } } },
    });
    if (!doc) return res.status(404).json({ error: 'not_found' });
    const isManager = req.user.role !== 'REPRESENTATIVE';
    if (!isManager && doc.rfq.userId !== req.user.id) return res.status(403).json({ error: 'forbidden' });

    fs.unlink(path.join(config.uploadDir, doc.filePath), () => undefined);
    await prisma.rfqDocument.delete({ where: { id: doc.id } });
    await logActivity(req.user.id, 'rfq.documentDelete', { rfqId: doc.rfqId, fileName: doc.fileName }, req.user.name);
    res.json({ ok: true });
  },
);

// ======================= مرفقات زيارات الخطط الأسبوعية =======================

async function findPlanVisit(visitId: string, userId: string, isManager: boolean) {
  return prisma.planVisit.findFirst({
    where: isManager
      ? { id: visitId }
      : { id: visitId, day: { plan: { userId } } },
  });
}

// رفع/إرفاق ملف (عرض/مستند) لزيارة ضمن الخطة الأسبوعية
router.post(
  '/weekly-plans/visits/:visitId/documents',
  authenticate,
  requireRole('SALES_MANAGER', 'DEPUTY_SALES_MANAGER', 'REPRESENTATIVE'),
  captureLocation('ATTACHMENT_UPLOAD'),
  upload.single('file'),
  async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'missing_file' });
    const isManager = req.user.role !== 'REPRESENTATIVE';
    const visit = await findPlanVisit(String(req.params.visitId), req.user.id, isManager);
    if (!visit) {
      fs.unlink(path.join(config.uploadDir, req.file.filename), () => undefined);
      return res.status(404).json({ error: 'not_found' });
    }

    const count = await prisma.planVisitDocument.count({ where: { planVisitId: visit.id } });
    if (count >= MAX_DOCS) {
      fs.unlink(path.join(config.uploadDir, req.file.filename), () => undefined);
      return res.status(400).json({ error: 'document_limit', max: MAX_DOCS });
    }

    const doc = await prisma.planVisitDocument.create({
      data: {
        planVisitId: visit.id,
        filePath: req.file.filename,
        fileName: path.basename(req.file.originalname).slice(0, 200) || req.file.filename,
        mimeType: req.file.mimetype,
        size: req.file.size,
        uploadedBy: req.user.id,
      },
    });

    await logActivity(req.user.id, 'weeklyPlan.documentUpload', { visitId: visit.id, documentId: doc.id, fileName: doc.fileName }, req.user.name);
    res.status(201).json(doc);
  },
);

// قائمة مرفقات زيارة
router.get(
  '/weekly-plans/visits/:visitId/documents',
  authenticate,
  requireRole('SALES_MANAGER', 'DEPUTY_SALES_MANAGER', 'REPRESENTATIVE'),
  async (req, res) => {
    const isManager = req.user.role !== 'REPRESENTATIVE';
    const visit = await findPlanVisit(String(req.params.visitId), req.user.id, isManager);
    if (!visit) return res.status(404).json({ error: 'not_found' });
    const docs = await prisma.planVisitDocument.findMany({
      where: { planVisitId: visit.id },
      select: { id: true, fileName: true, mimeType: true, size: true, createdAt: true, uploadedBy: true },
      orderBy: { createdAt: 'asc' },
    });
    res.json(docs);
  },
);

// عرض/تحميل ملف زيارة
router.get(
  '/plan-documents/:id/file',
  authenticate,
  requireRole('SALES_MANAGER', 'DEPUTY_SALES_MANAGER', 'REPRESENTATIVE'),
  async (req, res) => {
    const doc = await prisma.planVisitDocument.findUnique({
      where: { id: String(req.params.id) },
      include: { visit: { select: { day: { select: { plan: { select: { userId: true } } } } } } },
    });
    if (!doc) return res.status(404).json({ error: 'not_found' });
    const isManager = req.user.role !== 'REPRESENTATIVE';
    if (!isManager && doc.visit.day.plan.userId !== req.user.id) return res.status(403).json({ error: 'forbidden' });

    const filePath = path.join(config.uploadDir, doc.filePath);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'file_missing' });
    res.type(doc.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(doc.fileName)}`);
    res.sendFile(filePath);
  },
);

// حذف ملف زيارة
router.delete(
  '/plan-documents/:id',
  authenticate,
  requireRole('SALES_MANAGER', 'DEPUTY_SALES_MANAGER', 'REPRESENTATIVE'),
  async (req, res) => {
    const doc = await prisma.planVisitDocument.findUnique({
      where: { id: String(req.params.id) },
      include: { visit: { select: { day: { select: { plan: { select: { userId: true } } } } } } },
    });
    if (!doc) return res.status(404).json({ error: 'not_found' });
    const isManager = req.user.role !== 'REPRESENTATIVE';
    if (!isManager && doc.visit.day.plan.userId !== req.user.id) return res.status(403).json({ error: 'forbidden' });

    fs.unlink(path.join(config.uploadDir, doc.filePath), () => undefined);
    await prisma.planVisitDocument.delete({ where: { id: doc.id } });
    await logActivity(req.user.id, 'weeklyPlan.documentDelete', { visitId: doc.planVisitId, fileName: doc.fileName }, req.user.name);
    res.json({ ok: true });
  },
);

export const documentsRouter = router;