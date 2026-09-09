import http from 'node:http';
import cron from 'node-cron';
import { app } from './app.js';
import { config } from './config.js';
import { prisma } from './lib/prisma.js';
import { logActivity } from './lib/activity.js';
import { initSocket } from './lib/socket.js';
import { startJobs } from './jobs/dailySummary.js';
import { startTaskReminders } from './jobs/taskReminders.js';

const server = http.createServer(app);

process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
});

const ioServer = initSocket(server);
startJobs();
startTaskReminders();

server.listen(config.port, () => {
  console.log(`[hanycard-backend] listening on :${config.port}`);
});

// ===== تسجيل انصراف تلقائي لمن لم يغادر بنهاية اليوم (18:00 بتوقيت الرياض) =====
async function runAutoCheckoutIfDue() {
  const riyadhNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Riyadh' }));
  if (riyadhNow.getHours() !== 18) return;
  await autoCheckoutAll();
}

async function autoCheckoutAll() {
  const riyadhStr = new Date().toLocaleString('en-US', { timeZone: 'Asia/Riyadh' });
  const riyadh = new Date(riyadhStr);
  const todayDate = new Date(Date.UTC(riyadh.getFullYear(), riyadh.getMonth(), riyadh.getDate(), 0, 0, 0));
  const now = new Date();

  const records = await prisma.legacyAttendance.findMany({
    where: { date: todayDate, status: 'CHECKED_IN' },
    include: { user: { select: { id: true, name: true } } },
  });

  for (const rec of records) {
    await prisma.legacyAttendance.update({
      where: { id: rec.id },
      data: { checkOutTime: now, status: 'CHECKED_OUT' },
    });
    await logActivity(rec.userId, 'attendance.autoCheckOut', { date: todayDate.toISOString().slice(0, 10) }, rec.user?.name);
    console.log(`[auto-checkout] checked out user ${rec.userId}`);
  }

  if (records.length > 0) {
    console.log(`[auto-checkout] processed ${records.length} record(s)`);
  }
}

// مرة واحدة يومياً عند الساعة 15:00 UTC (= 18:00 بتوقيت الرياض)
cron.schedule('0 15 * * *', () => {
  void runAutoCheckoutIfDue().catch((err) => console.error('auto-checkout failed', err));
});

// ===== إغلاق نظيف عند إيقاف الخادم (Render يرسل SIGTERM) =====
let shuttingDown = false;
function gracefulShutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[shutdown] received ${signal}; closing HTTP server, sockets and DB pool...`);

  const force = setTimeout(() => process.exit(1), 10_000);
  force.unref();

  ioServer.disconnectSockets(true);

  server.close(async () => {
    try {
      await prisma.$disconnect();
    } catch (err) {
      console.error('[shutdown] prisma disconnect error:', err);
    }
    clearTimeout(force);
    process.exit(0);
  });
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));