import QRCode from 'qrcode';
import path from 'node:path';
import fs from 'node:fs';
import { config } from '../config.js';

/**
 * توليد رمز QR يحتوي بيانات تتبع عرض السعر
 * وإرجاع مسار الملف والرابط العام له.
 */
export async function generateQrCode(
  payload: Record<string, unknown>,
  fileName: string,
): Promise<{ filePath: string; url: string }> {
  const dir = path.join(config.uploadDir, 'qr');
  fs.mkdirSync(dir, { recursive: true });

  const filePath = path.join(dir, fileName);
  await QRCode.toFile(filePath, JSON.stringify(payload), {
    width: 300,
    margin: 1,
    color: { dark: '#0f172a', light: '#ffffff' },
  });

  return { filePath, url: `${config.publicBaseUrl}/uploads/qr/${fileName}` };
}
