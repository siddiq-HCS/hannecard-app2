import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { hashPassword } from '../lib/password.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole, requirePageAccess } from '../middleware/rbac.js';
import { logActivity } from '../lib/activity.js';
import type { Permission, Role } from '@prisma/client';

const router = Router();

// كل مسارات الإدارة محمية بالدور
router.use(authenticate, requireRole('SALES_MANAGER', 'DEPUTY_SALES_MANAGER', 'DEVELOPER'));

// ============ المناديب ============

const createRepSchema = z.object({
  name: z.string().min(1).max(100),
  phone: z.string().min(6).max(30),
  password: z.string().min(6),
  email: z.string().email().trim().transform((v) => v.toLowerCase()),
});

router.get('/reps', requirePageAccess('PAGE_REPS_ACCESS'), async (_req, res) => {
  const reps = await prisma.user.findMany({
    where: { role: 'REPRESENTATIVE' },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      plainPassword: true,
      isActive: true,
      createdAt: true,
      _count: { select: { tasks: true, visits: true } },
    },
    orderBy: { name: 'asc' },
  });
  res.json(reps);
});

router.post('/reps', async (req, res) => {
  const parsed = createRepSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_input', details: parsed.error.flatten() });

  try {
    const rep = await prisma.user.create({
      data: {
        name: parsed.data.name,
        phone: parsed.data.phone,
        email: parsed.data.email,
        passwordHash: await hashPassword(parsed.data.password),
        plainPassword: parsed.data.password,
        role: 'REPRESENTATIVE',
      },
      select: { id: true, name: true, phone: true, plainPassword: true, role: true, isActive: true },
    });
    await logActivity(req.user.id, 'rep.create', { repId: rep.id, name: rep.name }, req.user.name);
    res.status(201).json(rep);
  } catch {
    return res.status(409).json({ error: 'phone_or_email_exists' });
  }
});

const updateRepSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(6).optional(),
});

router.patch('/reps/:id', async (req, res) => {
  const parsed = updateRepSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_input' });

  const data: Record<string, unknown> = { name: parsed.data.name, isActive: parsed.data.isActive };
  if (parsed.data.password) {
    data.passwordHash = await hashPassword(parsed.data.password);
    data.plainPassword = parsed.data.password;
  }

  try {
    const rep = await prisma.user.update({
      where: { id: req.params.id },
      data,
      select: { id: true, name: true, phone: true, plainPassword: true, isActive: true },
    });
    await logActivity(req.user.id, 'rep.update', { repId: rep.id }, req.user.name);
    res.json(rep);
  } catch {
    return res.status(404).json({ error: 'not_found' });
  }
});

// حذف مندوب (مع منع حذف الحساب نفسه)
router.delete('/reps/:id', async (req, res) => {
  const target = await prisma.user.findUnique({
    where: { id: String(req.params.id) },
    select: { id: true, role: true, name: true },
  });
  if (!target || target.role !== 'REPRESENTATIVE') return res.status(404).json({ error: 'not_found' });
  if (target.id === req.user.id) return res.status(400).json({ error: 'cannot_delete_self' });

  await prisma.user.delete({ where: { id: target.id } });
  await logActivity(req.user.id, 'rep.delete', { repId: target.id, name: target.name }, req.user.name);
  res.json({ ok: true });
});

// ============ الصلاحيات (منح/سحب) ============

router.get('/reps/:id/permissions', async (req, res) => {
  const permissions = await prisma.userPermission.findMany({
    where: { userId: req.params.id },
    select: { permission: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });
  res.json(permissions.map((p) => p.permission));
});

const grantSchema = z.object({ permission: z.string() });

const ALL_PERMISSIONS: Permission[] = [
  'TASK_CREATE',
  'TASK_VIEW',
  'TASK_UPDATE',
  'TASK_DELETE',
  'VISIT_CREATE',
  'VISIT_VIEW',
  'ATTACHMENT_UPLOAD',
  'ATTACHMENT_VIEW',
  'REPORT_WRITE',
  'REPORT_VIEW',
  'LOCATION_SEND',
  'PAGE_DASHBOARD_ACCESS',
  'PAGE_MAP_ACCESS',
  'PAGE_REPS_ACCESS',
  'PAGE_RFQS_ACCESS',
  'PAGE_ANALYTICS_ACCESS',
  'PAGE_CHAT_ACCESS',
  'PAGE_WEEKLY_PLANS_ACCESS',
  'PAGE_ATTENDANCE_ACCESS',
  'PAGE_MANAGERS_ACCESS',
  'PAGE_ROLL_MATERIALS_ACCESS',
  'AUTO_PRICING_ACCESS',
];

router.post('/reps/:id/permissions', async (req, res) => {
  const parsed = grantSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_input' });

  const permission = parsed.data.permission as Permission;
  if (!ALL_PERMISSIONS.includes(permission)) return res.status(400).json({ error: 'unknown_permission' });

  await prisma.userPermission.upsert({
    where: { userId_permission: { userId: req.params.id, permission } },
    update: { grantedBy: req.user.id },
    create: { userId: req.params.id, permission, grantedBy: req.user.id },
  });
  await logActivity(req.user.id, 'permission.grant', { repId: req.params.id, permission }, req.user.name);
  res.json({ ok: true });
});

router.delete('/reps/:id/permissions/:permission', async (req, res) => {
  const permission = req.params.permission as Permission;
  await prisma.userPermission.deleteMany({ where: { userId: req.params.id, permission } });
  await logActivity(req.user.id, 'permission.revoke', { repId: req.params.id, permission }, req.user.name);
  res.json({ ok: true });
});

// ============ النشاط اللحظي والمواقع ============

router.get('/live', requirePageAccess('PAGE_DASHBOARD_ACCESS'), async (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 50), 200);
  const logs = await prisma.activityLog.findMany({
    take: limit,
    orderBy: { createdAt: 'desc' },
    include: { user: { select: { name: true } } },
  });
  res.json(logs.map((l) => ({ ...l, userName: l.user.name })));
});

router.get('/locations', requirePageAccess('PAGE_MAP_ACCESS'), async (_req, res) => {
  // آخر موقع لكل مندوب نشط
  const reps = await prisma.user.findMany({ where: { role: 'REPRESENTATIVE', isActive: true }, select: { id: true, name: true } });
  const locations = await Promise.all(
    reps.map(async (rep) => {
      const last = await prisma.location.findFirst({
        where: { userId: rep.id },
        orderBy: { recordedAt: 'desc' },
        select: { lat: true, lng: true, accuracy: true, recordedAt: true, action: true },
      });
      return { userId: rep.id, name: rep.name, ...(last ?? null) };
    }),
  );
  res.json(locations);
});

// ============ مراجعة المرفقات (فواتير + Delivery Docs) ============

router.get('/attachments', async (req, res) => {
  const where: Record<string, unknown> = {};
  if (req.query.repId) where.userId = req.query.repId;
  const attachments = await prisma.visitAttachment.findMany({
    where,
    include: {
      visit: { select: { clientName: true, purpose: true, visitedAt: true, userId: true, user: { select: { name: true } } } },
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json(attachments);
});

// ============ التقارير اليومية ============

router.get('/daily-summaries', async (req, res) => {
  const date = req.query.date as string | undefined;
  const where = date ? { summaryDate: new Date(`${date}T00:00:00Z`) } : {};
  const summaries = await prisma.dailySummary.findMany({
    where,
    include: { user: { select: { name: true } } },
    orderBy: { summaryDate: 'desc' },
  });
  res.json(summaries);
});

router.get('/reports', async (req, res) => {
  const date = req.query.date as string | undefined;
  const where: Record<string, unknown> = { isDraft: false };
  if (date) where.reportDate = new Date(`${date}T00:00:00Z`);
  const reports = await prisma.report.findMany({
    where,
    include: { user: { select: { name: true } } },
    orderBy: { reportDate: 'desc' },
  });
  res.json(reports);
});

// ============ المدراء ============

const createManagerSchema = z.object({
  name: z.string().min(1).max(100),
  phone: z.string().min(6).max(30),
  password: z.string().min(6),
  email: z.string().email().trim().transform((v) => v.toLowerCase()),
  role: z.enum(['SALES_MANAGER', 'DEPUTY_SALES_MANAGER']),
});

router.get('/managers', requirePageAccess('PAGE_MANAGERS_ACCESS'), async (_req, res) => {
  const managers = await prisma.user.findMany({
    where: { role: { in: ['SALES_MANAGER', 'DEPUTY_SALES_MANAGER'] } },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      plainPassword: true,
      role: true,
      isActive: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  });
  res.json(managers);
});

router.post('/managers', async (req, res) => {
  const parsed = createManagerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_input', details: parsed.error.flatten() });

  try {
    const manager = await prisma.user.create({
      data: {
        name: parsed.data.name,
        phone: parsed.data.phone,
        email: parsed.data.email,
        passwordHash: await hashPassword(parsed.data.password),
        plainPassword: parsed.data.password,
        role: parsed.data.role,
      },
      select: { id: true, name: true, phone: true, plainPassword: true, role: true, isActive: true },
    });
    await logActivity(req.user.id, 'manager.create', { managerId: manager.id, name: manager.name }, req.user.name);
    res.status(201).json(manager);
  } catch {
    return res.status(409).json({ error: 'phone_or_email_exists' });
  }
});

const updateManagerSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(6).optional(),
  role: z.enum(['SALES_MANAGER', 'DEPUTY_SALES_MANAGER']).optional(),
});

router.patch('/managers/:id', async (req, res) => {
  const parsed = updateManagerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_input' });

  const data: Record<string, unknown> = { name: parsed.data.name, isActive: parsed.data.isActive, role: parsed.data.role };
  if (parsed.data.password) {
    data.passwordHash = await hashPassword(parsed.data.password);
    data.plainPassword = parsed.data.password;
  }

  try {
    const manager = await prisma.user.update({
      where: { id: req.params.id },
      data,
      select: { id: true, name: true, phone: true, plainPassword: true, role: true, isActive: true },
    });
    await logActivity(req.user.id, 'manager.update', { managerId: manager.id }, req.user.name);
    res.json(manager);
  } catch {
    return res.status(404).json({ error: 'not_found' });
  }
});

// حذف مدير — يسمح به مدير المبيعات فقط (وليس حذف الحساب نفسه)
router.delete('/managers/:id', async (req, res) => {
  const target = await prisma.user.findUnique({
    where: { id: String(req.params.id) },
    select: { id: true, role: true, name: true },
  });
  if (!target || (target.role !== 'SALES_MANAGER' && target.role !== 'DEPUTY_SALES_MANAGER')) {
    return res.status(404).json({ error: 'not_found' });
  }
  if (target.id === req.user.id) return res.status(400).json({ error: 'cannot_delete_self' });
  if (req.user.role !== 'SALES_MANAGER') return res.status(403).json({ error: 'forbidden' });

  await prisma.user.delete({ where: { id: target.id } });
  await logActivity(req.user.id, 'manager.delete', { managerId: target.id, name: target.name }, req.user.name);
  res.json({ ok: true });
});

// ============ تقرير شامل لمندوب (للطباعة والتصدير) ============

router.get('/rep-report', async (req, res) => {
  const repId = req.query.repId as string | undefined;
  if (!repId) return res.status(400).json({ error: 'repId_required' });

  const rep = await prisma.user.findUnique({
    where: { id: repId },
    select: { id: true, name: true, phone: true },
  });
  if (!rep) return res.status(404).json({ error: 'not_found' });

  const from = req.query.from as string | undefined;
  const to = req.query.to as string | undefined;
  const start = from ? new Date(`${from}T00:00:00Z`) : new Date('2020-01-01T00:00:00Z');
  const end = to ? new Date(`${to}T00:00:00Z`) : new Date('2100-01-01T00:00:00Z');

  const [visits, reports] = await Promise.all([
    prisma.visit.findMany({
      where: { userId: repId, visitedAt: { gte: start, lt: end } },
      include: { attachments: true },
      orderBy: { visitedAt: 'asc' },
    }),
    prisma.report.findMany({
      where: { userId: repId, isDraft: false, reportDate: { gte: start, lt: end } },
      orderBy: { reportDate: 'asc' },
    }),
  ]);

  const summary = {
    totalVisits: visits.length,
    totalCollected: visits.reduce((sum, v) => sum + (Number(v.collectedAmount) || 0), 0),
    reportsSubmitted: reports.length,
  };

  res.json({ rep, from: from ?? null, to: to ?? null, visits, reports, summary });
});

// ============ تغيير كلمة المرور للمدير ============

const changePwSchema = z.object({ userId: z.string(), newPassword: z.string().min(6) });

router.post('/change-password', async (req, res) => {
  const parsed = changePwSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_input' });

  const target = await prisma.user.findUnique({ where: { id: parsed.data.userId } });
  if (!target) return res.status(404).json({ error: 'not_found' });

  const hash = await hashPassword(parsed.data.newPassword);
  await prisma.user.update({ where: { id: target.id }, data: { passwordHash: hash, plainPassword: parsed.data.newPassword } });
  await logActivity(req.user.id, 'password_change_admin', { targetId: target.id, name: target.name }, req.user.name);
  res.json({ ok: true });
});

// ============ إدارة صلاحيات المطور ============

router.get('/managers-with-perms', async (_req, res) => {
  const managers = await prisma.user.findMany({
    where: { role: { in: ['SALES_MANAGER', 'DEPUTY_SALES_MANAGER'] } },
    select: {
      id: true, name: true, phone: true, email: true, role: true, isActive: true,
      permissions: { select: { permission: true } },
    },
    orderBy: { name: 'asc' },
  });
  res.json(managers.map((m) => ({ ...m, permissions: m.permissions.map((p) => p.permission) })));
});

router.post('/managers/:id/permissions', async (req, res) => {
  const parsed = grantSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_input' });

  const permission = parsed.data.permission as Permission;
  if (!ALL_PERMISSIONS.includes(permission)) return res.status(400).json({ error: 'invalid_permission' });

  const target = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!target) return res.status(404).json({ error: 'not_found' });

  await prisma.userPermission.upsert({
    where: { userId_permission: { userId: target.id, permission } },
    create: { userId: target.id, permission },
    update: {},
  });
  await logActivity(req.user.id, 'permission.grant', { targetId: target.id, permission }, req.user.name);
  res.json({ ok: true });
});

router.delete('/managers/:id/permissions/:permission', async (req, res) => {
  const target = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!target) return res.status(404).json({ error: 'not_found' });

  try {
    await prisma.userPermission.delete({
      where: { userId_permission: { userId: target.id, permission: req.params.permission as Permission } },
    });
  } catch { /* not found is fine */ }

  await logActivity(req.user.id, 'permission.revoke', { targetId: target.id, permission: req.params.permission }, req.user.name);
  res.json({ ok: true });
});

export const managerRouter = router;
