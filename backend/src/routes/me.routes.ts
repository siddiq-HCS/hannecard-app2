import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';

const router = Router();

// بيانات المستخدم الحالي + صلاحياته
router.get('/me', authenticate, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      role: true,
      createdAt: true,
    },
  });

  // إن لم يوجد مستخدم من التوكين (محذوف/غير صالح) → نطرد الجلسة بهدوء بدل تعليق الشاشة
  if (!user) return res.status(404).json({ error: 'user_not_found' });

  // جلب الصلاحيات: أي فشل/بطء لا يمنع الدخول — نمنح الحد الأدنى (بدون صلاحيات = صلاحية كاملة للمدير)
  let permissions: string[] = [];
  try {
    const rows = await prisma.userPermission.findMany({
      where: { userId: req.user.id },
      select: { permission: true },
    });
    permissions = rows.map((p) => p.permission);
  } catch (err) {
    console.error('[me] failed to load permissions, using empty (full-access for managers):', err);
  }

  res.json({ user, permissions });
});

// تسجيل رمز الإشعارات (Expo push token)
const fcmSchema = z.object({ token: z.string().min(10) });

router.post('/me/fcm-token', authenticate, async (req, res) => {
  const parsed = fcmSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_input' });
  await prisma.user.update({ where: { id: req.user.id }, data: { fcmToken: parsed.data.token } });
  res.json({ ok: true });
});

// (إدارة) قائمة المستخدمين النشطين لتسهيل تكليف المهام
router.get('/users', authenticate, requireRole('SALES_MANAGER', 'DEPUTY_SALES_MANAGER', 'DEVELOPER'), async (_req, res) => {
  const users = await prisma.user.findMany({
    where: { role: 'REPRESENTATIVE' },
    select: { id: true, name: true, phone: true, isActive: true },
    orderBy: { name: 'asc' },
  });
  res.json(users);
});

export const meRouter = router;
