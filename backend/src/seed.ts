import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { config } from './config.js';
import { hashPassword } from './lib/password.js';

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: config.databaseUrl }) });

async function main() {
  // كلمات مرور تجريبية ثابتة — تُعاد هذه القيم عند كل تشغيل (idempotent)
  const adminPassword = await hashPassword('admin123');
  const repPassword = await hashPassword('rep123');

  // حساب إداري للوحة الإدارة (Web Panel): دخول بالبريد الإلكتروني + app:"web"
  const manager = await prisma.user.upsert({
    where: { phone: '01100000001' },
    update: {
      name: 'مدير المبيعات (تجريبي)',
      email: 'manager@hanycard.sa',
      passwordHash: adminPassword,
      plainPassword: 'admin123',
      role: 'SALES_MANAGER',
      isActive: true,
    },
    create: {
      name: 'مدير المبيعات (تجريبي)',
      phone: '01100000001',
      email: 'manager@hanycard.sa',
      passwordHash: adminPassword,
      plainPassword: 'admin123',
      role: 'SALES_MANAGER',
    },
  });

  // حساب مندوب لتطبيق الجوال (Mobile App): دخول برقم الهاتف فقط
  const rep = await prisma.user.upsert({
    where: { phone: '01100000002' },
    update: {
      name: 'مندوب هانيكارد (تجريبي)',
      email: 'rep@hanycard.sa',
      passwordHash: repPassword,
      plainPassword: 'rep123',
      role: 'REPRESENTATIVE',
      isActive: true,
    },
    create: {
      name: 'مندوب هانيكارد (تجريبي)',
      phone: '01100000002',
      email: 'rep@hanycard.sa',
      passwordHash: repPassword,
      plainPassword: 'rep123',
      role: 'REPRESENTATIVE',
    },
  });

  const client = await prisma.client.upsert({
    where: { id: 'seed-client-1' },
    update: {},
    create: {
      id: 'seed-client-1',
      companyName: 'مطبعة الرياض الحديثة',
      contactPerson: 'أحمد الشمري',
      phone: '01100000003',
      email: 'ahmad@press.example',
      taxNumber: '300000000000003',
      latitude: 24.7136,
      longitude: 46.6753,
      address: 'الرياض، حي العليا',
      createdById: rep.id,
    },
  });

  const spec = await prisma.rollerSpec.upsert({
    where: { id: 'seed-spec-1' },
    update: {},
    create: {
      id: 'seed-spec-1',
      clientId: client.id,
      serviceType: 'RECOATING',
      outerDiameterOd: 250,
      coreDiameter: 120,
      faceLength: 1400,
      totalLength: 1600,
      coatingMaterial: 'POLYURETHANE',
      hardnessShore: '75 Shore A',
      groovingType: 'SMOOTH',
      operatingTemp: 60,
      chemicalExposure: 'أحبار مائية',
      notes: 'إعادة تلبيس أسطوانة لاصق للحف.',
    },
  });

  console.log('seed done:', {
    adminWebPanel: { email: manager.email, password: 'admin123', app: 'web', role: manager.role },
    repMobileApp: { phone: rep.phone, password: 'rep123', role: rep.role },
    client: client.companyName,
    spec: spec.id,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
