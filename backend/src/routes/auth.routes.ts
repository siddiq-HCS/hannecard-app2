import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { verifyPassword } from '../lib/password.js';
import { signToken } from '../lib/jwt.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

const loginSchema = z.object({
  phone: z.string().min(6),
  password: z.string().min(6),
});

function publicUser(u: { id: string; name: string; phone: string; role: string; email: string | null }) {
  return { id: u.id, name: u.name, phone: u.phone, role: u.role, email: u.email };
}

router.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_input', details: parsed.error.flatten() });

  const { phone, password } = parsed.data;
  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user || !user.isActive) return res.status(401).json({ error: 'invalid_credentials' });

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: 'invalid_credentials' });

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  const token = signToken({ sub: user.id, role: user.role });
  res.json({ token, user: publicUser(user) });
});

router.post('/logout', authenticate, async (_req, res) => {
  res.json({ ok: true });
});

export const authRouter = router;
