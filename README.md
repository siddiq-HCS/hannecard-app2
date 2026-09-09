# Hanycard Saudi — Field Sales & Roller Configurator

تطبيق المناديب الميدانيين لشركة هانيكارد السعودية (تصنيع وتلبيس المحابر والاسطوانات):
قياس الأسطوانات التالفة ميدانياً، حساب التكلفة فورياً، إصدار عروض أسعار PDF معتمدة، وتحويلها لأوامر إنتاج.

## البنية

```
hanycard/
  backend/    # Node.js 24 + Express 5 + Prisma 7 + PostgreSQL + pdfkit
  mobile/     # React Native (Expo SDK 57) — Offline-First
docker-compose.yml  # postgres:18 (منفذ 5433)
```

## التشغيل

```bash
# 1. قاعدة البيانات
docker compose up -d db

# 2. Backend
cd hanycard/backend
npm install
npm run db:generate
npm run db:migrate -- --name init
npm run db:seed
npm run dev          # http://localhost:4001

# 3. Mobile
cd hanycard/mobile
npm install
npx expo start
```

> ملاحظة: بدون Docker محلي يمكن استخدام PostgreSQL سحابي (Neon) وتعديل `DATABASE_URL` في `.env`.

## حسابات تجريبية (بعد seed)

| الدور | الهاتف | كلمة المرور |
|---|---|---|
| مدير المبيعات | 01100000001 | manager123 |
| مندوب هانيكارد | 01100000002 | rep123 |

## REST API

| Method | Endpoint | الوصف |
|---|---|---|
| POST | `/api/v1/auth/login` | تسجيل دخول JWT |
| GET/POST | `/api/v1/clients` | قائمة/إنشاء عملاء (مع GPS) |
| POST | `/api/v1/rollers/calculate` | محرك التسعير وإرجاع التفاصيل |
| POST | `/api/v1/rollers` | حفظ مواصفة أسطوانة |
| POST | `/api/v1/quotations` | إنشاء عرض سعر + PDF/QR |
| GET | `/api/v1/quotations/:id/pdf` | تنزيل PDF العرض |
| PATCH | `/api/v1/quotations/:id/approve` | موافقة المدير على الخصم |
| PATCH | `/api/v1/quotations/:id/signature` | حفظ توقيع العميل |
| POST | `/api/v1/visits` | تسجيل زيارة GPS |
| POST | `/api/v1/sync/bulk` | مزامنة المعاملات دون اتصال |

## قواعد العمل (Business Logic)

- **الأبعاد**: `OD > Core` قطعياً، `Total Length >= Face Length`، جميع القيم موجبة.
- **الحجم**: `V = π × ((OD/2)² - (Core/2)²) × FaceLength`
- **التكلفة**: `(V × كثافة × سعر المادة) + (طول الوجه × سعر التشغيل)` — حسب نوع المادة والخدمة.
- **الضريبة**: 15% (ZATCA).
- **الخصم**: ≤ 10% يصدر العرض فوراً (DRAFT)؛ > 10% ينتقل إلى PENDING_APPROVAL بانتظار موافقة المدير.

## Offline-First

جميع العمليات تُحفظ محلياً أولاً (SQLite محلي في التطبيق)، ثم عند عودة الاتصال يُرسل
`POST /api/v1/sync/bulk` لمزامنة العناصر المعلقة. استراتيجية التعارض: آخر زمن من الخادم يفوز.
