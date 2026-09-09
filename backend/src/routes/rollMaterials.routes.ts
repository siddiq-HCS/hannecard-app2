import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole, requirePageAccess } from '../middleware/rbac.js';
import { logActivity } from '../lib/activity.js';

const router = Router();

// كل مسارات أسعار الخامات محمية للمدير فقط (المطور يمر دائماً، المندوب ممنوع)
router.use(authenticate, requireRole('SALES_MANAGER', 'DEPUTY_SALES_MANAGER'));

// ============ حساب السعر الآلي ============

const calcSchema = z.object({
  materialId: z.string().min(1),
  outerDiameter: z.number().positive(),   // القطر الخارجي D (ملم)
  innerDiameter: z.number().positive(),   // القطر الداخلي d (ملم)
  length: z.number().positive(),          // الطول L (ملم)
});

/**
 * حساب سعر الرول بناءً على القياسات والخامة
 *
 * المعادلة:
 *   Volume (m³) = π × ((D/2)² - (d/2)²) × L   (بالملم → ÷ 1e9)
 *   Weight (kg) = Volume × Density
 *   Material Cost = Weight × MaterialCostPerKg
 *   Total = Material Cost + WorkmanshipCost
 */
router.post('/calculate', async (req, res) => {
  const parsed = calcSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_input', details: parsed.error.flatten() });

  const { materialId, outerDiameter, innerDiameter, length } = parsed.data;

  if (innerDiameter >= outerDiameter) {
    return res.status(400).json({ error: 'inner_diameter_must_be_smaller' });
  }

  const material = await prisma.rollMaterial.findUnique({ where: { id: materialId } });
  if (!material) return res.status(404).json({ error: 'material_not_found' });

  // تحويل من ملم إلى متر
  const D = outerDiameter / 1000;
  const d = innerDiameter / 1000;
  const L = length / 1000;

  // حساب الحجم (m³)
  const volume = Math.PI * ((D / 2) ** 2 - (d / 2) ** 2) * L;

  // الوزن بالكيلو
  const weight = volume * material.density;

  // تكلفة الخامة
  const materialCost = weight * material.materialCostPerKg;

  // السعر الإجمالي
  const total = materialCost + material.baseWorkmanshipCost;

  res.json({
    materialId: material.id,
    materialName: material.name,
    density: material.density,
    materialCostPerKg: material.materialCostPerKg,
    baseWorkmanshipCost: material.baseWorkmanshipCost,
    outerDiameter,
    innerDiameter,
    length,
    volumeM3: Math.round(volume * 10000) / 10000,
    weightKg: Math.round(weight * 1000) / 1000,
    materialCost: Math.round(materialCost * 100) / 100,
    total: Math.round(total * 100) / 100,
    currency: 'SAR',
  });
});

// قائمة الخامات (تستخدم أيضاً في شاشة RFQ لحاسبة التسعير الآلي)
router.get('/', async (req, res) => {
  const onlyActive = req.query.active === 'true';
  const materials = await prisma.rollMaterial.findMany({
    where: onlyActive ? { isActive: true } : undefined,
    orderBy: { name: 'asc' },
  });
  res.json(materials);
});

// ============ إدارة أسعار خام المواد والرولات (تتطلب صلاحية الصفحة) ============

// الصفحة تظهر حسب صلاحية مانحة من المطور (PAGE_ROLL_MATERIALS_ACCESS)
router.use(requirePageAccess('PAGE_ROLL_MATERIALS_ACCESS'));

const materialSchema = z.object({
  name: z.string().min(1).max(200),
  density: z.number().positive(),
  materialCostPerKg: z.number().positive(),
  baseWorkmanshipCost: z.number().min(0),
  isActive: z.boolean().optional(),
});

// إضافة خامة جديدة
router.post('/', async (req, res) => {
  const parsed = materialSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_input', details: parsed.error.flatten() });

  try {
    const material = await prisma.rollMaterial.create({ data: parsed.data });
    await logActivity(req.user.id, 'roll_material.create', { id: material.id, name: material.name }, req.user.name);
    res.status(201).json(material);
  } catch (e) {
    if ((e as { code?: string }).code === 'P2002') return res.status(409).json({ error: 'duplicate_name' });
    throw e;
  }
});

// تعديل خامة
router.patch('/:id', async (req, res) => {
  const parsed = materialSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_input', details: parsed.error.flatten() });

  const material = await prisma.rollMaterial.findUnique({ where: { id: String(req.params.id) } });
  if (!material) return res.status(404).json({ error: 'not_found' });

  try {
    const updated = await prisma.rollMaterial.update({ where: { id: material.id }, data: parsed.data });
    await logActivity(req.user.id, 'roll_material.update', { id: updated.id, name: updated.name }, req.user.name);
    res.json(updated);
  } catch (e) {
    if ((e as { code?: string }).code === 'P2002') return res.status(409).json({ error: 'duplicate_name' });
    throw e;
  }
});

// حذف خامة (ممنوع إذا كانت مرتبطة برولات)
router.delete('/:id', async (req, res) => {
  const material = await prisma.rollMaterial.findUnique({ where: { id: String(req.params.id) } });
  if (!material) return res.status(404).json({ error: 'not_found' });

  try {
    await prisma.rollMaterial.delete({ where: { id: material.id } });
  } catch (e) {
    if ((e as { code?: string }).code === 'P2003') return res.status(409).json({ error: 'material_in_use' });
    throw e;
  }

  await logActivity(req.user.id, 'roll_material.delete', { id: material.id, name: material.name }, req.user.name);
  res.json({ ok: true });
});

// ============ الرولات (تسعير لكل رول على حدة) ============

const rollSchema = z.object({
  materialId: z.string().min(1),
  name: z.string().min(1).max(200).optional().nullable(),
  outerDiameter: z.number().positive(),
  innerDiameter: z.number().positive(),
  length: z.number().positive(),
  workmanshipCost: z.number().min(0).optional(),
  notes: z.string().max(500).optional().nullable(),
  isActive: z.boolean().optional(),
});

const rollUpdateSchema = z.object({
  materialId: z.string().min(1).optional(),
  name: z.string().min(1).max(200).optional().nullable(),
  outerDiameter: z.number().positive().optional(),
  innerDiameter: z.number().positive().optional(),
  length: z.number().positive().optional(),
  workmanshipCost: z.number().min(0).optional(),
  notes: z.string().max(500).optional().nullable(),
  isActive: z.boolean().optional(),
});

// قائمة الرولات
router.get('/rolls', async (req, res) => {
  const materialId = req.query.materialId as string | undefined;
  const rolls = await prisma.roll.findMany({
    where: materialId ? { materialId } : undefined,
    include: { material: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json(rolls.map((r) => ({ ...r, materialName: r.material.name })));
});

// إضافة رول مع تسعير آلي وحفظ لقطات الأسعار
router.post('/rolls', async (req, res) => {
  const parsed = rollSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_input', details: parsed.error.flatten() });

  const { materialId, name, outerDiameter, innerDiameter, length, workmanshipCost, notes, isActive } = parsed.data;

  if (innerDiameter >= outerDiameter) {
    return res.status(400).json({ error: 'inner_diameter_must_be_smaller' });
  }

  const material = await prisma.rollMaterial.findUnique({ where: { id: materialId } });
  if (!material) return res.status(404).json({ error: 'material_not_found' });

  const D = outerDiameter / 1000;
  const d = innerDiameter / 1000;
  const L = length / 1000;
  const volume = Math.PI * ((D / 2) ** 2 - (d / 2) ** 2) * L;
  const weight = volume * material.density;
  const materialCost = weight * material.materialCostPerKg;
  const workCost = workmanshipCost ?? material.baseWorkmanshipCost;
  const total = materialCost + workCost;

  const roll = await prisma.roll.create({
    data: {
      materialId,
      name: name ?? null,
      outerDiameter,
      innerDiameter,
      length,
      density: material.density,
      materialCostPerKg: material.materialCostPerKg,
      workmanshipCost: workCost,
      volumeM3: Math.round(volume * 10000) / 10000,
      weightKg: Math.round(weight * 1000) / 1000,
      materialCost: Math.round(materialCost * 100) / 100,
      total: Math.round(total * 100) / 100,
      notes: notes ?? null,
      isActive: isActive ?? true,
    },
  });

  await logActivity(req.user.id, 'roll.create', { id: roll.id, name: roll.name ?? '', materialId }, req.user.name);
  res.status(201).json(roll);
});

// تعديل رول مع إعادة التسعير
router.patch('/rolls/:id', async (req, res) => {
  const parsed = rollUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_input', details: parsed.error.flatten() });

  const existing = await prisma.roll.findUnique({ where: { id: String(req.params.id) } });
  if (!existing) return res.status(404).json({ error: 'not_found' });

  const materialId = parsed.data.materialId ?? existing.materialId;
  const material = await prisma.rollMaterial.findUnique({ where: { id: materialId } });
  if (!material) return res.status(404).json({ error: 'material_not_found' });

  const outerDiameter = parsed.data.outerDiameter ?? existing.outerDiameter;
  const innerDiameter = parsed.data.innerDiameter ?? existing.innerDiameter;
  const length = parsed.data.length ?? existing.length;
  if (innerDiameter >= outerDiameter) {
    return res.status(400).json({ error: 'inner_diameter_must_be_smaller' });
  }

  const D = outerDiameter / 1000;
  const d = innerDiameter / 1000;
  const L = length / 1000;
  const volume = Math.PI * ((D / 2) ** 2 - (d / 2) ** 2) * L;
  const weight = volume * material.density;
  const materialCost = weight * material.materialCostPerKg;
  const workCost = parsed.data.workmanshipCost ?? existing.workmanshipCost;
  const total = materialCost + workCost;

  const updated = await prisma.roll.update({
    where: { id: existing.id },
    data: {
      materialId,
      name: parsed.data.name !== undefined ? parsed.data.name : existing.name,
      outerDiameter,
      innerDiameter,
      length,
      density: material.density,
      materialCostPerKg: material.materialCostPerKg,
      workmanshipCost: workCost,
      volumeM3: Math.round(volume * 10000) / 10000,
      weightKg: Math.round(weight * 1000) / 1000,
      materialCost: Math.round(materialCost * 100) / 100,
      total: Math.round(total * 100) / 100,
      notes: parsed.data.notes !== undefined ? parsed.data.notes : existing.notes,
      isActive: parsed.data.isActive ?? existing.isActive,
    },
  });

  await logActivity(req.user.id, 'roll.update', { id: updated.id, name: updated.name ?? '' }, req.user.name);
  res.json(updated);
});

// حذف رول
router.delete('/rolls/:id', async (req, res) => {
  const roll = await prisma.roll.findUnique({ where: { id: String(req.params.id) } });
  if (!roll) return res.status(404).json({ error: 'not_found' });

  await prisma.roll.delete({ where: { id: roll.id } });
  await logActivity(req.user.id, 'roll.delete', { id: roll.id, name: roll.name ?? '' }, req.user.name);
  res.json({ ok: true });
});

export const rollMaterialsRouter = router;