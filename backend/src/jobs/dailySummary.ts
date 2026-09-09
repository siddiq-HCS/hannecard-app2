import cron from 'node-cron';
import { prisma } from '../lib/prisma.js';
import { broadcastDailySummary } from '../lib/socket.js';
import { config } from '../config.js';

/** فرق التوقيت بالمللي ثانية بين UTC والمنطقة الزمنية المطلوبة في لحظة معينة */
function tzOffsetMs(tz: string, at: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = Object.fromEntries(
    dtf.formatToParts(at).map((p) => [p.type, p.value]),
  );
  const asUTC = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second),
  );
  return asUTC - at.getTime();
}

/** بداية ونهاية اليوم (بالمنطقة الزمنية) كـ UTC instants */
export function dayRange(tz: string, ref: Date = new Date()): { start: Date; end: Date } {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = Object.fromEntries(dtf.formatToParts(ref).map((p) => [p.type, p.value]));
  const noon = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), 12));
  const offset = tzOffsetMs(tz, noon);
  const start = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), 0, 0, 0) - offset);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

/** توليد التقرير اليومي التلقائي لكل مندوب وإرساله للمديرين */
export async function generateDailySummaries(): Promise<void> {
  const { start, end } = dayRange(config.dailyReportTz);
  const reps = await prisma.user.findMany({
    where: { role: 'REPRESENTATIVE', isActive: true },
    select: { id: true, name: true },
  });

  for (const rep of reps) {
    const [visits, completedTasks, report, collected] = await Promise.all([
      prisma.visit.count({ where: { userId: rep.id, visitedAt: { gte: start, lt: end } } }),
      prisma.task.count({ where: { userId: rep.id, status: 'DONE', completedAt: { gte: start, lt: end } } }),
      prisma.report.findFirst({ where: { userId: rep.id, isDraft: false, reportDate: { gte: start, lt: end } } }),
      prisma.visit.aggregate({
        where: { userId: rep.id, visitedAt: { gte: start, lt: end } },
        _sum: { collectedAmount: true },
      }),
    ]);

    const summaryDate = new Date(start.toISOString().slice(0, 10) + 'T00:00:00Z');
    const summary = await prisma.dailySummary.upsert({
      where: { userId_summaryDate: { userId: rep.id, summaryDate } },
      update: {
        totalVisits: visits,
        tasksCompleted: completedTasks,
        totalCollected: collected._sum.collectedAmount,
        reportSubmitted: Boolean(report),
        generatedAt: new Date(),
      },
      create: {
        userId: rep.id,
        summaryDate,
        totalVisits: visits,
        tasksCompleted: completedTasks,
        totalCollected: collected._sum.collectedAmount,
        reportSubmitted: Boolean(report),
      },
      include: { user: { select: { name: true } } },
    });

    broadcastDailySummary(summary);
  }
}

export function startJobs(): void {
  // الساعة HH في المنطقة الزمنية المحلية للخادم (نموذجياً تُضبط على DAILY_REPORT_HOUR)
  cron.schedule(`0 ${config.dailyReportHour} * * *`, () => {
    void generateDailySummaries().catch((err) => console.error('daily summary failed', err));
  });
}
