import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { calculateRollerPricing, discountNeedsApproval } from '../lib/pricing.js';
import { generateQrCode } from '../lib/qr.js';
import { generateQuotationPdf } from '../lib/pdf.js';
import path from 'node:path';
import fs from 'node:fs';
import { config } from '../config.js';

const router = Router();

/** توليد رقم عرض: HNC-2026-0001 */
async function nextQuotationNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `HNC-${year}-`;
  const last = await prisma.quotation.findFirst({
    where: { quotationNumber: { startsWith: prefix } },
    orderBy: { quotationNumber: 'desc' },
  });
  let seq = 1;
  if (last) {
    const parsed = Number(last.quotationNumber.replace(prefix, ''));
    if (Number.isFinite(parsed)) seq = parsed + 1;
  }
  return `${prefix}${String(seq).padStart(4, '0')}`;
}

const quotationSchema = z.object({
  clientId: z.string().min(1),
  rollerSpecId: z.string().min(1),
  discountPercentage: z.number().min(0).max(100).default(0),
  terms: z.string().max(2000).optional().or(z.literal('')),
});

// قائمة العروض (للمدير الكل، للمندوب عروضه)
router.get('/', authenticate, requireRole('SALES_MANAGER', 'REPRESENTATIVE'), async (req, res) => {
  const isManager = req.user.role !== 'REPRESENTATIVE';
  const where: Record<string, unknown> = {};
  if (!isManager) where.createdByUserId = req.user.id;
  if (req.query.status) where.status = String(req.query.status);

  const quotations = await prisma.quotation.findMany({
    where,
    include: {
      client: { select: { id: true, companyName: true } },
      rollerSpec: true,
      createdBy: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json(quotations);
});

// تفاصيل عرض
router.get('/:id', authenticate, requireRole('SALES_MANAGER', 'REPRESENTATIVE'), async (req, res) => {
  const quotation = await prisma.quotation.findUnique({
    where: { id: String(req.params.id) },
    include: {
      client: true,
      rollerSpec: true,
      createdBy: { select: { id: true, name: true, phone: true } },
    },
  });
  if (!quotation) return res.status(404).json({ error: 'not_found' });
  if (req.user.role === 'REPRESENTATIVE' && quotation.createdByUserId !== req.user.id) {
    return res.status(403).json({ error: 'forbidden' });
  }
  res.json(quotation);
});

// تنزيل PDF العرض
router.get('/:id/pdf', authenticate, requireRole('SALES_MANAGER', 'REPRESENTATIVE'), async (req, res) => {
  const quotation = await prisma.quotation.findUnique({
    where: { id: String(req.params.id) },
    include: { client: true, rollerSpec: true, createdBy: true },
  });
  if (!quotation) return res.status(404).json({ error: 'not_found' });

  if (!quotation.pdfUrl) {
    const calc = calculateRollerPricing(
      {
        serviceType: quotation.rollerSpec.serviceType,
        outerDiameterOd: quotation.rollerSpec.outerDiameterOd,
        coreDiameter: quotation.rollerSpec.coreDiameter,
        faceLength: quotation.rollerSpec.faceLength,
        totalLength: quotation.rollerSpec.totalLength,
        coatingMaterial: quotation.rollerSpec.coatingMaterial,
      },
      Number(quotation.discountPercentage),
    );
    const { url } = await generateQuotationPdf({ quotation, calc });
    await prisma.quotation.update({ where: { id: quotation.id }, data: { pdfUrl: url } });
    quotation.pdfUrl = url;
  }

  const rel = quotation.pdfUrl.replace(config.publicBaseUrl, '');
  const file = path.join(process.cwd(), rel.replace(/^\//, ''));
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'pdf_not_found' });
  res.download(file, `${quotation.quotationNumber}.pdf`);
});

/**
 * إنشاء عرض سعر:
 * - حساب التكلفة عبر المحرك
 * - خصم <= 10% => DRAFT (يصدر فوراً)
 * - خصم > 10%  => PENDING_APPROVAL (بانتظار موافقة المدير)
 * - توليد QR و PDF
 */
router.post('/', authenticate, requireRole('SALES_MANAGER', 'REPRESENTATIVE'), async (req, res) => {
  const parsed = quotationSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_input', details: parsed.error.flatten() });

  const { clientId, rollerSpecId, discountPercentage, terms } = parsed.data;

  const rollerSpec = await prisma.rollerSpec.findFirst({ where: { id: rollerSpecId, clientId } });
  if (!rollerSpec) return res.status(404).json({ error: 'roller_spec_not_found' });

  const calc = calculateRollerPricing(
    {
      serviceType: rollerSpec.serviceType,
      outerDiameterOd: rollerSpec.outerDiameterOd,
      coreDiameter: rollerSpec.coreDiameter,
      faceLength: rollerSpec.faceLength,
      totalLength: rollerSpec.totalLength,
      coatingMaterial: rollerSpec.coatingMaterial,
    },
    discountPercentage,
  );
  if (!calc.valid) return res.status(422).json({ error: 'validation_failed', errors: calc.errors });

  const number = await nextQuotationNumber();

  const quotation = await prisma.quotation.create({
    data: {
      quotationNumber: number,
      clientId,
      rollerSpecId,
      baseMaterialCost: calc.baseMaterialCost,
      laborMachiningCost: calc.laborMachiningCost,
      subtotal: calc.subtotal,
      discountPercentage: calc.discountPercentage,
      discountAmount: calc.discountAmount,
      vatAmount: calc.vatAmount,
      grandTotal: calc.grandTotal,
      status: discountNeedsApproval(discountPercentage) ? 'PENDING_APPROVAL' : 'DRAFT',
      terms: terms || 'سريان العرض 30 يوماً من تاريخ الإصدار.',
      createdByUserId: req.user.id,
    },
  });

  // توليد QR و PDF
  const { url: qrUrl } = await generateQrCode(
    {
      type: 'HANYCARD_QUOTATION',
      quotationNumber: number,
      quotationId: quotation.id,
      grandTotal: calc.grandTotal,
      validUntil: new Date(new Date(quotation.createdAt).getTime() + 30 * 864e5).toISOString().slice(0, 10),
    },
    `${number}.png`,
  );
  await prisma.quotation.update({ where: { id: quotation.id }, data: { qrCodeUrl: qrUrl } });

  const withRelations = await prisma.quotation.findUnique({
    where: { id: quotation.id },
    include: { client: true, rollerSpec: true, createdBy: true },
  });
  if (withRelations) {
    const { url: pdfUrl } = await generateQuotationPdf({ quotation: withRelations, calc });
    await prisma.quotation.update({ where: { id: quotation.id }, data: { pdfUrl } });
    withRelations.pdfUrl = pdfUrl;
  }

  res.status(201).json(withRelations);
});

/**
 * موافقة المدير على الخصم.
 * يمكن للمدير الموافقة أو الرفض (body.status = APPROVED | REJECTED).
 */
router.patch('/:id/approve', authenticate, requireRole('SALES_MANAGER'), async (req, res) => {
  const actionSchema = z.object({ status: z.enum(['APPROVED', 'REJECTED']) }).default({ status: 'APPROVED' });
  const parsed = actionSchema.safeParse(req.body);
  const status = parsed.success ? parsed.data.status : 'APPROVED';

  const quotation = await prisma.quotation.findUnique({ where: { id: String(req.params.id) } });
  if (!quotation) return res.status(404).json({ error: 'not_found' });

  if (quotation.status !== 'PENDING_APPROVAL') {
    return res.status(409).json({ error: 'not_pending_approval' });
  }

  const updated = await prisma.quotation.update({
    where: { id: quotation.id },
    data: { status },
  });
  res.json(updated);
});

/** تحديث توقيع العميل (مصفوفة نقاط الرسم) */
router.patch('/:id/signature', authenticate, requireRole('SALES_MANAGER', 'REPRESENTATIVE'), async (req, res) => {
  const sigSchema = z.object({ strokes: z.array(z.array(z.number())) });
  const parsed = sigSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_input', details: parsed.error.flatten() });

  const quotation = await prisma.quotation.findUnique({ where: { id: String(req.params.id) } });
  if (!quotation) return res.status(404).json({ error: 'not_found' });
  if (req.user.role === 'REPRESENTATIVE' && quotation.createdByUserId !== req.user.id) {
    return res.status(403).json({ error: 'forbidden' });
  }

  const updated = await prisma.quotation.update({
    where: { id: quotation.id },
    data: { clientSignature: parsed.data.strokes },
  });
  res.json(updated);
});

export const quotationsRouter = router;
