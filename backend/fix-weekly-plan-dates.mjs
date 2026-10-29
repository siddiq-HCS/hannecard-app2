import 'dotenv/config';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const connectionString = process.env.DATABASE_URL;
const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('ÌÇÑí ÊÕÍíÍ ÊæÇÑíÎ ÇáÎØØ ÇáÃÓÈæÚíÉ Ýí ÞÇÚÏÉ ÇáÈíÇäÇÊ...');
  const plans = await prisma.weeklyPlan.findMany();
  let updated = 0;

  for (const plan of plans) {
    const start = new Date(plan.startDate);
    if (start.getUTCDay() === 1) { // ÅÐÇ ßÇäÊ ÊÈÏÃ Èíæã ÇáÅËäíä
      const newStart = new Date(start);
      newStart.setUTCDate(start.getUTCDate() - 1); // ÊÚÏíá Åáì ÇáÃÍÏ

      const end = new Date(plan.endDate);
      const newEnd = new Date(end);
      newEnd.setUTCDate(end.getUTCDate() - 1); // ÊÚÏíá Åáì ÇáÎãíÓ

      await prisma.weeklyPlan.update({
        where: { id: plan.id },
        data: { startDate: newStart, endDate: newEnd }
      });
      updated++;
    }
  }
  console.log(`Êã ÊÚÏíá ${updated} ÎØÉ ÃÓÈæÚíÉ ÈäÌÇÍ áÊÕÈÍ ãä (ÇáÃÍÏ Åáì ÇáÎãíÓ)!`);
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
