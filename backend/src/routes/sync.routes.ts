import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { calculateRollerPricing, discountNeedsApproval } from '../lib/pricing.js';
import { generateQrCode } from '../lib/qr.js';

const router = Router();

/**
 * POST /sync/bulk
 * مزامنة المعاملات المحفوظة محلياً أثناء عدم الاتصال (Offline-First).
 * الخادم يعالج كل عنصر ويعيد النتائج وفق استراتيجية (Server Timestamp wins).
 *
 * Body:
 * {
 *   deviceId: string,
 *   items: [
 *     { id, entityType: 'CLIENT'|'ROLLER_SPEC'|'QUOTATION'|'VISIT', payload, createdAt }
 *   ]
 * }
 */
router.post('/bulk', authenticate, requireRole('SALES_MANAGER', 'REPRESENTATIVE'), async (req, res) => {
  const schema = z.object({
    deviceId: z.string().min(1),
    items: z.array(
      z.object({
        id: z.string().min(1),
        entityType: z.enum(['CLIENT', 'ROLLER_SPEC', 'QUOTATION', 'VISIT']),
        payload: z.record(z.string(), z.unknown()),
        createdAt: z.string().optional(),
      }),
    ).max(200),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_input', details: parsed.error.flatten() });

  const { deviceId, items } = parsed.data;
  const results: { localId: string; ok: boolean; serverId?: string; error?: string }[] = [];

  for (const item of items) {
    const p = item.payload;
    try {
      switch (item.entityType) {
        case 'CLIENT': {
          const client = await prisma.client.create({
            data: {
              companyName: String(p.companyName ?? ''),
              contactPerson: String(p.contactPerson ?? ''),
              phone: String(p.phone ?? ''),
              email: p.email ? String(p.email) : null,
              taxNumber: p.taxNumber ? String(p.taxNumber) : null,
              latitude: typeof p.latitude === 'number' ? p.latitude : null,
              longitude: typeof p.longitude === 'number' ? p.longitude : null,
              address: p.address ? String(p.address) : null,
              createdById: req.user.id,
            },
          });
          await prisma.syncQueue.create({
            data: { deviceId, entityType: 'CLIENT', payload: item.payload as object, serverId: client.id, status: 'SYNCED', userId: req.user.id },
          });
          results.push({ localId: item.id, ok: true, serverId: client.id });
          break;
        }

        case 'ROLLER_SPEC': {
          const calc = calculateRollerPricing({
            serviceType: String(p.serviceType ?? 'RECOATING') as never,
            outerDiameterOd: Number(p.outerDiameterOd ?? 0),
            coreDiameter: Number(p.coreDiameter ?? 0),
            faceLength: Number(p.faceLength ?? 0),
            totalLength: Number(p.totalLength ?? 0),
            coatingMaterial: String(p.coatingMaterial ?? 'POLYURETHANE') as never,
          });
          if (!calc.valid) {
            results.push({ localId: item.id, ok: false, error: 'validation_failed' });
            break;
          }
          const spec = await prisma.rollerSpec.create({
            data: {
              clientId: String(p.clientId ?? ''),
              serviceType: String(p.serviceType ?? 'RECOATING') as never,
              outerDiameterOd: Number(p.outerDiameterOd),
              coreDiameter: Number(p.coreDiameter),
              faceLength: Number(p.faceLength),
              totalLength: Number(p.totalLength),
              coatingMaterial: String(p.coatingMaterial ?? 'POLYURETHANE') as never,
              hardnessShore: String(p.hardnessShore ?? '70 Shore A'),
              groovingType: String(p.groovingType ?? 'SMOOTH') as never,
              operatingTemp: typeof p.operatingTemp === 'number' ? p.operatingTemp : null,
              chemicalExposure: p.chemicalExposure ? String(p.chemicalExposure) : null,
              notes: p.notes ? String(p.notes) : null,
            },
          });
          await prisma.syncQueue.create({
            data: { deviceId, entityType: 'ROLLER_SPEC', payload: item.payload as object, serverId: spec.id, status: 'SYNCED', userId: req.user.id },
          });
          results.push({ localId: item.id, ok: true, serverId: spec.id });
          break;
        }

        case 'QUOTATION': {
          const rollerSpec = await prisma.rollerSpec.findUnique({ where: { id: String(p.rollerSpecId ?? '') } });
          if (!rollerSpec) {
            results.push({ localId: item.id, ok: false, error: 'roller_spec_not_found' });
            break;
          }
          const discount = Number(p.discountPercentage ?? 0);
          const calc = calculateRollerPricing(
            {
              serviceType: rollerSpec.serviceType,
              outerDiameterOd: rollerSpec.outerDiameterOd,
              coreDiameter: rollerSpec.coreDiameter,
              faceLength: rollerSpec.faceLength,
              totalLength: rollerSpec.totalLength,
              coatingMaterial: rollerSpec.coatingMaterial,
            },
            discount,
          );
          const year = new Date().getFullYear();
          const count = await prisma.quotation.count();
          const number = `HNC-${year}-${String(count + 1).padStart(4, '0')}`;
          const quotation = await prisma.quotation.create({
            data: {
              quotationNumber: number,
              clientId: String(p.clientId ?? rollerSpec.clientId),
              rollerSpecId: rollerSpec.id,
              baseMaterialCost: calc.baseMaterialCost,
              laborMachiningCost: calc.laborMachiningCost,
              subtotal: calc.subtotal,
              discountPercentage: calc.discountPercentage,
              discountAmount: calc.discountAmount,
              vatAmount: calc.vatAmount,
              grandTotal: calc.grandTotal,
              status: discountNeedsApproval(discount) ? 'PENDING_APPROVAL' : 'DRAFT',
              terms: p.terms ? String(p.terms) : 'سريان العرض 30 يوماً من تاريخ الإصدار.',
              createdByUserId: req.user.id,
            },
          });
          const { url: qrUrl } = await generateQrCode(
            { type: 'HANYCARD_QUOTATION', quotationNumber: number, quotationId: quotation.id, grandTotal: calc.grandTotal },
            `${number}.png`,
          );
          await prisma.quotation.update({ where: { id: quotation.id }, data: { qrCodeUrl: qrUrl } });
          await prisma.syncQueue.create({
            data: { deviceId, entityType: 'QUOTATION', payload: item.payload as object, serverId: quotation.id, status: 'SYNCED', userId: req.user.id },
          });
          results.push({ localId: item.id, ok: true, serverId: quotation.id });
          break;
        }

        case 'VISIT': {
          const visit = await prisma.visit.create({
            data: {
              userId: req.user.id,
              clientId: p.clientId ? String(p.clientId) : null,
              lat: Number(p.lat ?? 0),
              lng: Number(p.lng ?? 0),
              accuracy: typeof p.accuracy === 'number' ? p.accuracy : null,
              notes: p.notes ? String(p.notes) : null,
            },
          });
          await prisma.syncQueue.create({
            data: { deviceId, entityType: 'VISIT', payload: item.payload as object, serverId: visit.id, status: 'SYNCED', userId: req.user.id },
          });
          results.push({ localId: item.id, ok: true, serverId: visit.id });
          break;
        }
      }
    } catch (err) {
      results.push({ localId: item.id, ok: false, error: (err as Error).message });
    }
  }

  res.json({ synced: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length, results });
});

export const syncRouter = router;
