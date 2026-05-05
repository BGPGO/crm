import cron from 'node-cron';
import prisma from '../lib/prisma';
import { buildSegmentWhere } from '../services/segmentEngine';

export function startSegmentCountCron() {
  cron.schedule('0 * * * *', async () => {
    try {
      console.log('[segmentCountCron] Updating contact counts for active segments...');

      const segments = await prisma.segment.findMany({
        where: { isActive: true },
      });

      let updated = 0;

      for (const segment of segments) {
        try {
          const whereClause = buildSegmentWhere(segment.filters as any, segment.brand);
          const contactCount = await prisma.contact.count({ where: whereClause });

          await prisma.segment.update({
            where: { id: segment.id },
            data: { contactCount },
          });

          updated++;
        } catch (error) {
          console.error(`[segmentCountCron] Error processing segment ${segment.id}:`, error);
        }
      }

      console.log(`[segmentCountCron] Done: ${updated}/${segments.length} segments updated`);
    } catch (error) {
      console.error('[segmentCountCron] Error fetching segments:', error);
    }
  });

  console.log('[segmentCountCron] Scheduled: every hour at minute 0');
}
