import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';

const router = Router();

const clientSchema = z.object({
  companyName: z.string().min(1).max(200),
  contactPerson: z.string().min(1).max(120),
  phone: z.string().min(6).max(30),
  email: z.string().email().optional().or(z.literal('')),
  taxNumber: z.string().max(20).optional().or(z.literal('')),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  address: z.string().max(500).optional().or(z.literal('')),
});

// قائمة العملاء (بحث بالاسم أو الهاتف)
router.get('/', authenticate, requireRole('SALES_MANAGER', 'REPRESENTATIVE'), async (req, res) => {
  const q = String(req.query.q ?? '').trim();
  const where = q
    ? {
        OR: [
          { companyName: { contains: q, mode: 'insensitive' as const } },
          { phone: { contains: q, mode: 'insensitive' as const } },
        ],
      }
    : {};
  const clients = await prisma.client.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { rollerSpecs: true, quotations: true } } },
  });
  res.json(clients);
});

// إنشاء عميل جديد
router.post('/', authenticate, requireRole('SALES_MANAGER', 'REPRESENTATIVE'), async (req, res) => {
  const parsed = clientSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_input', details: parsed.error.flatten() });

  const data = parsed.data;
  const client = await prisma.client.create({
    data: {
      companyName: data.companyName,
      contactPerson: data.contactPerson,
      phone: data.phone,
      email: data.email || null,
      taxNumber: data.taxNumber || null,
      latitude: data.latitude,
      longitude: data.longitude,
      address: data.address || null,
      createdById: req.user.id,
    },
  });
  res.status(201).json(client);
});

// تفاصيل عميل مع أسطواناته وعروضه
router.get('/:id', authenticate, requireRole('SALES_MANAGER', 'REPRESENTATIVE'), async (req, res) => {
  const client = await prisma.client.findUnique({
    where: { id: String(req.params.id) },
    include: {
      rollerSpecs: { orderBy: { createdAt: 'desc' } },
      quotations: { orderBy: { createdAt: 'desc' } },
    },
  });
  if (!client) return res.status(404).json({ error: 'not_found' });
  res.json(client);
});

export const clientsRouter = router;
