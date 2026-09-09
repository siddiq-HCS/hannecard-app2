import { Server } from 'socket.io';
import type { Server as HttpServer } from 'http';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { prisma } from './prisma.js';

export const MANAGERS_ROOM = 'managers';

let io: Server | null = null;

export function initSocket(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: { origin: config.corsOrigins },
  });

  // مصادقة اتصال Socket.IO عبر نفس JWT
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) return next(new Error('unauthorized'));
    try {
      const payload = jwt.verify(token, config.jwtSecret) as { sub: string; role: string };
      socket.data.userId = payload.sub;
      socket.data.role = payload.role;
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', async (socket) => {
    // كل مستخدم ينضم لغرفة خاصة لاستقبال رسائل المحادثات
    socket.join(`user:${socket.data.userId}`);
    // المديرون فقط يشتركون في قناة البث اللحظي
    if (socket.data.role === 'SALES_MANAGER' || socket.data.role === 'DEPUTY_SALES_MANAGER' || socket.data.role === 'DEVELOPER') {
      socket.join(MANAGERS_ROOM);
    }
    // البث اللحظي لموقع المندوب أثناء تسجيل الدخول
    const last = await prisma.location.findFirst({
      where: { userId: socket.data.userId },
      orderBy: { recordedAt: 'desc' },
    });
    if (last) getIo().to(MANAGERS_ROOM).emit('location:update', last);
  });

  return io;
}

export function getIo(): Server {
  if (!io) throw new Error('Socket.IO not initialized');
  return io;
}

/** بث حدث نشاط إلى لوحة الإدارة */
export function broadcastActivity(activity: {
  id: string;
  userId: string;
  type: string;
  payload?: unknown;
  createdAt: Date;
  userName?: string;
}) {
  getIo().to(MANAGERS_ROOM).emit('activity:new', activity);
}

/** بث تحديث موقع */
export function broadcastLocation(location: unknown) {
  getIo().to(MANAGERS_ROOM).emit('location:update', location);
}

/** بث تقرير يومي جديد */
export function broadcastDailySummary(summary: unknown) {
  getIo().to(MANAGERS_ROOM).emit('dailySummary:new', summary);
}

/** بث رسالة جديدة إلى غرفة المستلم */
export function emitMessageNew(recipientId: string, payload: unknown) {
  getIo().to(`user:${recipientId}`).emit('message:new', payload);
}

/** بث حالة قراءة إلى الطرف الآخر في المحادثة */
export function emitConversationRead(recipientId: string, payload: unknown) {
  getIo().to(`user:${recipientId}`).emit('conversation:read', payload);
}

/** بث تحديث طلب تسعير (اعتماد/تسعير) إلى المندوب صاحب الطلب */
export function emitRfqUpdated(recipientId: string, payload: unknown) {
  getIo().to(`user:${recipientId}`).emit('rfq:updated', payload);
}
