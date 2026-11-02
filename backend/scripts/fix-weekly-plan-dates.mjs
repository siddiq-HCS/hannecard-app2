#!/usr/bin/env node
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is missing. Set it in the local .env file before running this script.');
}

const applyChanges = process.argv.includes('--apply');
const adapter = new PrismaPg({ connectionString: databaseUrl });
const prisma = new PrismaClient({ adapter });

async function main() {
  const candidates = await prisma.$queryRaw`
    SELECT id, "startDate"::text AS "startDate", "endDate"::text AS "endDate"
    FROM weekly_plans
    WHERE EXTRACT(ISODOW FROM "startDate") = 1
      AND "endDate" = "startDate" + INTERVAL '4 days'
    ORDER BY "startDate", id
  `;

  console.log(`Matching Monday-Friday weekly plans: ${candidates.length}`);
  for (const plan of candidates) {
    console.log(`${plan.id}: ${plan.startDate}..${plan.endDate} -> previous day on both dates`);
  }

  if (!applyChanges) {
    console.log('Dry run only. Re-run with --apply to update these records.');
    return;
  }

  const updated = await prisma.$executeRaw`
    UPDATE weekly_plans
    SET "startDate" = "startDate" - INTERVAL '1 day',
        "endDate" = "endDate" - INTERVAL '1 day',
        "updatedAt" = NOW()
    WHERE EXTRACT(ISODOW FROM "startDate") = 1
      AND "endDate" = "startDate" + INTERVAL '4 days'
  `;

  console.log(`Updated weekly plans: ${updated}`);
}

main()
  .catch((error) => {
    console.error('Weekly plan date repair failed:', error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });