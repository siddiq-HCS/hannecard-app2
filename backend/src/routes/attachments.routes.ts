import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { prisma } from '../lib/prisma.js';
import { config } from '../config.js';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { captureLocation } from '../middleware/location.js';
import { logActivity } from '../lib/activity.js';
import type { AttachmentType } from '@prisma/client';

const router = Router();

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
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('only_images'));
    cb(null, true);
  },
});

// رفع فاتورة / Delivery Doc لزيارة محددة
router.post(
  '/visits/:visitId/attachments',
  authenticate,
  requirePermission('ATTACHMENT_UPLOAD'),
  captureLocation('ATTACHMENT_UPLOAD'),
  upload.single('image'),
  async (req, res) => {
    const type = (req.body.type as string | undefined)?.toUpperCase();
    if (type !== 'INVOICE' && type !== 'DELIVERY_DOC') {
      return res.status(400).json({ error: 'invalid_type' });
    }
    if (!req.file) return res.status(400).json({ error: 'missing_file' });

    const isManager = req.user.role !== 'REPRESENTATIVE';
    const visit = await prisma.visit.findFirst({
      where: isManager
        ? { id: String(req.params.visitId) }
        : { id: String(req.params.visitId), userId: req.user.id },
    });
    if (!visit) return res.status(404).json({ error: 'not_found' });

    const attachment = await prisma.visitAttachment.create({
      data: {
        visitId: visit.id,
        type: type as AttachmentType,
        filePath: req.file.filename,
        size: req.file.size,
      },
    });

    await logActivity(visit.userId, 'attachment.upload', { visitId: visit.id, attachmentId: attachment.id, type }, req.user.name);
    res.status(201).json(attachment);
  },
);

// عرض ملف مرفق (صاحب الزيارة أو الإدارة)
router.get('/attachments/:id/file', authenticate, requirePermission('ATTACHMENT_VIEW'), async (req, res) => {
  const isManager = req.user.role !== 'REPRESENTATIVE';
    const attachment = await prisma.visitAttachment.findFirst({
      where: isManager
        ? { id: String(req.params.id) }
        : { id: String(req.params.id), visit: { userId: req.user.id } },
      include: { visit: { select: { userId: true } } },
    });
  if (!attachment) return res.status(404).json({ error: 'not_found' });

  const filePath = path.join(config.uploadDir, attachment.filePath);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'file_missing' });
  res.sendFile(filePath);
});

// رفع صورة/مرفق لمهمة (يستخدمه المندوب لتوثيق التنفيذ)
router.post(
  '/tasks/:taskId/attachments',
  authenticate,
  requirePermission('ATTACHMENT_UPLOAD'),
  captureLocation('ATTACHMENT_UPLOAD'),
  upload.single('image'),
  async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'missing_file' });

    const isManager = req.user.role !== 'REPRESENTATIVE';
    const task = await prisma.task.findFirst({
      where: isManager
        ? { id: String(req.params.taskId) }
        : { id: String(req.params.taskId), userId: req.user.id },
    });
    if (!task) return res.status(404).json({ error: 'not_found' });

    // الحد الأقصى: 5 صور لكل مهمة
    const count = await prisma.taskAttachment.count({ where: { taskId: task.id } });
    if (count >= 5) return res.status(400).json({ error: 'attachment_limit', max: 5 });

    const attachment = await prisma.taskAttachment.create({
      data: {
        taskId: task.id,
        filePath: req.file.filename,
        size: req.file.size,
      },
    });

    await logActivity(task.userId, 'task.attachment', { taskId: task.id, attachmentId: attachment.id }, req.user.name);
    res.status(201).json(attachment);
  },
);

// عرض صورة مهمة (صاحب المهمة أو الإدارة)
router.get('/task-attachments/:id/file', authenticate, requirePermission('ATTACHMENT_VIEW'), async (req, res) => {
  const isManager = req.user.role !== 'REPRESENTATIVE';
  const attachment = await prisma.taskAttachment.findFirst({
    where: isManager
      ? { id: String(req.params.id) }
      : { id: String(req.params.id), task: { userId: req.user.id } },
  });
  if (!attachment) return res.status(404).json({ error: 'not_found' });

  const filePath = path.join(config.uploadDir, attachment.filePath);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'file_missing' });
  res.sendFile(filePath);
});

export const attachmentsRouter = router;
