import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { calculateRollerPricing } from '../lib/pricing.js';

const router = Router();

const rollerSchema = z.object({
  clientId: z.string().min(1),
  serviceType: z.enum(['NEW_MANUFACTURE', 'RECOATING', 'REPAIR_GRINDING', 'CHROME_PLATING']),
  // الأبعاد بالمليمتر
  outerDiameterOd: z.number().positive(),
  coreDiameter: z.number().positive(),
  faceLength: z.number().positive(),
  totalLength: z.number().positive(),
  coatingMaterial: z.enum(['NATURAL_RUBBER', 'POLYURETHANE', 'SILICONE', 'CHROME', 'CERAMIC']),
  hardnessShore: z.string().default('70 Shore A'),
  groovingType: z.enum(['SMOOTH', 'AXIAL', 'SPIRAL', 'CROWNED', 'HELIBONE']),
  operatingTemp: z.number().optional(),
  chemicalExposure: z.string().max(300).optional().or(z.literal('')),
  damagePhotos: z.array(z.string()).max(10).optional(),
  notes: z.string().max(2000).optional().or(z.literal('')),
});

/**
 * POST /rollers/calculate
 * تنفيذ خوارزمية التسعير وإرجاع تفصيل التكلفة بدون حفظ.
 */
router.post('/calculate', authenticate, requireRole('SALES_MANAGER', 'REPRESENTATIVE'), async (req, res) => {
  const parsed = rollerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_input', details: parsed.error.flatten() });

  const s = parsed.data;
  const result = calculateRollerPricing(s, Number(req.body.discountPercentage ?? 0));

  if (!result.valid) {
    return res.status(422).json({ error: 'validation_failed', errors: result.errors });
  }
  res.json(result);
});

// حفظ مواصفة أسطوانة
router.post('/', authenticate, requireRole('SALES_MANAGER', 'REPRESENTATIVE'), async (req, res) => {
  const parsed = rollerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_input', details: parsed.error.flatten() });

  const s = parsed.data;
  // تحقق قواعد الأبعاد قبل الحفظ
  const validation = calculateRollerPricing(s);
  if (!validation.valid) {
    return res.status(422).json({ error: 'validation_failed', errors: validation.errors });
  }

  const client = await prisma.client.findFirst({ where: { id: s.clientId } });
  if (!client) return res.status(404).json({ error: 'client_not_found' });

  const spec = await prisma.rollerSpec.create({
    data: {
      clientId: s.clientId,
      serviceType: s.serviceType,
      outerDiameterOd: s.outerDiameterOd,
      coreDiameter: s.coreDiameter,
      faceLength: s.faceLength,
      totalLength: s.totalLength,
      coatingMaterial: s.coatingMaterial,
      hardnessShore: s.hardnessShore,
      groovingType: s.groovingType,
      operatingTemp: s.operatingTemp,
      chemicalExposure: s.chemicalExposure || null,
      damagePhotos: s.damagePhotos?.length ? s.damagePhotos : undefined,
      notes: s.notes || null,
    },
  });
  res.status(201).json(spec);
});

// قائمة المواصفات (اختياري: تصفية حسب العميل)
router.get('/', authenticate, requireRole('SALES_MANAGER', 'REPRESENTATIVE'), async (req, res) => {
  const clientId = req.query.clientId as string | undefined;
  const specs = await prisma.rollerSpec.findMany({
    where: clientId ? { clientId } : {},
    include: { client: { select: { id: true, companyName: true } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json(specs);
});

export const rollersRouter = router;
