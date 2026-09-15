import path from 'node:path';
import fs from 'node:fs';
import type { Response } from 'express';
import { prisma } from './prisma.js';
import { config } from '../config.js';

/**
 * التخزين الدائم للملفات في قاعدة البيانات (bytea) بدل قرص الخادم المؤقت.
 *
 * - الحفظ: ننشئ سجلاً في uploaded_files ونعيد معرّفه ليُخزَّن في حقول filePath/imageUrl.
 * - العرض: إن كان المفتاح معرّفاً موجوداً في قاعدة البيانات نرسل محتواه،
 *   وإلا نجرّب القرص (توافق مع الملفات القديمة المخزنة قبل النقل).
 */

export async function storeUploadedFile(input: {
  data: Buffer;
  mimeType?: string | null;
  fileName?: string | null;
}): Promise<string> {
  const rec = await prisma.uploadedFile.create({
    data: {
      data: new Uint8Array(input.data),
      mimeType: input.mimeType ?? null,
      fileName: input.fileName ?? null,
      size: input.data.length,
    },
  });
  return rec.id;
}

export async function deleteUploadedFile(key: string | null | undefined): Promise<void> {
  if (!key) return;
  await prisma.uploadedFile.delete({ where: { id: key } }).catch(() => undefined);
  fs.unlink(path.join(config.uploadDir, key), () => undefined);
}

function sendNotFound(res: Response, code = 'file_missing') {
  if (!res.headersSent) res.status(404).json({ error: code });
}

/**
 * إرسال ملف/صورة إلى العميل: من قاعدة البيانات أولاً، ثم من القرص (توافق قديم).
 * المُستدعي يتحقق من الأذونات قبل الاستدعاء.
 */
export async function serveUploadedFile(
  res: Response,
  key: string | null | undefined,
  opts?: { mimeType?: string | null; fileName?: string | null; download?: boolean },
): Promise<void> {
  if (!key) return sendNotFound(res);

  // 1) من قاعدة البيانات
  const rec = await prisma.uploadedFile.findUnique({ where: { id: key } }).catch(() => null);
  if (rec) {
    const mime = opts?.mimeType ?? rec.mimeType ?? 'application/octet-stream';
    const name = opts?.fileName ?? rec.fileName;
    res.type(mime);
    if (name) {
      const disposition = opts?.download ? 'attachment' : 'inline';
      res.setHeader('Content-Disposition', `${disposition}; filename*=UTF-8''${encodeURIComponent(name)}`);
    }
    res.send(rec.data);
    return;
  }

  // 2) من القرص (الملفات القديمة قبل اعتماد التخزين في قاعدة البيانات)
  const filePath = path.resolve(config.uploadDir, key);
  if (fs.existsSync(filePath)) {
    if (opts?.mimeType) res.type(opts.mimeType);
    else res.type('application/octet-stream');
    if (opts?.fileName) {
      const disposition = opts?.download ? 'attachment' : 'inline';
      res.setHeader('Content-Disposition', `${disposition}; filename*=UTF-8''${encodeURIComponent(opts.fileName)}`);
    }
    res.sendFile(filePath);
    return;
  }

  sendNotFound(res);
}

/** محاولة حذف ملف من القرص (يُستخدم لكسر مسار القراءة القديم عند حذف السجل). */
export function unlinkDiskFile(key: string | null | undefined): void {
  if (!key) return;
  fs.unlink(path.join(config.uploadDir, key), () => undefined);
}