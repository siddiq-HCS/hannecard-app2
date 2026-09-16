import QRCode from 'qrcode';
import { config } from '../config.js';
import { storeUploadedFile } from './storage.js';

/**
 * توليد رمز QR يحتوي بيانات تتبع عرض السعر
 * وتخزينه في قاعدة البيانات (bytea) بدل قرص الخادم المؤقت.
 */
export async function generateQrCode(
  payload: Record<string, unknown>,
  fileName: string,
): Promise<{ filePath: string; url: string }> {
  const data = await QRCode.toBuffer(JSON.stringify(payload), {
    width: 300,
    margin: 1,
    color: { dark: '#0f172a', light: '#ffffff' },
  });

  const filePath = await storeUploadedFile({ data, mimeType: 'image/png', fileName });
  return { filePath, url: `${config.publicBaseUrl}/uploads/qr/${filePath}.png` };
}