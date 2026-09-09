import PDFDocument from 'pdfkit';
import fs from 'node:fs';
import path from 'node:path';
import reshaper from 'arabic-reshaper';
import bidiFactory from 'bidi-js';

const bidi = bidiFactory();
const FONT_DIR = path.join(process.cwd(), 'assets', 'fonts');

function ar(text) {
  try {
    const shaped = reshaper.convertArabic(text);
    const levels = bidi.getEmbeddingLevels(shaped, 'rtl');
    return bidi.getReorderedString(shaped, levels);
  } catch (e) {
    console.error('shape error', e);
    return text;
  }
}

const doc = new PDFDocument({ size: 'A4', margin: 42 });
const filePath = path.join(process.cwd(), 'uploads', 'pdf', 'test-arabic.pdf');
fs.mkdirSync(path.dirname(filePath), { recursive: true });
const stream = fs.createWriteStream(filePath);
doc.pipe(stream);

doc.font(path.join(FONT_DIR, 'Cairo-Bold.ttf')).fontSize(18).fillColor('#0f172a').text(ar('شركة هانيكارد السعودية'));
doc.moveDown();
doc.font(path.join(FONT_DIR, 'Cairo-Regular.ttf')).fontSize(12).text(ar('عرض سعر / تصنيع وتلبيس المحابر والاسطوانات'));
doc.moveDown();
doc.font(path.join(FONT_DIR, 'Cairo-Regular.ttf')).fontSize(10).text('CR: 1010000000    VAT: 300000000000003');
doc.moveDown();
doc.font(path.join(FONT_DIR, 'Cairo-Regular.ttf')).fontSize(11).text(ar('القطر الخارجي: 250 مم — طول الوجه: 1400 مم — المادة: بولي يوريثان'));
doc.moveDown();
doc.font(path.join(FONT_DIR, 'Cairo-Regular.ttf')).fontSize(11).text('Grand Total: 1,234.50 SAR');

doc.end();
await new Promise((resolve) => stream.on('finish', () => resolve(true)));
console.log('PDF written:', filePath, fs.statSync(filePath).size, 'bytes');
