-- جعل إحداثيات الحضور اختيارية: بعض أجهزة المندوبين لا توفر GPS
-- ولا يجوز منع تسجيل الحضور بدونه (جدول attendance الجديد)
ALTER TABLE "attendance" ALTER COLUMN "lat" DROP NOT NULL;
ALTER TABLE "attendance" ALTER COLUMN "lng" DROP NOT NULL;