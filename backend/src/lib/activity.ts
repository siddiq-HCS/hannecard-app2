import type { LocationAction } from '@prisma/client';
import { prisma } from './prisma.js';
import { broadcastActivity, broadcastLocation } from './socket.js';

/**
 * تسجيل حدث نشاط + بثه لحظياً للوحة الإدارة.
 */
export async function logActivity(
  userId: string,
  type: string,
  payload: unknown,
  userName?: string,
): Promise<{ id: string; type: string; payload: unknown; createdAt: Date; userId: string; userName?: string }> {
  const log = await prisma.activityLog.create({
    data: { userId, type, payload: payload as object },
  });
  const event = { id: log.id, userId, type, payload, createdAt: log.createdAt, userName };
  broadcastActivity(event);
  return event;
}

/**
 * تسجيل موقع GPS + بثه لحظياً.
 */
export async function recordLocation(
  userId: string,
  action: LocationAction,
  lat: number,
  lng: number,
  accuracy?: number,
) {
  const loc = await prisma.location.create({
    data: { userId, lat, lng, accuracy, action },
  });
  broadcastLocation({ id: loc.id, userId, lat, lng, accuracy, action, recordedAt: loc.recordedAt });
  return loc;
}

/** استخراج إحداثيات من body/headers (قيم اختيارية) */
export function coordsFrom(req: {
  body?: Record<string, unknown>;
  headers: Record<string, unknown>;
}): { lat: number; lng: number; accuracy?: number } | null {
  const lat = Number(req.body?.lat ?? req.headers['x-lat']);
  const lng = Number(req.body?.lng ?? req.headers['x-lng']);
  const accuracy = Number(req.body?.accuracy ?? req.headers['x-accuracy']);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng, accuracy: Number.isFinite(accuracy) ? accuracy : undefined };
}
