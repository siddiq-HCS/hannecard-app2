import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { captureLocation } from '../middleware/location.js';
import { logActivity } from '../lib/activity.js';

const router = Router();

const reportSchema = z.object({
  reportDate: z.string(), // YYYY-MM-DD
  content: z.string().max(10000),
});

// تقريري ليوم محدد أو الأحدث (يشمل المسودات والمرسلة)
router.get('/mine', authenticate, requirePermission('REPORT_VIEW'), async (req, res) => {
  const date = req.query.date as string | undefined;
  const where = date
    ? { userId: req.user.id, reportDate: new Date(`${date}T00:00:00Z`) }
    : { userId: req.user.id };

  const reports = await prisma.report.findMany({ where, orderBy: { reportDate: 'desc' } });
  res.json(reports);
});

// حفظ/تحديث مسودة التقرير اليومي (يبقى مسودة طوال اليوم)
router.post('/', authenticate, requirePermission('REPORT_WRITE'), captureLocation('REPORT_SUBMIT'), async (req, res) => {
  const parsed = reportSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_input', details: parsed.error.flatten() });

  const reportDate = new Date(`${parsed.data.reportDate}T00:00:00Z`);

  const report = await prisma.report.upsert({
    where: { userId_reportDate: { userId: req.user.id, reportDate } },
    update: { content: parsed.data.content, isDraft: true, submittedAt: null },
    create: { userId: req.user.id, reportDate, content: parsed.data.content, isDraft: true, submittedAt: null },
  });

  await logActivity(req.user.id, 'report.draft', { reportDate: parsed.data.reportDate }, req.user.name);
  res.json(report);
});

// إرسال التقرير اليومي للمدير
router.post('/submit', authenticate, requirePermission('REPORT_WRITE'), captureLocation('REPORT_SUBMIT'), async (req, res) => {
  const parsed = reportSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_input', details: parsed.error.flatten() });
  if (!parsed.data.content.trim()) return res.status(400).json({ error: 'empty_report' });

  const reportDate = new Date(`${parsed.data.reportDate}T00:00:00Z`);

  const report = await prisma.report.upsert({
    where: { userId_reportDate: { userId: req.user.id, reportDate } },
    update: { content: parsed.data.content, isDraft: false, submittedAt: new Date() },
    create: { userId: req.user.id, reportDate, content: parsed.data.content, isDraft: false, submittedAt: new Date() },
  });

  await logActivity(req.user.id, 'report.submit', { reportDate: parsed.data.reportDate }, req.user.name);
  res.json(report);
});

export const reportsRouter = router;
