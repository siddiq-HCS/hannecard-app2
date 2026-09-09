import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { config } from './config.js';
import { hashPassword } from './lib/password.js';

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: config.databaseUrl }) });

async function main() {
  const managerPassword = await hashPassword('manager123');
  const repPassword = await hashPassword('rep123');

  const manager = await prisma.user.upsert({
    where: { phone: '01100000001' },
    update: {},
    create: {
      name: 'مدير المبيعات',
      phone: '01100000001',
      email: 'manager@hanycard.sa',
      passwordHash: managerPassword,
      role: 'SALES_MANAGER',
    },
  });

  const rep = await prisma.user.upsert({
    where: { phone: '01100000002' },
    update: {},
    create: {
      name: 'مندوب هانيكارد',
      phone: '01100000002',
      email: 'rep@hanycard.sa',
      passwordHash: repPassword,
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
    manager: manager.phone,
    rep: rep.phone,
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
