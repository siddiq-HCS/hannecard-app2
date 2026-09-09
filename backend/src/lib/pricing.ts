import type { CoatingMaterial, GroovingType, ServiceType } from '@prisma/client';

// ======================= معايير التسعير =======================
// الوحدات: الأسعار بالريال السعودي (SAR)
// - materialUnitRate: سعر المادة لكل سم³
// - machiningRate: سعر التشغيل لكل متر من طول الوجه

export interface MaterialConfig {
  densityFactor: number;
  materialUnitRate: number; // SAR / cm³
  machiningRate: number; // SAR / m
}

export const MATERIAL_CONFIG: Record<CoatingMaterial, MaterialConfig> = {
  NATURAL_RUBBER: { densityFactor: 1.0, materialUnitRate: 0.45, machiningRate: 900 },
  POLYURETHANE: { densityFactor: 1.1, materialUnitRate: 0.85, machiningRate: 1100 },
  SILICONE: { densityFactor: 1.15, materialUnitRate: 1.4, machiningRate: 1300 },
  CHROME: { densityFactor: 7.2, materialUnitRate: 0.6, machiningRate: 1500 },
  CERAMIC: { densityFactor: 3.9, materialUnitRate: 1.2, machiningRate: 1700 },
};

// معاملات حسب نوع الخدمة
export const SERVICE_FACTOR: Record<ServiceType, { material: number; machining: number }> = {
  NEW_MANUFACTURE: { material: 1.0, machining: 1.0 },
  RECOATING: { material: 0.85, machining: 1.15 },
  REPAIR_GRINDING: { material: 0.1, machining: 0.9 },
  CHROME_PLATING: { material: 1.0, machining: 1.25 },
};

export const VAT_RATE = 15; // ضريبة القيمة المضافة السعودية

export const MAX_DISCOUNT_WITHOUT_APPROVAL = 10; // % بدون موافقة المدير

export interface RollerInput {
  serviceType: ServiceType;
  outerDiameterOd: number;
  coreDiameter: number;
  faceLength: number;
  totalLength: number;
  coatingMaterial: CoatingMaterial;
}

export interface RollerCalculation {
  valid: boolean;
  errors: string[];
  // الأبعاد المحسوبة
  coatingThickness: number; // مم
  coatingVolume: number; // سم³
  coatingVolumeM3: number; // م³ (للتوثيق)
  // التكاليف
  baseMaterialCost: number;
  laborMachiningCost: number;
  subtotal: number;
  discountPercentage: number;
  discountAmount: number;
  vatAmount: number;
  vatRate: number;
  grandTotal: number;
}

// ======================= التحقق من الأبعاد =======================

export function validateRoller(input: RollerInput): string[] {
  const errors: string[] = [];

  const positive = (v: number, name: string) => {
    if (!Number.isFinite(v) || v <= 0) errors.push(`${name} يجب أن يكون رقم موجب أكبر من صفر`);
  };

  positive(input.outerDiameterOd, 'القطر الخارجي');
  positive(input.coreDiameter, 'قطر المعدن (القلب)');
  positive(input.faceLength, 'طول الوجه');
  positive(input.totalLength, 'الطول الكلي');

  // OD يجب أن يكون أكبر قطعياً من قطر القلب
  if (input.outerDiameterOd <= input.coreDiameter) {
    errors.push('القطر الخارجي يجب أن يكون أكبر من قطر المعدن (القلب)');
  }

  // الطول الكلي >= طول الوجه
  if (input.totalLength < input.faceLength) {
    errors.push('الطول الكلي يجب أن يكون أكبر من أو يساوي طول الوجه');
  }

  return errors;
}

// ======================= محرك الحساب =======================

export function calculateRollerPricing(input: RollerInput, discountPercentage = 0): RollerCalculation {
  const errors = validateRoller(input);
  if (errors.length > 0) {
    return {
      valid: false,
      errors,
      coatingThickness: 0,
      coatingVolume: 0,
      coatingVolumeM3: 0,
      baseMaterialCost: 0,
      laborMachiningCost: 0,
      subtotal: 0,
      discountPercentage,
      discountAmount: 0,
      vatAmount: 0,
      vatRate: VAT_RATE,
      grandTotal: 0,
    };
  }

  const { outerDiameterOd: od, coreDiameter: cd, faceLength: face } = input;
  const mat = MATERIAL_CONFIG[input.coatingMaterial];
  const svc = SERVICE_FACTOR[input.serviceType];

  // سماكة التغطية: (OD - Core) / 2
  const coatingThickness = (od - cd) / 2;

  // حجم التغطية: π × (R² - r²) × L   (بالـ mm³ ثم تحويل إلى سم³)
  const rOuter = od / 2;
  const rInner = cd / 2;
  const volumeMm3 = Math.PI * (rOuter * rOuter - rInner * rInner) * face;
  const coatingVolumeCm3 = volumeMm3 / 1000;
  const coatingVolumeM3 = volumeMm3 / 1e9;

  // التكلفة الأساسية: (V × كثافة × سعر المادة) + (طول الوجه بالمتر × سعر التشغيل)
  const faceLengthM = face / 1000;
  const baseMaterialCost = coatingVolumeCm3 * mat.densityFactor * mat.materialUnitRate * svc.material;
  const laborMachiningCost = faceLengthM * mat.machiningRate * svc.machining;

  const subtotal = baseMaterialCost + laborMachiningCost;
  const discountAmount = subtotal * (discountPercentage / 100);
  const taxable = subtotal - discountAmount;
  const vatAmount = taxable * (VAT_RATE / 100);
  const grandTotal = taxable + vatAmount;

  const round2 = (n: number) => Math.round(n * 100) / 100;

  return {
    valid: true,
    errors: [],
    coatingThickness: round2(coatingThickness),
    coatingVolume: round2(coatingVolumeCm3),
    coatingVolumeM3: coatingVolumeM3,
    baseMaterialCost: round2(baseMaterialCost),
    laborMachiningCost: round2(laborMachiningCost),
    subtotal: round2(subtotal),
    discountPercentage,
    discountAmount: round2(discountAmount),
    vatAmount: round2(vatAmount),
    vatRate: VAT_RATE,
    grandTotal: round2(grandTotal),
  };
}

// هل يحتاج الخصم لموافقة المدير؟
export function discountNeedsApproval(discountPercentage: number): boolean {
  return discountPercentage > MAX_DISCOUNT_WITHOUT_APPROVAL;
}

export const GROOVING_LABELS: Record<GroovingType, string> = {
  SMOOTH: 'أملس',
  AXIAL: 'محوري',
  SPIRAL: 'حلزوني',
  CROWNED: 'تاجي',
  HELIBONE: 'هيليبوب',
};

export const SERVICE_LABELS: Record<ServiceType, string> = {
  NEW_MANUFACTURE: 'تصنيع جديد',
  RECOATING: 'إعادة تلبيس',
  REPAIR_GRINDING: 'إصلاح وتجليخ',
  CHROME_PLATING: 'طلاء كروم',
};

export const MATERIAL_LABELS: Record<CoatingMaterial, string> = {
  NATURAL_RUBBER: 'مطاط طبيعي',
  POLYURETHANE: 'بولي يوريثان',
  SILICONE: 'سيليكون',
  CHROME: 'كروم',
  CERAMIC: 'سيراميك',
};
