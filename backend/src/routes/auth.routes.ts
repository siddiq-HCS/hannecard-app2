import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { verifyPassword, hashPassword } from '../lib/password.js';
import { signToken } from '../lib/jwt.js';
import { coordsFrom, logActivity, recordLocation } from '../lib/activity.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import type { LocationAction } from '@prisma/client';

const router = Router();

const loginSchema = z
  .object({
    phone: z.string().min(6).optional(),
    email: z.string().email().optional(),
    password: z.string().min(6),
    app: z.enum(['web', 'mobile']).optional(), // واجهة الدخول: لوحة الإدارة أو تطبيق الجوال
    lat: z.number().optional(),
    lng: z.number().optional(),
    accuracy: z.number().optional(),
  })
  .refine((d) => d.phone || d.email, { message: 'phone_or_email_required' });

const changePasswordSchema = z.object({
  currentPassword: z.string().min(6),
  newPassword: z.string().min(6),
});

function publicUser(u: { id: string; name: string; phone: string; role: string; email: string | null }) {
  return { id: u.id, name: u.name, phone: u.phone, role: u.role, email: u.email };
}

router.post('/login', async (req, res) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_input', details: parsed.error.flatten() });

    const { email, phone, password, app } = parsed.data;
    const appType = app ?? null; // إذا لم يُرسل → تطبيق جوال جديد (بلا حارس دور)

    // الدخول بالبريد الإلكتروني (لوحة الإدارة) أو بالهاتف (تطبيق الجوال)
    const user = email
      ? await prisma.user.findFirst({
          where: { email: { equals: email.trim().toLowerCase(), mode: 'insensitive' } },
        })
      : await prisma.user.findUnique({ where: { phone: phone! } });

    if (!user) {
      console.warn(`[auth][failed] user-not-found identifier=${email ?? phone} app=${appType ?? 'none'} ip=${req.ip}`);
      return res.status(401).json({ error: 'invalid_credentials' });
    }

    if (!user.isActive) {
      console.warn(`[auth][failed] account-inactive id=${user.id} identifier=${email ?? phone} app=${appType ?? 'none'} ip=${req.ip}`);
      return res.status(403).json({
        error: 'account_inactive',
        message: 'تم إيقاف هذا الحساب عن تسجيل الدخول. يرجى التواصل مع الإدارة لتفعيله.',
      });
    }

    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) {
      console.warn(`[auth][failed] wrong-password id=${user.id} identifier=${email ?? phone} app=${appType ?? 'none'} ip=${req.ip}`);
      return res.status(401).json({ error: 'invalid_credentials' });
    }

    // فصل الصلاحيات بين اللوحة الإدارية وتطبيق الجوال على مستوى السيرفر
    if (appType === 'web' && user.role === 'REPRESENTATIVE') {
      console.warn(`[auth][failed] web-not-allowed id=${user.id} identifier=${email ?? phone} ip=${req.ip}`);
      return res.status(403).json({ error: 'web_not_allowed', message: 'عذراً، هذا الحساب مخصص لتطبيق الجوال فقط' });
    }
    if (appType === 'mobile' && user.role !== 'REPRESENTATIVE') {
      console.warn(`[auth][failed] mobile-not-allowed id=${user.id} identifier=${email ?? phone} role=${user.role} ip=${req.ip}`);
      return res.status(403).json({ error: 'mobile_not_allowed', message: 'هذا الحساب للوحة الإدارية، يرجى استخدامها' });
    }

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    const coords = coordsFrom(req);
    if (coords) {
      await recordLocation(user.id, 'LOGIN' as LocationAction, coords.lat, coords.lng, coords.accuracy);
    }
    await logActivity(user.id, 'login', { via: appType ?? 'mobile' }, user.name);

    const token = signToken({ sub: user.id, role: user.role });
    res.json({ token, user: publicUser(user) });
  } catch (err) {
    console.error('Login failed:', err);
    res.status(503).json({ error: 'server_unavailable', message: 'Database temporarily unreachable. Please try again.' });
  }
});

router.post('/logout', authenticate, async (req, res) => {
  const coords = coordsFrom(req);
  if (coords) {
    await recordLocation(req.user.id, 'LOGOUT' as LocationAction, coords.lat, coords.lng, coords.accuracy);
  }
  await logActivity(req.user.id, 'logout', {}, req.user.name);
  res.json({ ok: true });
});

router.post('/change-password', authenticate, async (req, res) => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_input', details: parsed.error.flatten() });

  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user) return res.status(404).json({ error: 'not_found' });

  const ok = await verifyPassword(parsed.data.currentPassword, user.passwordHash);
  if (!ok) return res.status(401).json({ error: 'wrong_password' });

  const newHash = await hashPassword(parsed.data.newPassword);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: newHash, plainPassword: parsed.data.newPassword } });
  await logActivity(user.id, 'password_change', {}, user.name);
  res.json({ ok: true });
});

// تغيير كلمة مرور مستخدم آخر (للمدير)
const changePwAdminSchema = z.object({ userId: z.string(), newPassword: z.string().min(6) });

router.post('/change-password-manager', authenticate, requireRole('SALES_MANAGER', 'DEPUTY_SALES_MANAGER'), async (req, res) => {
  const parsed = changePwAdminSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_input' });

  const target = await prisma.user.findUnique({ where: { id: parsed.data.userId } });
  if (!target) return res.status(404).json({ error: 'not_found' });

  const hash = await hashPassword(parsed.data.newPassword);
  await prisma.user.update({ where: { id: target.id }, data: { passwordHash: hash, plainPassword: parsed.data.newPassword } });
  await logActivity(req.user.id, 'password_change_admin', { targetId: target.id, name: target.name }, req.user.name);
  res.json({ ok: true });
});

export const authRouter = router;