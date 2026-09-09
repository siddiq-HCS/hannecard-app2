import 'dotenv/config';

function int(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) ? v : fallback;
}

export const config = {
  port: int('PORT', 10000),
  databaseUrl: process.env.DATABASE_URL!,
  jwtSecret: process.env.JWT_SECRET ?? 'dev-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  uploadDir: process.env.UPLOAD_DIR ?? './uploads',
  publicBaseUrl: process.env.PUBLIC_BASE_URL ?? 'http://localhost:4001',
  corsOrigins: (process.env.CORS_ORIGIN ?? 'http://localhost:5173,http://localhost:8081')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  dailyReportHour: int('DAILY_REPORT_HOUR', 17),
  dailyReportTz: process.env.DAILY_REPORT_TZ ?? 'Asia/Riyadh',
  expoPushUrl: 'https://exp.host/--/api/v2/push/send',
  hanycard: {
    cr: process.env.HANYCARD_CR ?? '',
    vat: process.env.HANYCARD_VAT ?? '',
    nameAr: process.env.HANYCARD_ARABIC_NAME ?? 'شركة هانيكارد السعودية',
    nameEn: process.env.HANYCARD_ENGLISH_NAME ?? 'Hanycard Saudi',
  },
  // ضريبة القيمة المضافة في السعودية
  vatRate: 15,
};
