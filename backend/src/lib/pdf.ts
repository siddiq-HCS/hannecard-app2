import PDFDocument from 'pdfkit';
import path from 'node:path';
import fs from 'node:fs';
import reshaper from 'arabic-reshaper';
import bidiFactory from 'bidi-js';
import { config } from '../config.js';
import {
  GROOVING_LABELS,
  MATERIAL_LABELS,
  SERVICE_LABELS,
  type RollerCalculation,
} from './pricing.js';
import type { Client, Quotation, RollerSpec, User } from '@prisma/client';

const bidi = bidiFactory();

const FONT_DIR = path.join(process.cwd(), 'assets', 'fonts');
const ARABIC_REGULAR = path.join(FONT_DIR, 'Cairo-Regular.ttf');
const ARABIC_BOLD = path.join(FONT_DIR, 'Cairo-Bold.ttf');
const LATIN_REGULAR = path.join(FONT_DIR, 'Cairo-Regular.ttf');

/** تحويل نص عربي إلى شكله المتصل المناسب لـ PDF (RTL) */
export function ar(text: string): string {
  try {
    const shaped = reshaper.convertArabic(text);
    const levels = bidi.getEmbeddingLevels(shaped, 'rtl');
    return bidi.getReorderedString(shaped, levels);
  } catch {
    return text;
  }
}

export interface QuotationPdfData {
  quotation: Quotation & { client: Client; rollerSpec: RollerSpec; createdBy: User };
  calc: RollerCalculation;
}

const DARK = '#0f172a';
const BRAND = '#1d4ed8';
const GRAY = '#64748b';
const LIGHT = '#f1f5f9';
const BORDER = '#cbd5e1';

function money(n: number | string | unknown): string {
  const v = typeof n === 'number' ? n : Number(n ?? 0);
  return `${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س`;
}

/**
 * توليد PDF عرض سعر بالعربية/الإنجليزية وفق معايير ZATCA وهوية هانيكارد.
 * يعيد مسار الملف والرابط العام.
 */
export async function generateQuotationPdf(data: QuotationPdfData): Promise<{ filePath: string; url: string }> {
  const { quotation, calc } = data;
  const q = quotation;
  const roller = quotation.rollerSpec;

  const fileName = `${q.quotationNumber}.pdf`;
  const dir = path.join(config.uploadDir, 'pdf');
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, fileName);

  const doc = new PDFDocument({ size: 'A4', margin: 42, bufferPages: true });
  const stream = fs.createWriteStream(filePath);
  doc.pipe(stream);

  doc.font(LATIN_REGULAR).font(LATIN_REGULAR);

  // ===== الترويسة =====
  doc.font(LATIN_REGULAR).fontSize(8).fillColor(BRAND).text('HANYCARD SAUDI', 42, 42, { continued: false });
  doc.font(ARABIC_BOLD).fontSize(14).fillColor(DARK).text(ar(config.hanycard.nameAr), 42, 54);
  doc.font(LATIN_REGULAR).fontSize(8).fillColor(GRAY).text('Roller Manufacturing & Recoating', 42, 74);

  // رقم العرض على اليمين
  doc.font(LATIN_REGULAR).fontSize(10).fillColor(DARK).text(q.quotationNumber, 42, 42, { align: 'right' });
  doc.font(ARABIC_REGULAR).fontSize(8).fillColor(GRAY).text(ar('عرض سعر / Quotation'), 42, 58, { align: 'right' });
  doc.font(LATIN_REGULAR).fontSize(7.5).fillColor(GRAY).text(
    `CR: ${config.hanycard.cr}    VAT: ${config.hanycard.vat}`,
    42,
    74,
    { align: 'right' },
  );

  // خط فاصل
  doc.moveTo(42, 92).lineTo(552, 92).lineWidth(1.2).strokeColor(BRAND).stroke();

  // ===== بيانات العميل =====
  doc.font(ARABIC_BOLD).fontSize(10).fillColor(DARK).text(ar('العميل'), 42, 104);
  doc.font(ARABIC_REGULAR).fontSize(9).fillColor(DARK).text(ar(q.client.companyName), 42, 118);
  doc.font(ARABIC_REGULAR).fontSize(8).fillColor(GRAY).text(ar(`الشخص المسؤول: ${q.client.contactPerson}`), 42, 132);
  doc.font(ARABIC_REGULAR).fontSize(8).fillColor(GRAY).text(ar(`الهاتف: ${q.client.phone}`), 42, 145);
  if (q.client.taxNumber) {
    doc.font(ARABIC_REGULAR).fontSize(8).fillColor(GRAY).text(ar(`الرقم الضريبي: ${q.client.taxNumber}`), 42, 158);
  }

  const issuedAt = q.createdAt.toLocaleDateString('en-GB');
  const validUntil = new Date(q.createdAt.getTime() + 30 * 864e5).toLocaleDateString('en-GB');
  doc.font(LATIN_REGULAR).fontSize(8).fillColor(GRAY).text(`Issued: ${issuedAt}`, 42, 104, { align: 'right' });
  doc.font(LATIN_REGULAR).fontSize(8).fillColor(GRAY).text(`Valid until: ${validUntil}`, 42, 118, { align: 'right' });

  // ===== جدول المواصفات =====
  const tableTop = 180;
  const left = 42;
  const right = 552;
  const colWidths = [130, 90, 110, 100, 80];
  const rowHeight = 22;

  doc.font(ARABIC_BOLD).fontSize(9).fillColor('#fff');
  doc.rect(left, tableTop, right - left, rowHeight).fill(BRAND);

  const headers = [ar('البند'), ar('النوع'), ar('المقاسات'), ar('المادة'), ar('الصلابة')];
  let x = left;
  headers.forEach((h, i) => {
    doc.text(h, x + 6, tableTop + 6, { width: colWidths[i] - 12, align: 'right' });
    x += colWidths[i];
  });

  const serviceLabel = SERVICE_LABELS[roller.serviceType];
  const dims = `OD ${roller.outerDiameterOd} / Core ${roller.coreDiameter} / Face ${roller.faceLength} / L ${roller.totalLength} mm`;
  const materialLabel = MATERIAL_LABELS[roller.coatingMaterial];
  const grooving = GROOVING_LABELS[roller.groovingType] ?? roller.groovingType;

  const rows: string[][] = [
    [ar('تصنيع/تلبيس أسطوانة'), ar(serviceLabel), dims, ar(materialLabel), roller.hardnessShore],
  ];

  let y = tableTop + rowHeight;
  doc.font(ARABIC_REGULAR).fontSize(8.5).fillColor(DARK);
  rows.forEach((row, idx) => {
    if (idx % 2 === 1) {
      doc.rect(left, y, right - left, rowHeight).fill(LIGHT);
    }
    let cx = left;
    row.forEach((cell, i) => {
      doc.text(cell, cx + 6, y + 6, { width: colWidths[i] - 12, align: 'right' });
      cx += colWidths[i];
    });
    y += rowHeight;
  });

  doc.moveTo(left, y).lineTo(right, y).lineWidth(0.5).strokeColor(BORDER).stroke();
  doc.font(ARABIC_REGULAR).fontSize(7.5).fillColor(GRAY).text(ar(`نوع التحزيز: ${grooving}`), left, y + 4);

  // ===== تفصيل الأسعار =====
  const priceTop = y + 22;
  doc.font(ARABIC_BOLD).fontSize(9).fillColor(DARK).text(ar('التفاصيل المالية'), left, priceTop);

  const priceRows: [string, string][] = [
    [ar('تكلفة المواد (سماكة التغطية)'), money(calc.baseMaterialCost)],
    [ar('تكلفة التشغيل/التصنيع'), money(calc.laborMachiningCost)],
    [ar('الإجمالي قبل الخصم'), money(calc.subtotal)],
  ];
  if (calc.discountAmount > 0) {
    priceRows.push([ar(`الخصم (${calc.discountPercentage}%)`), `- ${money(calc.discountAmount)}`]);
  }
  priceRows.push([ar('ضريبة القيمة المضافة 15%'), money(calc.vatAmount)]);

  const pTop = priceTop + 16;
  let py = pTop;
  doc.font(ARABIC_REGULAR).fontSize(8.5).fillColor(DARK);
  for (const [label, value] of priceRows) {
    doc.text(label, left, py, { width: 300 });
    doc.text(value, right - 130, py, { width: 130, align: 'right' });
    py += 18;
  }

  // الإجمالي النهائي
  doc.rect(left, py + 4, right - left, 26).fill(BRAND);
  doc.font(ARABIC_BOLD).fontSize(10).fillColor('#fff').text(ar('الإجمالي النهائي (شامل الضريبة)'), left + 8, py + 8, { width: 320 });
  doc.font(LATIN_REGULAR).fontSize(11).fillColor('#fff').text(money(calc.grandTotal), right - 140, py + 8, { width: 130, align: 'right' });

  // ===== الشروط والتوقيع والرمز =====
  const footerTop = py + 44;
  doc.font(ARABIC_BOLD).fontSize(9).fillColor(DARK).text(ar('الشروط والأحكام'), left, footerTop);
  doc.font(ARABIC_REGULAR).fontSize(7.5).fillColor(GRAY).text(
    ar(
      '1) سريان العرض 30 يوماً من تاريخ الإصدار.\n2) الأسعار تشمل ضريبة القيمة المضافة بنسبة 15%.\n3) تُحدد مدة التصنيع بعد تأكيد الطلب وتوقيع العميل.\n4) تُحسب الشحنات إلى موقع العميل حسب الاتفاق.',
    ),
    left,
    footerTop + 14,
    { width: 330 },
  );

  // توقيع العميل
  doc.font(ARABIC_BOLD).fontSize(9).fillColor(DARK).text(ar('توقيع العميل'), left, footerTop + 92);
  doc.rect(left, footerTop + 102, 160, 50).strokeColor(BORDER).lineWidth(0.8).stroke();
  doc.font(ARABIC_REGULAR).fontSize(7).fillColor(GRAY).text(ar('(التوقيع الإلكتروني)'), left + 8, footerTop + 128, { width: 140 });

  // توقيع مندوب المبيعات
  doc.font(ARABIC_BOLD).fontSize(9).fillColor(DARK).text(ar('مندوب المبيعات'), 380, footerTop + 92);
  doc.rect(380, footerTop + 102, 172, 50).strokeColor(BORDER).lineWidth(0.8).stroke();
  doc.font(ARABIC_REGULAR).fontSize(8).fillColor(DARK).text(ar(q.createdBy.name), 388, footerTop + 116, { width: 156 });

  // رمز QR للتتبع
  if (q.qrCodeUrl) {
    const qrPath = q.qrCodeUrl.replace(config.publicBaseUrl, '');
    const qrFile = path.join(process.cwd(), qrPath.replace(/^\//, ''));
    if (fs.existsSync(qrFile)) {
      doc.image(qrFile, right - 90, footerTop + 92, { width: 88, height: 88 });
    }
  }

  // التذييل
  const bottom = 800;
  doc.moveTo(42, bottom).lineTo(552, bottom).lineWidth(0.5).strokeColor(BORDER).stroke();
  doc.font(ARABIC_REGULAR).fontSize(6.5).fillColor(GRAY).text(
    ar(`${config.hanycard.nameAr} — ${config.hanycard.nameEn} | س.ت: ${config.hanycard.cr} | الرقم الضريبي: ${config.hanycard.vat}`),
    42,
    bottom + 6,
    { width: 510, align: 'center' },
  );

  doc.end();
  await new Promise((resolve) => stream.on('finish', () => resolve(true)));

  return { filePath, url: `${config.publicBaseUrl}/uploads/pdf/${fileName}` };
}
