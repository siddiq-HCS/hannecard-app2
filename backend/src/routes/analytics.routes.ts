import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole, requirePageAccess } from '../middleware/rbac.js';

const router = Router();

router.use(authenticate, requireRole('SALES_MANAGER', 'DEPUTY_SALES_MANAGER'), requirePageAccess('PAGE_ANALYTICS_ACCESS'));

// بداية النطاق الزمني حسب الفلتر (أسبوع/شهر/سنة) أو بدون فلتر
function periodStart(period: string | undefined): Date | undefined {
  if (!period || period === 'all') return undefined;
  const now = new Date();
  if (period === 'week') now.setUTCDate(now.getUTCDate() - 7);
  else if (period === 'month') now.setUTCMonth(now.getUTCMonth() - 1);
  else if (period === 'year') now.setUTCFullYear(now.getUTCFullYear() - 1);
  return now;
}

function monthKey(d: Date) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

// ملخص عام للإحصائيات مع فلترة حسب المندوب والنطاق الزمني
router.get('/', async (req, res) => {
  const repId = req.query.repId as string | undefined;
  const period = req.query.period as string | undefined;
  const from = periodStart(period);

  const planWhere: Record<string, unknown> = {};
  if (repId) planWhere.userId = repId;
  if (from) planWhere.startDate = { gte: from };

  const [plans, rfqs, reps] = await Promise.all([
    prisma.weeklyPlan.findMany({
      where: planWhere,
      include: {
        user: { select: { id: true, name: true } },
        days: { include: { visits: { select: { companyCategory: true } } } },
      },
    }),
    prisma.rfq.findMany({
      where: { userId: repId ?? undefined, createdAt: from ? { gte: from } : undefined },
      select: { createdAt: true },
    }),
    prisma.user.findMany({
      where: { role: 'REPRESENTATIVE', isActive: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  const planStatus = { total: plans.length, DRAFT: 0, SUBMITTED: 0, APPROVED: 0 };
  const visitsByRep = new Map<string, { repId: string; name: string; count: number }>();
  const visitsByCategory = new Map<string, number>();
  let totalVisits = 0;

  for (const plan of plans) {
    planStatus[plan.status as keyof typeof planStatus]++;
    const key = plan.user.id;
    if (!visitsByRep.has(key)) visitsByRep.set(key, { repId: key, name: plan.user.name, count: 0 });
    const repAgg = visitsByRep.get(key)!;
    for (const day of plan.days) {
      for (const v of day.visits) {
        totalVisits++;
        repAgg.count++;
        visitsByCategory.set(v.companyCategory, (visitsByCategory.get(v.companyCategory) ?? 0) + 1);
      }
    }
  }

  // اتجاه آخر 6 أشهر لطلبات التسعير
  const monthBuckets: { month: string; count: number }[] = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    monthBuckets.push({ month: monthKey(d), count: 0 });
  }
  const bucketByMonth = new Map(monthBuckets.map((m) => [m.month, m]));
  for (const r of rfqs) {
    const k = monthKey(new Date(r.createdAt));
    const b = bucketByMonth.get(k);
    if (b) b.count++;
  }

  res.json({
    range: { from: from ? from.toISOString().slice(0, 10) : null, to: null },
    plans: planStatus,
    visits: {
      total: totalVisits,
      byRep: Array.from(visitsByRep.values()).sort((a, b) => b.count - a.count),
      byCategory: Array.from(visitsByCategory.entries())
        .map(([category, count]) => ({ category, count }))
        .sort((a, b) => b.count - a.count),
    },
    rfqs: { total: rfqs.length, byMonth: monthBuckets },
    reps,
  });
});

export const analyticsRouter = router;
