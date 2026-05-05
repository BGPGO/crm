import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const result = await prisma.cloudWaTemplate.deleteMany({
    where: {
      name: {
        in: [
          'bgp_no_show_d2_valor',
          'bgp_no_show_d3_prova_social',
          'bgp_no_show_d5_ligacao',
          'bgp_no_show_d7_breakup',
        ],
      },
      status: 'REJECTED',
    },
  });
  console.log(`Templates REJECTED removidos: ${result.count}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
