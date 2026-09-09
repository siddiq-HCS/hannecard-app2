import type { Request, Response, NextFunction } from 'express';
import type { LocationAction } from '@prisma/client';
import { recordLocation } from '../lib/activity.js';

/**
 * التقاط GPS تلقائي: يقرأ lat/lng من body أو headers لكل طلب
 * ويسجل الموقع في قاعدة البيانات + يبثه للوحة الإدارة.
 * المندوب يرسل إحداثياته مع كل طلب تلقائياً من التطبيق.
 */
export function captureLocation(action: LocationAction) {
  return async (req: Request, res: Response, _next: NextFunction) => {
    if (!req.user) return _next();

    const lat = Number(req.body?.lat ?? req.headers['x-lat']);
    const lng = Number(req.body?.lng ?? req.headers['x-lng']);
    const accuracy = Number(req.body?.accuracy ?? req.headers['x-accuracy']);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return _next();

    try {
      await recordLocation(req.user.id, action, lat, lng, Number.isFinite(accuracy) ? accuracy : undefined);
    } catch (err) {
      console.warn('location capture failed', err);
    }
    _next();
  };
}
