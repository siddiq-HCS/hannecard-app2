import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { config } from '../config.js';
import { authenticate } from '../middleware/auth.js';
import { requirePermission, requireRole } from '../middleware/rbac.js';
import { captureLocation } from '../middleware/location.js';
import { logActivity } from '../lib/activity.js';
import { dayRange } from '../jobs/dailySummary.js';

const router = Router();

const createTaskSchema = z.object({
  type: z.enum(['DAILY', 'WEEKLY']),
  category: z.enum(['NEW_CLIENT', 'EXISTING_CLIENT', 'DAILY_REPORT']),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  dueDate: z.string(), // YYYY-MM-DD
  dueTime: z.string().optional(), // ISO time optional
});

function toDueDate(s: string): Date {
  const d = new Date(`${s}T00:00:00Z`);
  return d;
}

// قائمة المهام (للمندوب: مهامه؛ للمدير: كل المهام مع فلاتر repId/date/status)
router.get(
  '/',
  authenticate,
  requireRole('SALES_MANAGER', 'DEPUTY_SALES_MANAGER', 'REPRESENTATIVE'),
  async (req, res) => {
    const isManager = req.user.role !== 'REPRESENTATIVE';
    const repId = req.query.repId as string | undefined;

    const where: Record<string, unknown> = {};
    // المدير بدون repId يرى كل المهام بجميع حالاتها؛ المندوب يرى مهامه فقط
    if (isManager) {
      if (repId) where.userId = repId;
    } else {
      where.userId = req.user.id;
    }
    if (req.query.status) where.status = req.query.status;
    if (req.query.date) {
      const day = toDueDate(req.query.date as string);
      const next = new Date(day);
      next.setUTCDate(next.getUTCDate() + 1);
      where.dueDate = { gte: day, lt: next };
    }

    // في واجهة المندوب: المهام المكتملة في يوم سابق تختفي (تُؤرشف للمدير فقط)
    if (!isManager) {
      const { start } = dayRange(config.dailyReportTz);
      where.OR = [
        { status: { not: 'DONE' } },
        { status: 'DONE', completedAt: { gte: start } },
      ];
    }

    const tasks = await prisma.task.findMany({
      where,
      include: { attachments: true, user: { select: { id: true, name: true } } },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
    });
    res.json(tasks);
  },
);

// إنشاء مهمة
router.post(
  '/',
  authenticate,
  requireRole('SALES_MANAGER', 'DEPUTY_SALES_MANAGER', 'REPRESENTATIVE'),
  requirePermission('TASK_CREATE'),
  captureLocation('TASK_CREATE'),
  async (req, res) => {
    const parsed = createTaskSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_input', details: parsed.error.flatten() });

    const isManager = req.user.role !== 'REPRESENTATIVE';
    const targetUserId = isManager ? (req.body.userId as string | undefined) ?? req.user.id : req.user.id;

    const task = await prisma.task.create({
      data: {
        userId: targetUserId,
        type: parsed.data.type,
        category: parsed.data.category,
        title: parsed.data.title,
        description: parsed.data.description,
        dueDate: toDueDate(parsed.data.dueDate),
        dueTime: parsed.data.dueTime ? new Date(parsed.data.dueTime) : null,
      },
    });

    await logActivity(targetUserId, 'task.create', { taskId: task.id, title: task.title }, req.user.name);
    res.status(201).json(task);
  },
);

async function getOwnedTask(userId: string, taskId: string, isManager: boolean) {
  return prisma.task.findFirst({
    where: isManager ? { id: taskId } : { id: taskId, userId },
  });
}

// تعديل مهمة
router.patch(
  '/:id',
  authenticate,
  requirePermission('TASK_UPDATE'),
  captureLocation('TASK_UPDATE'),
  async (req, res) => {
    const isManager = req.user.role !== 'REPRESENTATIVE';
    const task = await getOwnedTask(req.user.id, String(req.params.id), isManager);
    if (!task) return res.status(404).json({ error: 'not_found' });

    const { title, description, dueDate, dueTime, category, status } = req.body as Record<string, string | undefined>;

    const updated = await prisma.task.update({
      where: { id: task.id },
      data: {
        title: title ?? undefined,
        description: description ?? undefined,
        category: category as never ?? undefined,
        status: status as never ?? undefined,
        dueDate: dueDate ? toDueDate(dueDate) : undefined,
        dueTime: dueTime ? new Date(dueTime) : undefined,
      },
    });
    await logActivity(task.userId, 'task.update', { taskId: task.id }, req.user.name);
    res.json(updated);
  },
);

// إكمال مهمة
router.post(
  '/:id/complete',
  authenticate,
  requirePermission('TASK_UPDATE'),
  captureLocation('TASK_COMPLETE'),
  async (req, res) => {
    const isManager = req.user.role !== 'REPRESENTATIVE';
    const task = await getOwnedTask(req.user.id, String(req.params.id), isManager);
    if (!task) return res.status(404).json({ error: 'not_found' });

    const updated = await prisma.task.update({
      where: { id: task.id },
      data: { status: 'DONE', completedAt: new Date() },
    });
    await logActivity(task.userId, 'task.complete', { taskId: task.id, title: task.title }, req.user.name);
    res.json(updated);
  },
);

// حذف مهمة
router.delete('/:id', authenticate, requirePermission('TASK_DELETE'), async (req, res) => {
  const isManager = req.user.role !== 'REPRESENTATIVE';
  const task = await getOwnedTask(req.user.id, String(req.params.id), isManager);
  if (!task) return res.status(404).json({ error: 'not_found' });

  await prisma.task.delete({ where: { id: task.id } });
  await logActivity(task.userId, 'task.delete', { taskId: task.id }, req.user.name);
  res.json({ ok: true });
});

export const tasksRouter = router;
