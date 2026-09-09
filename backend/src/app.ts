import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { config } from './config.js';
import { authRouter } from './routes/auth.routes.js';
import { clientsRouter } from './routes/clients.routes.js';
import { rollersRouter } from './routes/rollers.routes.js';
import { quotationsRouter } from './routes/quotations.routes.js';
import { visitsRouter } from './routes/visits.routes.js';
import { attendanceRouter } from './routes/attendance.routes.js';
import { syncRouter } from './routes/sync.routes.js';

export const app = express();

app.use(cors({ origin: config.corsOrigins }));
app.use(express.json({ limit: '10mb' }));

// ملفات مرفوعة (صور التلف، QR، PDF) — عامة
app.use('/uploads', express.static(path.join(process.cwd(), config.uploadDir)));

app.get('/health', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

// REST API
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/clients', clientsRouter);
app.use('/api/v1/rollers', rollersRouter);
app.use('/api/v1/quotations', quotationsRouter);
app.use('/api/v1/visits', visitsRouter);
app.use('/api/v1/attendance', attendanceRouter);
app.use('/api/v1/sync', syncRouter);

// معالج أخطاء موحد
app.use(
  (err: Error & { status?: number; code?: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err.message === 'only_images' || err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: err.message });
    }
    console.error(err);
    res.status(err.status ?? 500).json({ error: 'internal_error' });
  },
);
