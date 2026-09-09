import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { authRouter } from './routes/auth.routes.js';
import { clientsRouter } from './routes/clients.routes.js';
import { rollersRouter } from './routes/rollers.routes.js';
import { quotationsRouter } from './routes/quotations.routes.js';
import { visitsRouter } from './routes/visits.routes.js';
import { attendanceRouter } from './routes/attendance.routes.js';
import { syncRouter } from './routes/sync.routes.js';
// لوحة الإدارة (Web Panel)
import { meRouter } from './routes/me.routes.js';
import { managerRouter } from './routes/manager.routes.js';
import { conversationsRouter } from './routes/conversations.routes.js';
import { rfqsRouter } from './routes/rfqs.routes.js';
import { weeklyPlansRouter } from './routes/weeklyPlans.routes.js';
import { analyticsRouter } from './routes/analytics.routes.js';
import { rollMaterialsRouter } from './routes/rollMaterials.routes.js';
import { reportsRouter } from './routes/reports.routes.js';
import { locationsRouter } from './routes/locations.routes.js';
import { attachmentsRouter } from './routes/attachments.routes.js';
import { documentsRouter } from './routes/documents.routes.js';

export const app = express();

app.use(cors({ origin: config.corsOrigins }));
app.use(express.json({ limit: '10mb' }));

// ملفات مرفوعة (صور التلف، QR، PDF) — عامة
app.use('/uploads', express.static(path.join(process.cwd(), config.uploadDir)));

app.get('/health', (_req, res) => res.json({ ok: true, ts: new Date().toISOString(), cwd: process.cwd(), webDist: webDistPath ?? null }));

// REST API — تطبيق الجوال الجديد
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/clients', clientsRouter);
app.use('/api/v1/rollers', rollersRouter);
app.use('/api/v1/quotations', quotationsRouter);
app.use('/api/v1/visits', visitsRouter);
app.use('/api/v1/attendance', attendanceRouter);
app.use('/api/v1/sync', syncRouter);

// REST API — لوحة الإدارة (Web Panel)
app.use('/api/v1', meRouter);
app.use('/api/v1/manager', managerRouter);
app.use('/api/v1/conversations', conversationsRouter);
app.use('/api/v1/rfqs', rfqsRouter);
app.use('/api/v1/weekly-plans', weeklyPlansRouter);
app.use('/api/v1/analytics', analyticsRouter);
app.use('/api/v1/roll-materials', rollMaterialsRouter);
app.use('/api/v1/reports', reportsRouter);
app.use('/api/v1/locations', locationsRouter);
app.use('/api/v1', attachmentsRouter);
app.use('/api/v1', documentsRouter);

// ===== لوحة الإدارة (SPA) =====
// الملفات مبنية في web/dist (جذر الريبو) ويُقدَّم من نفس الخدمة لتوحيد المنشأ مع Socket.IO.
const webDistCandidates = [
  path.resolve(__dirname, '../../web/dist'), // backend/dist -> repo root
  path.resolve(process.cwd(), '../web/dist'),
  path.resolve(process.cwd(), 'web/dist'),
];
const webDistPath = webDistCandidates.find((p) => fs.existsSync(p));

console.log('[app] cwd =', process.cwd());
console.log('[app] web/dist candidates:', webDistCandidates);
console.log('[app] selected web/dist =', webDistPath ?? 'none');

if (webDistPath) {
  app.use(express.static(webDistPath, { etag: false, maxAge: 0 }));

  // أي مسار بدون امتداد → index.html (SPA fallback) بشرط ألا يكون API
  app.get('/{*splat}', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/health') || req.path.startsWith('/uploads')) return next();
    if (path.extname(req.path)) return res.status(404).send(`Asset ${req.path} not found on server`);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    return res.sendFile(path.join(webDistPath, 'index.html'));
  });
} else {
  console.warn('[app] web/dist not found — ستنشر لوحة الإدارة بدون واجهة أمامية (dev mode)');
}

// معالج أخطاء موحد
app.use(
  (err: Error & { status?: number; code?: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err.message === 'only_images' || err.message === 'unsupported_file_type' || err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: err.message });
    }
    console.error(err);
    res.status(err.status ?? 500).json({ error: 'internal_error' });
  },
);