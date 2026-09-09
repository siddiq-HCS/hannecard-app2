import cron from 'node-cron';
import { prisma } from '../lib/prisma.js';
import { sendTaskReminder } from '../lib/notifications.js';

/**
 * تذكير تلقائي: يفحص كل 10 دقائق المهام المعلقة المستحقة خلال الساعة القادمة
 * ويرسل إشعارات للمناديب الذين لديهم رمز إشعارات مسجل.
 */
export function startTaskReminders(): void {
  cron.schedule('*/10 * * * *', async () => {
    try {
      const now = new Date();
      const inOneHour = new Date(now.getTime() + 60 * 60 * 1000);

      const pending = await prisma.task.findMany({
        where: {
          status: 'PENDING',
          dueDate: { lte: inOneHour },
        },
        include: { user: { select: { fcmToken: true } } },
      });

      const dueNow = pending.filter((t) => {
        if (t.dueTime) return t.dueTime >= now && t.dueTime <= inOneHour;
        return true; // لا يوجد وقت محدد → تذكير إذا كان يوم الاستحقاق قريباً
      });

      for (const task of dueNow) {
        if (!task.user.fcmToken) continue;
        await sendTaskReminder(task.user.fcmToken, task);
      }
    } catch (err) {
      console.error('task reminder job failed', err);
    }
  });
}
