import { config } from '../config.js';

export interface PushMessage {
  to: string; // Expo push token
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

/**
 * إرسال إشعار عبر خدمة Expo Push (لا يحتاج Firebase).
 * بسيط وعملي مع تطبيق Expo — في حال تطلب Firebase لاحقاً يُستبدل هذا الملف فقط.
 */
export async function sendPush(message: PushMessage): Promise<void> {
  if (!message.to) return;
  try {
    const res = await fetch(config.expoPushUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify([message]),
    });
    if (!res.ok) console.warn('push failed', res.status);
  } catch (err) {
    console.warn('push error', err);
  }
}

export async function sendTaskReminder(
  expoToken: string,
  task: { title: string; id: string; dueTime: Date | null },
): Promise<void> {
  const at = task.dueTime ? ` الساعة ${task.dueTime.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}` : '';
  await sendPush({
    to: expoToken,
    title: 'تذكير بمهمة',
    body: `لديك مهمة معلقة: ${task.title}${at}`,
    data: { taskId: task.id },
  });
}
