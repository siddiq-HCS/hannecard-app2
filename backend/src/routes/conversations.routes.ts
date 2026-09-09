import { Router } from 'express';
import { z } from 'zod';
import type { Prisma, Role } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { requirePageAccess } from '../middleware/rbac.js';
import { emitConversationRead, emitMessageNew } from '../lib/socket.js';

const router = Router();
router.use(authenticate);

const MANAGER_ROLES = ['SALES_MANAGER', 'DEPUTY_SALES_MANAGER'];

function isManager(role: string) {
  return MANAGER_ROLES.includes(role);
}

const conversationInclude = {
  participants: { include: { user: { select: { id: true, name: true, role: true } } } },
  messages: { orderBy: { createdAt: 'desc' as const }, take: 1, include: { sender: { select: { name: true } } } },
} satisfies Prisma.ConversationInclude;

type ConversationRow = Prisma.ConversationGetPayload<{ include: typeof conversationInclude }>;

/** تحويل المحادثة إلى شكل استجابة موحد */
function serializeConversation(conv: ConversationRow, myId: string, unreadCount: number) {
  const other = conv.participants.find((p) => p.userId !== myId) ?? null;
  const lastMessage = conv.messages[0] ?? null;
  return {
    id: conv.id,
    other: other ? { id: other.user.id, name: other.user.name, role: other.user.role } : null,
    lastMessage: lastMessage
      ? {
          id: lastMessage.id,
          content: lastMessage.content,
          senderId: lastMessage.senderId,
          senderName: lastMessage.sender.name,
          readAt: lastMessage.readAt,
          createdAt: lastMessage.createdAt,
        }
      : null,
    unreadCount,
    createdAt: conv.createdAt,
    updatedAt: conv.updatedAt,
  };
}

/** جهات يمكن بدء محادثة معها: للمندوب المديرون، وللمدير المناديب */
router.get('/contacts', requirePageAccess('PAGE_CHAT_ACCESS'), async (req, res) => {
  const me = await prisma.user.findUnique({ where: { id: req.user.id }, select: { role: true } });
  const users = await prisma.user.findMany({
    where: isManager(me?.role ?? '') ? { role: 'REPRESENTATIVE' } : { role: { in: MANAGER_ROLES as Role[] } },
    select: { id: true, name: true, phone: true, role: true, isActive: true },
    orderBy: { name: 'asc' },
  });
  res.json(users);
});

// قائمة المحادثات
router.get('/', requirePageAccess('PAGE_CHAT_ACCESS'), async (req, res) => {
  const myId = req.user.id;
  const conversations = await prisma.conversation.findMany({
    where: { participants: { some: { userId: myId } } },
    include: conversationInclude,
    orderBy: { updatedAt: 'desc' },
  });

  const ids = conversations.map((c) => c.id);
  const unread =
    ids.length > 0
      ? await prisma.message.groupBy({
          by: ['conversationId'],
          where: { conversationId: { in: ids }, senderId: { not: myId }, readAt: null },
          _count: { _all: true },
        })
      : [];

  const unreadMap = new Map(unread.map((u) => [u.conversationId, u._count._all]));
  res.json(conversations.map((c) => serializeConversation(c, myId, unreadMap.get(c.id) ?? 0)));
});

const createConversationSchema = z.object({ participantId: z.string().min(1) });

// فتح/إنشاء محادثة مع مندوب أو مدير
router.post('/', async (req, res) => {
  const parsed = createConversationSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_input' });

  const myId = req.user.id;
  const me = await prisma.user.findUnique({ where: { id: myId }, select: { role: true } });
  if (!me) return res.status(401).json({ error: 'invalid_token' });

  const target = await prisma.user.findUnique({
    where: { id: parsed.data.participantId },
    select: { id: true, name: true, role: true, isActive: true },
  });
  if (!target) return res.status(404).json({ error: 'participant_not_found' });
  // محادثة 1-1: المندوب مع مدير فقط، والمدير مع مندوب فقط
  const invalid = isManager(me.role) ? target.role !== 'REPRESENTATIVE' : target.role === 'REPRESENTATIVE';
  if (invalid) return res.status(400).json({ error: 'invalid_participant' });
  if (myId === target.id) return res.status(400).json({ error: 'invalid_participant' });

  const existing = await prisma.conversation.findFirst({
    where: {
      AND: [
        { participants: { some: { userId: myId } } },
        { participants: { some: { userId: target.id } } },
      ],
    },
    include: conversationInclude,
  });

  const conversation =
    existing ??
    (await prisma.$transaction(async (tx) => {
      const created = await tx.conversation.create({ data: {} });
      await tx.conversationParticipant.createMany({
        data: [
          { conversationId: created.id, userId: myId },
          { conversationId: created.id, userId: target.id },
        ],
      });
      return tx.conversation.findUniqueOrThrow({ where: { id: created.id }, include: conversationInclude });
    }));

  const unreadCount = await prisma.message.count({
    where: { conversationId: conversation.id, senderId: { not: myId }, readAt: null },
  });
  res.status(existing ? 200 : 201).json(serializeConversation(conversation, myId, unreadCount));
});

async function getParticipantConversation(conversationId: string, userId: string) {
  const conv = await prisma.conversation.findFirst({
    where: { id: conversationId, participants: { some: { userId } } },
    include: conversationInclude,
  });
  return conv;
}

// رسائل المحادثة (وتمييزها كمقروءة عند الفتح)
router.get('/:id/messages', requirePageAccess('PAGE_CHAT_ACCESS'), async (req, res) => {
  const conversationId = String(req.params.id);
  const myId = req.user.id;
  const conv = await getParticipantConversation(conversationId, myId);
  if (!conv) return res.status(404).json({ error: 'not_found' });

  const limit = Math.min(Number(req.query.limit ?? 100), 200);
  const offset = Math.max(Number(req.query.offset ?? 0), 0);

  const messages = await prisma.message.findMany({
    where: { conversationId },
    include: { sender: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
    take: limit,
    skip: offset,
  });

  const marked = await prisma.message.updateMany({
    where: { conversationId, senderId: { not: myId }, readAt: null },
    data: { readAt: new Date() },
  });
  if (marked.count > 0) {
    const other = conv.participants.find((p) => p.userId !== myId);
    if (other) emitConversationRead(other.userId, { conversationId, userId: myId });
  }

  res.json(
    messages.map((m) => ({
      id: m.id,
      senderId: m.senderId,
      senderName: m.sender.name,
      content: m.content,
      readAt: m.readAt,
      createdAt: m.createdAt,
    })),
  );
});

const sendMessageSchema = z.object({ content: z.string().min(1).max(2000) });

// إرسال رسالة
router.post('/:id/messages', async (req, res) => {
  const parsed = sendMessageSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_input' });

  const conversationId = String(req.params.id);
  const myId = req.user.id;
  const conv = await getParticipantConversation(conversationId, myId);
  if (!conv) return res.status(404).json({ error: 'not_found' });

  const message = await prisma.message.create({
    data: { conversationId, senderId: myId, content: parsed.data.content },
    include: { sender: { select: { id: true, name: true } } },
  });
  await prisma.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });

  const publicMessage = {
    id: message.id,
    conversationId,
    senderId: message.senderId,
    senderName: message.sender.name,
    content: message.content,
    readAt: message.readAt,
    createdAt: message.createdAt,
  };

  const other = conv.participants.find((p) => p.userId !== myId);
  if (other) emitMessageNew(other.userId, { conversationId, message: publicMessage });

  res.status(201).json(publicMessage);
});

// تعليم الرسائل كمقروءة
router.post('/:id/read', async (req, res) => {
  const conversationId = String(req.params.id);
  const myId = req.user.id;
  const conv = await getParticipantConversation(conversationId, myId);
  if (!conv) return res.status(404).json({ error: 'not_found' });

  await prisma.message.updateMany({
    where: { conversationId, senderId: { not: myId }, readAt: null },
    data: { readAt: new Date() },
  });
  const other = conv.participants.find((p) => p.userId !== myId);
  if (other) emitConversationRead(other.userId, { conversationId, userId: myId });

  res.json({ ok: true });
});

export const conversationsRouter = router;
