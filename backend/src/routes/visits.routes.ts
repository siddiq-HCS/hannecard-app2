import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';

const router = Router();

const visitSchema = z.object({
  clientId: z.string().optional(),
  lat: z.number(),
  lng: z.number(),
  accuracy: z.number().optional(),
  notes: z.string().max(2000).optional().or(z.literal('')),
  visitedAt: z.string().optional(), // ISO
});

// تسجيل زيارة ميدانية (GPS check-in)
router.post('/', authenticate, requireRole('SALES_MANAGER', 'REPRESENTATIVE'), async (req, res) => {
  const parsed = visitSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_input', details: parsed.error.flatten() });

  const visit = await prisma.visit.create({
    data: {
      userId: req.user.id,
      clientId: parsed.data.clientId || null,
      lat: parsed.data.lat,
      lng: parsed.data.lng,
      accuracy: parsed.data.accuracy,
      notes: parsed.data.notes || null,
      visitedAt: parsed.data.visitedAt ? new Date(parsed.data.visitedAt) : new Date(),
    },
    include: { client: { select: { id: true, companyName: true } } },
  });
  res.status(201).json(visit);
});

// زيارات المستخدم (أو كل الزيارات للمدير)
router.get('/', authenticate, requireRole('SALES_MANAGER', 'REPRESENTATIVE'), async (req, res) => {
  const isManager = req.user.role !== 'REPRESENTATIVE';
  const userId = isManager ? (req.query.userId as string | undefined) : req.user.id;

  const visits = await prisma.visit.findMany({
    where: userId ? { userId } : {},
    include: { client: { select: { id: true, companyName: true } } },
    orderBy: { visitedAt: 'desc' },
    take: 100,
  });
  res.json(visits);
});

export const visitsRouter = router;
