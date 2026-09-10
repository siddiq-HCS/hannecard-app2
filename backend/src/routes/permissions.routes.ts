import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import type { Permission, Role } from '@prisma/client';

const router = Router();

/** صفحات اللوحة الإدارية (المصفوفة في صفحة إدارة الصلاحيات) */
export const PAGES: { key: string; labelKey: string; permission: Permission }[] = [
  { key: 'dashboard', labelKey: 'nav.home', permission: 'PAGE_DASHBOARD_ACCESS' },
  { key: 'map', labelKey: 'nav.map', permission: 'PAGE_MAP_ACCESS' },
  { key: 'reps', labelKey: 'nav.reps', permission: 'PAGE_REPS_ACCESS' },
  { key: 'rfqs', labelKey: 'nav.rfqs', permission: 'PAGE_RFQS_ACCESS' },
  { key: 'analytics', labelKey: 'nav.analytics', permission: 'PAGE_ANALYTICS_ACCESS' },
  { key: 'chat', labelKey: 'nav.chat', permission: 'PAGE_CHAT_ACCESS' },
  { key: 'weeklyPlans', labelKey: 'nav.reports', permission: 'PAGE_WEEKLY_PLANS_ACCESS' },
  { key: 'attendance', labelKey: 'nav.attendance', permission: 'PAGE_ATTENDANCE_ACCESS' },
  { key: 'managers', labelKey: 'nav.managers', permission: 'PAGE_MANAGERS_ACCESS' },
  { key: 'rollMaterials', labelKey: 'rollMat.title', permission: 'PAGE_ROLL_MATERIALS_ACCESS' },
];

const ROLES: Role[] = ['SALES_MANAGER', 'DEPUTY_SALES_MANAGER', 'REPRESENTATIVE', 'DEVELOPER'];
const PAGE_PERMISSIONS = PAGES.map((p) => p.permission);

// إدارة صلاحيات الأدوار — متاحة لمدير المبيعات (سيديك) والمطوّر فقط
router.use(authenticate, requireRole('SALES_MANAGER', 'DEVELOPER'));

// GET /api/v1/permissions — قائمة الصفحات والصلاحيات الحالية لكل دور
router.get('/', async (_req, res) => {
  try {
    const rows = await prisma.rolePermission.findMany({ select: { role: true, permission: true } });
    const rolePermissions = Object.fromEntries(ROLES.map((r) => [r, [] as string[]])) as Record<Role, string[]>;
    for (const row of rows) {
      rolePermissions[row.role].push(row.permission);
    }
    for (const r of ROLES) rolePermissions[r].sort();
    res.json({ pages: PAGES, roles: ROLES, rolePermissions });
  } catch (err) {
    console.error('[permissions] GET failed:', err);
    res.status(503).json({ error: 'server_unavailable' });
  }
});

// PUT /api/v1/permissions — استبدال صلاحيات دور معيّن (مصفوفة كاملة)
const updateSchema = z.object({
  role: z.enum(ROLES as [Role, ...Role[]]),
  permissions: z.array(z.enum(PAGE_PERMISSIONS as [Permission, ...Permission[]])),
});

router.put('/', async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_input', details: parsed.error.flatten() });
  }

  const { role, permissions } = parsed.data;
  const unique = [...new Set(permissions)].sort();

  try {
    await prisma.$transaction([
      prisma.rolePermission.deleteMany({ where: { role } }),
      prisma.rolePermission.createMany({ data: unique.map((permission) => ({ role, permission })) }),
    ]);
    console.log(`[permissions] updated role=${role} count=${unique.length}`);
    res.json({ role, permissions: unique });
  } catch (err) {
    console.error('[permissions] PUT failed:', err);
    res.status(503).json({ error: 'server_unavailable' });
  }
});

export const permissionsRouter = router;